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
    var guestLayoutIDs: [String] = LayoutTemplate.guestChoices.map(\.id)

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

    var branding: PrintBranding {
        PrintBranding(eventName: eventName,
                      caption: printCaption,
                      showsDate: printDate,
                      date: Date(),
                      word: printWord,
                      sequence: sheetCounter)
    }

    var guestLayouts: [LayoutTemplate] {
        let found = guestLayoutIDs.compactMap { id in
            LayoutTemplate.all.first { $0.id == id }
        }
        // A saved list can name layouts that no longer exist — the six-layout
        // build renamed `four-full` to `four-grid`. If anything was dropped,
        // fall back to the full set rather than leaving the operator with one
        // tile and no way to guess why.
        return found.count == guestLayoutIDs.count && !found.isEmpty
            ? found
            : LayoutTemplate.guestChoices
    }
}
