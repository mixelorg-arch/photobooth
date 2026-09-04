import UIKit
import Combine

/// Where the kiosk is in the guest flow. One screen per case.
enum BoothStep: Equatable {
    case attract
    case layout
    case capture
    case review
    case copies
    case confirm
    case printing
    case thankYou
    case failed(String)
    case admin
}

/// The session: what has been shot, what the guest chose, and what the print
/// pipeline was handed. Owns the flow machine and the on-disk session folder.
///
/// Views never touch the camera, the renderer or a printer directly — they
/// call methods here, which is what keeps the retro chrome swappable and the
/// print path testable.
@MainActor
final class SessionState: ObservableObject {

    // MARK: - Flow

    @Published private(set) var step: BoothStep = .attract
    /// Fixed length: one entry per *distinct* shot the layout needs, nil
    /// until it has been taken. An array that grows as photos arrive cannot
    /// express "frame 3 is being redone", which is the whole point of
    /// per-frame retake.
    @Published private(set) var photos: [UIImage?] = []
    /// When each frame was taken, parallel to `photos`. The receipt's shot
    /// order is timed from these, so they are session data, not decoration.
    @Published private(set) var captureTimes: [Date?] = []
    /// Slot indices the guest has marked for a retake on the review screen.
    @Published private(set) var marks: Set<Int> = []
    @Published var layout: LayoutTemplate = .oneFullPage
    @Published var copies: Int = 1

    /// The flattened sheet handed to the printer. Rebuilt whenever the
    /// photos, the layout or the media change.
    @Published private(set) var sheet: UIImage?

    @Published private(set) var printProgress: Double = 0
    @Published private(set) var printStatusText: String = ""

    // MARK: - Collaborators

    let camera: CameraController
    private let settingsStore: SettingsStore
    private var printer: PrinterService

    private var settings: AppSettings { settingsStore.settings }

    // MARK: - Session folder

    private(set) var sessionID = UUID().uuidString
    private var sessionDirectory: URL?

    // MARK: - Timers

    private var idleTask: Task<Void, Never>?
    private var captureTask: Task<Void, Never>?

    /// Countdown currently on screen, nil when not counting.
    @Published private(set) var countdown: Int?
    /// 1-based *slot* being filled, so a retake of frame 3 says "RETAKING 3"
    /// and lands back in frame 3.
    @Published private(set) var shotIndex: Int = 0
    /// True while only some frames are being re-shot.
    @Published private(set) var isRetaking: Bool = false

    let flash = ShutterFlash()

    init(settingsStore: SettingsStore,
         camera: CameraController = CameraController(),
         printer: PrinterService? = nil) {
        self.settingsStore = settingsStore
        self.camera = camera
        self.printer = printer ?? AirPrintService()
        self.layout = settingsStore.settings.guestLayouts.first ?? .oneFullPage
        self.copies = settingsStore.settings.defaultCopies
        rebuildPrinter()
    }

    /// Swap the concrete service when the operator changes target in Admin.
    func rebuildPrinter() {
        switch settings.printerTarget {
        case .airPrint:
            printer = AirPrintService(lastPrinterURL: settings.lastPrinterURL)
        case .thermalBLE:
            // A roll knows its own imaging width. Sending a 576-dot receipt
            // to a head told it is 384 would rescale it — the type would
            // shrink and the QR's modules would blur into something no
            // phone can read — so the paper wins over the saved setting.
            let dots = settings.media.isRoll
                ? Int(settings.media.pixelSize.width)
                : settings.thermalWidthDots
            printer = ThermalSDKService(savedPeripheralID: settings.thermalPeripheralID,
                                        widthDots: dots)
        }
    }

    var printerDescription: String {
        switch settings.printerTarget {
        case .airPrint:
            return settings.lastPrinterName ?? "AirPrint — pick on first print"
        case .thermalBLE:
            return settings.thermalPeripheralName ?? "Thermal — not paired"
        }
    }

    // MARK: - Navigation

    func go(_ next: BoothStep) {
        step = next
        restartIdleTimer()
    }

