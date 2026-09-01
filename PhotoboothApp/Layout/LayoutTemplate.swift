import UIKit

/// Paper the composed sheet is being made for.
///
/// The renderer works in pixels, so every media definition carries its own
/// DPI. Adding a paper size is a value here, not a change to the pipeline.
struct PrintMedia: Equatable, Hashable {
    let id: String
    let name: String
    /// All-caps short form for the bitmap type on the confirm screen, where
    /// a parenthetical would have to shrink to stay inside its box.
    let shortName: String
    let widthInches: CGFloat
    let heightInches: CGFloat
    let dpi: CGFloat
    /// True for receipt-style thermal: the renderer flattens onto white and
    /// the printer service dithers to 1-bit before sending.
    let isMonochrome: Bool

    var pixelSize: CGSize {
        CGSize(width: (widthInches * dpi).rounded(),
               height: (heightInches * dpi).rounded())
    }

    var isPortrait: Bool { heightInches >= widthInches }

    /// Canon SELPHY CP1500 postcard, borderless. Portrait — the same
    /// 1200 x 1800 @ 300 DPI sheet the desktop booth prints.
    static let postcard4x6 = PrintMedia(
        id: "postcard-4x6", name: "4x6 Postcard (SELPHY)", shortName: "4X6 SELPHY",
        widthInches: 4, heightInches: 6, dpi: 300, isMonochrome: false)

    /// The same paper fed the other way, for a landscape single shot.
    static let postcard6x4 = PrintMedia(
        id: "postcard-6x4", name: "6x4 Postcard (SELPHY, landscape)",
        shortName: "6X4 LANDSCAPE",
        widthInches: 6, heightInches: 4, dpi: 300, isMonochrome: false)

    /// 58 mm receipt roll: 384 dots across at 203 DPI, which is the width
    /// almost every pocket ESC/POS printer actually images.
    static let thermal58 = PrintMedia(
        id: "thermal-58", name: "58mm Thermal Roll", shortName: "58MM THERMAL",
        widthInches: 384.0 / 203.0, heightInches: 576.0 / 203.0,
        dpi: 203, isMonochrome: true)

    /// 80 mm roll: 576 dots across.
    static let thermal80 = PrintMedia(
        id: "thermal-80", name: "80mm Thermal Roll", shortName: "80MM THERMAL",
        widthInches: 576.0 / 203.0, heightInches: 864.0 / 203.0,
        dpi: 203, isMonochrome: true)

    static let all: [PrintMedia] = [postcard4x6, postcard6x4, thermal58, thermal80]
}

/// How a photo is fitted into its slot.
enum SlotFit: String, Codable {
    /// Fill the slot and crop the overflow. What a booth normally wants.
    case fill
    /// Show the whole frame, letterboxed onto the sheet background. The way
    /// out when the camera aspect fights the slot aspect.
    case fit
}

/// One place on the sheet, and which photograph goes in it.
///
/// `source` is what makes duplicate strips possible: two slots pointing at
/// the same shot. It is why `shotCount` is derived from the *distinct*
/// sources rather than written by hand — a slot list and a shot count that
/// disagree is a bug waiting to happen.
struct LayoutSlot: Equatable {
    /// Unit rect inside the content area.
    let rect: CGRect
    /// Index into the captured photographs.
    let source: Int

    init(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, source: Int) {
        self.rect = CGRect(x: x, y: y, width: w, height: h)
        self.source = source
    }
}

/// One piece of the editorial layer: a hairline rule or a run of type.
///
/// Placed in unit space over the whole sheet (or over one strip), so the
/// dressing sits against the paper edge like a magazine rather than inside
/// the photo grid. `y` is a text *baseline*, not a box top, so type sits on
/// a rule the way it does on a printed page.
///
/// Tokens in `text`: `{event}` `{caption}` `{date}` `{word}` `{n}` `{shots}`
/// `{sub}`. `{word}` is the oversized display word and is deliberately not
/// fitted — a long one runs off the edge, and that overrun is the look.
struct SheetDecoration: Equatable {
    enum Kind: Equatable { case rule, text }
    enum Tone: Equatable { case ink, dim, paper }
    enum Align: Equatable { case left, right, centre }

    var kind: Kind = .text
    var text: String = ""
    var x: CGFloat = 0
    var y: CGFloat = 0
    /// Rules only: length as a fraction of the region width.
    var width: CGFloat = 0
    /// Rules: thickness. Text: cap size. Both as a fraction of region width.
    var size: CGFloat = 0.002
    /// Letter spacing, as a fraction of `size`.
    var tracking: CGFloat = 0
    var weight: UIFont.Weight = .regular
    var align: Align = .left
    var tone: Tone = .ink
    var uppercase: Bool = false
    /// Shrink to this fraction of the region width. nil lets it overrun.
    var fits: CGFloat? = nil

