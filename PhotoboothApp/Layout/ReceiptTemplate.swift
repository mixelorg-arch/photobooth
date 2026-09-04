import UIKit

/// One row of the receipt's shot order: a name and how far into the session
/// that frame was taken.
struct ReceiptTrack: Equatable {
    let label: String
    let time: String
}

/// One block in a receipt's flow.
///
/// A till roll has no page, so a receipt layout is a list read top to bottom
/// rather than a set of unit rects: every block measures itself and the
/// heights add up to the paper. Sizes are fractions of the roll's printable
/// width, exactly like `SheetDecoration`, so a layout stays correct if the
/// print head's dpi ever changes.
///
/// Tokens, on top of the sheet's: `{longdate}` `{total}` `{link}`
/// `{para}` `{footer}`.
struct ReceiptBlock: Equatable {
    enum Kind: Equatable {
        case gap, rule, runs, row, tracks, photos, paragraph, qr
    }

    var kind: Kind
    /// Gaps: height. Rules: thickness. QR: side. All fractions of the width.
    var size: CGFloat = 0
    /// Rules: dash and gap lengths. 0 dash means a solid rule.
    var dash: CGFloat = 0
    var dashGap: CGFloat = 0
    /// Runs: the lines, each a list of segments set on one baseline.
    var lines: [[ReceiptSegment]] = []
    /// Runs and paragraphs: line height as a multiple of the cap size.
    var leading: CGFloat = 1.12
    /// Runs: pull this block up into the one above it.
    var tight: CGFloat = 0
    /// Runs: space between segments, as a multiple of the cap size.
    var space: CGFloat = 0.22
    /// Rows and tracks and paragraphs: how the type is set.
    var style: ReceiptSegment = ReceiptSegment(text: "", size: 0.032)
    /// Rows: the two ends of the line.
    var left: String = ""
    var right: String = ""
    /// Photographs: grid shape.
    var columns: Int = 1
    var aspect: CGFloat = 1
    var gap: CGFloat = 0
    /// Paragraphs: first-line indent.
    var indent: CGFloat = 0
    /// QR and paragraphs: the text or token to set.
    var text: String = ""

    static func gap(_ height: CGFloat) -> ReceiptBlock {
        ReceiptBlock(kind: .gap, size: height)
    }
    static func rule(weight: CGFloat = 0.0045,
                     dash: CGFloat = 0, gap: CGFloat = 0) -> ReceiptBlock {
        ReceiptBlock(kind: .rule, size: weight, dash: dash, dashGap: gap)
    }
    static func runs(_ lines: [[ReceiptSegment]],
                     leading: CGFloat = 1.12,
                     tight: CGFloat = 0) -> ReceiptBlock {
        ReceiptBlock(kind: .runs, lines: lines, leading: leading, tight: tight)
    }
    static func line(_ segment: ReceiptSegment,
                     leading: CGFloat = 1.12, tight: CGFloat = 0) -> ReceiptBlock {
        runs([[segment]], leading: leading, tight: tight)
    }
    static func row(_ left: String, _ right: String,
                    style: ReceiptSegment, leading: CGFloat = 1.7) -> ReceiptBlock {
        ReceiptBlock(kind: .row, leading: leading, style: style,
                     left: left, right: right)
    }
    static func tracks(style: ReceiptSegment, leading: CGFloat = 1.9) -> ReceiptBlock {
        ReceiptBlock(kind: .tracks, leading: leading, style: style)
    }
    static func photos(columns: Int, aspect: CGFloat, gap: CGFloat = 0) -> ReceiptBlock {
        ReceiptBlock(kind: .photos, columns: columns, aspect: aspect, gap: gap)
    }
    static func paragraph(_ text: String, style: ReceiptSegment,
                          leading: CGFloat = 1.75, indent: CGFloat = 0) -> ReceiptBlock {
        ReceiptBlock(kind: .paragraph, leading: leading, style: style,
                     indent: indent, text: text)
    }
    static func qr(_ text: String = "{link}", size: CGFloat) -> ReceiptBlock {
        ReceiptBlock(kind: .qr, size: size, text: text)
    }
}

/// One run of type on a receipt.
struct ReceiptSegment: Equatable {
    enum Face: Equatable { case sans, mono, script, serif }

