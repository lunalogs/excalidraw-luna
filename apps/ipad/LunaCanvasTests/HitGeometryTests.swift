// 0046-R4: hit geometry must represent VISIBLE ink. Codex's independent
// native diagnostics (0044) found a 4-point short stroke exported exactly
// 1 hit sample (unhittable on the web) and a 100pt horizontal 3pt line
// exported width=34 (its renderBounds LENGTH) — both are formal tests now.

import CoreGraphics
import PencilKit
import XCTest
@testable import LunaCanvas

final class HitGeometryTests: XCTestCase {
    private func makeStroke(
        x: CGFloat,
        y: CGFloat,
        points: Int = 4,
        spacing: CGFloat = 10,
        size: CGFloat = 3
    ) -> PKStroke {
        var controlPoints: [PKStrokePoint] = []
        for i in 0..<points {
            controlPoints.append(
                PKStrokePoint(
                    location: CGPoint(x: x + CGFloat(i) * spacing, y: y),
                    timeOffset: TimeInterval(i) * 0.016,
                    size: CGSize(width: size, height: size),
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

    private struct HitPayload: Decodable {
        let bounds: [CGFloat]
        let width: CGFloat
        let path: [[CGFloat]]
        let hasMask: Bool
        let maskBounds: [CGFloat]?
    }

    private func decodeHit(_ drawing: PKDrawing) throws -> HitPayload {
        let data = try XCTUnwrap(DocumentExporter.makeHitData(for: drawing))
        return try JSONDecoder().decode(HitPayload.self, from: data)
    }

    /// 0044 native probe: a 4-point short stroke must export enough
    /// samples (and both endpoints) for the web to hit-test it.
    func testShortStrokeExportsEndpointsAndMultipleSamples() throws {
        let hit = try decodeHit(PKDrawing(strokes: [makeStroke(x: 5, y: 7)]))
        XCTAssertGreaterThanOrEqual(hit.path.count, 3, "arc-length sampling keeps ~4pt steps")
        XCTAssertEqual(hit.path[0][0], 5, accuracy: 0.01)
        XCTAssertEqual(hit.path[0][1], 7, accuracy: 0.01)
        XCTAssertEqual(hit.path[hit.path.count - 1][0], 35, accuracy: 1.5, "endpoint kept")
        XCTAssertEqual(hit.path[hit.path.count - 1][1], 7, accuracy: 0.5)
    }

    /// 0044 native probe: width must be the stroke THICKNESS, never the
    /// renderBounds width (== line length for horizontal lines).
    func testWidthIsStrokeThicknessNotLength() throws {
        let hit = try decodeHit(PKDrawing(strokes: [makeStroke(x: 0, y: 0, points: 11)]))
        XCTAssertGreaterThanOrEqual(hit.width, 2.5)
        XCTAssertLessThanOrEqual(hit.width, 6, "3pt line reports ~3, not 104 (length)")
    }

    /// Mask geometry is consumed by the WEB hit tests (hole semantics,
    /// 0046 TS suite); constructing a masked stroke programmatically is
    /// not publicly available in the iOS 27 SDK (masks originate from the
    /// canvas eraser), so native export coverage stops at hasMask=false
    /// plus the TS-side fixture tests.
    func testPlainStrokeHasNoMask() throws {
        let hit = try decodeHit(PKDrawing(strokes: [makeStroke(x: 0, y: 0)]))
        XCTAssertFalse(hit.hasMask)
        XCTAssertNil(hit.maskBounds)
    }

    /// Zero-length strokes still produce a degenerate segment.
    func testZeroLengthStrokeStillHittable() throws {
        var controlPoints: [PKStrokePoint] = []
        for i in 0..<2 {
            controlPoints.append(
                PKStrokePoint(
                    location: CGPoint(x: 20, y: 20),
                    timeOffset: TimeInterval(i) * 0.016,
                    size: CGSize(width: 4, height: 4),
                    opacity: 1,
                    force: 0.5,
                    azimuth: 0,
                    altitude: .pi / 2
                )
            )
        }
        let stroke = PKStroke(
            ink: PKInk(.pen, color: .black),
            path: PKStrokePath(controlPoints: controlPoints, creationDate: Date())
        )
        let hit = try decodeHit(PKDrawing(strokes: [stroke]))
        XCTAssertEqual(hit.path.count, 2)
        XCTAssertEqual(hit.path[0], hit.path[1])
    }
}
