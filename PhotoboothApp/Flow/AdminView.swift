import SwiftUI
import CoreBluetooth

/// The operator's console. Reached by three taps in the top-left corner of
/// the attract screen and gated by a passcode, so it survives a guest
/// exploring the kiosk.
///
/// Everything here is a *setting*, never a one-off action on the current
/// session — an operator changing the printer mid-event must not disturb the
/// guest who is halfway through.
struct AdminView: View {
    @ObservedObject var store: SettingsStore
    @ObservedObject var session: SessionState
    let onClose: () -> Void

    @Environment(\.panelSize) private var size
    @State private var unlocked = false
    @State private var entered = ""

    var body: some View {
        PanelScreen(status: "OPERATOR", footer: "CONTROL", onBack: onClose) {
            Group {
                if unlocked { console } else { passcode }
            }
            .padding(size.pick(22, 12))
        }
    }

    private var console: some View {
        PanelModule(title: "CONTROL PANEL", value: "OPERATOR", titleCell: 4) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    PrinterSection(store: store, session: session)
                    CaptureSection(store: store)
                    BrandingSection(store: store)
                    ReceiptSection(store: store)
                    KioskSection(store: store)

                    HStack {
                        Spacer()
                        PanelButton(title: "CLOSE", kind: .primary, cell: 4, action: onClose)
                            .frame(maxWidth: 250)
                    }
                    .padding(.top, 6)
                }
                .padding(.trailing, 6)
            }
        }
    }

    private var passcode: some View {
        HatchScrim {
            PasscodeDialog(entered: $entered,
                           expected: store.settings.adminPasscode,
                           onUnlock: { unlocked = true },
                           onCancel: onClose)
        }
    }
}

// MARK: - Passcode

private struct PasscodeDialog: View {
    @Binding var entered: String
    let expected: String
    let onUnlock: () -> Void
    let onCancel: () -> Void

    @State private var wrong = false

