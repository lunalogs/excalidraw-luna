// W12 performance benchmark (V17). Numbers are RECORDED, not hard-gated:
// the goal is reproducible evidence, not flakiness-prone assertions.
// Run: xcodebuild test -only-testing:LunaCanvasTests/PerformanceBenchmarkTests

import Foundation
import PencilKit
import XCTest
@testable import LunaCanvas

final class PerformanceBenchmarkTests: XCTestCase {
    private func makeStrokes(_ count: Int) -> [PKStroke] {
        let ink = PKInk(.pen, color: .black)
        return (0..<count).map { index in
            var cps: [PKStrokePoint] = []
            for i in 0..<12 {
                cps.append(PKStrokePoint(
                    location: CGPoint(
                        x: CGFloat(index % 40) * 20 + CGFloat(i) * 8,
                        y: CGFloat(index / 40) * 30 + CGFloat(i % 3)
                    ),
                    timeOffset: TimeInterval(i) * 0.016,
                    size: CGSize(width: 3, height: 3),
                    opacity: 1, force: 0.5, azimuth: 0, altitude: .pi / 2))
            }
            return PKStroke(ink: ink, path: PKStrokePath(controlPoints: cps, creationDate: Date()))
        }
    }

    private func measure<T>(_ label: String, _ block: () throws -> T) rethrows -> T {
        let start = Date()
        let result = try block()
        let ms = Date().timeIntervalSince(start) * 1000
        print("PERF \(label): \(String(format: "%.2f", ms))ms")
        return result
    }

    func testBenchmark100_1000_5000() throws {
        let canvas = PKCanvasView()
        let controller = CanvasController()
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("perf-\(UUID().uuidString).lunacanvas")

        for count in [100, 1000, 5000] {
            canvas.drawing = PKDrawing(strokes: makeStrokes(count))
            measure("updateUnits[\(count)]") {
                controller.updateUnits(from: canvas)
            }
            do {
                try measure("export[\(count)]") {
                    try DocumentExporter.export(
                        units: controller.units,
                        to: url,
                        documentId: controller.documentId.uuidString,
                        revision: count,
                    )
                }
            } catch {
                XCTFail("export[\(count)] threw: \(error)")
                return
            }
            do {
                _ = try measure("open[\(count)]") {
                    try DocumentExporter.open(url: url)
                }
            } catch {
                XCTFail("open[\(count)] threw: \(error)")
                return
            }
        }
        // sanity: no data loss at the largest size
        let reopened = try DocumentExporter.open(url: url)
        XCTAssertEqual(reopened.units.count, 5000)
    }
}
