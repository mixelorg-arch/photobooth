import AVFoundation
import UIKit
import Combine

enum CameraError: LocalizedError {
    case denied
    case unavailable
    case captureFailed(String)

    var errorDescription: String? {
        switch self {
        case .denied:       return "Camera access is off. Turn it on in Settings › Photobooth."
        case .unavailable:  return "No camera is available on this device."
        case .captureFailed(let why): return "The camera did not return a photo. \(why)"
        }
    }
}

/// Owns the `AVCaptureSession`, the preview layer and the still capture.
///
/// Session configuration and capture both run on a private serial queue —
/// `AVCaptureSession.startRunning()` blocks, and doing it on main is the
/// usual cause of a booth that freezes for a second on every screen change.
@MainActor
final class CameraController: NSObject, ObservableObject {

    @Published private(set) var isRunning = false
    @Published private(set) var permission: AVAuthorizationStatus = .notDetermined
    @Published private(set) var lastError: String?

    let session = AVCaptureSession()

    private let queue = DispatchQueue(label: "photobooth.camera", qos: .userInitiated)
    private let output = AVCapturePhotoOutput()
    private var configured = false

    /// `configureSession` runs off the main actor, so the desired camera is
    /// mirrored into a plain stored value written only from `start`.
    private nonisolated(unsafe) var facing: CameraFacing = .front

    /// One in flight at a time; the flow never overlaps captures.
    private var captureContinuation: CheckedContinuation<UIImage, Error>?

    // MARK: - Lifecycle

    func requestAccess() async {
        permission = AVCaptureDevice.authorizationStatus(for: .video)
        if permission == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .video)
            permission = AVCaptureDevice.authorizationStatus(for: .video)
        }
    }

    func start(facing: CameraFacing) async {
        await requestAccess()
        guard permission == .authorized else {
            lastError = CameraError.denied.localizedDescription
            return
        }

        if self.facing != facing { configured = false }
        self.facing = facing

        let session = self.session
        let needsConfigure = !configured

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async { [weak self] in
                guard let self else { continuation.resume(); return }
                if needsConfigure { self.configureSession() }
                if !session.isRunning { session.startRunning() }
                continuation.resume()
            }
        }

        configured = true
        isRunning = session.isRunning
    }

    func stop() {
        let session = self.session
        isRunning = false
        queue.async {
            if session.isRunning { session.stopRunning() }
        }
    }

    /// Runs on `queue`.
    private nonisolated func configureSession() {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        session.sessionPreset = .photo

        for existing in session.inputs { session.removeInput(existing) }

        let position: AVCaptureDevice.Position = (facing == .front) ? .front : .back
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera],
            mediaType: .video,
            position: position)

        guard let device = discovery.devices.first,
              let deviceInput = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(deviceInput) else {
            Task { @MainActor in self.lastError = CameraError.unavailable.localizedDescription }
            return
        }
        session.addInput(deviceInput)

        if !session.outputs.contains(output), session.canAddOutput(output) {
            session.addOutput(output)
            output.maxPhotoQualityPrioritization = .quality
        }
    }

    // MARK: - Capture

    func capturePhoto() async throws -> UIImage {
        guard permission == .authorized else { throw CameraError.denied }
        guard session.isRunning else { throw CameraError.unavailable }

        return try await withCheckedThrowingContinuation { continuation in
            self.captureContinuation = continuation

            let settings = AVCapturePhotoSettings(format: [
                AVVideoCodecKey: AVVideoCodecType.jpeg
            ])
            settings.photoQualityPrioritization = .balanced

            // The booth is landscape-locked, so the still is requested in the
            // same orientation as the preview the guest was looking at.
            if let connection = output.connection(with: .video) {
                if #available(iOS 17.0, *) {
                    let angle: CGFloat = 0   // landscape right, matching the lock
                    if connection.isVideoRotationAngleSupported(angle) {
                        connection.videoRotationAngle = angle
                    }
                }
                // The saved frame is never mirrored, whatever the preview
                // does — a mirrored print reverses every logo in the room.
                if connection.isVideoMirroringSupported {
                    connection.automaticallyAdjustsVideoMirroring = false
                    connection.isVideoMirrored = false
                }
            }

            let output = self.output
            let delegate = self
            queue.async {
                output.capturePhoto(with: settings, delegate: delegate)
            }
        }
    }

}

extension CameraController: @preconcurrency AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        let continuation = captureContinuation
        captureContinuation = nil

        if let error {
            continuation?.resume(throwing: CameraError.captureFailed(error.localizedDescription))
            return
        }
        guard let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else {
            continuation?.resume(throwing: CameraError.captureFailed("Empty frame."))
            return
        }
        continuation?.resume(returning: image.normalizedUp())
    }
}

extension UIImage {
    /// Bakes the EXIF orientation into the pixels.
    ///
    /// Core Graphics ignores `imageOrientation`, so a photo drawn straight
    /// into the layout renderer comes out rotated. Everything downstream —
    /// renderer, AirPrint, ESC/POS — assumes `.up`.
    func normalizedUp() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