    static func rule(x: CGFloat, y: CGFloat, width: CGFloat,
                     weight: CGFloat = 0.0022, tone: Tone = .ink) -> SheetDecoration {
        SheetDecoration(kind: .rule, x: x, y: y, width: width, size: weight, tone: tone)
    }

    static func text(_ text: String, x: CGFloat, y: CGFloat, size: CGFloat,
                     tracking: CGFloat = 0, weight: UIFont.Weight = .regular,
                     align: Align = .left, tone: Tone = .ink,
                     uppercase: Bool = false, fits: CGFloat? = nil) -> SheetDecoration {
        SheetDecoration(kind: .text, text: text, x: x, y: y, size: size,
                        tracking: tracking, weight: weight, align: align,
                        tone: tone, uppercase: uppercase, fits: fits)
    }
}

/// A layout is pure data: a list of unit-space slots plus dressing. Adding a
/// layout means adding a `LayoutTemplate` — the renderer and the print
/// pipeline never learn about it.
struct LayoutTemplate: Identifiable, Equatable {
    let id: String
    let name: String
    let subtitle: String
    /// Slots in unit space (0...1 of the *content* area, i.e. the sheet
    /// inside `margin`).
    let slots: [LayoutSlot]
    let fit: SlotFit
    /// Sheet margin as a fraction of the short edge. 0 = full bleed.
    let margin: CGFloat
    /// Gap between slots, fraction of the short edge. Only meaningful when
    /// slots are laid out edge to edge.
    let gutter: CGFloat
    /// Corner radius of each photo, fraction of the short edge.
    let cornerRadius: CGFloat
    /// Keyline drawn around each photo, fraction of the short edge.
    let keyline: CGFloat
    /// Colour of that keyline. Ink on white stock, paper on dark.
    let keylineHex: UInt32
    let backgroundHex: UInt32
    /// Photographs print monochrome. The design is built on grey plates —
    /// the type only reads against them — so this is on for every layout and
    /// the operator overrides it globally in Admin.
    let mono: Bool
    /// The editorial layer.
    let decor: [SheetDecoration]
    /// Reserve a strip at the foot of the sheet for the dressing.
    let footerHeight: CGFloat   // fraction of the long edge, 0 = none
    /// How many times the branding is repeated across that strip. A
    /// duplicate-strip sheet gets one foot per strip: each half is cut off
    /// and walks away on its own, so each half needs the branding.
    let footerColumns: Int
    /// The layout's signature colour. Fills its tile when chosen and tints
    /// the caption rule when not, so the choices are told apart by colour
    /// before they are read.
    let accentHex: UInt32
    /// Media this layout is designed against; used to pick a default.
    let preferredMedia: PrintMedia
    /// Force every slot to this width:height ratio, centred inside the slot
    /// the grid gave it. nil lets slots take whatever shape the paper makes.
    ///
    /// This is what keeps a 2 x 2 grid reading as four portrait frames on
    /// any paper instead of four squares on some of it. Whichever dimension
    /// runs out first becomes wider side mats or a deeper foot.
    var cellAspect: CGFloat? = nil

    var backgroundColor: UIColor { UIColor(rgb: backgroundHex) }
    var keylineColor: UIColor { UIColor(rgb: keylineHex) }
    var accent: Color { Color(hex: accentHex) }

    /// Distinct photographs this layout needs. Derived, never hand-written.
    var shotCount: Int { Set(slots.map(\.source)).count }

    // MARK: - The six shipped layouts
    //
    // Standard photobooth geometry, dressed like a printed page: a hairline
    // rule, an oversized grotesk word, a running sheet number, and micro
    // caps tracked out underneath.

    /// Full bleed photograph over a deep white foot carrying the word.
    static let oneFullPage = LayoutTemplate(
        id: "one-full", name: "1 SHOT", subtitle: "FULL BLEED",
        slots: [LayoutSlot(0, 0, 1, 1, source: 0)],
        fit: .fill,
        margin: 0, gutter: 0, cornerRadius: 0, keyline: 0, keylineHex: 0xFFFFFF,
        backgroundHex: 0xFFFFFF,
        mono: true,
        decor: [
            .text("{n}.", x: 0.955, y: 0.788, size: 0.052, tracking: -0.02,
                  weight: .heavy, align: .right),
            .rule(x: 0.05, y: 0.805, width: 0.90),
            .text("{word}", x: 0.045, y: 0.905, size: 0.175, tracking: -0.045,
                  weight: .heavy),
            .text("{caption}", x: 0.045, y: 0.948, size: 0.026, tracking: 0.22,
                  tone: .dim, uppercase: true),
            .text("{date}", x: 0.955, y: 0.948, size: 0.026, tracking: 0.12,
                  align: .right, tone: .dim),
        ],
        footerHeight: 0.22, footerColumns: 1, accentHex: 0x9BA3A3,
        preferredMedia: .postcard4x6)

