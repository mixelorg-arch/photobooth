import SwiftUI

/// A centred module over a hatched scrim. Every confirmation, error and the
/// thank-you screen is one of these.
///
/// The scrim is diagonal hatching rather than a dim overlay: in a two-colour
/// system a grey wash has no meaning, and hatching is how a printed panel
/// marks a region as inactive.
struct PanelDialog: View {
    let title: String
    var value: String = ""
    var icon: PixelIcon = .info
    var iconTint: Color = Panel.lavender
    var accent: Color = Panel.ink
    let message: String
    var detail: String? = nil
    var buttons: [DialogButton] = []
    /// A maximum, not a fixed size: on a phone the dialog takes the stage.
    var width: CGFloat = 760

    @Environment(\.panelSize) private var size

    struct DialogButton: Identifiable {
        let id = UUID()
        let title: String
        var kind: PanelButton.Kind = .normal
        let action: () -> Void
    }

    var body: some View {
        PanelModule(title: title, value: value, titleCell: 4, accent: accent) {
            VStack(alignment: .leading, spacing: size.pick(18, 12)) {
                HStack(alignment: .center, spacing: size.pick(20, 14)) {
                    PixelIconView(icon: icon, size: size.pick(72, 48), color: iconTint)
                    VStack(alignment: .leading, spacing: size.pick(10, 7)) {
                        PixelText(text: message, cell: size.pick(5, 3),
                                  fits: size.pick(width - 200, 220))
                        if let detail {
                            Text(detail)
                                .font(Panel.mono(14))
                                .foregroundStyle(Panel.dim)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                }

                if !buttons.isEmpty {
                    HStack(spacing: size.pick(12, 10)) {
                        Spacer(minLength: 0)
                        ForEach(buttons) { b in
                            PanelButton(title: b.title, kind: b.kind, cell: 4,
                                        action: b.action)
                                .frame(maxWidth: size.pick(240, 170))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: width)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Hatched modal backing.
struct HatchScrim<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            Panel.paper.opacity(0.93)
            DiagonalHatch(spacing: 12, colour: Panel.ink.opacity(0.09), lineWidth: 10)
            content()
        }
        .ignoresSafeArea()
    }
}
