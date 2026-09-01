import UIKit
import CoreBluetooth

/// A thermal printer the app has seen over BLE.
struct ThermalPeripheral: Identifiable, Equatable {
    let id: String          // CBPeripheral.identifier.uuidString
    let name: String
    let rssi: Int
}

/// Bluetooth link to an ESC/POS thermal printer.
///
/// This is the generic path, and it is deliberately generic: the printer
/// model has not been confirmed, so nothing here assumes one vendor's SDK.
/// It scans for any peripheral advertising a writable characteristic,
/// connects, and streams ESC/POS raster commands to it. That covers the
/// common Bluetooth receipt printers (Phomemo, Munbyn, Goojprt, and the
/// rebadged 58 mm modules) because they all accept the same bytes.
///
/// If the printer turns out to be AirPrint-capable instead, none of this is
/// needed — set the target to `.airPrint` in Admin and pick a thermal media
/// profile. If it turns out to need a proprietary SDK, this class is the one
/// file to replace: `PrinterService` keeps the rest of the app unchanged.
@MainActor
final class ThermalPrinterLink: NSObject, ObservableObject {

    static let shared = ThermalPrinterLink()

    @Published private(set) var state: CBManagerState = .unknown
    @Published private(set) var isScanning = false
    @Published private(set) var found: [ThermalPeripheral] = []
    @Published private(set) var connectedName: String?

    /// Service UUIDs the common modules advertise. Scanning is unfiltered so
    /// an unknown model still shows up; these are used to rank candidates.
    static let knownServices: [CBUUID] = [
        CBUUID(string: "FFE0"),     // and characteristic FFE1
        CBUUID(string: "FF00"),     // and characteristic FF02
        CBUUID(string: "18F0"),     // and characteristic 2AF1
        CBUUID(string: "AE30"),     // and characteristic AE01
        CBUUID(string: "49535343-FE7D-4AE5-8FA9-9FAFD205E455"),
    ]

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    /// CoreBluetooth does not retain peripherals it hands to the delegate,
    /// so every discovery is kept here until the app is done with it.
    private var discovered: [String: CBPeripheral] = [:]

    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var writeContinuation: CheckedContinuation<Void, Error>?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    var isConnected: Bool { writeCharacteristic != nil }

    // MARK: - Discovery

    func startScan() {
        guard central.state == .poweredOn else { return }
        found.removeAll()
        isScanning = true
        central.scanForPeripherals(withServices: nil,
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    func stopScan() {
        isScanning = false
        central.stopScan()
    }

    // MARK: - Connection

    func connect(id: String) async throws {
        if let current = peripheral, current.identifier.uuidString == id, isConnected { return }

        guard let uuid = UUID(uuidString: id) else { throw PrintError.noPrinter }
        guard let target = central.retrievePeripherals(withIdentifiers: [uuid]).first
                ?? discovered[id] else {
            throw PrintError.notConnected("the thermal printer")
        }

        peripheral = target
        discovered[id] = target
        target.delegate = self
        writeCharacteristic = nil

        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            connectContinuation = c
            central.connect(target, options: nil)

            // A BLE printer that is out of range never fails, it just never
            // answers — so the connect carries its own deadline.
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(12))
                guard let pending = self.connectContinuation else { return }
                self.connectContinuation = nil
                self.central.cancelPeripheralConnection(target)
                pending.resume(throwing:
                    PrintError.notConnected(target.name ?? "the thermal printer"))
            }
        }
    }

    func disconnect() {
        if let peripheral { central.cancelPeripheralConnection(peripheral) }
        peripheral = nil
        writeCharacteristic = nil
        connectedName = nil
    }

    // MARK: - Writing

    /// Streams the chunks, reporting 0...1 as it goes.
    func send(_ chunks: [Data], progress: @escaping (Double) -> Void) async throws {
        guard let peripheral, let characteristic = writeCharacteristic else {
            throw PrintError.notConnected(connectedName ?? "the thermal printer")
        }

        let withResponse = characteristic.properties.contains(.write)
        let type: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse

        for (index, chunk) in chunks.enumerated() {
            try Task.checkCancellation()

            if withResponse {
                // Flow control for free: the printer acknowledges each write
                // when its buffer has room. Without it a long raster
                // overruns the module and prints half an image.
                try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
                    writeContinuation = c
                    peripheral.writeValue(chunk, for: characteristic, type: type)
                }
            } else {
                peripheral.writeValue(chunk, for: characteristic, type: type)
                // No acknowledgement to wait on, so pace the writes by hand.
                try await Task.sleep(for: .milliseconds(18))
            }

            progress(Double(index + 1) / Double(chunks.count))
        }
    }
}

