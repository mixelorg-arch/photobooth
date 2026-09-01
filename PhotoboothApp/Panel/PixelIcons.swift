import SwiftUI

/// Pixel-art iconography, drawn rather than shipped as assets.
///
/// Each icon is a small character grid. `Canvas` fills one hard-edged
/// rectangle per cell, so the icons stay crisp at any size — the whole point
/// of the aesthetic — and there is no image file to lose, scale badly, or
/// license. Grids need not be square or uniform: the renderer measures them.
///
/// Legend:  `.` transparent   `K` ink        `W` white     `A` caller accent
///          `G` grey          `D` dark grey  `R` red       `Y` yellow
///          `B` blue          `S` skin/warm
enum PixelIcon: String, CaseIterable {
    case eyeball, floppy, cd, hourglass, folder, camera, printer
    case warning, info, star, check, gear

    var grid: [String] {
        switch self {
        case .eyeball: return [
            "................",
            ".....KKKKKK.....",
            "...KK......KK...",
            "..K..........K..",
            ".K....KKKK....K.",
            "K....KWWWWK....K",
            "K...KWWAAWWK...K",
            "K...KWAAAAWK...K",
            "K...KWWAAWWK...K",
            "K....KWWWWK....K",
            ".K....KKKK....K.",
            "..K..........K..",
            "...KK......KK...",
            ".....KKKKKK.....",
            "................",
        ]
        case .floppy: return [
            "................",
            ".KKKKKKKKKKKKKK.",
            ".KWWWWKKKKWWWWK.",
            ".KWKKWKAAKWKKWK.",
            ".KWKKWKAAKWKKWK.",
            ".KWKKWKAAKWKKWK.",
            ".KWWWWKKKKWWWWK.",
            ".KAAAAAAAAAAAAK.",
            ".KAAAAAAAAAAAAK.",
            ".KKWWWWWWWWWWKK.",
            ".KKWKKKKKKKKWKK.",
            ".KKWKKKKKKKKWKK.",
            ".KKWWWWWWWWWWKK.",
            ".KKKKKKKKKKKKKK.",
            "................",
        ]
        case .cd: return [
            ".....KKKKKK.....",
            "...KKWWWWWWKK...",
            "..KWWAAAAAAWWK..",
            ".KWAAAAAAAAAAWK.",
            ".KWAAAAKKAAAAWK.",
            "KWAAAAKWWKAAAAWK",
            "KWAAAKWWWWKAAAWK",
            "KWAAAKWWWWKAAAWK",
            "KWAAAAKWWKAAAAWK",
            "KWAAAAAKKAAAAAWK",
            ".KWAAAAAAAAAAWK.",
            ".KWWAAAAAAAAWWK.",
            "..KKWWWWWWWWKK..",
            "....KKKKKKKK....",
            "................",
        ]
        case .hourglass: return [
            "................",
            ".KKKKKKKKKKKKKK.",
            ".KWWWWWWWWWWWWK.",
            "..KAAAAAAAAAAK..",
            "...KAAAAAAAAK...",
            "....KAAAAAAK....",
            ".....KAAAAK.....",
            "......KAAK......",
            ".....KWAAWK.....",
            "....KWWAAWWK....",
            "...KWAAAAAAWK...",
            "..KWAAAAAAAAWK..",
            ".KWAAAAAAAAAAWK.",
            ".KKKKKKKKKKKKKK.",
            "................",
        ]
        case .folder: return [
            "................",
            "..KKKKK.........",
            ".KYYYYYKKKKKKK..",
            ".KYYYYYYYYYYYK..",
            ".KYYYYYYYYYYYK..",
            ".KYWWWWWWWWWYK..",
            ".KYWYYYYYYYWYK..",
            ".KYWYYYYYYYWYK..",
            ".KYWYYYYYYYWYK..",
            ".KYWWWWWWWWWYK..",
            ".KYYYYYYYYYYYK..",
            ".KKKKKKKKKKKKK..",
            "................",
        ]
        case .camera: return [
            "................",
            "......KKKK......",
            "....KKWWWWKK....",
            ".KKKKKKKKKKKKKK.",
            ".KWWWKKKKKKWRWK.",
            ".KWKKWWWWWWKKWK.",
            ".KWKWWAAAAWWKWK.",
            ".KWKWAAAAAAWKWK.",
            ".KWKWAAAAAAWKWK.",
            ".KWKWWAAAAWWKWK.",
            ".KWKKWWWWWWKKWK.",
            ".KWWWKKKKKKWWWK.",
            ".KKKKKKKKKKKKKK.",
            "................",
        ]
        case .printer: return [
            "................",
            "...KKKKKKKKKK...",
            "...KWWWWWWWWK...",
            "...KWKKKKKKWK...",
            "...KWWWWWWWWK...",
            ".KKKKKKKKKKKKKK.",
            ".KGGGGGGGGGGGAK.",
            ".KGGGGGGGGGGGGK.",
            ".KKKKKKKKKKKKKK.",
            "...KWWWWWWWWK...",
            "...KWAAAAAAWK...",
            "...KWWWWWWWWK...",
            "...KKKKKKKKKK...",
            "................",
        ]
        case .warning: return [
            "................",
            ".......KK.......",
            "......KRRK......",
            "......KRRK......",
            ".....KRRRRK.....",
            ".....KRWWRK.....",
            "....KRRWWRRK....",
            "....KRRWWRRK....",
            "...KRRRWWRRRK...",
            "...KRRRWWRRRK...",
            "..KRRRRRRRRRRK..",
            "..KRRRRWWRRRRK..",
            ".KRRRRRWWRRRRRK.",
            ".KKKKKKKKKKKKKK.",
            "................",
        ]
        case .info: return [
            "................",
            ".....KKKKKK.....",
            "...KKAAAAAAKK...",
            "..KAAAAWWAAAAK..",
            ".KAAAAAWWAAAAAK.",
            ".KAAAAAAAAAAAAK.",
            "KAAAAAWWWAAAAAAK",
            "KAAAAAAWWAAAAAAK",
            "KAAAAAAWWAAAAAAK",
            ".KAAAAAWWAAAAAK.",
            ".KAAAAWWWWAAAAK.",
            "..KAAAAAAAAAAK..",
            "...KKAAAAAAKK...",
            ".....KKKKKK.....",
            "................",
        ]
        case .star: return [
            "................",
            ".......KK.......",
            "......KAAK......",
            "......KAAK......",
            "...KKKKAAKKKK...",
            "...KAAAAAAAAK...",
            "....KAAAAAAK....",
            ".....KAAAAK.....",
            "....KAAAAAAK....",
            "....KAAKKAAK....",
            "...KAAK..KAAK...",
            "...KKK....KKK...",
            "................",
        ]
        case .check: return [
            "................",
            "..............K.",
            ".............KAK",
            "............KAAK",
            "...........KAAK.",
            "..K.......KAAK..",
            ".KAK.....KAAK...",
            ".KAAK...KAAK....",
            "..KAAK.KAAK.....",
            "...KAAKAAK......",
            "....KAAAAK......",
            ".....KAAK.......",
            "......KK........",
            "................",
        ]
        case .gear: return [
            "................",
            "....K.KKKK.K....",
            "....KKAAAAKK....",
            "..KKKAAAAAAKKK..",
            "..KAAAAKKAAAAK..",
            "KKAAAAKWWKAAAAKK",
            "KAAAAAKWWKAAAAAK",
            "KAAAAAKWWKAAAAAK",
            "KKAAAAKWWKAAAAKK",
            "..KAAAAKKAAAAK..",
            "..KKKAAAAAAKKK..",
            "....KKAAAAKK....",
            "....K.KKKK.K....",
            "................",
        ]
        }
    }
}

