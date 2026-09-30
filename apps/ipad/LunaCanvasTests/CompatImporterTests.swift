// W11 compatibility tests (N21).

import Foundation
import XCTest
@testable import LunaCanvas

final class CompatImporterTests: XCTestCase {
    private func legacySceneURL() throws -> URL {
        let scene: [String: Any] = [
            "type": "excalidraw",
            "version": 2,
            "source": "https://excalidraw.com",
            "elements": [["id": "rect-1", "type": "rectangle"]],
            "appState": [:],
            "files": [:],
        ]
        let data = try JSONSerialization.data(withJSONObject: scene)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("legacy-\(UUID().uuidString).excalidraw")
        try data.write(to: url)
        return url
    }

    func testSniffsLegacyByContentNotExtension() throws {
        let url = try legacySceneURL()
        guard case .legacyExcalidraw(let sceneData) = CompatImporter.sniff(url) else {
            return XCTFail("legacy scene must be detected")
        }
        let json = try JSONSerialization.jsonObject(with: sceneData) as? [String: Any]
        XCTAssertEqual((json?["elements"] as? [[String: Any]])?.first?["id"] as? String, "rect-1")
    }

    func testLegacySceneImportsAsZeroInkDocument() throws {
        let url = try legacySceneURL()
        guard case .legacyExcalidraw(let sceneData) = CompatImporter.sniff(url) else {
            throw XCTSkip("sniff failed")
        }
        let document = try CompatImporter.importedDocument(fromLegacyScene: sceneData)
        XCTAssertEqual(document.units.count, 0)
        XCTAssertEqual(document.revision, 0)
        // graphics bytes pass through untouched (N21)
        XCTAssertEqual(document.sceneData, sceneData)
    }

    func testGarbageFileIsNotImported() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("garbage-\(UUID().uuidString).excalidraw")
        try Data("not json and not a zip".utf8).write(to: url)
        XCTAssertNil(CompatImporter.sniff(url))
    }

    func testSceneOnlyDowngradeReportsInkLoss() throws {
        let url = try legacySceneURL()
        guard case .legacyExcalidraw(let sceneData) = CompatImporter.sniff(url) else {
            throw XCTSkip("sniff failed")
        }
        let out = FileManager.default.temporaryDirectory
            .appendingPathComponent("downgrade-\(UUID().uuidString).excalidraw")
        let report = try CompatExporter.exportSceneOnly(
            sceneData: sceneData,
            to: out,
            inkObjectCount: 3,
        )
        XCTAssertEqual(report, .sceneOnly(inkObjectCount: 3))
        XCTAssertEqual(try Data(contentsOf: out), sceneData, "scene bytes preserved")
    }
}
