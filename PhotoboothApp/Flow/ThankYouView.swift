import SwiftUI

/// The sign-off. Auto-dismisses; the OK button is for people who would
/// rather not wait for it.
struct ThankYouView: View {
    let copies: Int
    let onDone: () -> Void

    var body: some View {
        PanelScreen(status: "DONE", footer: "PHOTOBOOTH") {
            HatchScrim {
                PanelDialog(
                    title: "DONE",
                    icon: .star,
                    iconTint: Panel.sage,
                    message: copies == 1 ? "PRINT COMPLETE" : "\(copies) PRINTS ON THE WAY",
                    detail: "Collect your photo from the printer. Returning to the start…",
                    buttons: [.init(title: "OK", kind: .primary, action: onDone)],
                    width: 760)
            }
        }
    }
}

/// Any failure the guest can see, in the same language. The salmon accent is
/// the only thing that changes — an alarm state recolours the module rule
/// rather than adding a new component.
struct BoothErrorView: View {
    let message: String
    let onRetry: () -> Void
    let onCancel: () -> Void

    var body: some View {
        PanelScreen(status: "ERROR", footer: "PHOTOBOOTH") {
            HatchScrim {
                PanelDialog(
                    title: "ERROR",
                    value: "!",
                    icon: .warning,
                    iconTint: Panel.salmon,
                    accent: Panel.salmon,
                    message: "SOMETHING WENT WRONG",
                    detail: message,
                    buttons: [
                        .init(title: "START OVER", kind: .danger, action: onCancel),
                        .init(title: "TRY AGAIN", kind: .primary, action: onRetry),
                    ],
                    width: 780)
            }
        }
    }
}
