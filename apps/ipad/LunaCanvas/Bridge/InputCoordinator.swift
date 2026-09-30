// Native input/viewport coordination (W08, N02/N18).
// Pure model: mode state machine, input ownership, double-tap preference
// matrix, and the single scene<->view mapping. The shell (W08 UI) wires
// gestures to this coordinator; the web side uses the same mapping math
// (ADR-0003) so both layers align without a feedback loop.

import CoreGraphics
import Foundation

/// Write: Pencil inks, one finger pans, two fingers zoom (unless locked).
/// Arrange: gestures manipulate selection via the bridge; canvas is display-only.
public enum CanvasMode: String, Codable {
    case write
    case arrange
}

public enum InputKind: String, Codable {
    case pencil
    case finger
}

public enum PencilDoubleTapAction: String, Codable {
    case switchToEraser
    case switchToLastTool
    case showColorPicker
    case ignore
}

/// System UIPencilInteraction.preferredTapAction equivalent, resolved by
/// the shell and passed in (public API, device/system dependent — W08 ADR).
public struct PencilPreferences: Codable, Equatable {
    public var supportsDoubleTap: Bool
    public var tapAction: PencilDoubleTapAction
    public init(supportsDoubleTap: Bool, tapAction: PencilDoubleTapAction) {
        self.supportsDoubleTap = supportsDoubleTap
        self.tapAction = tapAction
    }
}

public enum InputDecision: String, Codable {
    /// the canvas (PKCanvasView) owns this touch
    case canvas
    /// the navigation/selection layer owns it
    case navigation
    /// ignored entirely (palm while Pencil is active, etc.)
    case ignored
}

public final class InputCoordinator {
    public private(set) var mode: CanvasMode = .write
    public private(set) var pencilIsActive = false
    public var zoomLocked = false
    public private(set) var activePointerIds = Set<Int>()

    public init() {}

    public func setMode(_ mode: CanvasMode) {
        self.mode = mode
    }

    public func pointerDown(_ id: Int, kind: InputKind) {
        if kind == .pencil {
            pencilIsActive = true
        }
        activePointerIds.insert(id)
    }

    public func pointerUp(_ id: Int) {
        activePointerIds.remove(id)
        if activePointerIds.isEmpty {
            pencilIsActive = false
        }
    }

    /// One touch = one consumer (SPEC 2.1). In write mode the Pencil owns
    /// the canvas; a finger navigates unless a Pencil is actively writing
    /// (palm rejection). In arrange mode the canvas never inks.
    public func ownership(for kind: InputKind) -> InputDecision {
        switch mode {
        case .arrange:
            return .navigation
        case .write:
            switch kind {
            case .pencil:
                return .canvas
            case .finger:
                return pencilIsActive ? .ignored : .navigation
            }
        }
    }

    /// Viewport zoom is blocked when locked (buttons, pinch, gesture) —
    /// panning, writing and SELECTION-CONTENT scaling stay allowed
    /// (user requirement + 0027 constraint).
    public func allowViewportZoom() -> Bool {
        !zoomLocked
    }

    /// Pencil double-tap resolution (N02/V03): unsupported devices degrade
    /// to the on-screen eraser entry (always available); the system
    /// preference is respected, never hardcoded.
    public func resolveDoubleTap(
        preferences: PencilPreferences,
        currentToolIsEraser: Bool,
        lastTool: String?,
    ) -> InputDecision {
        guard preferences.supportsDoubleTap else {
            // no hardware support: the tool picker already offers the
            // eraser on screen; the tap itself does nothing
            return .ignored
        }
        switch preferences.tapAction {
        case .switchToEraser, .switchToLastTool, .showColorPicker:
            return .navigation // shell performs the tool switch
        case .ignore:
            return .ignored
        }
    }
}

/// Single source of truth for scene<->UIKit point mapping (ADR-0003).
/// DPR only affects raster sampling, never document coordinates.
public struct ViewportMapping: Codable, Equatable {
    public var zoom: CGFloat
    public var scrollX: CGFloat // scene units translated
    public var scrollY: CGFloat
    /// editor container origin in the native view (safe area / offsets)
    public var originX: CGFloat
    public var originY: CGFloat

    public init(
        zoom: CGFloat = 1,
        scrollX: CGFloat = 0,
        scrollY: CGFloat = 0,
        originX: CGFloat = 0,
        originY: CGFloat = 0,
    ) {
        self.zoom = zoom
        self.scrollX = scrollX
        self.scrollY = scrollY
        self.originX = originX
        self.originY = originY
    }

    /// scene point -> UIKit point in the native view (1 UIKit pt = 1 CSS px)
    public func viewPoint(fromScene p: CGPoint) -> CGPoint {
        CGPoint(
            x: originX + p.x * zoom + scrollX * zoom,
            y: originY + p.y * zoom + scrollY * zoom,
        )
    }

    public func scenePoint(fromView p: CGPoint) -> CGPoint {
        CGPoint(
            x: (p.x - originX) / zoom - scrollX,
            y: (p.y - originY) / zoom - scrollY,
        )
    }

    /// The web layer's viewport mapping is scroll-in-pixels: CSS px =
    /// scene * zoom + scrollPx. Converts our state to the web convention
    /// so both layers consume identical numbers (W08 single viewport).
    public var webScrollPx: CGPoint {
        CGPoint(x: scrollX * zoom, y: scrollY * zoom)
    }
}