extension ThermalPrinterLink: @preconcurrency CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        state = central.state
        if central.state != .poweredOn {
            isScanning = false
            writeCharacteristic = nil
        }
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any],
                        rssi RSSI: NSNumber) {
        // Unnamed peripherals are noise in a venue full of phones.
        guard let name = peripheral.name, !name.isEmpty else { return }
        let entry = ThermalPeripheral(id: peripheral.identifier.uuidString,
                                      name: name,
                                      rssi: RSSI.intValue)
        if let existing = found.firstIndex(where: { $0.id == entry.id }) {
            found[existing] = entry
        } else {
            found.append(entry)
            found.sort { $0.rssi > $1.rssi }
        }
        discovered[entry.id] = peripheral
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectedName = peripheral.name
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager,
                        didFailToConnect peripheral: CBPeripheral,
                        error: Error?) {
        let continuation = connectContinuation
        connectContinuation = nil
        continuation?.resume(throwing: PrintError.notConnected(peripheral.name ?? "printer"))
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral,
                        error: Error?) {
        writeCharacteristic = nil
        connectedName = nil
        let continuation = writeContinuation
        writeContinuation = nil
        continuation?.resume(throwing: PrintError.notConnected(peripheral.name ?? "printer"))
    }
}

extension ThermalPrinterLink: @preconcurrency CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for service in peripheral.services ?? [] {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        guard writeCharacteristic == nil else { return }

        // Any characteristic that accepts a write will do — that is what
        // makes an unconfirmed printer model workable. Prefer one that
        // acknowledges, for the flow control.
        let candidates = (service.characteristics ?? []).filter {
            $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)
        }
        guard let chosen = candidates.first(where: { $0.properties.contains(.write) })
                ?? candidates.first else { return }

        writeCharacteristic = chosen
        let continuation = connectContinuation
        connectContinuation = nil
        continuation?.resume()
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didWriteValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        let continuation = writeContinuation
        writeContinuation = nil
        if let error {
            continuation?.resume(throwing: PrintError.failed(error.localizedDescription))
        } else {
            continuation?.resume()
        }
    }
}

/// `PrinterService` over the BLE link above.
@MainActor
final class ThermalSDKService: PrinterService {

    private let savedPeripheralID: String?
    private let widthDots: Int
    private let link = ThermalPrinterLink.shared

    init(savedPeripheralID: String?, widthDots: Int) {
        self.savedPeripheralID = savedPeripheralID
        self.widthDots = widthDots
    }

    nonisolated var displayName: String { "Thermal (Bluetooth)" }

    nonisolated func submit(_ job: PrintJob) -> AsyncThrowingStream<PrintUpdate, Error> {
        AsyncThrowingStream { continuation in
            Task { @MainActor in
                do {
                    try await self.run(job) { continuation.yield($0) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    private func run(_ job: PrintJob, emit: @escaping (PrintUpdate) -> Void) async throws {
        guard let id = savedPeripheralID else { throw PrintError.noPrinter }

        emit(PrintUpdate(progress: 0.08, message: "Connecting to the printer…"))
        try await link.connect(id: id)

        emit(PrintUpdate(progress: 0.22, message: "Dithering for thermal paper…"))
        guard let bitmap = Dither.floydSteinberg(job.image, widthDots: widthDots) else {
            throw PrintError.failed("The image could not be prepared for thermal paper.")
        }

        // ESC/POS has no copy count, so the raster is simply repeated —
        // which is why `PrintJob.copies` is passed down rather than handled
        // by the caller.
        let chunks = ESCPOSEncoder.chunked(
            ESCPOSEncoder.job(bitmap, copies: job.copies))

        emit(PrintUpdate(progress: 0.30, message: "Sending \(chunks.count) blocks…"))
        try await link.send(chunks) { fraction in
            emit(PrintUpdate(progress: 0.30 + fraction * 0.68,
                             message: "Printing… \(Int(fraction * 100))%"))
        }

        emit(PrintUpdate(progress: 1.0, message: "Sent to \(link.connectedName ?? "printer")."))
    }
}
