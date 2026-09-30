// LunaCanvas — phase-3 prototype (P0: native ink feasibility)
//
// STATUS: written against public PencilKit API, NOT compile-verified yet —
// this machine has no Xcode (Command Line Tools only). See
// docs/handwriting/native/adr/0001-sdk-and-deployment.md.

import SwiftUI

@main
struct LunaCanvasApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @StateObject private var canvasController = CanvasController()

    var body: some View {
        NavigationStack {
            CanvasView(controller: canvasController)
                .navigationTitle("LunaCanvas (P0)")
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        Button("Export 3 strokes") {
                            try? canvasController.exportFirstThreeStrokes()
                        }
                        Button("Simulate web transform") {
                            canvasController.simulateWebTransform()
                            if let canvas = canvasController.liveCanvasForUI {
                                canvasController.applyWebTransformsToCanvas(canvas)
                            }
                        }
                    }
                }
        }
    }
}
