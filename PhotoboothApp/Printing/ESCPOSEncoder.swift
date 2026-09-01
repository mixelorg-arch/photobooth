import Foundation

/// Builds the byte stream a receipt-class thermal printer expects.
///
/// ESC/POS is a de-facto standard: nearly every generic Bluetooth thermal
/// printer implements the raster bit-image command, which is the only one
/// this app needs. Manufacturer SDKs mostly wrap these same bytes.
enum ESCPOSEncoder {

    /// GS v 0 has a 16-bit height field, but many printers stall on very
    /// tall single rasters, so the image is sent in bands.
    static let bandHeight = 128

    static func job(_ bitmap: MonoBitmap,
                    copies: Int,
                    feedLines: Int = 4,
                    cut: Bool = true) -> [Data] {
        var chunks: [Data] = []
        chunks.append(initialise())

        for _ in 0..<max(1, copies) {
            chunks.append(contentsOf: raster(bitmap))
            chunks.append(feed(lines: feedLines))
            if cut { chunks.append(partialCut()) }
        }
        return chunks
    }

    /// ESC @ — reset to a known state. Without it the first job after a
    /// power cycle can inherit whatever mode the last app left set.
    static func initialise() -> Data { Data([0x1B, 0x40]) }

    /// ESC d n — feed n lines.
    static func feed(lines: Int) -> Data {
        Data([0x1B, 0x64, UInt8(clamping: lines)])
    }

    /// GS V 1 — partial cut. Printers with no cutter ignore it.
    static func partialCut() -> Data { Data([0x1D, 0x56, 0x01]) }

    /// GS v 0 — raster bit image, one command per band.
    ///
    ///   GS  v  0  m  xL xH yL yH  d1...dk
    ///   m = 0 (normal), xL/xH = bytes per row, yL/yH = rows in this band.
    static func raster(_ bitmap: MonoBitmap) -> [Data] {
        let bytesPerRow = bitmap.bytesPerRow
        guard bytesPerRow > 0, bitmap.height > 0 else { return [] }

        var bands: [Data] = []
        var row = 0
        while row < bitmap.height {
            let rows = min(bandHeight, bitmap.height - row)
            var band = Data([0x1D, 0x76, 0x30, 0x00])
            band.append(UInt8(bytesPerRow & 0xFF))
            band.append(UInt8((bytesPerRow >> 8) & 0xFF))
            band.append(UInt8(rows & 0xFF))
            band.append(UInt8((rows >> 8) & 0xFF))

            let start = row * bytesPerRow
            let end = start + rows * bytesPerRow
            band.append(contentsOf: bitmap.bits[start..<end])

            bands.append(band)
            row += rows
        }
        return bands
    }

    /// Splits a command stream into BLE-sized writes. 180 bytes sits under
    /// the 185-byte payload most of these modules accept and above the
    /// point where per-write latency dominates.
    static func chunked(_ datas: [Data], size: Int = 180) -> [Data] {
        var out: [Data] = []
        var buffer = Data()
        for data in datas { buffer.append(data) }
        var offset = 0
        while offset < buffer.count {
            let end = min(offset + size, buffer.count)
            out.append(buffer.subdata(in: offset..<end))
            offset = end
        }
        return out
    }
}