    /// Tap-to-start on the attract screen.
    func begin() {
        startNewSession()
        // Layout first by default: the app has to know whether to shoot one
        // frame or four before the camera ever opens.
        go(.layout)
    }

    func chooseLayout(_ template: LayoutTemplate) {
        layout = template
        photos = Array(repeating: nil, count: template.shotCount)
        captureTimes = Array(repeating: nil, count: template.shotCount)
        marks.removeAll()
        sheet = nil
        go(.capture)
    }

    /// Mark or unmark one frame for a retake. Tapping again unmarks it, so a
    /// mis-tap costs nothing — which matters when the control is a
    /// photograph of your own face.
    func toggleMark(_ index: Int) {
        if marks.contains(index) { marks.remove(index) } else { marks.insert(index) }
        restartIdleTimer()
    }

    /// The ✕ on any window, and the idle timeout, both land here.
    func abandon() {
        cancelCapture()
        camera.stop()
        discardSessionFiles()
        photos.removeAll()
        captureTimes.removeAll()
        marks.removeAll()
        sheet = nil
        copies = settings.defaultCopies
        layout = settings.guestLayouts.first ?? .oneFullPage
        printProgress = 0
        printStatusText = ""
        step = .attract
        idleTask?.cancel()
        idleTask = nil
    }

    /// Re-shoot the marked frames, or the whole set when nothing is marked.
    ///
    /// Only the marked slots are cleared: everything else stays exactly as
    /// it was, so a guest redoing one bad frame does not lose the three good
    /// ones.
    func retake() {
        cancelCapture()
        let targets = marks.isEmpty ? Array(photos.indices) : marks.sorted()
        for index in targets where photos.indices.contains(index) {
            photos[index] = nil
        }
        marks.removeAll()
        sheet = nil
        retakeTargets = targets
        go(.capture)
    }

    /// Slots the next capture run will fill. Empty means "all of them".
    private(set) var retakeTargets: [Int] = []

    // MARK: - Capture

    /// Runs the shoot: countdown, shutter, pause, repeat — over the slots
    /// that need filling, which is all of them for a fresh session and just
    /// the marked ones after a retake.
    func runCaptureSequence() {
        cancelCapture()
        let slots = retakeTargets.isEmpty ? Array(photos.indices) : retakeTargets
        let retaking = slots.count < photos.count
        retakeTargets = []

        guard !slots.isEmpty else { return }

        // Set before the first await: the capture screen is already on
        // screen, and a frame of "SHOT 1 OF 4" above a retake of frame 2 is
        // worse than a frame of nothing.
        isRetaking = retaking
        shotIndex = slots[0] + 1

        captureTask = Task { [weak self] in
            guard let self else { return }

            for (position, slot) in slots.enumerated() {
                if Task.isCancelled { return }
                self.shotIndex = slot + 1

                for tick in stride(from: self.settings.countdownSeconds, through: 1, by: -1) {
                    if Task.isCancelled { return }
                    self.countdown = tick
                    try? await Task.sleep(for: .seconds(1))
                }
                self.countdown = nil
                if Task.isCancelled { return }

                self.flash.fire()
                if let image = try? await self.camera.capturePhoto() {
                    self.place(image, at: slot)
                }

                if position < slots.count - 1 {
                    try? await Task.sleep(for: .seconds(self.settings.betweenShotsSeconds))
                }
            }

            self.shotIndex = 0
            self.isRetaking = false
            if Task.isCancelled { return }
            self.compose()
            self.go(.review)
        }
    }

    func cancelCapture() {
        captureTask?.cancel()
        captureTask = nil
        countdown = nil
        shotIndex = 0
        isRetaking = false
    }

    private func place(_ image: UIImage, at index: Int) {
        guard photos.indices.contains(index) else { return }
        photos[index] = image
        if captureTimes.indices.contains(index) { captureTimes[index] = Date() }
        // A retake overwrites the file it replaces. The desktop booth
        // archives superseded frames instead, but there the session survives
        // and gets uploaded; here the whole folder is deleted when the guest
        // walks away, so keeping the reject would only leak it into the next
        // sweep.
        persist(image, index: index + 1)
        compose()
    }

