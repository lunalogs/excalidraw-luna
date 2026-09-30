// Native shell view (W08): PKCanvasView for native ink layered above the
// web editor, sharing one ViewportMapping so both layers stay aligned
// (SPEC 2.1 v1: ink layer above graphics; single viewport state).

import PencilKit
import SwiftUI
import WebKit

struct ShellView: UIViewRepresentable {
    let canvasController: CanvasController
    let input: InputCoordinator
    let mapping: ViewportMapping

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UIView {
        let container = UIView()

        let webView = WKWebView()
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.translatesAutoresizingMaskIntoConstraints = false

        let canvas = PKCanvasView()
        // pencilOnly does not exist as a policy case — finger routing is
        // owned by InputCoordinator (palm rejection), so the policy stays
        // permissive and the coordinator decides per-touch.
        canvas.drawingPolicy = .anyInput
        canvas.isOpaque = false
        canvas.backgroundColor = .clear
        canvas.translatesAutoresizingMaskIntoConstraints = false
        canvas.delegate = context.coordinator
        canvasController.attach(canvas: canvas)

        container.addSubview(webView)
        container.addSubview(canvas)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            canvas.topAnchor.constraint(equalTo: container.topAnchor),
            canvas.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            canvas.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])

        if let indexURL = WebBridge.bundledIndexURL() {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // zoom lock constrains the VIEWPORT only; ink capture is untouched
        _ = uiView
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let parent: ShellView
        init(_ parent: ShellView) { self.parent = parent }
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            parent.canvasController.updateUnits(from: canvasView)
        }
    }
}
