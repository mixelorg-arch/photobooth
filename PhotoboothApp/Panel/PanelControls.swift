import SwiftUI

/// A push button: 4pt black frame on paper, or solid ink for the primary
/// action. Pressing inverts it — there is no bevel to sink, so the invert is
/// the whole feedback, and it has to be instant.
struct PanelButton: View {
    enum Kind {
        case normal
        case primary      // solid ink, inverted label
        case danger       // salmon fill
        case confirm      // sage fill
    }

    let title: String
    var kind: Kind = .normal
    var cell: CGFloat = 5
    var enabled: Bool = true
    var minHeight: CGFloat = Panel.touchTarget
    let action: () -> Void

    @Environment(\.panelSize) private var size
    @State private var held = false

    private var inverted: Bool {
        (kind == .primary) != held        // primary starts inverted; press flips
    }

    private var fill: Color {
        if !enabled { return Panel.paper }
        if inverted { return Panel.ink }
        switch kind {
        case .danger:  return Panel.salmon
        case .confirm: return Panel.sage
        default:       return Panel.paper
        }
    }

    private var labelColour: Color {
        if !enabled { return Panel.hair }
        return inverted ? Panel.paper : Panel.ink
    }

    var body: some View {
        Button(action: { if enabled { action() } }) {
            // The label shrinks on a phone; the target never does. 68pt is
            // the floor whatever the stage.
            PixelText(text: title, cell: size.pick(cell, max(3, cell - 1)),
                      colour: labelColour)
                .padding(.horizontal, size.pick(18, 12))
                .frame(maxWidth: .infinity, minHeight: minHeight)
                .background {
                    if enabled {
                        fill
                    } else {
                        // Disabled is hatched, not greyed: a grey fill has no
                        // meaning in a two-colour system.
                        DiagonalHatch(spacing: 12, colour: Panel.hair)
                    }
                }
                .heavyFramed()
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in if enabled { held = true } }
                .onEnded { _ in held = false }
        )
    }
}

/// Diagonal hatching, used for disabled fills and the modal scrim.
struct DiagonalHatch: View {
    var spacing: CGFloat = 16
    var colour: Color = Panel.ink
    var lineWidth: CGFloat = 8

    var body: some View {
        Canvas { ctx, size in
            let span = size.width + size.height
            var x = -size.height
            while x < span {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                ctx.stroke(path, with: .color(colour), lineWidth: lineWidth)
                x += spacing + lineWidth
            }
        }
        .allowsHitTesting(false)
    }
}

/// A layout choice: the sheet in a dark well, with a caption rule under it
/// carrying the name, a dashed leader and the subtitle.
struct PanelTile<Preview: View>: View {
    @Environment(\.panelSize) private var size
    let title: String
    let subtitle: String
    /// The layout's signature colour: a bar across the top always, and the
    /// whole tile when it is chosen. Six choices are told apart by colour
    /// before anyone reads them.
    var accent: Color = Panel.lavender
    var selected: Bool
    let action: () -> Void
    @ViewBuilder var preview: () -> Preview

    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                Rectangle().fill(accent).frame(height: 10)

                preview()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(8)
                    .background(Panel.display)
                    .padding(8)

                HStack(spacing: size.pick(10, 6)) {
                    PixelText(text: title, cell: size.pick(4, 3),
                              colour: selected ? Panel.paper : Panel.ink)
                    DashedLead(colour: selected ? Panel.paper : accent, opacity: 1)
                    PixelText(text: subtitle, cell: size.pick(3, 2),
                              colour: selected ? Panel.paper : Panel.ink)
                }
                .padding(.horizontal, size.pick(12, 8))
                .padding(.vertical, size.pick(10, 7))
                .background(selected ? Panel.ink : Panel.paper)
                .overlay(alignment: .top) {
                    Rectangle().fill(Panel.ink).frame(height: Panel.rule)
                }
            }
            .background(selected ? accent : Panel.paper)
            .heavyFramed()
        }
        .buttonStyle(.plain)
    }
}

