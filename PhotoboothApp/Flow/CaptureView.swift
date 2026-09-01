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

                if let countdown = session.countdown {
                    HatchScrim {
                        CountdownDialog(value: countdown,
                                        total: settings.countdownSeconds,
                                        shot: session.shotIndex,
                                        of: session.layout.shotCount,
                                        retaking: session.isRetaking,
                                        accent: session.layout.accent)
                    }
                    .transition(.hardCut)
                }
            }
        }
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

/// The countdown: a module with giant bitmap numerals and a segmented bar
/// that empties as the number falls.
private struct CountdownDialog: View {
    @Environment(\.panelSize) private var size
    let value: Int
    let total: Int
    let shot: Int
    let of: Int
    var retaking: Bool = false
    var accent: Color = Panel.lavender

    private var caption: String {
        if retaking { return "RETAKING \(shot)" }
        return of > 1 ? "SHOT \(shot) OF \(of)" : "ONE SHOT"
    }

    var body: some View {
        PanelModule(title: "GET READY", value: caption, titleCell: 4) {
            VStack(spacing: size.pick(18, 12)) {
                PixelText(text: "\(value)", cell: size.pick(22, 13), colour: Panel.ink)
                    .animation(nil, value: value)
                PanelBar(progress: Double(value) / Double(max(1, total)), tint: accent)
                PixelText(text: "HOLD STILL", cell: size.pick(4, 3))
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: 620)
        .fixedSize(horizontal: false, vertical: true)
    }
}
