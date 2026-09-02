import SwiftUI

/// Live preview in the display module, a shot strip below it, and the
/// countdown as a dialog on the hatched scrim. The guest does nothing here
/// except pose — the sequence runs itself once the screen appears.
struct CaptureView: View {
    @ObservedObject var session: SessionState
    let settings: AppSettings
    let onClose: () -> Void

    @Environment(\.panelSize) private var size

    private var shotLabel: String {
        if session.isRetaking { return "RETAKING \(max(1, session.shotIndex))" }
        return session.layout.shotCount > 1
            ? "SHOT \(max(1, session.shotIndex)) OF \(session.layout.shotCount)"
            : "SINGLE SHOT"
    }

    var body: some View {
        PanelScreen(status: "STEP 1/4", footer: "CAPTURE", onBack: onClose) {
            ZStack {
                VStack(spacing: size.pick(14, 10)) {
                    PanelModule(title: "CAMERA", value: shotLabel, padding: 10) {
                        ZStack {
                            FramedCameraPreview(
                                session: session.camera.session,
                                mirrored: settings.mirrorPreview,
                                guideAspect: session.layout.cellAspect)

                            // The countdown sits *on* the preview, cornered,
                            // so the guest keeps sight of their own face for
                            // the whole count. It used to be a full-screen
                            // dialog, which blinded them at the one moment
                            // they most need the mirror.
                            if let countdown = session.countdown {
                                CountdownOSD(value: countdown,
                                             total: settings.countdownSeconds,
                                             caption: countdownCaption,
                                             accent: session.layout.accent)
                            }

                            if let error = session.camera.lastError {
                                CameraMessage(text: error)
                            }
                        }
                    }

                    ShotStrip(total: session.layout.shotCount,
                              taken: session.photos.map { $0 != nil },
                              current: session.shotIndex,
                              accent: session.layout.accent)
                }
                .padding(size.pick(22, 14))
            }
        }
    }

    private var countdownCaption: String {
        if session.isRetaking { return "RETAKING \(session.shotIndex)" }
        return session.layout.shotCount > 1
            ? "SHOT \(session.shotIndex) OF \(session.layout.shotCount)"
            : "ONE SHOT"
    }
}

/// Camera trouble is shown *inside* the display panel rather than as a
/// dialog: the panel is the thing that is broken, and covering the whole
/// screen would hide the way out.
private struct CameraMessage: View {
    let text: String

    var body: some View {
        ZStack {
            Panel.display
            Text(text)
                .font(Panel.mono(15))
                .foregroundStyle(Color(white: 0.93))
                .multilineTextAlignment(.center)
                .padding(30)
        }
    }
}

/// The countdown, drawn over the live preview.
///
/// A boxed numeral in the top-right corner — away from where a face sits —
/// and a bar along the bottom edge. Small on purpose: the point of the
/// preview is that people can see themselves while they pose.
private struct CountdownOSD: View {
    @Environment(\.panelSize) private var size
    let value: Int
    let total: Int
    let caption: String
    var accent: Color = Panel.lavender

    var body: some View {
        ZStack {
            VStack(spacing: 5) {
                PixelText(text: caption, cell: 2, colour: Panel.ink)
                PixelText(text: "\(value)", cell: size.pick(8, 6), colour: Panel.ink)
                    .animation(nil, value: value)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 6)
            .background(Panel.paper)
            .heavyFramed()
            .frame(maxWidth: .infinity, maxHeight: .infinity,
                   alignment: .topTrailing)
            .padding(10)

            HStack(spacing: 10) {
                PanelBar(progress: Double(value) / Double(max(1, total)),
                         blocks: 16, tint: accent, framed: false)
                    .frame(height: size.pick(18, 14))
                PixelText(text: "HOLD STILL", cell: 3, colour: Panel.ink)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Panel.paper)
            .heavyFramed()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(10)
        }
        .allowsHitTesting(false)
    }
}
