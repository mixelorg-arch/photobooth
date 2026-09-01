import SwiftUI

/// The capture flash.
///
/// The old build split the frame into red and cyan plates; this one does not.
/// The panel language is ink on paper, so the shutter reads as a hard white
/// blast with a stepped falloff — a colour fringe would be the only chromatic
/// aberration in an otherwise two-colour app.
@MainActor
final class ShutterFlash: ObservableObject {
    @Published private(set) var intensity: Double = 0

    func fire() {
        intensity = 1
        // Stepped, not eased: this face has no anti-aliasing anywhere else.
        withAnimation(.linear(duration: 0.26)) { intensity = 0 }
    }
}

struct ShutterFlashOverlay: View {
    @ObservedObject var flash: ShutterFlash

    var body: some View {
        Panel.paper
            .opacity(flash.intensity)
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }
}

/// Hard cut between screens. A cross-fade would read as software; this reads
/// as a panel switching state.
extension AnyTransition {
    static var hardCut: AnyTransition {
        .asymmetric(insertion: .opacity.animation(.linear(duration: 0.05)),
                    removal:   .opacity.animation(.linear(duration: 0.05)))
    }
}
