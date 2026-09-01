import UIKit

/// One composed sheet, ready to go to paper.
struct PrintJob {
    let image: UIImage
    let copies: Int
    let media: PrintMedia
    let jobName: String
}

/// Which physical printer a job actually landed on. Only AirPrint reports
/// this; it is what lets the app remember the SELPHY and stop showing the
/// iOS print sheet to guests.
struct ChosenPrinter {
    let url: String
    let name: String
}

/// A step in a running job. Services emit these as they go.
struct PrintUpdate {
    var progress: Double          // 0...1
    var message: String
    var chosenPrinter: ChosenPrinter? = nil
}

enum PrintError: LocalizedError {
    case cancelled
    case noPrinter
    /// No printer has been paired yet. Distinct from `noPrinter` because the
    /// booth prints silently: this is the operator's problem, and the message
    /// has to say so rather than inviting a guest to pick one.
    case notConfigured
    case notConnected(String)
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:  return "The print was cancelled."
        case .noPrinter:  return "No printer was selected."
        case .notConfigured:
            return "No printer is paired. An operator needs to choose one in the control panel."
        case .notConnected(let n):
            return "Could not reach \(n). An operator needs to check the printer."
        case .failed(let why): return why
        }
    }
}

/// The one interface the rest of the app knows about.
///
/// Everything above this line is printer-agnostic: the flow hands over a
/// flattened `UIImage` and a copy count, and gets progress back. Swapping
/// SELPHY for a Bluetooth receipt printer changes which object is behind
/// this protocol and nothing else.
protocol PrinterService: AnyObject {
    var displayName: String { get }
    /// Emits progress until the job is accepted by the printer (or the
    /// spooler), then finishes. Throws `PrintError`.
    func submit(_ job: PrintJob) -> AsyncThrowingStream<PrintUpdate, Error>
}
