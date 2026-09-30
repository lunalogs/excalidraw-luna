// Fixture writer (env-gated): regenerates the cross-end fixture with the
// CURRENT writer so it carries previews + hit geometry (the W01-era
// fixture predates them). Runs only when LUNACANVAS_FIXTURE_OUT is set:
//
//   LUNACANVAS_FIXTURE_OUT=<abs path> xcodebuild test \
//     -only-testing:LunaCanvasTests/FixtureWriterTests

import PencilKit
import XCTest
@testable import LunaCanvas

final class FixtureWriterTests: XCTestCase {
    private func makeStroke() -> PKStroke {
        var controlPoints: [PKStrokePoint] = []
        for i in 0..<11 {
            controlPoints.append(
                PKStrokePoint(
                    location: CGPoint(x: 10 + CGFloat(i) * 10, y: 50),
                    timeOffset: TimeInterval(i) * 0.016,
                    size: CGSize(width: 3, height: 3),
                    opacity: 1,
                    force: 0.5,
                    azimuth: 0,
                    altitude: .pi / 2
                )
            )
        }
        return PKStroke(
            ink: PKInk(.pen, color: .black),
            path: PKStrokePath(controlPoints: controlPoints, creationDate: Date())
        )
    }

    func testWriteFixtureWhenEnvSet() throws {
        // env vars do not reach the simulator test runner through
        // xcodebuild; use a sentinel file with the target path instead.
        let sentinel = URL(fileURLWithPath: "/tmp/lunacanvas-fixture-out")
        guard FileManager.default.fileExists(atPath: sentinel.path),
              let out = try? String(contentsOf: sentinel, encoding: .utf8)
              .trimmingCharacters(in: .whitespacesAndNewlines),
              !out.isEmpty
        else {
            return // no trigger: no-op pass
        }
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke()])
        let controller = CanvasController()
        controller.updateUnits(from: canvas)
        controller.simulateWebTransform() // 1.5x web-side, as the original

        let url = URL(fileURLWithPath: out)
        _ = try controller.exportFirstThreeStrokes(to: url)

        // sanity: the regenerated fixture validates and carries the
        // derived resources the web hit-tests against
        let reopened = try DocumentExporter.open(url: url)
        XCTAssertEqual(reopened.units.count, 1)
        XCTAssertNotNil(reopened.units[0].previewData)
        XCTAssertNotNil(reopened.units[0].hitData)
        XCTAssertEqual(reopened.units[0].transform.a, 1.5, accuracy: 1e-9)
    }
}