/// Draws a `PixelIcon` at any size with hard edges and no interpolation.
///
/// Icons are ink by default now: in the panel language colour is a fill, so
/// an icon only takes an accent when it is standing in for a status.
struct PixelIconView: View {
    let icon: PixelIcon
    var size: CGFloat = 24
    /// Fills every `A` cell. Everything else uses the fixed legend colours.
    var color: Color = Panel.ink

    var body: some View {
        let grid = icon.grid
        let rows = grid.count
        let cols = grid.map(\.count).max() ?? 1

        Canvas { ctx, canvasSize in
            let cell = min(canvasSize.width / CGFloat(cols),
                           canvasSize.height / CGFloat(rows))
            // Centre the grid inside the requested box.
            let ox = (canvasSize.width  - cell * CGFloat(cols)) / 2
            let oy = (canvasSize.height - cell * CGFloat(rows)) / 2

            for (r, line) in grid.enumerated() {
                for (c, ch) in line.enumerated() {
                    guard let fill = PixelIconView.colour(for: ch, accent: color) else { continue }
                    // +0.5 on the size closes the hairline seams that appear
                    // between adjacent cells at fractional scales.
                    let rect = CGRect(x: ox + CGFloat(c) * cell,
                                      y: oy + CGFloat(r) * cell,
                                      width: cell + 0.5, height: cell + 0.5)
                    ctx.fill(Path(rect), with: .color(fill))
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private static func colour(for ch: Character, accent: Color) -> Color? {
        switch ch {
        case ".": return nil
        case "K": return Panel.ink
        case "W": return Color.white
        case "A": return accent
        case "G": return Panel.slate
        case "D": return Panel.dim
        case "R": return Panel.salmon
        case "Y": return Color(hex: 0xF5C542)
        case "B": return Panel.lavender
        case "S": return Color(hex: 0xE8B48A)
        default:  return nil
        }
    }
}

/// The hourglass / CD spinner used wherever the app is busy. The CD spins,
/// the hourglass flips — both in hard steps, never a smooth rotation, so it
/// reads as a 90s animation rather than a modern activity indicator.
struct PanelSpinner: View {
    var icon: PixelIcon = .hourglass
    var size: CGFloat = 72
    var color: Color = Panel.ink

    @State private var step = 0
    private let tick = Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()

    var body: some View {
        PixelIconView(icon: icon, size: size, color: color)
            .rotationEffect(.degrees(Double(step) * (icon == .cd ? 45 : 180)))
            .onReceive(tick) { _ in step = (step + 1) % 8 }
    }
}
