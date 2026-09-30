// 0045-R2/R3: saving a MIXED document must preserve the real scene, image
// resources, foreign entries and unknown extensions; identity must be
// proven by exact content digests, with explicit replacement edges for
// modify/split. All scenarios run through the real save/open entry points
// (DocumentFileStore / LunaArchive), not stubbed writers.

import CoreGraphics
import PencilKit
import XCTest
import ZIPFoundation
@testable import LunaCanvas

final class MixedDocumentTests: XCTestCase {
    private func makeStroke(
        x: CGFloat,
        y: CGFloat,
        points: Int = 4,
        force: CGFloat = 0.5
    ) -> PKStroke {
        var controlPoints: [PKStrokePoint] = []
        for i in 0..<points {
            controlPoints.append(
                PKStrokePoint(
                    location: CGPoint(x: x + CGFloat(i) * 10, y: y),
                    timeOffset: TimeInterval(i) * 0.016,
                    size: CGSize(width: 3, height: 3),
                    opacity: 1,
                    force: force,
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

    /// A REAL non-empty scene: rectangle + text + an image file reference.
    private func makeMixedSceneData() throws -> Data {
        let scene: [String: Any] = [
            "type": "excalidraw",
            "version": 2,
            "source": "https://excalidraw.com",
            "elements": [
                [
                    "id": "rect-1", "type": "rectangle", "x": 10, "y": 20,
                    "width": 100, "height": 50, "angle": 0,
                    "strokeColor": "#000000", "backgroundColor": "transparent",
                    "fillStyle": "hachure", "strokeWidth": 1, "strokeStyle": "solid",
                    "roughness": 1, "opacity": 100,
                    "groupIds": [], "frameId": nil, "roundness": nil,
                    "seed": 1, "version": 1, "isDeleted": false,
                    "boundElements": nil, "updated": 1, "link": nil,
                    "locked": false,
                ],
                [
                    "id": "text-1", "type": "text", "x": 15, "y": 30,
                    "width": 80, "height": 25, "angle": 0,
                    "strokeColor": "#000000", "backgroundColor": "transparent",
                    "fillStyle": "hachure", "strokeWidth": 1, "strokeStyle": "solid",
                    "roughness": 1, "opacity": 100,
                    "groupIds": [], "frameId": nil, "roundness": nil,
                    "seed": 2, "version": 1, "isDeleted": false,
                    "boundElements": nil, "updated": 1, "link": nil,
                    "locked": false, "text": "hello", "fontSize": 20,
                    "fontFamily": 1, "textAlign": "left", "verticalAlign": "top",
                    "containerId": nil, "originalText": "hello", "lineHeight": 1.25,
                    "baseline": 18,
                ],
            ],
            "appState": ["viewBackgroundColor": "#ffffff"],
            "files": [:],
        ]
        return try JSONSerialization.data(withJSONObject: scene)
    }

    private func makeController(canvas: PKCanvasView) -> CanvasController {
        let controller = CanvasController()
        controller.updateUnits(from: canvas)
        return controller
    }

    private func tempURL(_ tag: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("mixed-\(tag)-\(UUID().uuidString).lunacanvas")
    }

    /// 0045-R2: a mixed document saved through the real entry keeps its
    /// rectangle/text scene byte-for-byte, and a web-side save-and-reopen
    /// cycle does not degrade it to an empty scene.
    func testMixedSceneSurvivesSaveReopenResave() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0)])
        let controller = makeController(canvas: canvas)
        let scene = try makeMixedSceneData()

        let url = tempURL("scene")
        try DocumentFileStore.saveDocument(
            units: controller.units,
            to: url,
            documentId: controller.documentId.uuidString,
            revision: 0,
            scene: scene,
        )
        let opened = try DocumentFileStore.openDocument(at: url)
        XCTAssertEqual(
            opened.sceneData, scene,
            "graphics scene must survive the native save byte-for-byte",
        )

        // second save, as the web round-trip would do: pass the opened
        // scene (and any preserved entries) back through the real entry
        let url2 = tempURL("scene2")
        try DocumentFileStore.saveDocument(
            units: controller.units,
            to: url2,
            documentId: opened.documentId,
            revision: opened.revision + 1,
            scene: opened.sceneData,
            preservedEntries: opened.preservedEntries,
        )
        let reopened = try DocumentFileStore.openDocument(at: url2)
        XCTAssertEqual(
            reopened.sceneData, scene,
            "scene must still be intact after the second save",
        )
    }

