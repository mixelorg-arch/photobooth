import SwiftUI
import WebKit
import UIKit

/// The booth, as the shared web build, inside a WebView.
///
/// `web/` is the live booth — the same files served at
/// mixelorg-arch.github.io/photobooth — and it is where every redesign has
/// landed. The SwiftUI screens in `Flow/` and `Panel/` are an earlier,
/// separate implementation of the same booth that stopped receiving those
/// changes. Rather than port each one twice forever, the iPad now runs the
/// web build and keeps native code only for what a web page genuinely
/// cannot do. That is exactly the arrangement the Android build already
/// uses, and `booth.js` was written for it: see the `BoothNative` block
/// there, where every native call is guarded so the same file still runs in
/// a plain browser.
///
/// The files are served by `LocalWebServer` rather than loaded from disk —
/// see that type for why a real origin is not optional here.
struct BoothWebView: UIViewRepresentable {

    /// Where `LocalWebServer` is listening. Passed in rather than read from
    /// the server so the view cannot be built before there is something to
    /// load — the first version of this did exactly that and showed a black
    /// screen with no error, because a WKWebView with no URL is simply blank.
    let url: URL
    @ObservedObject var store: SettingsStore

    func makeCoordinator() -> BoothBridge {
        BoothBridge(store: store)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Without both of these the camera preview will not play: iOS would
        // otherwise demand a user gesture per <video> and try to take the
        // picture fullscreen, neither of which a kiosk can offer.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        config.userContentController.add(context.coordinator, name: BoothBridge.channel)
        config.userContentController.addUserScript(
            WKUserScript(source: BoothBridge.shim(capabilities: BoothBridge.capabilities()),
                         injectionTime: .atDocumentStart,
                         forMainFrameOnly: true))

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        // A kiosk does not bounce. Rubber-banding on a full-bleed camera
        // screen looks like the app has come loose from the glass.
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { web.isInspectable = true }

        context.coordinator.attach(web)
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.store = store
    }
}

/// Native half of the `BoothNative` bridge `booth.js` expects.
///
/// **The shape is forced by WebKit.** Android's `@JavascriptInterface` is
/// synchronous, so its bridge can simply return a string. A WKWebView
/// message handler cannot: it is one-way and asynchronous. So the methods
/// that only *do* something are posted across the channel, while the two
/// that have to *return* something are baked into the injected shim as
/// constants at load time. That works because what they return — what this
/// device is — does not change while the booth is running.
///
/// **What is deliberately not implemented**: `usbPrinters`, `usbPrint`,
/// `usbCameras`, `systemCameras` and the whole `uvc*` family. Those are
/// Android-only, `booth.js` guards each one with `NATIVE.x ? … : …`, and
/// leaving them undefined is what correctly hides those panels on iPad.
/// `printSheet`, `thermalPrint` and `savePNG` are *not* individually
/// guarded there, so they must exist.
final class BoothBridge: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {

    static let channel = "booth"

    var store: SettingsStore
    private weak var web: WKWebView?
    /// Prints run one after another, never at once. See `print`.
    private var chain: Task<Void, Never>?

    init(store: SettingsStore) {
        self.store = store
    }

    func attach(_ web: WKWebView) {
        self.web = web
    }

    // MARK: - The injected shim

    static func capabilities() -> String {
        let device = UIDevice.current
        return "SHARES USB CAMERAS\tUSB HOST\t\(device.model) · iPadOS \(device.systemVersion)"
    }

    static func shim(capabilities: String) -> String {
        let caps = capabilities
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\t", with: "\\t")
            .replacingOccurrences(of: "'", with: "\\'")
        return """
        (function () {
          function post(fn, args) {
            try {
              window.webkit.messageHandlers.\(channel).postMessage({ fn: fn, args: args });
            } catch (e) {}
          }
          window.BoothNative = {
            platform: function () { return 'ios'; },
            deviceCapabilities: function () { return '\(caps)'; },
            printSheet: function (dataUrl, copies, widthMils, heightMils, jobName) {
              post('printSheet', [dataUrl, copies, widthMils, heightMils, jobName]);
            },
            thermalPrint: function (dataUrl, copies, widthDots) {
              post('thermalPrint', [dataUrl, copies, widthDots]);
            },
            savePNG: function (dataUrl, name) { post('savePNG', [dataUrl, name]); },
            /* No toast: booth.js has its own, and falls back to it whenever
               NATIVE.toast is absent. A native one would look foreign and
               could not be styled with the rest of the booth. */
            setRotation: function (free) { post('setRotation', [!!free]); }
          };
        })();
        """
    }

    // MARK: - Messages in

    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let fn = body["fn"] as? String else { return }
        let args = body["args"] as? [Any] ?? []

