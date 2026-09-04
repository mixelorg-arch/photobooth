import Foundation

/// Which concrete `PrinterService` the operator has selected.
enum PrinterTarget: String, Codable, CaseIterable, Identifiable {
    case airPrint      // SELPHY CP1500, and any AirPrint-capable thermal
    case thermalBLE    // Bluetooth ESC/POS receipt printer

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .airPrint:   return "AIRPRINT (SELPHY)"
        case .thermalBLE: return "THERMAL (BLUETOOTH)"
        }
    }
}

enum CameraFacing: String, Codable, CaseIterable, Identifiable {
    case front, back
    var id: String { rawValue }
    var displayName: String { self == .front ? "FRONT" : "REAR" }
}

/// Everything the operator can change. Persisted as JSON.
struct AppSettings: Codable, Equatable {
    var camera: CameraFacing = .front
    /// Mirror the *preview* only. The saved photograph is never mirrored —
    /// a mirrored print puts every sign and shirt logo backwards.
    var mirrorPreview: Bool = true

    var countdownSeconds: Int = 3
    /// Pause between shots in a 4-shot run, so people can change pose.
    var betweenShotsSeconds: Double = 1.5

    var defaultCopies: Int = 1
    var maxCopies: Int = 10

    var printerTarget: PrinterTarget = .airPrint
    /// `UIPrinter.url.absoluteString` of the last printer used, so the guest
    /// never sees the iOS printer picker.
    var lastPrinterURL: String? = nil
    var lastPrinterName: String? = nil
    var mediaID: String = PrintMedia.postcard4x6.id

    /// CoreBluetooth peripheral identifier of the paired thermal printer.
    var thermalPeripheralID: String? = nil
    var thermalPeripheralName: String? = nil
    /// Imaging width in dots. 384 = 58 mm, 576 = 80 mm.
    var thermalWidthDots: Int = 384

    /// Layout ids offered to the guest, in order.
    var guestLayoutIDs: [String] = LayoutTemplate.all.map(\.id)

    var eventName: String = ""
    var printCaption: String = ""
    var printDate: Bool = true
    /// The oversized display word on the sheet. Falls back to the event name.
    /// A long one runs off the edge on purpose — that is the design.
    var printWord: String = ""
    /// Running sheet number, printed as "003.". Increments on every print.
    var sheetCounter: Int = 1
    /// Photographs print monochrome to match the sheet design.
    var photoMono: Bool = true

    // MARK: Receipt, on 80 mm thermal

    /// Names for the shot-order rows, comma separated. Falls back to
    /// FRAME 01, FRAME 02.
    var printTracks: String = ""
    /// The justified small print above the code.
    var printParagraph: String =
        "Printed the moment it happened, on the paper it happened on. "
        + "No filter, no second take, no cloud. Some things are worth "
        + "holding rather than scrolling."
    /// The line under the last rule.
    var printFooter: String = "THE ART OF THE MOMENT"
    /// What the QR points at. Empty prints no code at all.
    var printLink: String = ""

    /// Seconds of no touching before the kiosk drops back to attract.
    var idleReturnSeconds: Double = 90
    /// How long the thank-you screen holds before it resets itself.
    var thankYouSeconds: Double = 6
    /// Session photos older than this are deleted on the next sweep.
    var keepPhotosMinutes: Double = 30

    /// Guards the Admin screen. Entered on the hidden corner tap.
    var adminPasscode: String = "1234"

    var media: PrintMedia {
        PrintMedia.all.first { $0.id == mediaID } ?? .postcard4x6
    }

    /// The dressing for one print. A receipt needs the layout as well,
    /// because the number of shot-order rows is the number of frames it
    /// takes, and the times are session data rather than settings.
    func branding(for template: LayoutTemplate?, times: [Date?]) -> PrintBranding {
        PrintBranding(eventName: eventName,
                      caption: printCaption,
                      showsDate: printDate,
                      date: Date(),
                      word: printWord,
                      sequence: sheetCounter,
                      tracks: template.map { tracks(for: $0, times: times) } ?? [],
                      total: total(times),
                      paragraph: printParagraph,
                      footer: printFooter,
                      link: printLink)
    }

    /// One row per frame, timed from the first shutter, so the receipt lists
    /// what actually happened rather than invented durations. A frame with
    /// no timestamp yet reads "--:--" — a preview must never put a made-up
    /// number where a real one will go.
    private func tracks(for template: LayoutTemplate, times: [Date?]) -> [ReceiptTrack] {
        let names = printTracks
            .split(whereSeparator: { ",;\n".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let first = times.compactMap { $0 }.min()
        return (0..<template.shotCount).map { index in
            let label = index < names.count
                ? names[index]
                : String(format: "FRAME %02d", index + 1)
            let taken = index < times.count ? times[index] : nil
            guard let first, let taken else { return ReceiptTrack(label: label, time: "--:--") }
            return ReceiptTrack(label: label,
                                time: Self.mmss(taken.timeIntervalSince(first)))
        }
    }

    private func total(_ times: [Date?]) -> String {
        let taken = times.compactMap { $0 }
        guard let first = taken.min(), let last = taken.max() else { return "--:--" }
        guard taken.count > 1 else { return Self.mmss(0) }
        return Self.mmss(last.timeIntervalSince(first))
    }

    private static func mmss(_ seconds: TimeInterval) -> String {
        let whole = Int(max(0, seconds.rounded()))
        return String(format: "%02d:%02d", whole / 60, whole % 60)
    }

    var guestLayouts: [LayoutTemplate] {
        let pool = LayoutTemplate.guestChoices(for: media)
        let found = guestLayoutIDs.compactMap { id in
            pool.first { $0.id == id }
        }
        // A saved list can name layouts that no longer exist — the six-layout
        // build renamed `four-full` to `four-grid` — or layouts that belong
        // to the other kind of paper. Either way, fall back to everything the
        // chosen paper can hold rather than leaving the operator with one
        // tile and no way to guess why.
        return found.isEmpty ? pool : found
    }
}
