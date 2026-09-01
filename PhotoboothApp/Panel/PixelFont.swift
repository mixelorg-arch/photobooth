import SwiftUI

/// A 5x7 bitmap font, drawn with `Canvas`.
///
/// The panel look lives or dies on real bitmap type, and there is no pixel
/// face on iOS. So the font is built rather than hunted for — the same
/// decision as `PixelIcon`, and the grids are shared verbatim with the
/// browser build in `web/booth.js`. Uppercase only, which is all this UI
/// ever sets: `PixelText` upper-cases whatever it is handed.
enum PixelFont {

    static let glyphWidth  = 5
    static let glyphHeight = 7

    /// `#` is a lit pixel, `.` is paper.
    static let glyphs: [Character: [String]] = [
        "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
        "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
        "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
        "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
        "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
        "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
        "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
        "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
        "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
        "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
        "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
        "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
        "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
        "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
        "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
        "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
        "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
        "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
        "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
        "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
        "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
        "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
        "W": ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
        "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
        "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
        "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
        "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
        "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
        "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
        "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
        "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
        "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
        "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
        "7": ["#####", "....#", "....#", "...#.", "..#..", "..#..", "..#.."],
        "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
        "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
        " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
        ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
        ".": [".....", ".....", ".....", ".....", ".....", "..#..", "..#.."],
        ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
        "%": ["##..#", "##.#.", "..#..", ".#...", "#..##", "...##", "....."],
        "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
        "?": [".###.", "#...#", "....#", "..##.", "..#..", ".....", "..#.."],
        "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
        "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
        "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
        "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
        "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
        "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
        ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
        ">": ["#....", ".#...", "..#..", "...#.", "..#..", ".#...", "#...."],
        "<": ["....#", "...#.", "..#..", ".#...", "..#..", "...#.", "....#"],
        "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
        "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
        "@": [".###.", "#...#", "#.##.", "#.#.#", "#.###", "#....", ".###."],
        "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
        "x": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
    ]

    static func glyph(_ character: Character) -> [String] {
        glyphs[character] ?? glyphs["?"]!
    }

    /// Width in points of `text` at the given cell size, including the
    /// inter-character gap. Callers size their frames with this rather than
    /// measuring a rendered image.
    static func width(_ text: String, cell: CGFloat) -> CGFloat {
        let count = text.count
        guard count > 0 else { return cell }
        let gap = max(1, (cell * 0.8).rounded())
        return CGFloat(count) * (CGFloat(glyphWidth) * cell + gap) - gap
    }

    static func height(cell: CGFloat) -> CGFloat { CGFloat(glyphHeight) * cell }
}

/// Bitmap type. `cell` is the size of one font pixel, so the cap height is
/// always 7 x cell — the only size control there is, which is exactly how a
/// bitmap face should behave.
///
/// `fits` lets a label shrink rather than overflow its module: a clipped
/// legend is the one thing that breaks the silkscreen illusion.
struct PixelText: View {
    let text: String
    var cell: CGFloat = 4
    var colour: Color = Panel.ink
    /// Maximum width in points. The cell shrinks until the string fits.
    var fits: CGFloat? = nil

    private var upper: String { text.uppercased() }

    private var resolvedCell: CGFloat {
        guard let fits, fits > 0 else { return cell }
        var size = cell
        while size > 1 && PixelFont.width(upper, cell: size) > fits {
            size -= 1
        }
        return max(1, size)
    }

    var body: some View {
        let size = resolvedCell
        let characters = Array(upper)
        let gap = max(1, (size * 0.8).rounded())
        let w = PixelFont.width(upper, cell: size)
        let h = PixelFont.height(cell: size)

        Canvas { ctx, _ in
            for (index, character) in characters.enumerated() {
                let rows = PixelFont.glyph(character)
                let ox = CGFloat(index) * (CGFloat(PixelFont.glyphWidth) * size + gap)
                for (y, line) in rows.enumerated() {
                    for (x, pixel) in line.enumerated() where pixel == "#" {
                        ctx.fill(
                            Path(CGRect(x: ox + CGFloat(x) * size,
                                        y: CGFloat(y) * size,
                                        width: size, height: size)),
                            with: .color(colour))
                    }
                }
            }
        }
        .frame(width: w, height: h)
        .accessibilityLabel(Text(text))
    }
}