    /// Polaroid: white margin, deep foot, name and index on one line.
    static let onePolaroid = LayoutTemplate(
        id: "one-polaroid", name: "1 SHOT", subtitle: "POLAROID",
        slots: [LayoutSlot(0, 0, 1, 1, source: 0)],
        fit: .fill,
        margin: 0.075, gutter: 0, cornerRadius: 0, keyline: 0, keylineHex: 0xFFFFFF,
        backgroundHex: 0xFFFFFF,
        mono: true,
        decor: [
            .rule(x: 0.085, y: 0.845, width: 0.83, weight: 0.002),
            .text("{event}", x: 0.08, y: 0.905, size: 0.072, tracking: -0.02,
                  weight: .heavy, fits: 0.62),
            .text("{n}.", x: 0.92, y: 0.905, size: 0.072, tracking: -0.02,
                  weight: .heavy, align: .right),
            .text("{caption}", x: 0.08, y: 0.948, size: 0.024, tracking: 0.20,
                  tone: .dim, uppercase: true),
            .text("{date}", x: 0.92, y: 0.948, size: 0.024, tracking: 0.12,
                  align: .right, tone: .dim),
        ],
        footerHeight: 0.19, footerColumns: 1, accentHex: 0xA8BEB2,
        preferredMedia: .postcard4x6)

    /// Two landscape frames over a foot with the display word.
    static let twoStacked = LayoutTemplate(
        id: "two-stack", name: "2 SHOTS", subtitle: "STACKED",
        slots: [LayoutSlot(0, 0,   1, 0.5, source: 0),
                LayoutSlot(0, 0.5, 1, 0.5, source: 1)],
        fit: .fill,
        margin: 0.06, gutter: 0.028, cornerRadius: 0, keyline: 0, keylineHex: 0xFFFFFF,
        backgroundHex: 0xFFFFFF,
        mono: true,
        decor: [
            .text("{n}.", x: 0.95, y: 0.831, size: 0.042, tracking: -0.02,
                  weight: .heavy, align: .right),
            .rule(x: 0.055, y: 0.845, width: 0.89),
            .text("{word}", x: 0.05, y: 0.928, size: 0.130, tracking: -0.04,
                  weight: .heavy),
            .text("{date}", x: 0.05, y: 0.965, size: 0.024, tracking: 0.12, tone: .dim),
            .text("{caption}", x: 0.95, y: 0.965, size: 0.024, tracking: 0.20,
                  align: .right, tone: .dim, uppercase: true),
        ],
        footerHeight: 0.175, footerColumns: 1, accentHex: 0xA9A2CE,
        preferredMedia: .postcard4x6,
        cellAspect: 3.0 / 2.0)

    /// Four portrait frames, two by two.
    static let fourGrid = LayoutTemplate(
        id: "four-grid", name: "4 SHOTS", subtitle: "GRID",
        slots: [LayoutSlot(0,   0,   0.5, 0.5, source: 0),
                LayoutSlot(0.5, 0,   0.5, 0.5, source: 1),
                LayoutSlot(0,   0.5, 0.5, 0.5, source: 2),
                LayoutSlot(0.5, 0.5, 0.5, 0.5, source: 3)],
        fit: .fill,
        margin: 0.055, gutter: 0.026, cornerRadius: 0, keyline: 0, keylineHex: 0xFFFFFF,
        backgroundHex: 0xFFFFFF,
        mono: true,
        decor: [
            .rule(x: 0.05, y: 0.840, width: 0.90),
            .text("{event}", x: 0.048, y: 0.918, size: 0.092, tracking: -0.03,
                  weight: .heavy, fits: 0.60),
            .text("{n}.", x: 0.952, y: 0.918, size: 0.092, tracking: -0.03,
                  weight: .heavy, align: .right),
            .text("{caption}", x: 0.048, y: 0.960, size: 0.024, tracking: 0.20,
                  tone: .dim, uppercase: true),
            .text("{date}", x: 0.952, y: 0.960, size: 0.024, tracking: 0.12,
                  align: .right, tone: .dim),
        ],
        footerHeight: 0.175, footerColumns: 1, accentHex: 0xC97F7F,
        preferredMedia: .postcard4x6,
        cellAspect: 2.0 / 3.0)

