import SwiftUI
import AVFoundation

/// The live preview, wrapped for SwiftUI.
///
/// Backed by a `UIView` whose *layer class* is `AVCaptureVideoPreviewLayer`,
/// so the layer resizes with the view automatically. Adding a preview layer
/// as a sublayer instead is the usual reason a preview drifts out of its
/// frame on rotation or when a parent animates.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    /// Mirrors the preview only; the captured frame is never mirrored.
    var mirrored: Bool = true

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.videoPreviewLayer.session = session
        view.videoPreviewLayer.videoGravity = .resizeAspectFill
        view.backgroundColor = .black
        apply(to: view)
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        if view.videoPreviewLayer.session !== session {
            view.videoPreviewLayer.session = session
        }
        apply(to: view)
    }

    private func apply(to view: PreviewView) {
        guard let connection = view.videoPreviewLayer.connection else { return }
        if #available(iOS 17.0, *) {
            let angle: CGFloat = 0     // landscape-locked kiosk
            if connection.isVideoRotationAngleSupported(angle) {
                connection.videoRotationAngle = angle
            }
        }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = mirrored
        }
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var videoPreviewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}

/// The preview inside the dark display panel, with a framing guide showing
/// what the print will actually keep. The guide is the *slot* aspect from
/// the chosen layout — the single most useful thing to show someone before a
/// 2:3 portrait cell crops their group photo in half.
struct FramedCameraPreview: View {
    let session: AVCaptureSession
    var mirrored: Bool
    /// width:height of the slot the next shot lands in, nil for no guide.
    var guideAspect: CGFloat?

    var body: some View {
        GeometryReader { geo in
            DisplayWell(showsGrid: false) {
                ZStack {
                    CameraPreview(session: session, mirrored: mirrored)

                    if let aspect = guideAspect {
                        let box = Self.fit(aspect: aspect,
                                           in: CGSize(width: geo.size.width - 16,
                                                      height: geo.size.height - 16))
                        ZStack {
                            // Mask out everything the print throws away.
                            Panel.ink.opacity(0.55)
                                .mask {
                                    Rectangle()
                                        .overlay(
                                            Rectangle()
                                                .frame(width: box.width, height: box.height)
                                                .blendMode(.destinationOut)
                                        )
                                        .compositingGroup()
                                }
                            Rectangle()
                                .strokeBorder(Panel.lavender, lineWidth: Panel.ruleThin)
                                .frame(width: box.width, height: box.height)
                        }
                        .allowsHitTesting(false)
                    }
                }
            }
        }
    }

    private static func fit(aspect: CGFloat, in size: CGSize) -> CGSize {
        var w = size.width
        var h = w / aspect
        if h > size.height {
            h = size.height
            w = h * aspect
        }
        return CGSize(width: w, height: h)
    }
}