    var body: some View {
        PanelModule(title: "PASSWORD REQUIRED",
                    value: wrong ? "NO" : "",
                    titleCell: 4,
                    accent: wrong ? Panel.salmon : Panel.ink) {
            VStack(spacing: 18) {
                HStack(spacing: 16) {
                    PixelIconView(icon: .gear, size: 52,
                                  color: wrong ? Panel.salmon : Panel.lavender)
                    VStack(alignment: .leading, spacing: 8) {
                        PixelText(text: "OPERATOR CONSOLE", cell: 4)
                        PixelText(text: wrong ? "THAT CODE IS NOT RIGHT" : "ENTER THE PASSCODE",
                                  cell: 3, colour: wrong ? Panel.salmon : Panel.dim)
                    }
                    Spacer(minLength: 0)
                }

                PixelText(text: String(repeating: "*", count: entered.count), cell: 6)
                    .frame(maxWidth: .infinity, minHeight: 62)
                    .heavyFramed()

                Keypad(onDigit: { digit in
                    wrong = false
                    entered.append(digit)
                    if entered.count >= expected.count {
                        if entered == expected {
                            entered = ""
                            onUnlock()
                        } else {
                            wrong = true
                            entered = ""
                        }
                    }
                }, onClear: { entered = ""; wrong = false })

                PanelButton(title: "CANCEL", kind: .danger, cell: 4, action: onCancel)
            }
        }
        .frame(maxWidth: 520)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct Keypad: View {
    let onDigit: (String) -> Void
    let onClear: () -> Void

    private let rows = [["1","2","3"], ["4","5","6"], ["7","8","9"], ["C","0",""]]

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { key in
                        if key.isEmpty {
                            Color.clear.frame(height: Panel.touchTarget)
                        } else if key == "C" {
                            PanelButton(title: "C", kind: .danger, action: onClear)
                        } else {
                            PanelButton(title: key) { onDigit(key) }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Sections

private struct PrinterSection: View {
    @ObservedObject var store: SettingsStore
    @ObservedObject var session: SessionState

    @Environment(\.panelSize) private var size
    @ObservedObject private var link = ThermalPrinterLink.shared
    @State private var busy = false

    var body: some View {
        AdminSection(title: "PRINTER", icon: .printer) {
            VStack(alignment: .leading, spacing: 14) {
                SegmentedRow(title: "TARGET",
                             options: PrinterTarget.allCases.map { ($0.rawValue, $0.displayName) },
                             selection: store.settings.printerTarget.rawValue) { raw in
                    if let target = PrinterTarget(rawValue: raw) {
                        store.settings.printerTarget = target
                        // Rebuilt here rather than lazily at print time, so a
                        // mistake shows up now, in front of the operator.
                        session.rebuildPrinter()
                    }
                }

                SegmentedRow(title: "PAPER",
                             options: PrintMedia.all.map { ($0.id, $0.shortName) },
                             selection: store.settings.mediaID) { id in
                    store.settings.mediaID = id
                    session.compose()
                }

                switch store.settings.printerTarget {
                case .airPrint:
                    HStack(spacing: 14) {
                        PixelText(text: store.settings.lastPrinterName ?? "NO PRINTER CHOSEN",
                                  cell: 3,
                                  colour: store.settings.lastPrinterName == nil
                                      ? Panel.salmon : Panel.ink,
                                  fits: 420)
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                            .heavyFramed(Panel.ruleThin)

                        PanelButton(title: "CHOOSE", cell: 3, enabled: !busy, minHeight: 54) {
                            busy = true
                            Task {
                                if let picked = await PrinterPicker.pick() {
                                    store.settings.lastPrinterURL = picked.url
                                    store.settings.lastPrinterName = picked.name
                                    session.rebuildPrinter()
                                }
                                busy = false
                            }
                        }
                        .frame(width: size.pick(220, 150))
                    }
                    AdminNote(kind: .info,
                              text: "Pair the SELPHY once before the doors open — after that no guest ever sees the iOS print sheet.")

                case .thermalBLE:
                    ThermalPairing(store: store, session: session, link: link)
                }
            }
        }
    }
}

private struct ThermalPairing: View {
    @Environment(\.panelSize) private var size
    @ObservedObject var store: SettingsStore
    @ObservedObject var session: SessionState
    @ObservedObject var link: ThermalPrinterLink

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                PixelText(text: store.settings.thermalPeripheralName ?? "NOT PAIRED",
                          cell: 3,
                          colour: store.settings.thermalPeripheralName == nil
                              ? Panel.salmon : Panel.ink,
                          fits: 420)
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                    .heavyFramed(Panel.ruleThin)

                PanelButton(title: link.isScanning ? "STOP" : "SCAN", cell: 3, minHeight: 54) {
                    link.isScanning ? link.stopScan() : link.startScan()
                }
                .frame(width: size.pick(180, 120))
            }

            if link.state != .poweredOn {
                AdminNote(kind: .warning,
                          text: "Bluetooth is \(link.state.readable). Turn it on to pair a thermal printer.")
            }

            if !link.found.isEmpty {
                VStack(spacing: 0) {
                    ForEach(link.found) { device in
                        Button {
                            store.settings.thermalPeripheralID = device.id
                            store.settings.thermalPeripheralName = device.name
                            session.rebuildPrinter()
                            link.stopScan()
                        } label: {
                            HStack(spacing: 10) {
                                PixelIconView(icon: .printer, size: 22,
                                              color: store.settings.thermalPeripheralID == device.id
                                                  ? Panel.lavender : Panel.dim)
                                PixelText(text: device.name, cell: 3, fits: 320)
                                Spacer()
                                PixelText(text: "\(device.rssi) DBM", cell: 3, colour: Panel.dim)
                            }
                            .padding(.horizontal, 12)
                            .frame(height: 54)
                            .frame(maxWidth: .infinity)
                            .background(store.settings.thermalPeripheralID == device.id
                                        ? Panel.lavender : Panel.paper)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .heavyFramed(Panel.ruleThin)
            }

            SegmentedRow(title: "WIDTH",
                         options: [("384", "58 MM"), ("576", "80 MM")],
                         selection: String(store.settings.thermalWidthDots)) { value in
                store.settings.thermalWidthDots = Int(value) ?? 384
                session.rebuildPrinter()
            }

            AdminNote(kind: .info,
                      text: "Generic ESC/POS over Bluetooth. If your printer turns out to be AirPrint-capable, switch TARGET to AirPrint and pick a thermal paper size instead.")
        }
    }
}

private struct CaptureSection: View {
    @ObservedObject var store: SettingsStore

    var body: some View {
        AdminSection(title: "CAPTURE", icon: .camera) {
            VStack(alignment: .leading, spacing: 14) {
                SegmentedRow(title: "CAMERA",
                             options: CameraFacing.allCases.map { ($0.rawValue, $0.displayName) },
                             selection: store.settings.camera.rawValue) { raw in
                    if let facing = CameraFacing(rawValue: raw) { store.settings.camera = facing }
                }
                ToggleRow(title: "MIRROR PREVIEW", isOn: store.settings.mirrorPreview) {
                    store.settings.mirrorPreview = $0
                }
                NumberRow(title: "COUNTDOWN", value: store.settings.countdownSeconds,
                          range: 1...10, suffix: "S") { store.settings.countdownSeconds = $0 }
                NumberRow(title: "MAX COPIES", value: store.settings.maxCopies,
                          range: 1...20, suffix: "") { store.settings.maxCopies = $0 }
                AdminNote(kind: .info,
                          text: "The preview is mirrored so people can pose. The saved photo never is — a mirrored print reverses every logo in the room.")
            }
        }
    }
}

/// The 80 mm receipt's own copy. Only a roll prints it, so the note says
/// plainly which paper these fields belong to rather than leaving an
/// operator typing into fields that do nothing.
private struct ReceiptSection: View {
    @ObservedObject var store: SettingsStore

    var body: some View {
        AdminSection(title: "RECEIPT", icon: .printer) {
            VStack(alignment: .leading, spacing: 14) {
                TextRow(title: "SHOT NAMES", text: store.settings.printTracks,
                        placeholder: "comma separated, e.g. ARRIVAL, THE TOAST") {
                    store.settings.printTracks = $0
                }
                TextRow(title: "PARAGRAPH", text: store.settings.printParagraph,
                        placeholder: "the small print above the code") {
                    store.settings.printParagraph = $0
                }
                TextRow(title: "FOOTER", text: store.settings.printFooter,
                        placeholder: "e.g. THE ART OF THE MOMENT") {
                    store.settings.printFooter = $0
                }
                TextRow(title: "QR LINK", text: store.settings.printLink,
                        placeholder: "https://… — empty prints no code") {
                    store.settings.printLink = $0
                }
                AdminNote(kind: store.settings.media.isRoll ? .info : .warning,
                          text: store.settings.media.isRoll
                            ? "Receipt mode is on. Guests choose between the 1, 2 and 4 shot rolls; the shot order is timed from the first shutter, so those minutes are real. Leave SHOT NAMES empty for FRAME 01, FRAME 02."
                            : "These only appear on 80mm thermal. Set PAPER above to the 80mm roll to put the booth into receipt mode.")
            }
        }
    }
}

private struct BrandingSection: View {
    @ObservedObject var store: SettingsStore

    var body: some View {
        AdminSection(title: "PRINT DESIGN", icon: .star) {
            VStack(alignment: .leading, spacing: 14) {
                TextRow(title: "EVENT", text: store.settings.eventName,
                        placeholder: "e.g. Ana & Miguel") { store.settings.eventName = $0 }
                TextRow(title: "DISPLAY WORD", text: store.settings.printWord,
                        placeholder: "e.g. SATIROLOGIA") { store.settings.printWord = $0 }
                TextRow(title: "CAPTION", text: store.settings.printCaption,
                        placeholder: "e.g. @mixelbooth") { store.settings.printCaption = $0 }
                ToggleRow(title: "PRINT DATE", isOn: store.settings.printDate) {
                    store.settings.printDate = $0
                }
                SegmentedRow(title: "PHOTO TONE",
                             options: [("mono", "MONO"), ("colour", "COLOUR")],
                             selection: store.settings.photoMono ? "mono" : "colour") {
                    store.settings.photoMono = ($0 == "mono")
                }
                NumberRow(title: "SHEET NO.", value: store.settings.sheetCounter,
                          range: 1...999, suffix: "") { store.settings.sheetCounter = $0 }
                AdminNote(kind: .info,
                          text: "DISPLAY WORD is the oversized word on the sheet — a long one runs off the edge on purpose, and on a receipt it is the script line under the event name. Leave it empty to use the event name. SHEET NO. prints as \"003.\" and counts up with every print.")
            }
        }
    }
}

private struct KioskSection: View {
    @ObservedObject var store: SettingsStore

    var body: some View {
        AdminSection(title: "KIOSK", icon: .hourglass) {
            VStack(alignment: .leading, spacing: 14) {
                NumberRow(title: "IDLE RESET", value: Int(store.settings.idleReturnSeconds),
                          range: 15...600, step: 15, suffix: "S") {
                    store.settings.idleReturnSeconds = Double($0)
                }
                NumberRow(title: "THANK YOU HOLD", value: Int(store.settings.thankYouSeconds),
                          range: 2...30, suffix: "S") {
                    store.settings.thankYouSeconds = Double($0)
                }
                NumberRow(title: "KEEP PHOTOS", value: Int(store.settings.keepPhotosMinutes),
                          range: 1...240, step: 5, suffix: " MIN") {
                    store.settings.keepPhotosMinutes = Double($0)
                }
                AdminNote(kind: .warning,
                          text: "Photos are local only and deleted when the session ends. Nothing is uploaded.")
            }
        }
    }
}

// MARK: - Admin controls

private struct AdminSection<Content: View>: View {
    let title: String
    let icon: PixelIcon
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                PixelIconView(icon: icon, size: 26, color: Panel.ink)
                PixelText(text: title, cell: 4)
                RuleSegment(thickness: Panel.ruleThin)
            }
            content()
        }
    }
}

/// Black when on, white when off — the reference's DYN OFF / DYN ON block.
private struct SegmentedRow: View {
    let title: String
    let options: [(String, String)]
    let selection: String
    let onSelect: (String) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            AdminLabel(title)
            HStack(spacing: 0) {
                ForEach(Array(options.enumerated()), id: \.element.0) { index, option in
                    let on = option.0 == selection
                    Button { onSelect(option.0) } label: {
                        PixelText(text: option.1, cell: 3,
                                  colour: on ? Panel.paper : Panel.ink, fits: 200)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 52)
                            .background(on ? Panel.ink : Panel.paper)
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .trailing) {
                        if index < options.count - 1 {
                            Rectangle().fill(Panel.ink).frame(width: Panel.ruleThin)
                        }
                    }
                }
            }
            .heavyFramed(Panel.ruleThin)
            Spacer(minLength: 0)
        }
    }
}

