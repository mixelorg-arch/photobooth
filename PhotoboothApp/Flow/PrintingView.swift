import SwiftUI

/// "Please wait" — a spinning disc, a segmented bar, and whatever the printer
/// service last said. No cancel: by this point the job is with the printer
/// and cancelling here would lie about what the hardware is doing.
struct PrintingView: View {
    let progress: Double
    let status: String
    let copies: Int
    var accent: Color = Panel.lavender

    @Environment(\.panelSize) private var size

    var body: some View {
        PanelScreen(status: "BUSY", footer: "SPOOLER") {
            HatchScrim {
                PanelModule(title: "PRINTING", value: "BUSY", titleCell: 4) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 20) {
                            PanelSpinner(icon: .cd, size: size.pick(76, 52), color: accent)
                            VStack(alignment: .leading, spacing: 10) {
                                PixelText(text: copies == 1
                                            ? "PRINTING YOUR PHOTO"
                                            : "PRINTING \(copies) COPIES",
                                          cell: size.pick(5, 3), fits: size.pick(520, 240))
                                Text(status.isEmpty ? "Working…" : status)
                                    .font(Panel.mono(14))
                                    .foregroundStyle(Panel.dim)
                                    .lineLimit(2)
                            }
                            Spacer(minLength: 0)
                        }

                        PanelBar(progress: progress, tint: accent)

                        Text("Please do not touch the screen.")
                            .font(Panel.mono(13))
                            .foregroundStyle(Panel.dim)
                    }
                }
                .frame(maxWidth: 760)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
