// Typed document bridge core (W07, N18). Pure Swift — no UI/WebKit imports —
// so the session/dedup/revision state machine is unit-testable in the
// simulator. WebBridge (W08) wraps WKScriptMessageHandler around this core.

import Foundation

public enum BridgeMessageType: String, Codable {
    // capability handshake
    case hello
    case welcome
    // document state
    case documentSnapshot
    case inkEdits
    case graphicsState
    case saveRequest
    case saveAck
    case saveReject
    // liveness
    case ping
    case pong
}

public struct BridgeMessage: Codable, Equatable {
    public var protocolVersion: Int
    public var documentId: String
    public var sessionId: String
    public var requestId: String
    public var baseRevision: Int
    public var type: BridgeMessageType
    /// typed payload JSON, interpreted per message type
    public var payload: Data

    public init(
        protocolVersion: Int = BridgeSession.protocolVersion,
        documentId: String,
        sessionId: String,
        requestId: String,
        baseRevision: Int,
        type: BridgeMessageType,
        payload: Data = Data(),
    ) {
        self.protocolVersion = protocolVersion
        self.documentId = documentId
        self.sessionId = sessionId
        self.requestId = requestId
        self.baseRevision = baseRevision
        self.type = type
        self.payload = payload
    }
}

public enum BridgeRejectReason: String, Codable, Equatable {
    case unsupportedProtocolVersion
    case unknownSession
    case staleRevision
    case duplicateRequest
    case malformedPayload
    case untrustedOrigin
}

public struct BridgeReject: Codable, Equatable {
    public let requestId: String
    public let reason: BridgeRejectReason
}

public enum BridgeInbound {
    case accepted(BridgeMessage)
    case rejected(BridgeReject)
}

/// Session-scoped bridge guard (N18/V11): exactly-once request handling,
/// revision monotonicity, session binding, protocol version negotiation.
public final class BridgeSession {
    public static let protocolVersion = 1

    public let documentId: String
    public let sessionId: String
    private var currentRevision: Int
    private var handledRequestIds = Set<String>()
    private var counter = 0
    /// origins allowed to talk to the bridge (bundled pages only, W08
    /// fills this with the app bundle's file URLs)
    public private(set) var trustedOrigins = Set<String>()

    public init(documentId: String, sessionId: String, baseRevision: Int = 0) {
        self.documentId = documentId
        self.sessionId = sessionId
        self.currentRevision = baseRevision
    }

    public func trust(origin: String) {
        trustedOrigins.insert(origin)
    }

    public var revision: Int { currentRevision }

    public func makeMessage(
        type: BridgeMessageType,
        payload: Data = Data(),
    ) -> BridgeMessage {
        counter += 1
        return BridgeMessage(
            documentId: documentId,
            sessionId: sessionId,
            requestId: "native-\(counter)",
            baseRevision: currentRevision,
            type: type,
            payload: payload,
        )
    }

    /// Validates an inbound message. Rejections carry a reason; the caller
    /// must NOT apply rejected messages (V11: duplicates and stale
    /// revisions never mutate the document).
    public func receive(
        _ message: BridgeMessage,
        origin: String? = nil,
    ) -> BridgeInbound {
        if let origin, !trustedOrigins.contains(origin) {
            return .rejected(.init(requestId: message.requestId, reason: .untrustedOrigin))
        }
        guard message.protocolVersion == Self.protocolVersion else {
            return .rejected(.init(requestId: message.requestId, reason: .unsupportedProtocolVersion))
        }
        guard message.documentId == documentId else {
            return .rejected(.init(requestId: message.requestId, reason: .unknownSession))
        }
        guard message.sessionId == sessionId else {
            return .rejected(.init(requestId: message.requestId, reason: .unknownSession))
        }
        guard !handledRequestIds.contains(message.requestId) else {
            return .rejected(.init(requestId: message.requestId, reason: .duplicateRequest))
        }
        guard message.baseRevision <= currentRevision else {
            // from the future: we must resync rather than guess (N18)
            return .rejected(.init(requestId: message.requestId, reason: .staleRevision))
        }
        handledRequestIds.insert(message.requestId)
        if message.baseRevision == currentRevision {
            currentRevision += 1
        }
        return .accepted(message)
    }
}
