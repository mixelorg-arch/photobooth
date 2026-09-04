import SwiftUI

/// The kiosk shell: owns the session, switches screens, and holds the two
/// things that must survive every screen change — the shutter flash and the
/// idle-reset gesture.
///
/// Marked `@MainActor` in full: `SettingsStore` and `SessionState` are both
/// main-actor isolated and are built in `init`, which SwiftUI does not
/// isolate for you.
@MainActor
struct BoothRootView: View {
    @StateObject private var store = SettingsStore()
    @StateObject private var session: SessionState

    init() {
        let store = SettingsStore()
        _store = StateObject(wrappedValue: store)
        _session = StateObject(wrappedValue: SessionState(settingsStore: store))
    }

    var body: some View {
        ZStack {
            screen
                .transition(.hardCut)

            ShutterFlashOverlay(flash: session.flash)
        }
        .animation(.linear(duration: 0.05), value: session.step)
        // The panel is ink on paper by definition — it must not be inverted
        // by the system appearance.
        .preferredColorScheme(.light)
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        // Any touch anywhere is activity: the booth must not reset itself
        // under someone who is mid-decision.
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onEnded { _ in session.restartIdleTimer() }
        )
        .task { await prepare() }
        .onChange(of: session.step) { _, step in
            Task { await handle(step) }
        }
    }

    // MARK: - Screens

    @ViewBuilder
    private var screen: some View {
        switch session.step {
        case .attract:
            AttractView(onStart: { session.begin() },
                        onAdmin: { session.go(.admin) })

        case .layout:
            LayoutSelectView(layouts: store.settings.guestLayouts,
                             media: store.settings.media,
                             brandingFor: { store.settings.branding(for: $0, times: []) },
                             mono: store.settings.photoMono,
                             onChoose: { session.chooseLayout($0) },
                             onClose: { session.abandon() })

        case .capture:
            CaptureView(session: session,
                        settings: store.settings,
                        onClose: { session.abandon() })

        case .review:
            ReviewView(session: session,
                       media: store.settings.media,
                       branding: store.settings.branding(for: session.layout,
                                                         times: session.captureTimes),
                       mono: store.settings.photoMono,
                       onKeep: { session.go(.copies) },
                       onRetake: { session.retake() },
                       onClose: { session.abandon() })

        case .copies:
            CopiesView(copies: $session.copies,
                       maxCopies: store.settings.maxCopies,
                       accent: session.layout.accent,
                       onBack: { session.go(.review) },
                       onNext: { session.go(.confirm) },
                       onClose: { session.abandon() })

        case .confirm:
            PrintConfirmView(sheet: session.sheet,
                             layout: session.layout,
                             media: store.settings.media,
                             copies: session.copies,
                             printerName: session.printerDescription,
                             printerTarget: store.settings.printerTarget,
                             onBack: { session.go(.copies) },
                             onPrint: { session.submitPrint() },
                             onClose: { session.abandon() })

        case .printing:
            PrintingView(progress: session.printProgress,
                         status: session.printStatusText,
                         copies: session.copies,
                         accent: session.layout.accent)

        case .thankYou:
            ThankYouView(copies: session.copies,
                         onDone: { session.abandon() })

        case .failed(let message):
            BoothErrorView(message: message,
                           onRetry: { session.submitPrint() },
                           onCancel: { session.abandon() })

        case .admin:
            AdminView(store: store,
                      session: session,
                      onClose: { session.abandon() })
        }
    }

    // MARK: - Side effects

    private func prepare() async {
        // A kiosk must never sleep, and never show the home indicator
        // mid-countdown.
        UIApplication.shared.isIdleTimerDisabled = true
        await session.camera.requestAccess()
    }

    /// The camera is started only for the screens that show it and stopped
    /// the moment the flow leaves them — an iPad holding a capture session
    /// open all evening runs hot and eats battery on a booth that is usually
    /// on a stand, not a charger.
    private func handle(_ step: BoothStep) async {
        switch step {
        case .capture:
            await session.camera.start(facing: store.settings.camera)
            session.runCaptureSequence()
        case .layout:
            // Warm the camera one screen early so the countdown does not
            // start against a black preview.
            await session.camera.start(facing: store.settings.camera)
        case .attract, .admin:
            session.cancelCapture()
            session.camera.stop()
        default:
            session.cancelCapture()
        }
    }
}
