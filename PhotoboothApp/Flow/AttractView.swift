import SwiftUI

/// The resting screen: one module, the wordmark in the header, and a solid
/// ink button that fills the width.
///
/// The whole screen is the button — a guest walking up should not have to
/// find a target. The hidden operator door is in the top-left corner, away
/// from where anyone taps to start.
struct AttractView: View {
    let onStart: () -> Void
    let onAdmin: () -> Void

    @Environment(\.panelSize) private var size

    var body: some View {
        PanelScreen(status: "READY", footer: "PHOTOBOOTH") {
            ZStack {
                VStack {
                    PanelModule(title: "SAY CHEESE", value: "6 LAYOUTS") {
                        VStack(alignment: .leading, spacing: size.pick(24, 16)) {
                            HStack(spacing: size.pick(20, 14)) {
                                PixelIconView(icon: .eyeball, size: size.pick(104, 64),
                                              color: Panel.lavender)
                                VStack(alignment: .leading, spacing: size.pick(10, 7)) {
                                    PixelText(text: "PHOTOS IN A MINUTE", cell: size.pick(4, 3))
                                    PixelText(text: "PRINTED ON THE SPOT", cell: size.pick(4, 3),
                                              colour: Panel.dim)
                                }
                                Spacer(minLength: 0)
                            }

                            Rectangle().fill(Panel.ink).frame(height: Panel.ruleThin)

                            PanelButton(title: "TAP TO START", kind: .primary,
                                        cell: size.pick(7, 5),
                                        minHeight: size.pick(124, 92), action: onStart)
                        }
                    }
                    .frame(maxWidth: 900)
                }
                .padding(size.pick(32, 16))

                // The whole panel is tappable, not just the button.
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onStart)
                    .zIndex(-1)

                VStack {
                    HStack { AdminCorner(onOpen: onAdmin); Spacer() }
                    Spacer()
                }
            }
        }
    }
}

/// An invisible 3-tap target. Deliberately not a long-press: a guest resting
/// a finger on a kiosk should never find the operator's console.
struct AdminCorner: View {
    let onOpen: () -> Void
    @State private var taps = 0
    @State private var resetTask: Task<Void, Never>?

    var body: some View {
        Color.clear
            .frame(width: 110, height: 110)
            .contentShape(Rectangle())
            .onTapGesture {
                taps += 1
                resetTask?.cancel()
                if taps >= 3 {
                    taps = 0
                    onOpen()
                } else {
                    resetTask = Task {
                        try? await Task.sleep(for: .seconds(2))
                        if !Task.isCancelled { taps = 0 }
                    }
                }
            }
    }
}