    // MARK: - Compose

    /// Rebuilds the flattened sheet. Cheap enough to call on every change —
    /// a 1200 x 1800 composite is a few milliseconds — and doing it eagerly
    /// means the confirm screen shows the real print, not an approximation.
    func compose() {
        sheet = PhotoLayoutRenderer.render(
            photos: photos,
            template: layout,
            media: settings.media,
            branding: settings.branding(for: layout, times: captureTimes),
            monoOverride: settings.photoMono)
    }

    // MARK: - Print

    func submitPrint() {
        go(.printing)
        printProgress = 0.05
        printStatusText = "Preparing job…"

        guard let sheet else {
            fail("Nothing to print — the layout came back empty.")
            return
        }

        let job = PrintJob(image: sheet,
                           copies: copies,
                           media: settings.media,
                           jobName: jobName())

        Task { [weak self] in
            guard let self else { return }
            do {
                for try await update in self.printer.submit(job) {
                    self.printProgress = update.progress
                    self.printStatusText = update.message
                    if case .airPrint = self.settings.printerTarget,
                       let printer = update.chosenPrinter {
                        // Remember the picked printer so the next guest is
                        // never shown the iOS print sheet.
                        self.settingsStore.settings.lastPrinterURL = printer.url
                        self.settingsStore.settings.lastPrinterName = printer.name
                    }
                }
                self.printProgress = 1
                self.finishPrinting()
            } catch is CancellationError {
                self.go(.confirm)
            } catch {
                self.fail(error.localizedDescription)
            }
        }
    }

    private func finishPrinting() {
        // The sheet number advances only once a job has actually been sent,
        // so a guest who backs out does not burn a number.
        settingsStore.settings.sheetCounter += 1
        go(.thankYou)
        Task { [weak self] in
            guard let self else { return }
            let hold = self.settings.thankYouSeconds
            try? await Task.sleep(for: .seconds(hold))
            if case .thankYou = self.step { self.abandon() }
        }
    }

    private func fail(_ message: String) {
        step = .failed(message)
        restartIdleTimer()
    }

    private func jobName() -> String {
        let name = settings.eventName.isEmpty ? "Photobooth" : settings.eventName
        return "\(name) — \(layout.name) x\(copies)"
    }

    // MARK: - Idle

    /// Any touch anywhere in the kiosk resets this.
    func restartIdleTimer() {
        idleTask?.cancel()
        // The attract screen is the resting state; it does not time out.
        guard step != .attract, step != .admin else { return }
        let seconds = settings.idleReturnSeconds
        guard seconds > 0 else { return }
        idleTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard let self, !Task.isCancelled else { return }
            if self.step != .attract && self.step != .admin { self.abandon() }
        }
    }

    // MARK: - Files

    private func startNewSession() {
        discardSessionFiles()
        sessionID = ISO8601DateFormatter().string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PhotoboothSessions", isDirectory: true)
            .appendingPathComponent(sessionID, isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        sessionDirectory = base
        sweepOldSessions()
    }

    private func persist(_ image: UIImage, index: Int) {
        guard let dir = sessionDirectory,
              let data = image.jpegData(compressionQuality: 0.92) else { return }
        let url = dir.appendingPathComponent(String(format: "photo-%02d.jpg", index))
        try? data.write(to: url, options: .atomic)
    }

    /// Local-only storage: the session folder goes as soon as the flow ends.
    private func discardSessionFiles() {
        if let dir = sessionDirectory {
            try? FileManager.default.removeItem(at: dir)
        }
        sessionDirectory = nil
    }

    /// Anything a crash or a force-quit left behind, older than the keep
    /// window, is removed on the next session start.
    private func sweepOldSessions() {
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PhotoboothSessions", isDirectory: true)
        let cutoff = Date().addingTimeInterval(-settings.keepPhotosMinutes * 60)
        guard let entries = try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        for entry in entries where entry != sessionDirectory {
            let modified = (try? entry.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            if modified < cutoff { try? FileManager.default.removeItem(at: entry) }
        }
    }
}
