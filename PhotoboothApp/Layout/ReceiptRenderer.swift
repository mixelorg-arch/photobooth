import UIKit
import CoreImage

/// Composes a receipt for an 80 mm thermal roll.
///
/// A roll has no page, so this is a *flow*: every block measures itself, the
/// heights sum to the canvas, and the same list then draws into it. Measure
/// and draw walk the identical array so the two passes cannot drift apart.
///
/// A direct port of the receipt half of `web/booth.js` — same block list,
/// same fractions, same faces. A change to the flow maths has to land in
/// both or the browser preview stops being the truth about the paper.
enum ReceiptRenderer {

    /// Where one block landed, and anything the measure pass worked out that
    /// the draw pass would otherwise have to compute twice.
    private struct Placed {
        let block: ReceiptBlock
        let y: CGFloat
        let height: CGFloat
        var lines: [MeasuredLine] = []
        var paragraph: [ParagraphLine] = []
    }
    private struct MeasuredLine {
        var segments: [(segment: ReceiptSegment, text: String,
                        size: CGFloat, width: CGFloat)]
        var width: CGFloat
        var cap: CGFloat
        var height: CGFloat
    }
    private struct ParagraphLine {
        var words: [String]
        var indent: CGFloat
        var isLast: Bool
    }

    /// The finished height of a receipt, without drawing it. The confirm
    /// screen and the preview wells need to know how long the paper will be
    /// before there is an image.
    static func height(template: LayoutTemplate,
                       media: PrintMedia,
                       branding: PrintBranding) -> CGFloat {
        let width = (media.widthInches * media.dpi).rounded()
        return plan(template: template, branding: branding, width: width).height
    }

