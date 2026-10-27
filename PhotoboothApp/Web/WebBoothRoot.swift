import SwiftUI
import UIKit

/// Starts the loopback server, then shows the booth in a WebView.
///
/// The server has to be up before the WebView is pointed anywhere, so this
/// owns both and holds the view back until there is a URL to load. If it
/// cannot start, that is a bundling fault rather than anything a guest can
/// fix, so it says so plainly rather than showing an empty black screen.
struct WebBoothRoot: View {

    @StateObject private var host = WebBoothHost()
    @StateObject private var store = SettingsStore()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let url = host.url {
                BoothWebView(url: url, store: store)
                    .ignoresSafeArea()
            } else if let failure = host.failure {
                VStack(spacing: 14) {
                    Text("THE BOOTH COULD NOT START")
                        .font(.system(size: 17, weight: .bold, design: .monospaced))
                    Text(failure)
                        .font(.system(size: 13, design: .monospaced))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                }
                .foregroundStyle(.white)
                .padding(32)
            }
        }
        .statusBarHidden(true)
        .onAppear { host.start() }
    }
}

@MainActor
final class WebBoothHost: ObservableObject {

    /// `web/` ships as a folder reference, so it keeps its own directory
    /// inside the bundle instead of having every file flattened into the
    /// root — which matters because `booth.js`, `sw.js` and the icons all
    /// reference each other by relative path.
    let server = LocalWebServer(
        root: Bundle.main.bundleURL.appendingPathComponent("web", isDirectory: true))

    /// Published, not derived from the server: SwiftUI only redraws when an
    /// observed value changes, and `server.rootURL` is a plain computed
    /// property it cannot see becoming non-nil.
    @Published var url: URL?
    @Published var failure: String?

    private var started = false

    func start() {
        guard !started else { return }
        started = true
        do {
            try server.start()
            url = server.rootURL
        } catch {
            failure = error.localizedDescription
        }
    }
}

/// Supplies the live orientation mask.
///
/// SwiftUI has no way to vary supported orientations at runtime, so the one
/// place that can answer is the app delegate. `BoothOrientation` holds the
/// value and `setRotation` from the web build flips it.
final class BoothAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     supportedInterfaceOrientationsFor window: UIWindow?)
    -> UIInterfaceOrientationMask {
        MainActor.assumeIsolated { BoothOrientation.shared.mask }
    }
}
