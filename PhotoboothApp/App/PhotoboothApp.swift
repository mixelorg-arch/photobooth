import SwiftUI

@main
struct PhotoboothApp: App {
    /// Only there to answer `supportedInterfaceOrientationsFor`, which
    /// SwiftUI cannot vary at runtime on its own.
    @UIApplicationDelegateAdaptor(BoothAppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            // The booth is the shared `web/` build — the same files served
            // at mixelorg-arch.github.io/photobooth — so a change lands
            // once instead of being ported into SwiftUI as well. The native
            // screens in Flow/ and Panel/ are the earlier implementation
            // and are left in place, unreferenced, rather than deleted:
            // `BoothRootView()` still brings them up.
            WebBoothRoot()
        }
    }
}