/// The copy picker: two big square buttons and the count in a heavy box.
struct PanelStepper: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    var accent: Color = Panel.lavender

    @Environment(\.panelSize) private var size

    var body: some View {
        let side = size.pick(138, 96)
        let boxWidth = size.pick(210, 150)
        let numeral = size.pick(14, 10)

        HStack(spacing: size.pick(18, 12)) {
            PanelButton(title: "-", kind: .normal, cell: size.pick(7, 5),
                        enabled: value > range.lowerBound, minHeight: side) {
                value = max(range.lowerBound, value - 1)
            }
            .frame(width: side)

            PixelText(text: "\(value)", cell: numeral)
                // Padding before the frame, so the accent bar sits under the
                // numeral rather than through its feet.
                .padding(.bottom, size.pick(14, 10))
                .frame(width: boxWidth, height: side)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(accent).frame(height: size.pick(10, 7))
                }
                .heavyFramed()

            PanelButton(title: "+", kind: .normal, cell: size.pick(7, 5),
                        enabled: value < range.upperBound, minHeight: side) {
                value = min(range.upperBound, value + 1)
            }
            .frame(width: side)
        }
    }
}

/// The segmented fill bar — blocks in a heavy box, the reference's crossover
/// control. Used for the countdown and the print job.
struct PanelBar: View {
    @Environment(\.panelSize) private var size
    var progress: Double
    var blocks: Int = 26
    var tint: Color = Panel.lavender

    var body: some View {
        GeometryReader { geo in
            let filled = Int((Double(blocks) * max(0, min(1, progress))).rounded())
            HStack(spacing: 3) {
                ForEach(0..<blocks, id: \.self) { i in
                    Rectangle().fill(i < filled ? tint : Color.clear)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .padding(size.pick(5, 4))
        .frame(height: size.pick(42, 32))
        .heavyFramed()
    }
}

/// One cell per shot, divided by dashed rules — the reference's fader group.
/// Taken shots fill the layout's accent, the live one is hatched salmon.
///
/// `taken` is a per-slot list rather than a count: after a retake, frames 1
/// and 3 can be filled while 2 and 4 are not.
struct ShotStrip: View {
    @Environment(\.panelSize) private var size
    let total: Int
    let taken: [Bool]
    let current: Int
    var accent: Color = Panel.lavender

    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<total, id: \.self) { index in
                let live = index + 1 == current
                let done = !live && taken.indices.contains(index) && taken[index]
                ZStack {
                    if live { DiagonalHatch(spacing: 8, colour: Panel.salmon, lineWidth: 8) }
                    else if done { accent }
                    else { Panel.paper }
                }
                .overlay(alignment: .trailing) {
                    if index < total - 1 {
                        Rectangle()
                            .strokeBorder(style: StrokeStyle(lineWidth: Panel.ruleThin,
                                                            dash: [6, 6]))
                            .foregroundStyle(Panel.ink)
                            .frame(width: Panel.ruleThin)
                    }
                }
            }
        }
        .frame(height: size.pick(48, 34))
        .heavyFramed()
    }
}

/// `LABEL ------- VALUE`, the reference's most characteristic detail.
struct SpecRow: View {
    let key: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            PixelText(text: key, cell: 3, colour: Panel.ink)
            DashedLead()
            PixelText(text: value, cell: 3, colour: Panel.ink)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .heavyFramed(Panel.ruleThin)
        }
    }
}

/// The dark display panel: camera preview, sheet proofs, anything that is a
/// picture rather than a control.
struct DisplayWell<Content: View>: View {
    var showsGrid: Bool = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            Panel.display
            content()
            if showsGrid { DisplayGrid() }
        }
        .clipped()
        .heavyFramed()
    }
}

/// Dashed measurement grid over the display panel.
struct DisplayGrid: View {
    var columns: Int = 8
    var rows: Int = 4

    var body: some View {
        Canvas { ctx, size in
            let dash = StrokeStyle(lineWidth: 2, dash: [7, 6])
            for c in 1..<max(1, columns) {
                let x = size.width * CGFloat(c) / CGFloat(columns)
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0))
                p.addLine(to: CGPoint(x: x, y: size.height))
                ctx.stroke(p, with: .color(Panel.displayGrid), style: dash)
            }
            for r in 1..<max(1, rows) {
                let y = size.height * CGFloat(r) / CGFloat(rows)
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y))
                p.addLine(to: CGPoint(x: size.width, y: y))
                ctx.stroke(p, with: .color(Panel.displayGrid), style: dash)
            }
        }
        .allowsHitTesting(false)
    }
}