private struct ToggleRow: View {
    let title: String
    let isOn: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        SegmentedRow(title: title,
                     options: [("on", "ON"), ("off", "OFF")],
                     selection: isOn ? "on" : "off") { onChange($0 == "on") }
    }
}

private struct NumberRow: View {
    let title: String
    let value: Int
    let range: ClosedRange<Int>
    var step: Int = 1
    let suffix: String
    let onChange: (Int) -> Void

    var body: some View {
        HStack(spacing: 14) {
            AdminLabel(title)
            HStack(spacing: 0) {
                stepButton("-", enabled: value > range.lowerBound) {
                    onChange(max(range.lowerBound, value - step))
                }
                PixelText(text: "\(value)\(suffix)", cell: 3)
                    .frame(width: 120, height: 52)
                    .overlay(alignment: .leading) { divider }
                    .overlay(alignment: .trailing) { divider }
                stepButton("+", enabled: value < range.upperBound) {
                    onChange(min(range.upperBound, value + step))
                }
            }
            .heavyFramed(Panel.ruleThin)
            Spacer(minLength: 0)
        }
    }

    private var divider: some View {
        Rectangle().fill(Panel.ink).frame(width: Panel.ruleThin)
    }

    private func stepButton(_ glyph: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: { if enabled { action() } }) {
            PixelText(text: glyph, cell: 4, colour: enabled ? Panel.ink : Panel.hair)
                .frame(width: 60, height: 52)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

private struct TextRow: View {
    let title: String
    let text: String
    let placeholder: String
    let onChange: (String) -> Void

    var body: some View {
        HStack(spacing: 14) {
            AdminLabel(title)
            TextField(placeholder, text: Binding(get: { text }, set: onChange))
                .textFieldStyle(.plain)
                .font(Panel.mono(16))
                .foregroundStyle(Panel.ink)
                .padding(.horizontal, 12)
                .frame(height: 52)
                .heavyFramed(Panel.ruleThin)
                .autocorrectionDisabled()
        }
    }
}

private struct AdminLabel: View {
    @Environment(\.panelSize) private var size
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Panel.mono(size.pick(12, 10), weight: .semibold))
            .tracking(1.6)
            .foregroundStyle(Panel.dim)
            // A phone gives the label a whole line of its own rather than a
            // 160pt gutter that leaves nothing for the control.
            .frame(width: size.pick(160, 110), alignment: .leading)
    }
}

/// A note with a colour bar down its left edge instead of an icon: in this
/// language colour is a fill, so the swatch is the signal.
private struct AdminNote: View {
    enum Kind { case info, warning }
    let kind: Kind
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Rectangle()
                .fill(kind == .warning ? Panel.salmon : Panel.lavender)
                .frame(width: 14)
            Text(text)
                .font(Panel.mono(12.5))
                .foregroundStyle(Panel.dim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

extension CBManagerState {
    /// Plain wording for the operator — "unauthorized" on a status line is
    /// not a useful instruction at 2am in a function room.
    var readable: String {
        switch self {
        case .poweredOn:     return "on"
        case .poweredOff:    return "switched off"
        case .unauthorized:  return "not allowed for this app (Settings › Photobooth › Bluetooth)"
        case .unsupported:   return "unsupported on this iPad"
        case .resetting:     return "restarting"
        case .unknown:       return "starting up"
        @unknown default:    return "unavailable"
        }
    }
}