    var text: String
    /// Cap size as a fraction of the roll's printable width.
    var size: CGFloat
    var tracking: CGFloat = 0
    var weight: UIFont.Weight = .regular
    var face: Face = .mono
    var italic: Bool = false
    var tone: SheetDecoration.Tone = .ink
    var uppercase: Bool = false
    /// Shrink to this fraction of the width rather than overrunning. A sheet
    /// lets the display word run off the edge on purpose; a receipt cannot,
    /// because the roll simply cuts it off.
    var fits: CGFloat? = nil
}

extension LayoutTemplate {

    /// The head every receipt shares: the wordmark, the shot order, and the
    /// total. Shared rather than repeated so the three rolls can only ever
    /// be changed together.
    static let receiptHead: [ReceiptBlock] = [
        .gap(0.055),
        .line(ReceiptSegment(text: "{event}", size: 0.150, tracking: -0.025,
                             weight: .heavy, face: .sans,
                             uppercase: true, fits: 0.86)),
        .line(ReceiptSegment(text: "{word}", size: 0.135, face: .script,
                             italic: true, fits: 0.76),
              tight: 0.038),
        .gap(0.040),
        .line(ReceiptSegment(text: "SHOT ORDER", size: 0.038, tracking: 0.30)),
        .gap(0.014),
        .line(ReceiptSegment(text: "{longdate}", size: 0.030, tracking: 0.10,
                             tone: .dim)),
        .gap(0.032),
        .rule(dash: 0.014, gap: 0.011),
        .gap(0.022),
        // One row per frame, timed from the first shutter — a real running
        // order, not decoration.
        .tracks(style: ReceiptSegment(text: "", size: 0.033)),
        .gap(0.012),
        .rule(dash: 0.014, gap: 0.011),
        .gap(0.020),
        .row("TOTAL", "{total}", style: ReceiptSegment(text: "", size: 0.033)),
        .gap(0.022),
        .rule(dash: 0.014, gap: 0.011),
        .gap(0.055),
    ]

    /// The foot: the small print, the code, and the tag line.
    static let receiptFoot: [ReceiptBlock] = [
        .gap(0.060),
        .paragraph("{para}", style: ReceiptSegment(text: "", size: 0.030),
                   indent: 0.055),
        .gap(0.055),
        .line(ReceiptSegment(text: "ALL RIGHTS RESERVED", size: 0.028,
                             tracking: 0.06, face: .serif, italic: true)),
        .gap(0.038),
        // Skipped whole when no link is set: a code that goes nowhere is
        // worse than no code at all.
        .qr(size: 0.36),
        .gap(0.045),
        .rule(dash: 0.014, gap: 0.011),
        .gap(0.030),
        .line(ReceiptSegment(text: "{footer}", size: 0.031, tracking: 0.22,
                             uppercase: true)),
        .gap(0.075),
    ]

    /// A receipt carries no slots, but the rest of the app counts frames
    /// from them — the shot strip, per-frame retake, the review thumbnails.
    private static func receiptSlots(_ count: Int) -> [LayoutSlot] {
        (0..<count).map { LayoutSlot(0, 0, 1, 1, source: $0) }
    }

    private static func receipt(id: String, name: String, accent: UInt32,
                                shots: Int, columns: Int, aspect: CGFloat,
                                gap: CGFloat) -> LayoutTemplate {
        LayoutTemplate(
            id: id, name: name, subtitle: "RECEIPT",
            slots: receiptSlots(shots),
            fit: .fill,
            margin: 0, gutter: 0, cornerRadius: 0, keyline: 0,
            keylineHex: 0x111111, backgroundHex: 0xFFFFFF,
            mono: true,
            decor: [],
            footerHeight: 0, footerColumns: 1,
            accentHex: accent,
            preferredMedia: .thermal80,
            cellAspect: aspect,
            flow: receiptHead
                + [.photos(columns: columns, aspect: aspect, gap: gap)]
                + receiptFoot)
    }

    static let receiptOne = receipt(id: "receipt-1", name: "1 SHOT",
                                    accent: 0x9BA3A3, shots: 1,
                                    columns: 1, aspect: 4.0 / 5.0, gap: 0)
    static let receiptTwo = receipt(id: "receipt-2", name: "2 SHOTS",
                                    accent: 0xA9A2CE, shots: 2,
                                    columns: 1, aspect: 1, gap: 0.022)
    static let receiptFour = receipt(id: "receipt-4", name: "4 SHOTS",
                                     accent: 0xC97F7F, shots: 4,
                                     columns: 2, aspect: 1, gap: 0.020)

    static let receipts: [LayoutTemplate] = [receiptOne, receiptTwo, receiptFour]
}
