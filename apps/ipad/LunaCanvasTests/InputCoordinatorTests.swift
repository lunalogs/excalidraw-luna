// W08 input/viewport coordination tests.

import CoreGraphics
import XCTest
@testable import LunaCanvas

final class InputCoordinatorTests: XCTestCase {
    func testWriteModeOwnership() {
        let coordinator = InputCoordinator()
        coordinator.setMode(.write)

        // pencil owns the canvas
        XCTAssertEqual(coordinator.ownership(for: .pencil), .canvas)
        // finger navigates when no pencil is active
        XCTAssertEqual(coordinator.ownership(for: .finger), .navigation)

        // while the pencil writes, a finger (palm) is ignored, not画布
        coordinator.pointerDown(1, kind: .pencil)
        XCTAssertEqual(coordinator.ownership(for: .finger), .ignored)
        coordinator.pointerUp(1)
        XCTAssertEqual(coordinator.ownership(for: .finger), .navigation)
    }

    func testArrangeModeNeverInks() {
        let coordinator = InputCoordinator()
        coordinator.setMode(.arrange)
        XCTAssertEqual(coordinator.ownership(for: .pencil), .navigation)
        XCTAssertEqual(coordinator.ownership(for: .finger), .navigation)
    }

    func testZoomLockBlocksViewportZoomOnly() {
        let coordinator = InputCoordinator()
        XCTAssertTrue(coordinator.allowViewportZoom())
        coordinator.zoomLocked = true
        XCTAssertFalse(coordinator.allowViewportZoom())
        // writing/selection still allowed — ownership unaffected by the lock
        XCTAssertEqual(coordinator.ownership(for: .pencil), .canvas)
    }

    func testDoubleTapRespectsSystemPreferenceAndDegrades() {
        let coordinator = InputCoordinator()
        // unsupported device: tap ignored, on-screen eraser remains the entry
        let unsupported = PencilPreferences(supportsDoubleTap: false, tapAction: .switchToEraser)
        XCTAssertEqual(coordinator.resolveDoubleTap(preferences: unsupported, currentToolIsEraser: false, lastTool: nil), .ignored)
        // supported + preference = switch tool
        let supported = PencilPreferences(supportsDoubleTap: true, tapAction: .switchToLastTool)
        XCTAssertEqual(coordinator.resolveDoubleTap(preferences: supported, currentToolIsEraser: true, lastTool: "pen"), .navigation)
        // preference = ignore
        let ignoring = PencilPreferences(supportsDoubleTap: true, tapAction: .ignore)
        XCTAssertEqual(coordinator.resolveDoubleTap(preferences: ignoring, currentToolIsEraser: false, lastTool: nil), .ignored)
    }

    func testViewportMappingRoundTripsAtAllZooms() {
        for zoom in [CGFloat(0.25), 1, 4] {
            let mapping = ViewportMapping(
                zoom: zoom,
                scrollX: 120,
                scrollY: -40,
                originX: 16, // safe area inset
                originY: 74,
            )
            let scene = CGPoint(x: 300, y: -55)
            let view = mapping.viewPoint(fromScene: scene)
            let back = mapping.scenePoint(fromView: view)
            XCTAssertEqual(back.x, scene.x, accuracy: 1e-6, "round trip at \(zoom)x")
            XCTAssertEqual(back.y, scene.y, accuracy: 1e-6)
        }
    }

    func testWebScrollConventionMatchesNativeState() {
        let mapping = ViewportMapping(zoom: 2, scrollX: 50, scrollY: 20)
        // web: css px = scene * zoom + scrollPx
        XCTAssertEqual(mapping.webScrollPx.x, 100)
        XCTAssertEqual(mapping.webScrollPx.y, 40)
    }
}
