import SwiftUI

/// The design system: a silkscreened hardware panel.
///
/// Three rules, and everything else follows from them.
///
/// 1. **White paper, black ink, heavy strokes.** Every edge is a 4pt black
///    rule. No bevels, no gradients, no drop shadows — the previous build's
///    light model is gone entirely.
/// 2. **Everything lives in a labelled module.** The label breaks the top
///    rule and a value sits at its right end, the way a hardware front panel
///    is printed. `PanelModule` is that frame, and nearly every screen is
///    one or two of them.
/// 3. **Colour is a fill, never a stroke, and always muted.** Four accents,
///    used sparingly. A screen has to read black-and-white first.
///
/// Type is a real 5x7 bitmap font drawn with `Canvas` (see `PixelFont`),
/// for the same reason the icons are: there is no pixel face on iOS, and the
/// look does not survive a smooth one. Small running text is monospaced.
enum Panel {

    // MARK: - Palette

    static let paper = Color(hex: 0xFFFFFF)
    static let ink   = Color(hex: 0x111111)
    static let dim   = Color(hex: 0x8A8A8A)
    static let hair  = Color(hex: 0xD5D5D5)

    static let lavender = Color(hex: 0xA9A2CE)   // selection, progress
    static let salmon   = Color(hex: 0xC97F7F)   // destructive, alarm
    static let sage     = Color(hex: 0xA8BEB2)   // confirmation
    static let slate    = Color(hex: 0x9BA3A3)   // neutral fill

    /// The dark display panel — the camera preview and every sheet well.
    static let display     = Color(hex: 0x2B2B2B)
    static let displayGrid = Color(hex: 0x4C4C4C)

    // MARK: - Size

    /// Which shape the app is running in.
    ///
    /// Not a device check: a compact stage is any stage too narrow to put two
    /// modules side by side. iPhone portrait is compact, iPad landscape is
    /// regular, and the split is made on measured width so it stays right on
    /// whatever Apple ships next.
    enum Size {
        case compact, regular

        var isCompact: Bool { self == .compact }

        /// Pick between a regular-stage value and a compact one.
        func pick(_ regular: CGFloat, _ compact: CGFloat) -> CGFloat {
            self == .compact ? compact : regular
        }

        static let compactBelow: CGFloat = 700
        /// Below this height the compact rules still do not fit — an iPhone
        /// SE, or any phone with browser bars showing. Everything gives back
        /// a little more.
        static let shortBelow: CGFloat = 740
    }

    // MARK: - Metrics

    static let rule: CGFloat      = 4     // the standard heavy stroke
    static let ruleThin: CGFloat  = 3
    /// Kiosk rule, unchanged: the drawing is fine, the targets are not.
    static let touchTarget: CGFloat = 68
    static let modulePadding: CGFloat = 22
    static let headerHeight: CGFloat  = 84
    static let footerHeight: CGFloat  = 54

    /// The same chrome, trimmed for a phone. A compact stage is around 700pt
    /// tall against the iPad's 1000+, so the frame has to give some back to
    /// the content — but never the touch target, which stays at 68.
    static func headerHeight(_ size: Size) -> CGFloat { size.pick(84, 62) }
    static func footerHeight(_ size: Size) -> CGFloat { size.pick(54, 44) }
    static func modulePadding(_ size: Size) -> CGFloat { size.pick(22, 14) }

    // MARK: - Type

    /// Monospaced running text. Used only where a sentence has to be read —
    /// error detail, operator notes. Everything else is the bitmap face.
    static func mono(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

// MARK: - Strokes

/// A 4pt black rectangle. The only border in the app.
struct HeavyBorder: View {
    var width: CGFloat = Panel.rule
    var colour: Color = Panel.ink

    var body: some View {
        Rectangle()
            .strokeBorder(colour, lineWidth: width)
            .allowsHitTesting(false)
    }
}

/// A dashed leader, as used between a label and its value.
struct DashedLead: View {
    var colour: Color = Panel.ink
    var opacity: Double = 0.45
    var width: CGFloat = Panel.ruleThin

    var body: some View {
        Rectangle()
            .strokeBorder(style: StrokeStyle(lineWidth: width, dash: [width * 2, width * 2]))
            .foregroundStyle(colour.opacity(opacity))
            .frame(height: width)
            .frame(maxWidth: .infinity)
    }
}

/// A solid rule segment — the part of a module's top edge either side of its
/// label.
struct RuleSegment: View {
    var width: CGFloat? = nil          // nil = flexible
    var thickness: CGFloat = Panel.rule
    var colour: Color = Panel.ink

    var body: some View {
        Rectangle()
            .fill(colour)
            .frame(width: width, height: thickness)
            .frame(maxWidth: width == nil ? .infinity : nil)
    }
}

/// The stacked-line hatch either side of the wordmark. Pure decoration, and
/// the thing that makes the header read as printed rather than rendered.
struct Hatch: View {
    var lineHeight: CGFloat = Panel.ruleThin
    var gap: CGFloat = 6
    var height: CGFloat = 36

    var body: some View {
        Canvas { ctx, size in
            var y: CGFloat = 0
            while y < size.height {
                ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: lineHeight)),
                         with: .color(Panel.ink))
                y += lineHeight + gap
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .allowsHitTesting(false)
    }
}

extension View {
    /// The standard heavy frame.
    func heavyFramed(_ width: CGFloat = Panel.rule, colour: Color = Panel.ink) -> some View {
        overlay(HeavyBorder(width: width, colour: colour))
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8)  & 0xFF) / 255,
            blue:  Double( hex        & 0xFF) / 255,
            opacity: 1
        )
    }
}


// MARK: - Environment

private struct PanelSizeKey: EnvironmentKey {
    static let defaultValue: Panel.Size = .regular
}

private struct PanelShortKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    /// Set once at the root from the measured stage; read by every component
    /// that has to change shape. Views never measure for themselves — two
    /// views disagreeing about the breakpoint is how a layout goes crooked.
    var panelSize: Panel.Size {
        get { self[PanelSizeKey.self] }
        set { self[PanelSizeKey.self] = newValue }
    }

    /// A stage too short for the compact rules as well as too narrow. Kept
    /// separate from `panelSize` because it is a second axis: a phone can be
    /// narrow and tall, or narrow and short, and they need different give.
    var panelShort: Bool {
        get { self[PanelShortKey.self] }
        set { self[PanelShortKey.self] = newValue }
    }
}
