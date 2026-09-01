import SwiftUI

/// The labelled module — the one container every screen is built from.
///
/// Its top edge *is* the label row: a short rule stub, the name, a long rule,
/// an optional value, another stub. That is how a hardware front panel is
/// silkscreened, and copying it exactly is what makes a SwiftUI view read as
/// a printed object rather than a card.
///
///     ┌── DECIMATE ──────────── MIX: 100% ──┐
///     │                                     │
///     └─────────────────────────────────────┘
struct PanelModule<Content: View>: View {
    let title: String
    /// Right-hand value on the label rule. Empty draws rule instead.
    var value: String = ""
    var titleCell: CGFloat = 5
    var valueCell: CGFloat = 3
    var accent: Color = Panel.ink
    /// nil takes the padding the current stage calls for.
    var padding: CGFloat? = nil
    @ViewBuilder var content: () -> Content

    @Environment(\.panelSize) private var size

    var body: some View {
        VStack(spacing: 0) {
            labelRule
            content()
                .padding(padding ?? Panel.modulePadding(size))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(Panel.paper)
        // Left, right and bottom only — the label row is the top edge.
        .overlay(alignment: .leading)   { edge(width: Panel.rule) }
        .overlay(alignment: .trailing)  { edge(width: Panel.rule) }
        .overlay(alignment: .bottom)    { edge(height: Panel.rule) }
    }

    private var labelRule: some View {
        HStack(spacing: 10) {
            RuleSegment(width: 18, thickness: Panel.rule, colour: accent)
            PixelText(text: title, cell: size.pick(titleCell, max(3, titleCell - 1)),
                      colour: Panel.ink)
                .layoutPriority(-1)
            RuleSegment(thickness: Panel.rule, colour: accent)
            if !value.isEmpty {
                PixelText(text: value, cell: valueCell, colour: Panel.ink)
                RuleSegment(width: 18, thickness: Panel.rule, colour: accent)
            }
        }
        .frame(height: PixelFont.height(cell: size.pick(titleCell, max(3, titleCell - 1))))
        .padding(.horizontal, 2)
    }

    private func edge(width: CGFloat? = nil, height: CGFloat? = nil) -> some View {
        Rectangle()
            .fill(accent)
            .frame(width: width, height: height)
            .allowsHitTesting(false)
    }
}

/// The persistent header: back arrow, badge, hatch, wordmark, hatch, status.
struct PanelHeader: View {
    var status: String = ""
    /// nil hides the back control — there is nowhere to go from attract.
    var onBack: (() -> Void)? = nil

    @Environment(\.panelSize) private var size

    private var square: CGFloat { size.pick(56, 42) }

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let onBack {
                    Button(action: onBack) {
                        PixelText(text: "<", cell: size.pick(4, 3))
                            .frame(width: square, height: square)
                            .heavyFramed()
                    }
                    .buttonStyle(.plain)
                } else {
                    Color.clear.frame(width: square, height: square)
                }
            }

            // The hatch and the badge are scenery; the wordmark and the step
            // counter are not. On a phone the scenery goes so the wordmark
            // keeps a size worth reading.
            if !size.isCompact {
                PixelIconView(icon: .camera, size: 30, color: Panel.ink)
                    .frame(width: square, height: square)
                    .heavyFramed()
                Hatch()
            }
            PixelText(text: "PHOTOBOOTH", cell: size.pick(8, 4))
                .layoutPriority(-1)
            if !size.isCompact { Hatch() } else { Spacer(minLength: 8) }

            PixelText(text: status, cell: 3)
                .frame(minWidth: size.pick(90, 60), alignment: .trailing)
        }
        .padding(.horizontal, size.pick(12, 8))
        .frame(height: Panel.headerHeight(size))
        .background(Panel.paper)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Panel.ink).frame(height: Panel.rule)
        }
    }
}

/// The bottom strip: screen name, dashed leader, a decorative meter, clock.
struct PanelFooter: View {
    var left: String
    var meter: Double = 0.35

    @Environment(\.panelSize) private var size
    @State private var now = Date()
    private let tick = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 14) {
            PixelText(text: left, cell: 3)
            DashedLead(colour: Panel.hair, opacity: 1)
            HStack(spacing: 0) {
                Rectangle().fill(Panel.sage)
                    .frame(maxWidth: .infinity)
                    .scaleEffect(x: meter, anchor: .leading)
            }
            .frame(width: size.pick(150, 84), height: size.pick(28, 22))
            .padding(3)
            .heavyFramed(Panel.ruleThin)
            PixelText(text: clock, cell: 3)
        }
        .padding(.horizontal, size.pick(14, 10))
        .frame(height: Panel.footerHeight(size))
        .background(Panel.paper)
        .overlay(alignment: .top) {
            Rectangle().fill(Panel.ink).frame(height: Panel.rule)
        }
        .onReceive(tick) { now = $0 }
    }

    private var clock: String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: now)
    }
}

/// Header + content + footer, with the outer 4pt frame around the lot.
struct PanelScreen<Content: View>: View {
    var status: String = ""
    var footer: String = "PHOTOBOOTH"
    var onBack: (() -> Void)? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        // The stage is measured here, once, and published to everything
        // below. iPhone portrait comes out compact, iPad landscape regular.
        GeometryReader { geo in
            let size: Panel.Size = geo.size.width < Panel.Size.compactBelow
                ? .compact : .regular

            VStack(spacing: 0) {
                PanelHeader(status: status, onBack: onBack)
                ZStack {
                    Panel.paper
                    content()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                PanelFooter(left: footer)
            }
            .environment(\.panelSize, size)
        }
        .background(Panel.paper)
        .heavyFramed()
        .ignoresSafeArea()
    }
}