    /// 0045-R2: foreign entries (scene image files, unknown resources) are
    /// carried through open -> save, byte-identical.
    func testPreservedEntriesSurviveFullCycle() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0)])
        let controller = makeController(canvas: canvas)
        let scene = try makeMixedSceneData()
        let imageBytes = Data([0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4, 5])
        let foreignBytes = Data("foreign-resource".utf8)

        let url = tempURL("preserved")
        try DocumentFileStore.saveDocument(
            units: controller.units,
            to: url,
            documentId: controller.documentId.uuidString,
            revision: 0,
            scene: scene,
            preservedEntries: [
                ("scene/files/img-1.png", imageBytes),
                ("custom/vendor/blob.bin", foreignBytes),
            ],
        )
        let opened = try DocumentFileStore.openDocument(at: url)
        XCTAssertEqual(opened.preservedEntries.count, 2)
        XCTAssertEqual(
            Dictionary(uniqueKeysWithValues: opened.preservedEntries)["scene/files/img-1.png"],
            imageBytes,
        )
        XCTAssertEqual(
            Dictionary(uniqueKeysWithValues: opened.preservedEntries)["custom/vendor/blob.bin"],
            foreignBytes,
        )

        // re-save: the regenerated document must still carry them
        let url2 = tempURL("preserved2")
        try DocumentFileStore.saveDocument(
            units: controller.units,
            to: url2,
            documentId: opened.documentId,
            revision: 1,
            scene: opened.sceneData,
            preservedEntries: opened.preservedEntries,
        )
        let reopened = try DocumentFileStore.openDocument(at: url2)
        let byPath = Dictionary(uniqueKeysWithValues: reopened.preservedEntries)
        XCTAssertEqual(byPath["scene/files/img-1.png"], imageBytes)
        XCTAssertEqual(byPath["custom/vendor/blob.bin"], foreignBytes)
    }

    /// 0045-R2: unknown per-ink-object extensions survive a save/reopen/
    /// re-save cycle (a newer producer's fields are never dropped).
    func testInkObjectExtrasSurviveResave() throws {
        let unit = LunaArchiveUnit(
            objectId: "stroke-x",
            data: Data("drawing-bytes".utf8),
            transform: .identity,
            inkObjectExtras: ["experimentalWeight": 3, "vendorFlag": true],
        )
        let url = tempURL("extras")
        try LunaArchive.export(
            units: [unit],
            to: url,
            documentId: "doc-1",
            revision: 0,
        )
        let opened = try LunaArchive.open(url: url)
        XCTAssertEqual(opened.units.count, 1)
        XCTAssertEqual(opened.units[0].inkObjectExtras["experimentalWeight"] as? Int, 3)
        XCTAssertEqual(opened.units[0].inkObjectExtras["vendorFlag"] as? Bool, true)

        let reexported = LunaArchiveUnit(
            objectId: opened.units[0].objectId,
            data: opened.units[0].data,
            transform: opened.units[0].transform,
            inkObjectExtras: opened.units[0].inkObjectExtras,
        )
        let url2 = tempURL("extras2")
        try LunaArchive.export(
            units: [reexported],
            to: url2,
            documentId: "doc-1",
            revision: 1,
        )
        let reopened = try LunaArchive.open(url: url2)
        XCTAssertEqual(reopened.units[0].inkObjectExtras["experimentalWeight"] as? Int, 3)
        XCTAssertEqual(reopened.units[0].inkObjectExtras["vendorFlag"] as? Bool, true)
    }

    /// 0045-R2: a legal document may name resources independently of
    /// objectId; re-exporting unmodified objects must keep those refs.
    func testNonObjectIdAssetRefsSurviveReexport() throws {
        let unit = LunaArchiveUnit(
            objectId: "asset-v2-abc",
            data: Data("drawing-bytes".utf8),
            transform: .identity,
        )
        let url = tempURL("refs")
        try LunaArchive.export(
            units: [unit],
            to: url,
            documentId: "doc-1",
            revision: 0,
        )
        let opened = try LunaArchive.open(url: url)

        let reexported = LunaArchiveUnit(
            objectId: opened.units[0].objectId,
            data: opened.units[0].data,
            transform: opened.units[0].transform,
        )
        let url2 = tempURL("refs2")
        try LunaArchive.export(
            units: [reexported],
            to: url2,
            documentId: "doc-1",
            revision: 1,
        )
        // .lunacanvas is a ZIP — read the manifest entry, not the raw file
        let archive = try XCTUnwrap(Archive(url: url2, accessMode: .read))
        let manifestEntry = try XCTUnwrap(archive["manifest.json"])
        var manifestData = Data()
        _ = try archive.extract(manifestEntry) { chunk in
            manifestData.append(chunk)
        }
        let manifest = try JSONSerialization.jsonObject(with: manifestData)
            as! [String: Any]
        let inkObjects = manifest["inkObjects"] as! [[String: Any]]
        XCTAssertEqual(inkObjects[0]["nativeAssetRef"] as? String, "ink/asset-v2-abc.drawing")
    }

    /// 0045-R3 (Codex 0044 native probe): a pressure-only edit with
    /// identical bounds and point count MUST be detected — the old
    /// geometric fingerprint silently discarded the user's change.
    func testPressureOnlyEditIsDetectedAndGetsNewIdentity() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0, force: 0.2)])
        let controller = makeController(canvas: canvas)
        let originalId = controller.units[0].objectId
        let originalBytes = controller.units[0].originalData
        XCTAssertNotNil(originalBytes)

        // identical bounds, identical point count, SAME color — only force differs
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0, force: 0.9)])
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units.count, 1)
        XCTAssertNotEqual(
            controller.units[0].objectId, originalId,
            "a real content change must never keep the old identity",
        )
        XCTAssertNotEqual(
            controller.units[0].originalData, originalBytes,
            "the edited stroke's pristine payload is its NEW bytes, never the stale old ones",
        )
        XCTAssertNotEqual(
            controller.units[0].drawing.dataRepresentation(), originalBytes,
            "the edited stroke's bytes must differ from the original",
        )
    }

    /// 0045-R3: a 1→2 split links both children to the replaced unit, and
    /// the edge survives into the manifest as splitFrom.
    func testSplitLinksChildrenAndManifestCarriesSplitFrom() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [makeStroke(x: 0, y: 0, points: 4)])
        let controller = makeController(canvas: canvas)
        let parentId = controller.units[0].objectId

        // local-erase-like split: the 0..30 stroke becomes two segments
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0, points: 2),
            makeStroke(x: 20, y: 0, points: 2),
        ])
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units.count, 2)
        XCTAssertEqual(
            controller.units.map(\.replacedObjectId),
            [parentId, parentId],
            "both split children reference the replaced unit",
        )

        let url = tempURL("split")
        try DocumentFileStore.saveDocument(
            units: controller.units,
            to: url,
            documentId: controller.documentId.uuidString,
            revision: 0,
            scene: try makeMixedSceneData(),
        )
        let opened = try DocumentFileStore.openDocument(at: url)
        XCTAssertEqual(
            Set(opened.units.compactMap(\.splitFrom)),
            [parentId.uuidString],
            "the manifest records the identity replacement graph",
        )
    }

    /// 0045-R3: unchanged strokes keep ids AND pristine bytes across a
    /// repeated snapshot; a pure insertion claims no replacement parent.
    func testInsertionKeepsExistingIdentityAndClaimsNoParent() throws {
        let canvas = PKCanvasView()
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0),
            makeStroke(x: 0, y: 50),
        ])
        let controller = makeController(canvas: canvas)
        let ids = controller.units.map(\.objectId)

        // pure insertion in the middle: existing strokes unchanged
        canvas.drawing = PKDrawing(strokes: [
            makeStroke(x: 0, y: 0),
            makeStroke(x: 200, y: 0),
            makeStroke(x: 0, y: 50),
        ])
        controller.updateUnits(from: canvas)

        XCTAssertEqual(controller.units[0].objectId, ids[0])
        XCTAssertEqual(controller.units[2].objectId, ids[1])
        XCTAssertNotNil(controller.units[0].originalData)
        XCTAssertNotNil(controller.units[2].originalData)
        XCTAssertNil(
            controller.units[1].replacedObjectId,
            "a pure insertion replaces no existing content",
        )
    }
}
