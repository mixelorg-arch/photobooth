import SwiftUI

/// The proof on the left in a display well, the frames and the two choices
/// on the right.
///
/// Retake is deliberately whole-set: picking one frame out of four to redo
/// is not a decision to make with a queue behind you.
struct ReviewView: View {
    @ObservedObject var session: SessionState
    let media: PrintMedia
    var branding: PrintBranding = PrintBranding()
    var mono: Bool = true
    let onKeep: () -> Void
    let onRetake: () -> Void
    let onClose: () -> Void

    @Environment(\.panelSize) private var size
    @Environment(\.panelShort) private var short

    /// A receipt is three times as tall as the paper it shares a media
    /// entry with, so the well asks the renderer rather than the media.
    private var sheetAspect: CGFloat {
        let size = PhotoLayoutRenderer.sheetSize(template: session.layout,
                                                 media: media, branding: branding)
        return size.width / size.height
    }

    /// What the one retake button will actually do, given what is marked.
    private var retakeTitle: String {
        switch session.marks.count {
        case 0:  return "RETAKE ALL"
        case 1:  return "REDO 1 SHOT"
        default: return "REDO \(session.marks.count) SHOTS"
        }
    }

    var body: some View {
        PanelScreen(status: "STEP 2/4", footer: "REVIEW", onBack: onClose) {
            // Side by side where there is room, stacked where there is not.
            AdaptiveSplit(spacing: size.pick(18, 12)) {
                PanelModule(title: "PROOF", padding: 10) {
                    DisplayWell(aspect: sheetAspect) {
                        SheetThumbnail(template: session.layout,
                                       media: media,
                                       photos: session.photos,
                                       branding: branding,
                                       mono: mono)
                            .padding(10)
                    }
                    .frame(maxWidth: .infinity)
                }
                .frame(width: size.isCompact ? nil : 420,
                       height: size.isCompact ? (short ? 240 : 320) : nil)
            } detail: {
                VStack(spacing: size.pick(18, 12)) {
                    PanelModule(title: "HOW IT LOOKS",
                                value: session.photos.count == 1
                                    ? "1 SHOT" : "\(session.photos.count) SHOTS") {
                        VStack(alignment: .leading, spacing: 14) {
                            ThumbnailRow(photos: session.photos,
                                         marks: session.marks,
                                         onTap: { session.toggleMark($0) })
                            HStack(spacing: 10) {
                                Rectangle().fill(Panel.lavender).frame(width: 16, height: 16)
                                PixelText(text: session.marks.isEmpty
                                            ? "TAP A PHOTO TO REDO JUST THAT ONE"
                                            : "TAP AGAIN TO UNMARK",
                                          cell: 3, colour: Panel.dim, fits: 460)
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    HStack(spacing: size.pick(14, 10)) {
                        PanelButton(title: retakeTitle, kind: .danger, cell: 4,
                                    action: onRetake)
                        PanelButton(title: "LOOKS GOOD >", kind: .primary, cell: 4,
                                    action: onKeep)
                    }
                }
            }
            .padding(size.pick(22, 14))
        }
    }
}

/// Two panes side by side on a wide stage, stacked on a narrow one.
///
/// The split is the only structural difference between the iPad and the
/// iPhone builds — everything else just changes size — so it lives in one
/// place rather than as an `if` in every screen.
struct AdaptiveSplit<Primary: View, Detail: View>: View {
    var spacing: CGFloat = 18
    @ViewBuilder var primary: () -> Primary
    @ViewBuilder var detail: () -> Detail

    @Environment(\.panelSize) private var size

    var body: some View {
        if size.isCompact {
            VStack(spacing: spacing) { primary(); detail() }
        } else {
            HStack(alignment: .top, spacing: spacing) { primary(); detail() }
        }
    }
}

/// The individual frames, divided by dashed rules like the reference's fader
/// group. Each one is a button: tapping marks it for a retake.
///
/// Marked frames get three signals — a salmon wash, a heavy frame and a
/// drawn X — because at arm's length, in a room, one is not enough.
private struct ThumbnailRow: View {
    let photos: [UIImage?]
    let marks: Set<Int>
    let onTap: (Int) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(photos.enumerated()), id: \.offset) { index, photo in
                let marked = marks.contains(index)
                Button { onTap(index) } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            if let photo {
                                Image(uiImage: photo)
                                    .resizable()
                                    .aspectRatio(1, contentMode: .fill)
                            } else {
                                Panel.display
                            }
                            if marked {
                                Panel.salmon.opacity(0.55)
                                CrossMark()
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .aspectRatio(1, contentMode: .fit)
                        .clipped()
                        .heavyFramed(marked ? Panel.rule : Panel.ruleThin)

                        PixelText(text: "\(index + 1)", cell: 3)
                    }
                    .padding(8)
                    .background(marked ? Panel.salmon : Panel.paper)
                }
                .buttonStyle(.plain)
                .overlay(alignment: .trailing) {
                    if index < photos.count - 1 {
                        Rectangle()
                            .strokeBorder(style: StrokeStyle(lineWidth: Panel.ruleThin,
                                                            dash: [6, 6]))
                            .foregroundStyle(Panel.ink)
                            .frame(width: Panel.ruleThin)
                    }
                }
            }
        }
        .heavyFramed(Panel.ruleThin)
    }
}

/// The X over a frame marked for a retake. Drawn rather than a glyph, so it
/// scales with the thumbnail and keeps the same stroke weight as the rules.
private struct CrossMark: View {
    var body: some View {
        Canvas { ctx, size in
            var path = Path()
            let inset: CGFloat = 10
            path.move(to: CGPoint(x: inset, y: inset))
            path.addLine(to: CGPoint(x: size.width - inset, y: size.height - inset))
            path.move(to: CGPoint(x: size.width - inset, y: inset))
            path.addLine(to: CGPoint(x: inset, y: size.height - inset))
            ctx.stroke(path, with: .color(Panel.paper), lineWidth: 6)
        }
        .allowsHitTesting(false)
    }
}
