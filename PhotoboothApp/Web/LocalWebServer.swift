import Foundation
import Network

/// Serves the bundled `web/` folder over HTTP on the loopback interface.
///
/// Why a server at all, when `WKWebView` can load a folder straight off disk
/// with `loadFileURL`: **the camera**. `getUserMedia` is only offered to a
/// secure context, and `http://127.0.0.1` is defined as potentially
/// trustworthy, so it qualifies exactly as `https://` would. A `file://`
/// page does not, and the booth would come up with a dead preview.
///
/// This is the same problem the Android shell solved with
/// `WebViewAssetLoader` and its fake `https://appassets.androidplatform.net`
/// origin. iOS has no equivalent, so the loopback server is it.
///
/// Note what is *not* a reason: the service worker. `web/sw.js` deliberately
/// does not register on localhost — it was switched off there because a
/// stale cached file cost an afternoon of debugging once. That costs the
/// native build nothing, because `web/` ships inside the app bundle, so the
/// booth is already offline without any cache at all.
///
/// Deliberately minimal: GET only, no ranges, no keep-alive, no directory
/// listing. It serves a handful of static files to one WebView inside the
/// same process. It binds to loopback, so nothing off the device can reach
/// it — worth keeping that way given it answers before any booth passcode.
final class LocalWebServer {

    enum ServerError: LocalizedError {
        case missingRoot(URL)
        case noPort

        var errorDescription: String? {
            switch self {
            case .missingRoot(let url):
                return "The booth's web files are missing from the app bundle (\(url.lastPathComponent))."
            case .noPort:
                return "The booth could not open a local port to serve itself on."
            }
        }
    }

    private let root: URL
    private let queue = DispatchQueue(label: "photobooth.webserver", attributes: .concurrent)
    private var listener: NWListener?

    /// The port actually bound. Zero until `start()` returns.
    private(set) var port: UInt16 = 0

    /// Where the WebView should point once started.
    var rootURL: URL? {
        port == 0 ? nil : URL(string: "http://127.0.0.1:\(port)/")
    }

    init(root: URL) {
        self.root = root
    }

    /// Binds to a port the system picks and begins serving.
    ///
    /// Port 0 rather than a fixed number on purpose: a hardcoded port is a
    /// launch failure waiting to happen the one time something else on the
    /// device already holds it, and nothing outside this process needs to
    /// know the number.
    func start() throws {
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
            throw ServerError.missingRoot(root)
        }

        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredInterfaceType = .loopback

        let listener = try NWListener(using: params, on: .any)
        listener.newConnectionHandler = { [weak self] connection in
            connection.start(queue: self?.queue ?? .global())
            self?.receive(on: connection, buffer: Data())
        }

        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
            if case .failed = state { ready.signal() }
        }
        listener.start(queue: queue)
        _ = ready.wait(timeout: .now() + 5)

        guard let bound = listener.port?.rawValue, bound != 0 else {
            listener.cancel()
            throw ServerError.noPort
        }

        self.listener = listener
        self.port = bound
    }

    func stop() {
        listener?.cancel()
        listener = nil
        port = 0
    }

    // MARK: - Request handling

    /// Accumulates until the end of the request head.
    ///
    /// A single `receive` is not a request: TCP will happily split a header
    /// across packets, and on a fast loopback it usually does not — which is
    /// exactly why this is the kind of bug that only shows up on a slower
    /// device. So read until the blank line that ends the head, and only
    /// then parse. The booth never sends a body, so the head is the whole
    /// request.
    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) {
            [weak self] chunk, _, isComplete, error in
            guard let self else { return }

            var accumulated = buffer
            if let chunk { accumulated.append(chunk) }

            if let terminator = accumulated.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: accumulated[..<terminator.lowerBound], as: UTF8.self)
                self.respond(to: head, on: connection)
                return
            }

            if error != nil || isComplete || accumulated.count > 64 * 1024 {
                connection.cancel()
                return
            }
            self.receive(on: connection, buffer: accumulated)
        }
    }

    private func respond(to head: String, on connection: NWConnection) {
        guard let requestLine = head.split(separator: "\r\n").first else {
            return send(status: "400 Bad Request", body: Data(), type: "text/plain", on: connection)
        }

        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else {
            return send(status: "405 Method Not Allowed", body: Data(), type: "text/plain", on: connection)
        }

        guard let file = resolve(String(parts[1])) else {
            return send(status: "404 Not Found", body: Data("Not found".utf8),
                        type: "text/plain", on: connection)
        }

        guard let body = try? Data(contentsOf: file) else {
            return send(status: "404 Not Found", body: Data("Not found".utf8),
                        type: "text/plain", on: connection)
        }

        send(status: "200 OK", body: body, type: Self.contentType(for: file), on: connection)
    }

    /// Maps a request path to a file inside `root`, or nil.
    ///
    /// `standardized` then a prefix check is what stops `GET /../../etc` from
    /// escaping the folder. Even on loopback that is worth doing — the check
    /// costs nothing and the failure is total.
    private func resolve(_ target: String) -> URL? {
        var path = target
        if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
        if let h = path.firstIndex(of: "#") { path = String(path[..<h]) }
        path = path.removingPercentEncoding ?? path
        if path.isEmpty || path == "/" { path = "/index.html" }

        let candidate = root.appendingPathComponent(path).standardized
        guard candidate.path.hasPrefix(root.standardized.path) else { return nil }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory) else {
            return nil
        }
        if isDirectory.boolValue {
            let index = candidate.appendingPathComponent("index.html")
            return FileManager.default.fileExists(atPath: index.path) ? index : nil
        }
        return candidate
    }

    private func send(status: String, body: Data, type: String, on connection: NWConnection) {
        var header = "HTTP/1.1 \(status)\r\n"
        header += "Content-Type: \(type)\r\n"
        header += "Content-Length: \(body.count)\r\n"
        // The booth is reinstalled far more often than it is reloaded, and a
        // stale script served from the WebView's own cache after a rebuild is
        // a genuinely confusing afternoon. The service worker does the real
        // offline caching; this layer should not second-guess it.
        header += "Cache-Control: no-cache\r\n"
        header += "Connection: close\r\n\r\n"

        var payload = Data(header.utf8)
        payload.append(body)
        connection.send(content: payload, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private static func contentType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "text/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "png":         return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg":         return "image/svg+xml"
        case "gif":         return "image/gif"
        case "ico":         return "image/x-icon"
        case "woff2":       return "font/woff2"
        case "woff":        return "font/woff"
        case "txt":         return "text/plain; charset=utf-8"
        default:            return "application/octet-stream"
        }
    }
}
