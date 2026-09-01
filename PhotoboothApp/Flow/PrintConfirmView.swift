import SwiftUI

/// Last look before paper is spent: the real composed sheet, the spec, and
/// the copy count — the expensive mistake is printing four of the wrong
/// thing.
struct PrintConfirmView: View {
    let sheet: UIImage?
    let layout: LayoutTemplate
    let media: PrintMedia
    let copies: Int
    let printerName: String
    let printerTarget: PrinterTarget
    let onBack: () -> Void
    let onPrint: () -> Void
    let onClose: () -> Void

    @Environment(\.panelSize) private var size

    var body: some View {
        PanelScreen(status: "STEP 4/4", footer: "PRINT", onBack: onClose) {
            AdaptiveSplit(spacing: size.pick(18, 12)) {
                PanelModule(title: "SHEET", padding: 10) {
                    DisplayWell {
                        Group {
                            if let sheet {
                                Image(uiImage: sheet)
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                            } else {
                                Color.clear
                            }
                        }
                        .padding(10)
                    }
                }
                // The sheet takes a share of a phone stage, never all of it:
                // the controls under it have to fit, because a kiosk has
                // nowhere to scroll to.
                .frame(width: size.isCompact ? nil : 420,
                       height: size.isCompact ? 300 : nil)
            } detail: {
                VStack(spacing: size.pick(18, 12)) {
                    PanelModule(title: "READY TO PRINT") {
                        // A phone stage has room for the essentials only.
                        // Sheet size, printer and transport are operator
                        // detail; layout, paper and copies are what the guest
                        // is being asked to confirm.
                        VStack(alignment: .leading, spacing: size.pick(12, 8)) {
                            SpecRow(key: "LAYOUT",
                                    value: "\(layout.name) / \(layout.subtitle)")
                            SpecRow(key: "PAPER", value: media.shortName)
                            SpecRow(key: "COPIES",
                                    value: copies == 1 ? "1 PRINT" : "\(copies) PRINTS")
                            if !size.isCompact {
                                SpecRow(key: "SHEET",
                                        value: "\(Int(media.pixelSize.width))x\(Int(media.pixelSize.height)) / \(Int(media.dpi)) DPI")
                                SpecRow(key: "PRINTER", value: printerName)
                                SpecRow(key: "VIA", value: printerTarget.displayName)
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    HStack(spacing: size.pick(12, 10)) {
                        PanelButton(title: "< BACK", cell: 4, action: onBack)
                        PanelButton(title: copies == 1 ? "PRINT" : "PRINT \(copies)",
                                    kind: .primary, cell: 4, action: onPrint)
                    }
                }
            }
            .padding(size.pick(22, 14))
        }
    }
}
