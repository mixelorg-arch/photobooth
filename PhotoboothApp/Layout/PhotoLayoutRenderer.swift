import UIKit

/// Optional dressing stamped into the footer strip of a layout.
struct PrintBranding: Equatable {
    var eventName: String = ""
    var caption: String = ""
    /// Stamp the session's date.
    var showsDate: Bool = true
    var date: Date = Date()
    /// The oversized display word. Falls back to the event name.
    var word: String = ""
    /// The "003." on the sheet — a running count across the event, which is
    /// what makes it read as a print run rather than decoration.
    var sequence: Int = 1
}

/// Composes 1 or 4 photographs plus a `LayoutTemplate` into one flattened,
/// print-ready image at the media's own pixel size.
///
/// Everything downstream — AirPrint, ESC/POS, the confirmation preview —
/// takes this single `UIImage`. No print path ever sees a layout, and no
/// layout ever sees a printer.
enum PhotoLayoutRenderer {

    /// - Parameters:
    ///   - photos: one entry per shot the layout needs, `nil` where a frame
    ///     has not been taken (or is being retaken). Empty entries render as
    ///     wells, which is what the capture screen wants.
    ///   - numberEmptySlots: draw the slot number in each empty well. For
    ///     previews only — a number must never be able to reach paper, so
    ///     nothing on the print path ever passes true.
    static func render(photos: [UIImage?],
                       template: LayoutTemplate,
                       media: PrintMedia,
                       branding: PrintBranding = PrintBranding(),
                       numberEmptySlots: Bool = false,
                       monoOverride: Bool? = nil) -> UIImage {

        let size = media.pixelSize
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1                 // we are already working in device pixels
        format.opaque = true
        format.preferredRange = .standard

        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let cg = ctx.cgContext
            let sheet = CGRect(origin: .zero, size: size)

            // Monochrome media gets a white ground whatever the layout says —
            // a cream mat dithers into a field of noise on thermal paper.
            let ground = media.isMonochrome ? UIColor.white : template.backgroundColor
            ground.setFill()
            cg.fill(sheet)

            let short = min(size.width, size.height)
            let long  = max(size.width, size.height)

            let margin = template.margin * short
            let footer = template.footerHeight * long
            let content = sheet
                .insetBy(dx: margin, dy: margin)
                .divided(atDistance: max(0, footer - margin), from: .maxYEdge).remainder

            drawSlots(in: cg, content: content, photos: photos,
                      template: template, media: media, short: short,
                      numberEmptySlots: numberEmptySlots,
                      mono: monoOverride ?? template.mono)

            // The editorial layer, drawn once per strip: each half of a
            // duplicate sheet is cut off and leaves on its own.
            let columns = max(1, template.footerColumns)
            let columnWidth = sheet.width / CGFloat(columns)
            for index in 0..<columns {
                let region = CGRect(x: sheet.minX + columnWidth * CGFloat(index),
                                    y: sheet.minY,
                                    width: columnWidth,
                                    height: sheet.height)
                drawDecor(in: cg, region: region, template: template, branding: branding)
            }
        }
    }

    // MARK: - Slots

    private static func drawSlots(in cg: CGContext,
                                  content: CGRect,
                                  photos: [UIImage?],
                                  template: LayoutTemplate,
                                  media: PrintMedia,
                                  short: CGFloat,
                                  numberEmptySlots: Bool,
                                  mono: Bool) {
        let gutter = template.gutter * short
        let radius = template.cornerRadius * short
        let keyline = template.keyline * short

        for slot in template.slots {
            let unit = slot.rect
            var rect = CGRect(x: content.minX + unit.minX * content.width,
                              y: content.minY + unit.minY * content.height,
                              width: unit.width * content.width,
                              height: unit.height * content.height)

            // The gutter is paid for out of each slot, halved on interior
            // edges so the outer margin stays exactly `template.margin`.
            rect = rect.insetBy(dx: unit.width  < 1 ? gutter / 2 : 0,
                                dy: unit.height < 1 ? gutter / 2 : 0)

            if let aspect = template.cellAspect {
                rect = fitted(aspect: aspect, in: rect)
            }

            guard rect.width > 1, rect.height > 1 else { continue }

            let path = UIBezierPath(roundedRect: rect, cornerRadius: radius)

            guard slot.source < photos.count, photos[slot.source] != nil else {
                // Empty well — a slightly darker patch of the mat, so the
                // capture screen can show "this frame is still to come".
                cg.saveGState()
                path.addClip()
                UIColor.black.withAlphaComponent(media.isMonochrome ? 0.06 : 0.10).setFill()
                cg.fill(rect)
                if numberEmptySlots {
                    let side = min(rect.width, rect.height)
                    let onDark = template.backgroundColor.isDark
                    let attributes: [NSAttributedString.Key: Any] = [
                        .font: UIFont.monospacedSystemFont(ofSize: side * 0.42, weight: .black),
                        .foregroundColor: onDark
                            ? UIColor.white.withAlphaComponent(0.35)
                            : UIColor.black.withAlphaComponent(0.28),
                    ]
                    let label = "\(slot.source + 1)" as NSString
                    let size = label.size(withAttributes: attributes)
                    label.draw(at: CGPoint(x: rect.midX - size.width / 2,
                                           y: rect.midY - size.height / 2),
                               withAttributes: attributes)
                }
                cg.restoreGState()
                strokeKeyline(path, width: keyline, colour: template.keylineColor)
                continue
            }

            cg.saveGState()
            path.addClip()
            if let photo = photos[slot.source] {
                draw(photo, in: rect, fit: template.fit, context: cg)
                if mono {
                    // Desaturate what is inside the clip by painting mid-grey
                    // through the saturation blend. Cheaper and sharper than
                    // routing every frame through Core Image, and it leaves
                    // the paper untouched.
                    cg.setBlendMode(.saturation)
                    UIColor(white: 0.5, alpha: 1).setFill()
                    cg.fill(rect)
                    cg.setBlendMode(.normal)
                }
            }
            cg.restoreGState()

            // Keyline last, so it sits over the photograph's edge rather
            // than being clipped away under it.
            strokeKeyline(path, width: keyline, colour: template.keylineColor)
        }
    }

    private static func strokeKeyline(_ path: UIBezierPath, width: CGFloat,
                                      colour: UIColor) {
        guard width > 0 else { return }
        colour.setStroke()
        path.lineWidth = width
        path.stroke()
    }

    /// Largest rect of the given width:height ratio centred inside `bounds`.
    private static func fitted(aspect: CGFloat, in bounds: CGRect) -> CGRect {
        guard aspect > 0, bounds.width > 0, bounds.height > 0 else { return bounds }
        var w = bounds.width
        var h = w / aspect
        if h > bounds.height {
            h = bounds.height
            w = h * aspect
        }
        return CGRect(x: bounds.midX - w / 2, y: bounds.midY - h / 2, width: w, height: h)
    }

    /// Aspect-fill (crop) or aspect-fit (letterbox) a photo into a rect.
    private static func draw(_ image: UIImage, in rect: CGRect, fit: SlotFit, context cg: CGContext) {
        let src = image.size
        guard src.width > 0, src.height > 0 else { return }

        let scale: CGFloat
        switch fit {
        case .fill: scale = max(rect.width / src.width, rect.height / src.height)
        case .fit:  scale = min(rect.width / src.width, rect.height / src.height)
        }

        let drawn = CGSize(width: src.width * scale, height: src.height * scale)
        let origin = CGPoint(x: rect.midX - drawn.width / 2,
                             y: rect.midY - drawn.height / 2)
        image.draw(in: CGRect(origin: origin, size: drawn))
    }

    // MARK: - The editorial layer

    private static func drawDecor(in cg: CGContext,
                                  region: CGRect,
                                  template: LayoutTemplate,
                                  branding: PrintBranding) {
        let W = region.width, H = region.height

        for item in template.decor {
            switch item.kind {
            case .rule:
                colour(item.tone).setFill()
                cg.fill(CGRect(x: region.minX + item.x * W,
                               y: region.minY + item.y * H,
                               width: item.width * W,
                               height: max(1, item.size * W)))

            case .text:
                let resolved = resolve(item.text, branding: branding, template: template)
                guard !resolved.isEmpty else { continue }
                drawRun(item.uppercase ? resolved.uppercased() : resolved,
                        at: CGPoint(x: region.minX + item.x * W,
                                    y: region.minY + item.y * H),
                        size: item.size * W,
                        tracking: item.tracking * item.size * W,
                        weight: item.weight,
                        align: item.align,
                        colour: colour(item.tone),
                        // Without a limit the display word runs off the edge
                        // on purpose — that is the look.
                        maxWidth: item.fits.map { $0 * W })
            }
        }
    }

    private static func colour(_ tone: SheetDecoration.Tone) -> UIColor {
        switch tone {
        case .ink:   return UIColor(white: 0.067, alpha: 1)
        case .dim:   return UIColor(white: 0.067, alpha: 0.45)
        case .paper: return .white
        }
    }

    private static func resolve(_ text: String,
                                branding: PrintBranding,
                                template: LayoutTemplate) -> String {
        let date: String = {
            guard branding.showsDate else { return "" }
            let f = DateFormatter()
            f.dateFormat = "dd.MM.yyyy"
            return f.string(from: branding.date)
        }()
        let event = branding.eventName.trimmingCharacters(in: .whitespaces)
        // No subtitle fallback for {word}: an unconfigured booth prints
        // nothing there rather than the layout's own name on a souvenir.
        let word = branding.word.trimmingCharacters(in: .whitespaces).isEmpty
            ? event : branding.word.trimmingCharacters(in: .whitespaces)

        return text
            .replacingOccurrences(of: "{event}", with: event)
            .replacingOccurrences(of: "{caption}",
                                  with: branding.caption.trimmingCharacters(in: .whitespaces))
            .replacingOccurrences(of: "{date}", with: date)
            .replacingOccurrences(of: "{word}", with: word)
            .replacingOccurrences(of: "{n}", with: String(format: "%03d", branding.sequence))
            .replacingOccurrences(of: "{shots}", with: String(template.shotCount))
            .replacingOccurrences(of: "{sub}", with: template.subtitle)
            .trimmingCharacters(in: .whitespaces)
    }

    /// One run of type. `origin.y` is the **baseline**, so a line sits on a
    /// rule the way it does in print — `NSString.draw(at:)` takes a top-left,
    /// hence the ascender correction.
    private static func drawRun(_ text: String,
                                at origin: CGPoint,
                                size: CGFloat,
                                tracking: CGFloat,
                                weight: UIFont.Weight,
                                align: SheetDecoration.Align,
                                colour: UIColor,
                                maxWidth: CGFloat?) {
        var pointSize = size
        var attributes = runAttributes(pointSize, tracking: tracking,
                                       weight: weight, colour: colour)
        var measured = (text as NSString).size(withAttributes: attributes)

        if let maxWidth {
            while pointSize > 4 && measured.width > maxWidth {
                pointSize -= max(1, pointSize * 0.04)
                attributes = runAttributes(pointSize,
                                           tracking: tracking * (pointSize / size),
                                           weight: weight, colour: colour)
                measured = (text as NSString).size(withAttributes: attributes)
            }
        }

        var x = origin.x
        switch align {
        case .left:   break
        case .right:  x -= measured.width
        case .centre: x -= measured.width / 2
        }

        let font = attributes[.font] as? UIFont
        let top = origin.y - (font?.ascender ?? pointSize)
        (text as NSString).draw(at: CGPoint(x: x, y: top), withAttributes: attributes)
    }

    private static func runAttributes(_ pointSize: CGFloat,
                                      tracking: CGFloat,
                                      weight: UIFont.Weight,
                                      colour: UIColor) -> [NSAttributedString.Key: Any] {
        // Helvetica Neue rather than the system face, so the two builds set
        // the same grotesk — the browser build asks for it by name.
        let name: String
        switch weight {
        case .heavy, .black: name = "HelveticaNeue-Bold"
        case .bold:          name = "HelveticaNeue-Medium"
        default:             name = "HelveticaNeue"
        }
        let font = UIFont(name: name, size: pointSize)
            ?? .systemFont(ofSize: pointSize, weight: weight)
        return [.font: font, .foregroundColor: colour, .kern: tracking]
    }
}

extension UIColor {
    /// Perceived luminance test, used to pick footer type colour.
    var isDark: Bool {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard getRed(&r, green: &g, blue: &b, alpha: &a) else { return false }
        return (0.299 * r + 0.587 * g + 0.114 * b) < 0.5
    }
}
