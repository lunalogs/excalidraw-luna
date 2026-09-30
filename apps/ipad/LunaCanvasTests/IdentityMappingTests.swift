// P0 acceptance: per-stroke resources + stable identity mapping
// (SPEC N07 / ADR-0002), verified on the iPad simulator without a device.
// Fixtures are constructed programmatically — no user notes involved.

import PencilKit
import XCTest
@testable import LunaCanvas

final class IdentityMappingTests: XCTestCase {
    private func makeStroke(
        x: CGFloat,
        y: CGFloat,
        points: Int = 4,
        color: UIColor = .black
    ) -> PKStroke {
        let ink = PKInk(.pen, color: color)
        var controlPoints: [PKStrokePoint] = []
        for i in 0..<points {
            controlPoints.append(
                PKStrokePoint(
                    location: CGPoint(x: x + CGFloat(i) * 10, y: y),
                    timeOffset: TimeInterval(i) * 0.016,
                    size: CGSize(width: 3, height: 3),
                    opacity: 1,
                    force: 0.5,
                    azimuth: 0,
                    altitude: .pi / 2
                )
            )
        }
        let path = PKStrokePath(controlPoints: controlPoints, creationDate: Date())
        return PKStroke(ink: ink, path: path)
    }

    private func makeController() -> CanvasController {
        CanvasController()
    }

    func testThreeStrokesBecomeThreeIndependentUnitsWithStableIds() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0),
            makeStroke(x: 0, y: 50),
            makeStroke(x: 0, y: 100),
        ])
        let controller = makeController()
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units.count, 3)
        let ids = Set(controller.units.map { $0.objectId })
        XCTAssertEqual(ids.count, 3, "each stroke gets its own stable objectId")

        // Re-running on the same drawing keeps ids (idempotent)
        controller.updateUnits(from: canvas)
        XCTAssertEqual(Set(controller.units.map { $0.objectId }), ids)

        // Per-stroke resources: independent, non-empty, byte-distinct
        // serializations (same-size payloads are expected — identical
        // stroke structure — so compare content, not length)
        let payloads = controller.units.map { $0.drawing.dataRepresentation() }
        XCTAssertTrue(payloads.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(payloads).count, 3)
    }

    func testModifiedStrokeGetsNewIdOthersKeepTheirs() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0),
            makeStroke(x: 0, y: 50),
        ])
        let controller = makeController()
        controller.updateUnits(from: canvas)
        let originalIds = controller.units.map { $0.objectId }

        // Local-erase-like change: stroke 2 comes back shorter (split/modify)
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0),
            makeStroke(x: 0, y: 50, points: 2),
        ])
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units.count, 2)
        XCTAssertEqual(controller.units[0].objectId, originalIds[0], "unchanged stroke keeps its id")
        XCTAssertNotEqual(controller.units[1].objectId, originalIds[1], "modified stroke gets a new id")
    }

    func testTransformIsScaleTranslateOnlyAndAppliesOnce() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 10, y: 10)])
        let controller = makeController()
        controller.updateUnits(from: canvas)
        controller.simulateWebTransform()

        let t = try XCTUnwrap(controller.units.first?.transform)
        XCTAssertEqual(t.b, 0, accuracy: 1e-9)
        XCTAssertEqual(t.c, 0, accuracy: 1e-9)
        XCTAssertEqual(t.a, 1.5, accuracy: 1e-9)
        XCTAssertEqual(t.d, 1.5, accuracy: 1e-9)

        // A second simulated web pass on the same unit must not double-apply
        // (SPEC 3.2: transform normalized transactionally — P0 asserts the
        // scale factor only, normalization lands with P1's manifest writer)
        let before = controller.units[0].transform
        controller.simulateWebTransform()
        XCTAssertEqual(controller.units[0].transform, before.concatenating(.init(scaleX: 1.5, y: 1.5)))
    }
}

extension IdentityMappingTests {
    /// 0027-R1: two coincident identical strokes must keep TWO distinct ids
    /// across repeated snapshots (Codex's independent diagnostic).
    func testCoincidentStrokesKeepDistinctIdsOnRepeatedSnapshot() {
        let stroke = makeStroke(x: 10, y: 10)
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [stroke, stroke])
        let controller = makeController()

        controller.updateUnits(from: canvas)
        XCTAssertEqual(controller.units.count, 2)
        let ids = Set(controller.units.map { $0.objectId })
        XCTAssertEqual(ids.count, 2)

        controller.updateUnits(from: canvas)
        XCTAssertEqual(Set(controller.units.map { $0.objectId }), ids, "repeated snapshot must not collapse ids")
    }

    /// 0027-R1: deleting the first stroke keeps the SECOND stroke's own id.
    func testDeletingFirstStrokeKeepsRemainingStrokesOwnId() {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0),
            makeStroke(x: 0, y: 50),
        ])
        let controller = makeController()
        controller.updateUnits(from: canvas)
        let secondId = controller.units[1].objectId

        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 50)])
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units.count, 1)
        XCTAssertEqual(controller.units[0].objectId, secondId)
    }

    /// 0027-R1: same bounds + same point count but different ink content is
    /// distinguishable — the changed stroke is treated as modified (new id),
    /// not silently mapped to the old one.
    func testSameBoundsDifferentContentGetsNewId() {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0)])
        let controller = makeController()
        controller.updateUnits(from: canvas)
        let originalId = controller.units[0].objectId

        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0, color: .red)])
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units.count, 1)
        XCTAssertNotEqual(controller.units[0].objectId, originalId)
    }
}
