import SwiftUI

/// How many prints. One number, one stepper, a hard cap so nobody walks away
/// with forty sheets of dye-sub paper.
struct CopiesView: View {
    @Binding var copies: Int
    let maxCopies: Int
    /// The chosen layout's colour, carried through from the tile so the
    /// accent the guest picked on screen 1 follows them to the print.
    var accent: Color = Panel.lavender
    let onBack: () -> Void
    let onNext: () -> Void
    let onClose: () -> Void

    @Environment(\.panelSize) private var size

    var body: some View {
        PanelScreen(status: "STEP 3/4", footer: "COPIES", onBack: onClose) {
            VStack {
                PanelModule(title: "HOW MANY PRINTS",
                            value: copies == 1 ? "1 PRINT" : "\(copies) PRINTS") {
                    VStack(spacing: size.pick(20, 14)) {
                        PanelStepper(value: $copies, range: 1...maxCopies, accent: accent)
                            .frame(maxWidth: .infinity)

                        if copies == maxCopies {
                            HStack(spacing: 10) {
                                PixelIconView(icon: .warning, size: 24, color: Panel.salmon)
                                PixelText(text: "MAXIMUM FOR ONE SESSION", cell: 3,
                                          colour: Panel.salmon)
                            }
                        }

                        Rectangle().fill(Panel.ink).frame(height: Panel.ruleThin)

                        HStack(spacing: size.pick(14, 10)) {
                            PanelButton(title: "< BACK", cell: 4, action: onBack)
                                .frame(maxWidth: size.pick(230, 150))
                            Spacer(minLength: 0)
                            PanelButton(title: "NEXT >", kind: .primary, cell: 4,
                                        action: onNext)
                                .frame(maxWidth: size.pick(300, 200))
                        }
                    }
                }
                .frame(maxWidth: 900)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(size.pick(30, 16))
        }
    }
}