        switch fn {
        case "printSheet":
            guard let dataURL = args.first as? String, let image = Self.decode(dataURL) else {
                return notify(ok: false, message: "The sheet came back empty.")
            }
            let copies = (args.count > 1 ? args[1] as? Int : 1) ?? 1
            let name = (args.count > 4 ? args[4] as? String : nil) ?? "Photobooth"
            print(image, copies: copies, jobName: name, service: AirPrintService(
                lastPrinterURL: store.settings.lastPrinterURL))

        case "thermalPrint":
            guard let dataURL = args.first as? String, let image = Self.decode(dataURL) else {
                return notify(ok: false, message: "The sheet came back empty.")
            }
            let copies = (args.count > 1 ? args[1] as? Int : 1) ?? 1
            // The roll states its own imaging width, and booth.js has
            // already composed for it. Trusting the saved setting instead
            // would rescale the sheet and blur the QR past scanning.
            let dots = (args.count > 2 ? args[2] as? Int : nil) ?? store.settings.thermalWidthDots
            print(image, copies: copies, jobName: "Photobooth", service: ThermalTCPService(
                host: store.settings.thermalHost,
                port: UInt16(clamping: store.settings.thermalPort),
                widthDots: dots,
                dpi: 203,
                gapMM: store.settings.thermalGapMM,
                baud: store.settings.thermalBaud))

        case "savePNG":
            let dataURL = args.first as? String ?? ""
            let name = (args.count > 1 ? args[1] as? String : nil) ?? "photobooth"
            save(dataURL, named: name)

        case "setRotation":
            setRotation(free: args.first as? Bool ?? false)

        default:
            break
        }
    }

    // MARK: - Doing the work

    /// Runs a print, after every print already asked for.
    ///
    /// Serial, and that is not tidiness. `booth.js` asks for N copies by
    /// calling across the bridge N times in a tight loop and counting the
    /// replies down to zero, so each call has to run and report. Cancelling
    /// the previous one — which this did at first — leaves that counter
    /// stuck above zero, `printBusy()` true forever, and every later print
    /// answered with "A print is already on its way."
    ///
    /// It also matters on the wire: the WiFi bridge is a *serial* line, and
    /// two jobs sent down it at once interleave into one corrupt label.
    private func print(_ image: UIImage, copies: Int, jobName: String, service: PrinterService) {
        let job = PrintJob(image: image,
                           copies: max(1, copies),
                           media: store.settings.media,
                           jobName: jobName)
        let previous = chain
        chain = Task { @MainActor in
            _ = await previous?.value
            do {
                for try await update in service.submit(job) {
                    _ = update
                }
                self.notify(ok: true, message: "SENT TO PRINTER")
            } catch {
                self.notify(ok: false, message: error.localizedDescription)
            }
        }
    }

    /// Tells `booth.js` how the print went.
    ///
    /// The name is not ours to choose: the page exposes
    /// `window.booth.nativePrintResult(ok, message)` and counts one call per
    /// sheet per copy. Calling anything else — the first version of this
    /// invented `window.BoothNativeResult` — throws the result away, leaves
    /// the page's counter stuck, and wedges the booth after one print with
    /// no error anywhere.
    ///
    /// The wording matters too: on the wifi path nothing downstream confirms
    /// that paper moved, so this says *sent*. Reporting a print the booth
    /// cannot observe is the same failure as feeding a TSPL printer ESC/POS
    /// — a cheerful message over a blank label.
    private func notify(ok: Bool, message: String) {
        let escaped = message
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: " ")
        web?.evaluateJavaScript(
            "window.booth && window.booth.nativePrintResult && "
            + "window.booth.nativePrintResult(\(ok), '\(escaped)');",
            completionHandler: nil)
    }

    private func save(_ dataURL: String, named name: String) {
        guard let image = Self.decode(dataURL), let png = image.pngData() else {
            return NSLog("[booth] savePNG: nothing to save")
        }
        // Documents, not the photo library: the library needs a usage
        // description and a consent prompt, and a permission sheet in front
        // of a guest mid-session is worse than a file they can fetch later.
        // UIFileSharingEnabled puts this folder in the Files app.
        let safe = name.replacingOccurrences(of: "/", with: "-")
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = dir.appendingPathComponent(safe.hasSuffix(".png") ? safe : safe + ".png")
        // Deliberately silent either way: a save is not a print, and
        // `nativePrintResult` is the only channel back into the page. Using
        // it here would count a saved file as a printed sheet and leave the
        // page's copy counter short.
        do {
            try png.write(to: url)
            NSLog("[booth] saved %@", url.lastPathComponent)
        } catch {
            NSLog("[booth] savePNG failed: %@", error.localizedDescription)
        }
    }

    /// Lets the operator screens turn, and pins the guest screens.
    ///
    /// Same rule as the Android shell: a portrait sheet inside a landscape
    /// window is a sliver, so the console and the layout editor are allowed
    /// to rotate while the guest flow stays where the camera is.
    private func setRotation(free: Bool) {
        Task { @MainActor in
            BoothOrientation.shared.free = free
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first else { return }
            if #available(iOS 16.0, *) {
                scene.requestGeometryUpdate(
                    .iOS(interfaceOrientations: free ? .all : BoothOrientation.boothMask)) { _ in }
                scene.keyWindow?.rootViewController?
                    .setNeedsUpdateOfSupportedInterfaceOrientations()
            }
        }
    }

    private static func decode(_ dataURL: String) -> UIImage? {
        guard let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]),
                              options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }

    // MARK: - WebView delegates

    /// Hands the page the camera without a second prompt.
    ///
    /// iOS has already asked for camera access on the app's behalf, using
    /// NSCameraUsageDescription. Letting WebKit ask again would put a second
    /// dialog in front of a guest for permission the app already holds.
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        // A kiosk has nobody to dismiss a modal alert. Swallow it.
        completionHandler()
    }
}

/// Which way up the app is allowed to be.
///
/// `UISupportedInterfaceOrientations` in Info.plist is the ceiling; this is
/// the live value inside it, so `setRotation` can pin the guest flow and
/// release the operator screens without the app relaunching.
@MainActor
final class BoothOrientation {
    static let shared = BoothOrientation()

    /// Portrait: it puts the iPad's camera above the guest's eyeline rather
    /// than off to one side, which is the whole reason for standing one of
    /// these on end.
    static let boothMask: UIInterfaceOrientationMask = .portrait

    var free = false

    var mask: UIInterfaceOrientationMask {
        free ? .all : Self.boothMask
    }
}
