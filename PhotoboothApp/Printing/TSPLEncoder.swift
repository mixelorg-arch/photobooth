import Foundation

/// A print job in TSPL, the language label printers speak.
///
/// Why this exists alongside `ESCPOSEncoder`: ESC/POS is what *receipt*
/// printers understand, and it is what the Bluetooth path sends. A label
/// printer is a different animal. The VOZY U9 says so itself — plugged into
/// a Mac it reports
///
///     COMMANDSET:TSPL;MDL:LABEL-9X00;CLASS:PRINTER;ACTIVE COMMAND:TSPL
///
/// — and a printer that only speaks TSPL, handed ESC/POS, will connect,
/// acknowledge, and feed blank stickers. That is a worse failure than
/// refusing the job, because it looks like it is working.
///
/// The two languages differ in shape, not just in bytes. ESC/POS is a
/// stream: the head prints whatever arrives and the paper keeps moving.
/// TSPL describes a *label* — its size, the gap to the next one, what to
/// draw on it, and then how many to print. So the physical size has to be
/// stated up front, which also means the printer stops at the gap between
/// stickers instead of running on into the next one.
///
/// One trap worth naming: TSPL's BITMAP takes the raster with **0 meaning a
/// burned dot** — the opposite of the convention everywhere else in this
/// app, where a set bit means burn. The inversion happens here rather than
/// in the dither, so nothing upstream has to know which printer it feeds.
///
/// This is a port of `Tspl.java` in the Android build, byte for byte. The
/// two have to stay in step: a change here is a change there.
enum TSPLEncoder {

    /// One job: a label of `widthMM` x `heightMM` carrying `bitmap`,
    /// printed `copies` times.
    ///
    /// `gapMM` is the unprinted strip between stickers, which the printer's
    /// sensor uses to find the start of the next one. 2mm is the usual value
    /// for die-cut labels and is what the U9's own stock uses; a continuous
    /// roll wants 0, and gets GAP 0,0.
    ///
    /// Copies go in TSPL's own `PRINT n` rather than by sending the job `n`
    /// times — the printer repeats from its own buffer, so the image crosses
    /// the wire once. On a 115200-baud serial bridge that is the difference
    /// between one wait and `n` of them.
    static func job(_ bitmap: MonoBitmap,
                    copies: Int,
                    widthMM: Double,
                    heightMM: Double,
                    gapMM: Double) -> Data {
        var out = Data()

        out.append(ascii(String(format: "SIZE %.1f mm,%.1f mm\r\n", widthMM, heightMM)))
        out.append(ascii(String(format: "GAP %.1f mm,0 mm\r\n", max(0, gapMM))))
        // Left to right, top edge first, and no mirroring: the sheet is
        // already oriented the way it should come out.
        out.append(ascii("DIRECTION 0,0\r\n"))
        out.append(ascii("REFERENCE 0,0\r\n"))
        // Blackness and speed are deliberately left at the printer's own
        // settings. The booth dithers for a head at its default darkness,
        // and turning the heat up here would fill in the very midtones the
        // dither exists to preserve.
        out.append(ascii("CLS\r\n"))

        // BITMAP x,y,width-in-bytes,height,mode,<data>. Mode 0 overwrites.
        out.append(ascii("BITMAP 0,0,\(bitmap.bytesPerRow),\(bitmap.height),0,"))
        out.append(Data(bitmap.bits.map { ~$0 }))
        out.append(ascii("\r\n"))

        out.append(ascii("PRINT \(max(1, copies)),1\r\n"))
        return out
    }

    /// Millimetres a raster of `dots` covers on a head of `dpi`.
    ///
    /// TSPL wants the label in mm but the booth composes in dots, and the
    /// nominal media height is only nominal on a roll — the receipt renderer
    /// decides how far the paper actually feeds. So the *bitmap* is the
    /// source of truth for both axes, never the `PrintMedia` dimensions.
    static func millimetres(dots: Int, dpi: CGFloat) -> Double {
        Double(dots) * 25.4 / Double(dpi)
    }

    /// TSPL commands are ASCII; only the bitmap payload is binary.
    private static func ascii(_ s: String) -> Data {
        Data(s.utf8)
    }
}
