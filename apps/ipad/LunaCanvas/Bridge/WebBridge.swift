// WKWebView shell (W08): loads the BUNDLED web build offline, exposes the
// typed bridge to the page, and restricts message handling to trusted
// origins. Thin on purpose — all semantics live in BridgeCore /
// InputCoordinator and are unit-tested; this file only wires UIKit events.

import Foundation
import WebKit

public final class WebBridge: NSObject, WKScriptMessageHandler {
    public let session: BridgeSession
    private let onMessage: (BridgeMessage) -> Void

    public init(
        session: BridgeSession,
        onMessage: @escaping (BridgeMessage) -> Void,
    ) {
        self.session = session
        self.onMessage = onMessage
    }

    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
    ) {
        guard
            message.name == "lunacanvas",
            let body = message.body as? String,
            let data = body.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(BridgeMessage.self, from: data)
        else {
            return
        }
        let origin = (message.frameInfo.request.url?.absoluteString)
            .map { $0.hasPrefix("file://") ? "file://bundle" : $0 }
        switch session.receive(decoded, origin: origin) {
        case .accepted(let message):
            onMessage(message)
        case .rejected(let reject):
            // rejected messages are never applied (V11); the page can read
            // the reject via the console push channel (W09)
            #if DEBUG
            print("bridge rejected:", reject.reason.rawValue, reject.requestId)
            #endif
        }
    }

    /// Injects the postMessage hook into the bundled page.
    public static func makeUserScript() -> WKUserScript {
        WKUserScript(
            source: """
            window.lunacanvas = {
              postMessage: (msg) => {
                window.webkit.messageHandlers.lunacanvas.postMessage(JSON.stringify(msg));
              }
            };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
        )
    }

    /// The only URL the shell ever loads: the bundled index.html.
    public static func bundledIndexURL() -> URL? {
        Bundle.main.resourceURL?
            .appendingPathComponent("Web")
            .appendingPathComponent("index.html")
    }
}
