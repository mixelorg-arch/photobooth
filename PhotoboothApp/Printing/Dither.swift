import UIKit

/// 1-bit raster produced from a colour image, for thermal paper.
struct MonoBitmap {
    let width: Int          // in dots, always a multiple of 8 after padding
    let height: Int
    /// Row-major, 1 bit per dot, MSB first. 1 = burn (black).
    let bits: [UInt8]

    var bytesPerRow: Int { width / 8 }
}

/// Thermal heads are one bit deep: a dot is burnt or it is not. Sending a
/// thresholded photo produces mud, so the image is error-diffused first.
enum Dither {

    /// Scales `image` to `widthDots` and error-diffuses it to 1 bit.
    ///
    /// Floyd–Steinberg rather than ordered/Bayer: on a receipt printer's
    /// coarse dot pitch, ordered dithering leaves a visible crosshatch on
    /// skin, which is the one subject a photobooth always prints.
    static func floydSteinberg(_ image: UIImage, widthDots: Int) -> MonoBitmap? {
        let width = max(8, (widthDots / 8) * 8)          // whole bytes only
        guard let source = image.cgImage ?? image.normalizedUp().cgImage else { return nil }

        let ratio = CGFloat(source.height) / CGFloat(source.width)
        let height = max(1, Int((CGFloat(width) * ratio).rounded()))

        // Render to 8-bit grey. The buffer is allocated rather than passed
        // as `&array` — CGContext keeps the pointer for its whole lifetime,
        // and an inout array pointer is only valid for the duration of the
        // call it is passed to.
        let count = width * height
        let grey = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
        grey.initialize(repeating: 255, count: count)
        defer { grey.deallocate() }

        guard let ctx = CGContext(data: grey,
                                  width: width, height: height,
                                  bitsPerComponent: 8, bytesPerRow: width,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { return nil }

        ctx.setFillColor(UIColor.white.cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        ctx.interpolationQuality = .high
        ctx.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))

        // Diffuse in floating point so accumulated error is not re-quantised
        // every pixel.
        var buffer = [Float](repeating: 0, count: count)
        for i in 0..<count { buffer[i] = Float(grey[i]) }

        func index(_ x: Int, _ y: Int) -> Int { y * width + x }

        for y in 0..<height {
            for x in 0..<width {
                let i = index(x, y)
                let old = buffer[i]
                let new: Float = old < 128 ? 0 : 255
                buffer[i] = new
                let error = old - new

                if x + 1 < width          { buffer[index(x + 1, y)]     += error * 7 / 16 }
                if x > 0, y + 1 < height  { buffer[index(x - 1, y + 1)] += error * 3 / 16 }
                if y + 1 < height         { buffer[index(x, y + 1)]     += error * 5 / 16 }
                if x + 1 < width, y + 1 < height { buffer[index(x + 1, y + 1)] += error * 1 / 16 }
            }
        }

        // Pack: a dark pixel becomes a set bit, because on a thermal head a
        // 1 means "burn".
        let bytesPerRow = width / 8
        var bits = [UInt8](repeating: 0, count: bytesPerRow * height)
        for y in 0..<height {
            for x in 0..<width where buffer[index(x, y)] < 128 {
                bits[y * bytesPerRow + x / 8] |= UInt8(0x80 >> (x % 8))
            }
        }

        return MonoBitmap(width: width, height: height, bits: bits)
    }

    /// The dithered result as a `UIImage`, so Admin can show the operator
    /// exactly what the thermal printer will burn before they commit paper.
    static func preview(_ bitmap: MonoBitmap) -> UIImage? {
        let bytesPerRow = bitmap.bytesPerRow
        let count = bitmap.width * bitmap.height
        let pixels = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
        pixels.initialize(repeating: 255, count: count)
        defer { pixels.deallocate() }

        for y in 0..<bitmap.height {
            for x in 0..<bitmap.width {
                let bit = bitmap.bits[y * bytesPerRow + x / 8] & UInt8(0x80 >> (x % 8))
                pixels[y * bitmap.width + x] = bit != 0 ? 0 : 255
            }
        }
        guard let ctx = CGContext(data: pixels,
                                  width: bitmap.width, height: bitmap.height,
                                  bitsPerComponent: 8, bytesPerRow: bitmap.width,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue),
              let cg = ctx.makeImage()
        else { return nil }
        return UIImage(cgImage: cg)
    }
}
