import UIKit
import Network

/// Prints to a thermal label printer over a WiFi-to-serial bridge.
///
/// This is the only path that reaches a non-AirPrint printer from an iPad,
/// and it is worth saying why the obvious ones do not. Safari has no Web
/// Bluetooth, no Web Serial and no WebUSB, so the browser build cannot do
/// this at all. Bluetooth Classic SPP — which is what these printers expose
/// — requires the accessory to be MFi-certified, which a rebadged label
/// printer is not. USB needs a DriverKit extension, an Apple-granted
/// transport entitlement and a TSPL driver nobody has written. A TCP socket
/// needs none of those: `NWConnection` is ordinary networking.
///
/// The printer's "WiFi" is an **HF-LPT270**, a Hi-Flying WiFi-to-serial
/// bridge, and understanding that is the whole design. It is not a network
/// printer. It never advertises IPP, it will never appear in the iOS print
/// sheet, and it speaks no protocol of its own: it is a transparent pipe
/// that takes whatever arrives on a TCP socket and clocks it out of a UART.
/// So the bytes on the wire are exactly the bytes `TSPLEncoder` produces,
/// and the only configuration that matters is the address, the port, and
/// the baud rate the bridge was told to use.
///
/// Factory defaults, which `AppSettings` mirrors: TCP server on
/// **10.10.100.254:8899**, UART **115200 8N1**, WiFi in **AP mode** with no
/// encryption.
///
/// **What this can and cannot promise.** A transparent bridge gives no
/// acknowledgement from the printer. TCP confirms the *bridge* took the
/// bytes; nothing confirms paper moved. So this service reports the job as
/// sent, never as printed, and `PrintUpdate.message` says so in those words.
/// Claiming otherwise would be the same failure as sending ESC/POS to a
/// TSPL printer: a success message over a blank label.
final class ThermalTCPService: PrinterService {

    private let host: String
    private let port: UInt16
    private let widthDots: Int
    private let dpi: CGFloat
    private let gapMM: Double
    /// Only used to estimate how long the bridge needs to drain its buffer.
    /// It does not set the bridge's baud — that is configured on the
    /// module's own web page, and the two have to agree.
    private let baud: Int

    /// A socket that never reaches `.ready` would otherwise hang the print
    /// screen forever. Ten seconds is long for a LAN and short for a guest.
    private let connectTimeout: TimeInterval = 10

    private let queue = DispatchQueue(label: "photobooth.thermal.tcp")

    init(host: String,
         port: UInt16,
         widthDots: Int,
         dpi: CGFloat,
         gapMM: Double,
         baud: Int) {
        self.host = host
        self.port = port
        self.widthDots = widthDots
        self.dpi = dpi
        self.gapMM = gapMM
        self.baud = max(1200, baud)
    }

    var displayName: String { "THERMAL (WIFI) \(host):\(port)" }

    func submit(_ job: PrintJob) -> AsyncThrowingStream<PrintUpdate, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    continuation.yield(PrintUpdate(progress: 0.1, message: "PREPARING"))

                    guard let bitmap = Dither.floydSteinberg(job.image, widthDots: widthDots) else {
                        throw PrintError.failed("The sheet could not be converted for the printer.")
                    }

                    let payload = TSPLEncoder.job(
                        bitmap,
                        copies: job.copies,
                        widthMM: TSPLEncoder.millimetres(dots: bitmap.width, dpi: dpi),
                        heightMM: TSPLEncoder.millimetres(dots: bitmap.height, dpi: dpi),
                        gapMM: gapMM)

                    continuation.yield(PrintUpdate(progress: 0.3, message: "CONNECTING"))
                    let connection = try await connect()
                    defer { connection.cancel() }

                    continuation.yield(PrintUpdate(progress: 0.5, message: "SENDING"))
                    try await send(payload, over: connection)

