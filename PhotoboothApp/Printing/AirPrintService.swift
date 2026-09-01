import UIKit

/// AirPrint path — the Canon SELPHY CP1500, and any thermal photo printer
/// that speaks AirPrint (Liene, some Munbyn/Phomemo models). One code path,
/// a different `PrintMedia` profile.
@MainActor
final class AirPrintService: PrinterService {

    private let savedPrinterURL: String?

    init(lastPrinterURL: String? = nil) {
        self.savedPrinterURL = lastPrinterURL
    }

    nonisolated var displayName: String { "AirPrint" }

    nonisolated func submit(_ job: PrintJob) -> AsyncThrowingStream<PrintUpdate, Error> {
        AsyncThrowingStream { continuation in
            Task { @MainActor in
                do {
                    try await self.run(job, emit: { continuation.yield($0) })
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Job

    private func run(_ job: PrintJob, emit: (PrintUpdate) -> Void) async throws {
        emit(PrintUpdate(progress: 0.15, message: "Building the sheet…"))

        let controller = UIPrintInteractionController.shared
        controller.printInfo = printInfo(for: job)
        controller.showsNumberOfCopies = false
        controller.showsPaperSelectionForLoadedPapers = true

        // UIPrintInfo has no copy count and UIPrintInteractionController
        // exposes none either, so N copies is N identical printing items.
        // This is the only way to send a multi-copy job without putting the
        // iOS print sheet in front of a guest.
        controller.printingItems = Array(repeating: job.image, count: max(1, job.copies))

        // A guest must never meet the iOS print sheet. The printer is chosen
        // once by the operator in Admin; from then on every job goes
        // straight to it and the booth prints silently.
        //
        // If that printer is missing or unreachable this fails to the error
        // screen instead of falling back to the picker. A picker in front of
        // a guest is worse than a clear "tell the operator" — they cannot
        // fix a network printer, and they can walk off with the iPad in a
        // system sheet.
        guard let saved = savedPrinterURL, let url = URL(string: saved) else {
            throw PrintError.notConfigured
        }

        let printer = UIPrinter(url: url)
        emit(PrintUpdate(progress: 0.30, message: "Waking \(printer.displayName)…"))
        try await contact(printer)

        emit(PrintUpdate(progress: 0.55, message: "Sending to \(printer.displayName)…"))
        try await send(controller, to: printer)

        emit(PrintUpdate(progress: 1.0,
                         message: "Sent to \(printer.displayName).",
                         chosenPrinter: ChosenPrinter(url: saved,
                                                      name: printer.displayName)))
    }

    private func printInfo(for job: PrintJob) -> UIPrintInfo {
        let info = UIPrintInfo.printInfo()
        // .photo is what makes the SELPHY use its dye-sub photo path and
        // borderless postcard media rather than treating the sheet as a
        // document page.
        info.outputType = .photo
        info.jobName = job.jobName
        info.orientation = job.media.isPortrait ? .portrait : .landscape
        info.duplex = .none
        return info
    }

    /// `contactPrinter` is the only way to know a saved printer is actually
    /// on the network before committing a job to it.
    private func contact(_ printer: UIPrinter) async throws {
        let reachable: Bool = await withCheckedContinuation { continuation in
            printer.contactPrinter { available in
                continuation.resume(returning: available)
            }
        }
        guard reachable else { throw PrintError.notConnected(printer.displayName) }
    }

    private func send(_ controller: UIPrintInteractionController,
                      to printer: UIPrinter) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            controller.print(to: printer) { _, completed, error in
                if let error {
                    continuation.resume(throwing: PrintError.failed(error.localizedDescription))
                } else if completed {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: PrintError.cancelled)
                }
            }
        }
    }

    static var keyWindow: UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
    }
}

/// Printer picking for the Admin screen, so the operator pairs the SELPHY
/// once before the doors open instead of a guest meeting the print sheet.
@MainActor
enum PrinterPicker {
    /// Returns nil if the operator cancelled.
    static func pick() async -> ChosenPrinter? {
        guard let window = AirPrintService.keyWindow else { return nil }
        let picker = UIPrinterPickerController(initiallySelectedPrinter: nil)
        let anchor = CGRect(x: window.bounds.midX - 1, y: window.bounds.midY - 1,
                            width: 2, height: 2)

        return await withCheckedContinuation { continuation in
            picker.present(from: anchor, in: window, animated: true) { ctrl, completed, _ in
                guard completed, let printer = ctrl.selectedPrinter else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: ChosenPrinter(
                    url: printer.url.absoluteString,
                    name: printer.displayName))
            }
        }
    }
}
