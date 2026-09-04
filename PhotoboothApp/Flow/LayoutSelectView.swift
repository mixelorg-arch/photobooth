import SwiftUI

/// Layout first, so the capture stage knows whether to shoot one frame or
/// four. Each tile draws its own miniature of the real sheet in a display
/// well — the choice is about what the paper looks like, so show the paper.
struct LayoutSelectView: View {
    let layouts: [LayoutTemplate]
    let media: PrintMedia
    /// Dressing per layout, not one for all of them: a receipt's shot order
    /// has one row per frame, so the tile has to know which layout it is.
    var brandingFor: (LayoutTemplate) -> PrintBranding = { _ in PrintBranding() }
    var mono: Bool = true
    let onChoose: (LayoutTemplate) -> Void
    let onClose: () -> Void

    @Environment(\.panelSize) private var size
    @Environment(\.panelShort) private var short
    @State private var highlighted: String?

    var body: some View {
        PanelScreen(status: "STEP 1/4", footer: "LAYOUT", onBack: onClose) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: size.pick(14, 10)) {
                    PixelIconView(icon: .info, size: size.pick(34, 24), color: Panel.ink)
                    PixelText(text: "HOW MANY PHOTOS?", cell: size.pick(5, 3))
                    DashedLead(colour: Panel.hair, opacity: 1)
                    if !size.isCompact {
                        PixelText(text: "PICK ONE", cell: 3, colour: Panel.dim)
                    }
                }

                // Six choices in a tidy grid that fills the stage: 3 x 2 on
                // a tablet, 2 x 3 on a phone. A flexible column count packs
                // four across and leaves a ragged row — a kiosk wants the
                // same shape every time.
                // Receipts are narrow and very tall: three across reads,
                // two across wastes the stage.
                let receipts = layouts.first?.isReceipt == true
                let columns = size.isCompact ? (receipts ? 3 : 2) : 3
                let gap = size.pick(14, 10)
                // Rows tall enough that the sheet preview is legible. On a
                // phone six of them may not fit, so the grid scrolls rather
                // than shrinking every tile into a grey smudge.
                let rowHeight: CGFloat? = size.isCompact
                    ? (receipts ? (short ? 260 : 340) : (short ? 130 : 150))
                    : nil
                ScrollView(size.isCompact ? .vertical : []) {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: gap),
                                             count: columns),
                              spacing: gap) {
                        ForEach(layouts) { layout in
                            PanelTile(title: layout.name,
                                      subtitle: layout.subtitle,
                                      accent: layout.accent,
                                      selected: highlighted == layout.id) {
                                highlighted = layout.id
                                onChoose(layout)
                            } preview: {
                                SheetThumbnail(template: layout, media: media,
                                               branding: brandingFor(layout),
                                               numberEmptySlots: true,
                                               mono: mono)
                            }
                            .frame(minHeight: rowHeight, maxHeight: .infinity)
                        }
                    }
                    .frame(maxHeight: size.isCompact ? nil : .infinity)
                }
                .scrollDisabled(!size.isCompact)
                .frame(maxHeight: .infinity)
            }
            .padding(size.pick(22, 14))
        }
    }
}

/// A miniature of the layout, drawn with the same renderer the printer gets
/// so a tile can never disagree with the paper.
///
/// Rendered into state rather than in `body`: composing a 1200 x 1800 sheet
/// on every layout pass would drop frames.
struct SheetThumbnail: View {
    let template: LayoutTemplate
    let media: PrintMedia
    /// One entry per shot, nil where a frame has not been taken.
    var photos: [UIImage?] = []
    var branding: PrintBranding = PrintBranding(eventName: "", caption: "", showsDate: false)
    /// Number the empty wells. Preview only — a number must never reach paper.
    var numberEmptySlots: Bool = false
    var mono: Bool = true

    @State private var rendered: UIImage?

    var body: some View {
        ZStack {
            if let rendered {
                Image(uiImage: rendered)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                let paper = PhotoLayoutRenderer.sheetSize(template: template,
                                                          media: media,
                                                          branding: branding)
                Rectangle()
                    .fill(Color(uiColor: template.backgroundColor))
                    .aspectRatio(paper.width / paper.height, contentMode: .fit)
            }
        }
        .task(id: cacheKey) { rendered = compose() }
    }

    /// Identity of each `UIImage`, not just the count — a retake replaces
    /// the frames without changing how many there are.
    private var cacheKey: String {
        let ids = photos.map { photo in
            photo.map { String(UInt(bitPattern: ObjectIdentifier($0).hashValue)) } ?? "-"
        }
        return "\(template.id)|\(media.id)|\(ids.joined(separator: ","))|\(branding.eventName)|\(branding.word)|\(branding.caption)|\(branding.sequence)|\(numberEmptySlots)|\(mono)"
    }

    private func compose() -> UIImage {
        PhotoLayoutRenderer.render(photos: photos,
                                   template: template,
                                   media: media,
                                   branding: branding,
                                   numberEmptySlots: numberEmptySlots,
                                   monoOverride: mono)
    }
}