                    // The socket has the bytes; the printer does not yet.
                    // A serial bridge accepts a whole job into memory in
                    // milliseconds and then spends seconds clocking it out
                    // at 115200 baud. Cancelling the connection now can
                    // truncate the job mid-label on some firmware, so wait
                    // out the drain before the `defer` above fires.
                    let drain = drainSeconds(for: payload.count)
                    continuation.yield(PrintUpdate(progress: 0.7, message: "PRINTING"))
                    try await Task.sleep(nanoseconds: UInt64(drain * 1_000_000_000))

                    // Deliberately "SENT", not "PRINTED". See the note above:
                    // a transparent bridge cannot tell us the paper moved.
                    continuation.yield(PrintUpdate(progress: 1, message: "SENT TO PRINTER"))
                    continuation.finish()
                } catch let error as PrintError {
                    continuation.finish(throwing: error)
                } catch {
                    continuation.finish(throwing: PrintError.notConnected("\(host):\(port)"))
                }
            }
        }
    }

    /// Can the bridge be reached at all?
    ///
    /// Worth having its own button in Admin: by far the most likely fault is
    /// being on the wrong WiFi network, and that is a question a socket can
    /// answer in a second without feeding a label to find out. A `true` here
    /// means the bridge accepted a TCP connection — it says nothing about
    /// the baud rate matching, which only a real print reveals.
    func probe() async -> Bool {
        do {
            let connection = try await connect()
            connection.cancel()
            return true
        } catch {
            return false
        }
    }

    /// Seconds for `bytes` to leave the bridge's UART.
    ///
    /// 8N1 frames every byte in 10 bits — one start, eight data, one stop —
    /// so the useful rate is `baud / 10`, not `baud / 8`. A quarter second
    /// is added for the printer's own buffering and for the head to finish
    /// the last few rows.
    private func drainSeconds(for bytes: Int) -> Double {
        Double(bytes) / (Double(baud) / 10.0) + 0.25
    }

    private func connect() async throws -> NWConnection {
        let endpoint = NWEndpoint.Host(host)
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            throw PrintError.failed("\(port) is not a usable port number.")
        }

        // No TLS, and the bridge offers none: it is a serial cable with a
        // radio on it. `noDelay` matters because a raster is pushed as one
        // large write and Nagle would only add latency to the first packet.
        let options = NWProtocolTCP.Options()
        options.noDelay = true
        options.connectionTimeout = Int(connectTimeout)

        let connection = NWConnection(host: endpoint, port: nwPort,
                                      using: NWParameters(tls: nil, tcp: options))

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            // `stateUpdateHandler` can fire more than once — `.ready` then
            // `.failed` on a dropped link — and resuming a continuation
            // twice is a crash, not a warning.
            let resumed = OnceFlag()

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    if resumed.claim() { cont.resume() }
                case .failed(let error):
                    if resumed.claim() {
                        cont.resume(throwing: PrintError.notConnected(
                            "\(self.host):\(self.port) — \(error.localizedDescription)"))
                    }
                case .cancelled:
                    if resumed.claim() {
                        cont.resume(throwing: PrintError.cancelled)
                    }
                default:
                    break
                }
            }

            connection.start(queue: queue)

            // `connectionTimeout` covers a host that refuses, but not one
            // that silently never answers — which is exactly what an
            // unreachable AP looks like.
            queue.asyncAfter(deadline: .now() + connectTimeout) {
                if resumed.claim() {
                    connection.cancel()
                    cont.resume(throwing: PrintError.notConnected("\(self.host):\(self.port)"))
                }
            }
        }

        return connection
    }

    private func send(_ data: Data, over connection: NWConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error {
                    cont.resume(throwing: PrintError.failed(
                        "The printer stopped accepting the job: \(error.localizedDescription)"))
                } else {
                    cont.resume()
                }
            })
        }
    }
}

/// A one-shot latch, so a continuation is resumed exactly once no matter
/// how many times a callback fires.
private final class OnceFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var used = false

    /// True the first time it is called, false every time after.
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if used { return false }
        used = true
        return true
    }
}
