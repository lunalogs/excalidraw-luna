// W09: native editing transaction + unified history closure tests.

import PencilKit
import XCTest
@testable import LunaCanvas

final class NativeInkHistoryTests: XCTestCase {
    private func makeStroke(x: CGFloat, points: Int = 4) -> PKStroke {
        let ink = PKInk(.pen, color: .black)
        var cps: [PKStrokePoint] = []
        for i in 0..<points {
            cps.append(PKStrokePoint(
                location: CGPoint(x: x + CGFloat(i) * 10, y: 0),
                timeOffset: TimeInterval(i) * 0.016,
                size: CGSize(width: 3, height: 3),
                opacity: 1, force: 0.5, azimuth: 0, altitude: .pi / 2))
        }
        return PKStroke(ink: ink, path: PKStrokePath(controlPoints: cps, creationDate: Date()))
    }

    func testWriteEraseUndoRedoAsSingleCommands() {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0),
            makeStroke(x: 100),
            makeStroke(x: 200),
        ])
        let controller = CanvasController()

        let history = NativeInkHistory()
        history.beginTransaction(label: "write", units: []) // pre-write
        controller.updateUnits(from: canvas)
        history.commit(label: "write", units: controller.units)
        XCTAssertEqual(history.undoStack.count, 1)
        XCTAssertEqual(history.emittedPayloads.last?.count, 3)

        // erase the middle stroke (transaction)
        let beforeErase = controller.units
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0),
            makeStroke(x: 200),
        ])
        controller.updateUnits(from: canvas)
        history.beginTransaction(label: "erase", units: beforeErase)
        history.commit(label: "erase", units: controller.units)
        XCTAssertEqual(history.emittedPayloads.count, 2)

        // one undo restores all three strokes (whole transaction)
        var units = controller.units
        XCTAssertTrue(history.undo(units: &units))
        XCTAssertEqual(units.count, 3)
        // second undo restores the pre-write state
        XCTAssertTrue(history.undo(units: &units))
        XCTAssertEqual(units.count, 0)
        XCTAssertFalse(history.undo(units: &units), "undo stack exhausted")
    }

    func testCancelRollsBackWithoutHistoryOrEmissions() {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0)])
        let controller = CanvasController()
        controller.updateUnits(from: canvas)

        let history = NativeInkHistory()
        history.beginTransaction(label: "in-flight", units: controller.units)
        // simulate an in-progress change then cancel
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0),
            makeStroke(x: 100),
        ])
        controller.updateUnits(from: canvas)
        // (cancel restores the one-stroke snapshot via inout units)
        var units = controller.units
        history.cancel(units: &units)

        XCTAssertEqual(units.count, 1, "cancel restores the snapshot")
        XCTAssertEqual(history.undoStack.count, 0)
        XCTAssertEqual(history.emittedPayloads.count, 0)
        XCTAssertFalse(history.hasOpenTransaction)
    }

    func testModifiedStrokeAppearsAsNewVersionInPayload() {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0)])
        let controller = CanvasController()
        controller.updateUnits(from: canvas)
        let originalId = controller.units[0].objectId

        // local-erase-like modification
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, points: 2)])
        controller.updateUnits(from: canvas)

        let beforeModify = controller.units
        let history = NativeInkHistory()
        history.beginTransaction(label: "modify", units: beforeModify)
        history.commit(label: "modify", units: controller.units)

        let payload = history.emittedPayloads.last!
        XCTAssertEqual(payload.count, 1)
        XCTAssertNotEqual(payload[0].objectId, originalId.uuidString, "modified stroke is a new version")
        XCTAssertFalse(payload[0].contentHash.isEmpty)
    }

    func testRedoReappliesAndStaleUndoFails() {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0)])
        let controller = CanvasController()
        controller.updateUnits(from: canvas)

        let history = NativeInkHistory()
        history.beginTransaction(label: "write", units: []) // pre-write
        history.commit(units: controller.units)

        var units = controller.units
        history.undo(units: &units)
        XCTAssertEqual(units.count, 0)
        XCTAssertTrue(history.redo(units: &units))
        XCTAssertEqual(units.count, 1)
        XCTAssertFalse(history.redo(units: &units))
    }
}