    static func render(photos: [UIImage?],
                       template: LayoutTemplate,
                       media: PrintMedia,
                       branding: PrintBranding,
                       numberEmptySlots: Bool,
                       mono: Bool) -> UIImage {

        let width = (media.widthInches * media.dpi).rounded()
        let laid = plan(template: template, branding: branding, width: width)
        let size = CGSize(width: width, height: laid.height)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        format.preferredRange = .standard

        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.cgContext.fill(CGRect(origin: .zero, size: size))
            draw(laid, in: ctx.cgContext, template: template,
                 branding: branding, photos: photos, width: width,
                 numberEmptySlots: numberEmptySlots, mono: mono)
        }
    }

    // MARK: - Measure

    private struct Plan {
        var items: [Placed]
        var height: CGFloat
        var pad: CGFloat
        var contentWidth: CGFloat
    }

    private static func plan(template: LayoutTemplate,
                             branding: PrintBranding,
                             width W: CGFloat) -> Plan {
        let pad = template.receiptPadding * W
        let contentWidth = W - pad * 2
        var items: [Placed] = []
        var y: CGFloat = 0

        for block in template.flow {
            guard var placed = measure(block, template: template,
                                       branding: branding,
                                       width: W, contentWidth: contentWidth)
            else { continue }                 // this block has nothing to say
            y -= block.tight * W
            placed = Placed(block: placed.block, y: y, height: placed.height,
                            lines: placed.lines, paragraph: placed.paragraph)
            items.append(placed)
            y += placed.height
        }
        return Plan(items: items, height: max(1, y.rounded()),
                    pad: pad, contentWidth: contentWidth)
    }

    private static func measure(_ block: ReceiptBlock,
                                template: LayoutTemplate,
                                branding: PrintBranding,
                                width W: CGFloat,
                                contentWidth: CGFloat) -> Placed? {
        switch block.kind {
        case .gap:
            return Placed(block: block, y: 0, height: block.size * W)

        case .rule:
            return Placed(block: block, y: 0, height: max(1, block.size * W))

        case .runs:
            var lines: [MeasuredLine] = []
            for line in block.lines {
                var segments: [(segment: ReceiptSegment, text: String,
                                size: CGFloat, width: CGFloat)] = []
                var width: CGFloat = 0
                for segment in line {
                    let text = resolved(segment.text, branding: branding,
                                        template: template,
                                        uppercase: segment.uppercase)
                    guard !text.isEmpty else { continue }
                    let measured = fitted(text, segment, width: W)
                    if !segments.isEmpty { width += block.space * segment.size * W }
                    width += measured.width
                    segments.append((segment, text, measured.size, measured.width))
                }
                guard !segments.isEmpty else { continue }
                let cap = segments.map(\.size).max() ?? 0
                lines.append(MeasuredLine(segments: segments, width: width,
                                          cap: cap, height: cap * block.leading))
            }
            guard !lines.isEmpty else { return nil }
            return Placed(block: block, y: 0,
                          height: lines.reduce(0) { $0 + $1.height }, lines: lines)

        case .row:
            let right = resolved(block.right, branding: branding, template: template)
            guard !right.isEmpty else { return nil }
            return Placed(block: block, y: 0,
                          height: block.style.size * W * block.leading)

        case .tracks:
            guard !branding.tracks.isEmpty else { return nil }
            return Placed(block: block, y: 0,
                          height: CGFloat(branding.tracks.count)
                                  * block.style.size * W * block.leading)

        case .photos:
            let columns = max(1, block.columns)
            let rows = Int(ceil(Double(template.shotCount) / Double(columns)))
            let gap = block.gap * W
            let cellWidth = (contentWidth - gap * CGFloat(columns - 1)) / CGFloat(columns)
            return Placed(block: block, y: 0,
                          height: CGFloat(rows) * (cellWidth / block.aspect)
                                  + gap * CGFloat(rows - 1))

        case .paragraph:
            let text = resolved(block.text, branding: branding, template: template)
            guard !text.isEmpty else { return nil }
            let lines = wrap(text, block: block, width: W, contentWidth: contentWidth)
            return Placed(block: block, y: 0,
                          height: CGFloat(lines.count) * block.style.size * W * block.leading,
                          paragraph: lines)

        case .qr:
            let link = resolved(block.text, branding: branding, template: template)
            guard !link.isEmpty else { return nil }
            return Placed(block: block, y: 0, height: block.size * W)
        }
    }

    /// Greedy word wrap, with the first line indented like the reference.
    private static func wrap(_ text: String, block: ReceiptBlock,
                             width W: CGFloat, contentWidth: CGFloat) -> [ParagraphLine] {
        let indent = block.indent * W
        var lines: [ParagraphLine] = []
        var current: [String] = []
        var limit = contentWidth - indent

        for word in text.split(separator: " ").map(String.init) {
            let candidate = current + [word]
            let width = fitted(candidate.joined(separator: " "),
                               block.style, width: W).width
            if !current.isEmpty && width > limit {
                lines.append(ParagraphLine(words: current,
                                           indent: lines.isEmpty ? indent : 0,
                                           isLast: false))
                current = [word]
                limit = contentWidth
            } else {
                current = candidate
            }
        }
        if !current.isEmpty {
            lines.append(ParagraphLine(words: current,
                                       indent: lines.isEmpty ? indent : 0,
                                       isLast: true))
        }
        if !lines.isEmpty { lines[lines.count - 1].isLast = true }
        return lines
    }

    // MARK: - Draw

    private static func draw(_ plan: Plan, in cg: CGContext,
                             template: LayoutTemplate,
                             branding: PrintBranding,
                             photos: [UIImage?],
                             width W: CGFloat,
                             numberEmptySlots: Bool,
                             mono: Bool) {
        let pad = plan.pad, contentWidth = plan.contentWidth

        for item in plan.items {
            let block = item.block
            let y = item.y

            switch block.kind {
            case .gap:
                continue

            case .rule:
                let weight = max(1, block.size * W)
                PhotoLayoutRenderer.tint(.ink).setFill()
                if block.dash > 0 {
                    let dash = block.dash * W
                    let gap = (block.dashGap > 0 ? block.dashGap : block.dash * 0.8) * W
                    var x = pad
                    while x < pad + contentWidth - 0.5 {
                        cg.fill(CGRect(x: x, y: y,
                                       width: min(dash, pad + contentWidth - x),
                                       height: weight))
                        x += dash + gap
                    }
                } else {
                    cg.fill(CGRect(x: pad, y: y, width: contentWidth, height: weight))
                }

            case .runs:
                var lineY = y
                for line in item.lines {
                    let baseline = lineY + line.cap * 0.80
                    var x = pad + (contentWidth - line.width) / 2
                    for entry in line.segments {
                        drawSegment(entry.text, entry.segment, at: CGPoint(x: x, y: baseline),
                                    pointSize: entry.size, align: .left)
                        x += entry.width + block.space * entry.segment.size * W
                    }
                    lineY += line.height
                }

            case .row:
                let size = block.style.size * W
                let baseline = y + size * 0.80
                let left = resolved(block.left, branding: branding,
                                    template: template, uppercase: true)
                let right = resolved(block.right, branding: branding, template: template)
                if !left.isEmpty {
                    drawSegment(left, block.style, at: CGPoint(x: pad, y: baseline),
                                pointSize: size, align: .left)
                }
                if !right.isEmpty {
                    drawSegment(right, block.style,
                                at: CGPoint(x: pad + contentWidth, y: baseline),
                                pointSize: size, align: .right)
                }

            case .tracks:
                let size = block.style.size * W
                let step = size * block.leading
                for (index, track) in branding.tracks.enumerated() {
                    let baseline = y + CGFloat(index) * step + size * 0.80
                    let label = fitted(track.label.uppercased(), block.style,
                                       width: W, maxWidth: contentWidth * 0.72)
                    drawSegment(track.label.uppercased(), block.style,
                                at: CGPoint(x: pad, y: baseline),
                                pointSize: label.size, align: .left)
                    drawSegment(track.time, block.style,
                                at: CGPoint(x: pad + contentWidth, y: baseline),
                                pointSize: size, align: .right)
                }

            case .photos:
                let columns = max(1, block.columns)
                let gap = block.gap * W
                let cellWidth = (contentWidth - gap * CGFloat(columns - 1)) / CGFloat(columns)
                let cellHeight = cellWidth / block.aspect
                for index in 0..<template.shotCount {
                    let frame = CGRect(
                        x: pad + CGFloat(index % columns) * (cellWidth + gap),
                        y: y + CGFloat(index / columns) * (cellHeight + gap),
                        width: cellWidth, height: cellHeight)
                    cg.saveGState()
                    cg.clip(to: frame)
                    if let photo = photos.indices.contains(index) ? photos[index] : nil {
                        // Thermal paper is one bit deep. Grey is the honest
                        // preview of what the head will dither; colour is a lie.
                        PhotoLayoutRenderer.drawCovering(photo, in: frame,
                                                         fit: .fill, mono: mono)
                    } else {
                        UIColor(white: 0, alpha: 0.10).setFill()
                        cg.fill(frame)
                        if numberEmptySlots {
                            PhotoLayoutRenderer.drawSlotNumber(index + 1, in: frame,
                                                               onDark: false)
                        }
                    }
                    cg.restoreGState()
                }

            case .paragraph:
                let size = block.style.size * W
                let step = size * block.leading
                let spaceWidth = fitted(" ", block.style, width: W).width
                for (index, line) in item.paragraph.enumerated() {
                    let baseline = y + CGFloat(index) * step + size * 0.80
                    let room = contentWidth - line.indent
                    let natural = fitted(line.words.joined(separator: " "),
                                         block.style, width: W).width
                    // Justified, like the reference: every line but the last
                    // is set to the full measure by opening the word spaces.
                    let extra = (!line.isLast && line.words.count > 1)
                        ? (room - natural) / CGFloat(line.words.count - 1) : 0
                    var x = pad + line.indent
                    for word in line.words {
                        let width = fitted(word, block.style, width: W).width
                        drawSegment(word, block.style, at: CGPoint(x: x, y: baseline),
                                    pointSize: size, align: .left)
                        x += width + spaceWidth + extra
                    }
                }

            case .qr:
                let link = resolved(block.text, branding: branding, template: template)
                let side = block.size * W
                drawQR(link, in: CGRect(x: pad + (contentWidth - side) / 2, y: y,
                                        width: side, height: side), in: cg)
            }
        }
    }

    // MARK: - Type

    private static func font(_ segment: ReceiptSegment, size: CGFloat) -> UIFont {
        // The four faces both builds set. All of them ship with iOS, so
        // nothing has to be downloaded — a face that failed to load would
        // silently reflow a guest's souvenir.
        let name: String
        switch segment.face {
        case .sans:
            switch segment.weight {
            case .heavy, .black: name = "HelveticaNeue-Bold"
            case .bold:          name = "HelveticaNeue-Medium"
            default:             name = "HelveticaNeue"
            }
        case .mono:
            if segment.italic      { name = "CourierNewPS-ItalicMT" }
            else if segment.weight == .bold || segment.weight == .heavy {
                name = "CourierNewPS-BoldMT"
            } else                 { name = "CourierNewPSMT" }
        case .script:
            name = segment.weight == .regular ? "SnellRoundhand" : "SnellRoundhand-Bold"
        case .serif:
            name = segment.italic ? "Georgia-Italic" : "Georgia"
        }
        return UIFont(name: name, size: size)
            ?? .systemFont(ofSize: size, weight: segment.weight)
    }

    private static func attributes(_ segment: ReceiptSegment,
                                   size: CGFloat) -> [NSAttributedString.Key: Any] {
        [.font: font(segment, size: size),
         .foregroundColor: PhotoLayoutRenderer.tint(segment.tone),
         .kern: segment.tracking * size]
    }

    /// The width of a run, and the size it shrank to if it was limited.
    private static func fitted(_ text: String, _ segment: ReceiptSegment,
                               width W: CGFloat,
                               maxWidth: CGFloat? = nil) -> (size: CGFloat, width: CGFloat) {
        var size = segment.size * W
        var measured = (text as NSString).size(withAttributes: attributes(segment, size: size))
        let limit = maxWidth ?? segment.fits.map { $0 * W }
        if let limit {
            while size > 4 && measured.width > limit {
                size -= max(1, size * 0.04)
                measured = (text as NSString)
                    .size(withAttributes: attributes(segment, size: size))
            }
        }
        return (size, measured.width)
    }

    private static func drawSegment(_ text: String, _ segment: ReceiptSegment,
                                    at origin: CGPoint, pointSize: CGFloat,
                                    align: SheetDecoration.Align) {
        let attrs = attributes(segment, size: pointSize)
        let measured = (text as NSString).size(withAttributes: attrs)
        var x = origin.x
        switch align {
        case .left:   break
        case .right:  x -= measured.width
        case .centre: x -= measured.width / 2
        }
        // `origin.y` is the baseline; `draw(at:)` wants a top-left.
        let font = attrs[.font] as? UIFont
        (text as NSString).draw(at: CGPoint(x: x, y: origin.y - (font?.ascender ?? pointSize)),
                                withAttributes: attrs)
    }

    // MARK: - QR

    private static let ciContext = CIContext(options: [.useSoftwareRenderer: true])

    /// Draws a QR code centred in `box`, at a whole number of device pixels
    /// per module. A fractional module on a 203 dpi head prints as a smear
    /// no phone can read, so the code is snapped to the pixel grid and the
    /// leftover becomes quiet zone.
    private static func drawQR(_ text: String, in box: CGRect, in cg: CGContext) {
        guard let data = text.data(using: .utf8),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage,
              let image = ciContext.createCGImage(output, from: output.extent)
        else { return }

        // CIQRCodeGenerator already leaves a border; four more modules takes
        // it to the quiet zone the spec asks for.
        let modules = output.extent.width + 8
        let unit = max(1, floor(min(box.width, box.height) / modules))
        let side = unit * output.extent.width
        let inner = CGRect(x: (box.midX - unit * modules / 2 + unit * 4).rounded(),
                           y: (box.midY - unit * modules / 2 + unit * 4).rounded(),
                           width: side, height: side)

        cg.saveGState()
        UIColor.white.setFill()
        cg.fill(box)
        cg.interpolationQuality = .none          // hard pixels, never a blur
        cg.translateBy(x: 0, y: inner.maxY + inner.minY)
        cg.scaleBy(x: 1, y: -1)                  // CGImage draws bottom-up
        cg.draw(image, in: inner)
        cg.restoreGState()
    }

    // MARK: - Tokens

    private static func resolved(_ text: String, branding: PrintBranding,
                                 template: LayoutTemplate,
                                 uppercase: Bool = false) -> String {
        let resolved = PhotoLayoutRenderer.resolveTokens(text, branding: branding,
                                                         template: template)
        return uppercase ? resolved.uppercased() : resolved
    }
}