    /// The classic: two identical 2x6 strips on one 4x6, cut down the middle
    /// so two people each walk away with one. Eight slots, four photographs,
    /// hairline frames, and a foot on each half.
    static let fourStripDuo = LayoutTemplate(
        id: "four-strip-duo", name: "4 SHOTS", subtitle: "DOUBLE STRIP",
        slots: [LayoutSlot(0,   0,    0.5, 0.25, source: 0),
                LayoutSlot(0.5, 0,    0.5, 0.25, source: 0),
                LayoutSlot(0,   0.25, 0.5, 0.25, source: 1),
                LayoutSlot(0.5, 0.25, 0.5, 0.25, source: 1),
                LayoutSlot(0,   0.5,  0.5, 0.25, source: 2),
                LayoutSlot(0.5, 0.5,  0.5, 0.25, source: 2),
                LayoutSlot(0,   0.75, 0.5, 0.25, source: 3),
                LayoutSlot(0.5, 0.75, 0.5, 0.25, source: 3)],
        fit: .fill,
        margin: 0.05, gutter: 0.026, cornerRadius: 0,
        keyline: 0.0022, keylineHex: 0x111111,
        backgroundHex: 0xFFFFFF,
        mono: true,
        decor: [
            .rule(x: 0.10, y: 0.878, width: 0.80, weight: 0.004),
            .text("{event}", x: 0.10, y: 0.926, size: 0.058, tracking: 0.02,
                  weight: .heavy, uppercase: true, fits: 0.80),
            .text("{date}", x: 0.10, y: 0.962, size: 0.030, tracking: 0.16, tone: .dim),
            .text("{n}.", x: 0.90, y: 0.962, size: 0.030, tracking: 0.10,
                  weight: .bold, align: .right, tone: .dim),
        ],
        footerHeight: 0.135, footerColumns: 2, accentHex: 0xA9A2CE,
        preferredMedia: .postcard4x6,
        cellAspect: 3.0 / 2.0)

    /// Contact sheet: six landscape frames, 2 x 3.
    static let sixGrid = LayoutTemplate(
        id: "six-grid", name: "6 SHOTS", subtitle: "CONTACT SHEET",
        slots: [LayoutSlot(0,   0,       0.5, 1.0/3.0, source: 0),
                LayoutSlot(0.5, 0,       0.5, 1.0/3.0, source: 1),
                LayoutSlot(0,   1.0/3.0, 0.5, 1.0/3.0, source: 2),
                LayoutSlot(0.5, 1.0/3.0, 0.5, 1.0/3.0, source: 3),
                LayoutSlot(0,   2.0/3.0, 0.5, 1.0/3.0, source: 4),
                LayoutSlot(0.5, 2.0/3.0, 0.5, 1.0/3.0, source: 5)],
        fit: .fill,
        margin: 0.055, gutter: 0.022, cornerRadius: 0, keyline: 0, keylineHex: 0xFFFFFF,
        backgroundHex: 0xFFFFFF,
        mono: true,
        decor: [
            .text("{n}.", x: 0.952, y: 0.848, size: 0.038, tracking: -0.02,
                  weight: .heavy, align: .right),
            .rule(x: 0.05, y: 0.862, width: 0.90),
            .text("{word}", x: 0.048, y: 0.942, size: 0.115, tracking: -0.04,
                  weight: .heavy),
            .text("{caption}", x: 0.048, y: 0.976, size: 0.022, tracking: 0.20,
                  tone: .dim, uppercase: true),
            .text("{date}", x: 0.952, y: 0.976, size: 0.022, tracking: 0.14,
                  align: .right, tone: .dim),
        ],
        footerHeight: 0.155, footerColumns: 1, accentHex: 0x9BA3A3,
        preferredMedia: .postcard4x6,
        cellAspect: 3.0 / 2.0)

    /// Everything the app knows how to print.
    static let all: [LayoutTemplate] = [
        oneFullPage, onePolaroid, twoStacked, fourGrid, fourStripDuo, sixGrid,
    ]

    /// What the guest is offered on the layout screen — all of them.
    static let guestChoices: [LayoutTemplate] = all

    static func template(id: String) -> LayoutTemplate {
        all.first { $0.id == id } ?? oneFullPage
    }
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red:   CGFloat((rgb >> 16) & 0xFF) / 255,
                  green: CGFloat((rgb >> 8)  & 0xFF) / 255,
                  blue:  CGFloat( rgb        & 0xFF) / 255,
                  alpha: 1)
    }
}
