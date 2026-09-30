// W10: drafts + file store tests (N20 failure injection).

import Foundation
import PencilKit
import XCTest
@testable import LunaCanvas

final class DocumentFileStoreTests: XCTestCase {
    private func makeControllerWithStroke() throws -> CanvasController {
        let canvas = PKCanvasView()
        var cps: [PKStrokePoint] = []
        for i in 0..<4 {
            cps.append(PKStrokePoint(
                location: CGPoint(x: CGFloat(i) * 10, y: 0),
                timeOffset: TimeInterval(i) * 0.016,
                size: CGSize(width: 3, height: 3),
                opacity: 1, force: 0.5, azimuth: 0, altitude: .pi / 2))
        }
        canvas.drawing = PKDrawing(strokes: [
            PKStroke(ink: PKInk(.pen, color: .black), path: PKStrokePath(controlPoints: cps, creationDate: Date())),
        ])
        let controller = CanvasController()
        controller.updateUnits(from: canvas)
        return controller
    }

    private func tempDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("drafts-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testDraftRoundTripAndDiscard() throws {
        let controller = try makeControllerWithStroke()
        let store = LocalDraftStore(directory: try tempDir())
        let archive = try tempDir().appendingPathComponent("doc.lunacanvas")
        _ = try DocumentExporter.export(
            units: controller.units,
            to: archive,
            documentId: controller.documentId.uuidString,
            revision: 2,
        )
        try store.saveDraft(documentId: controller.documentId.uuidString, archiveURL: archive)

        let loaded = store.loadDraft(documentId: controller.documentId.uuidString)
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.revision, 2)
        XCTAssertEqual(loaded?.units.count, 1)

        store.discardDraft(documentId: controller.documentId.uuidString)
        XCTAssertNil(store.loadDraft(documentId: controller.documentId.uuidString))
    }

    func testCorruptedDraftReturnsNilAndKeepsBackup() throws {
        let controller = try makeControllerWithStroke()
        let dir = try tempDir()
        let store = LocalDraftStore(directory: dir)
        let archive = dir.appendingPathComponent("doc.lunacanvas")
        // first save: draft v1 exists
        _ = try DocumentExporter.export(
            units: controller.units,
            to: archive,
            documentId: controller.documentId.uuidString,
            revision: 1,
        )
        try store.saveDraft(documentId: controller.documentId.uuidString, archiveURL: archive)
        // second save: previous draft becomes .bak
        _ = try DocumentExporter.export(
            units: controller.units,
            to: archive,
            documentId: controller.documentId.uuidString,
            revision: 2,
        )
        try store.saveDraft(documentId: controller.documentId.uuidString, archiveURL: archive)
        // corrupt the current draft in place (truncate to zero bytes)
        let draftURL = dir.appendingPathComponent("\(controller.documentId.uuidString).lunacanvas")
        try Data().write(to: draftURL)

        XCTAssertNil(store.loadDraft(documentId: controller.documentId.uuidString))
        // the .bak copy of the previous good draft is still there
        let backup = dir.appendingPathComponent("\(controller.documentId.uuidString).bak")
        XCTAssertTrue(FileManager.default.fileExists(atPath: backup.path))
    }

    func testDraftForWrongDocumentIsRejected() throws {
        let controller = try makeControllerWithStroke()
        let store = LocalDraftStore(directory: try tempDir())
        let archive = try tempDir().appendingPathComponent("doc.lunacanvas")
        _ = try DocumentExporter.export(
            units: controller.units,
            to: archive,
            documentId: controller.documentId.uuidString,
            revision: 1,
        )
        try store.saveDraft(documentId: controller.documentId.uuidString, archiveURL: archive)
        XCTAssertNil(store.loadDraft(documentId: "some-other-document"))
    }

    func testConflictCopyNamingDoesNotCollide() {
        let url = URL(fileURLWithPath: "/tmp/notes.lunacanvas")
        let copy = DocumentFileStore.conflictCopyURL(for: url)
        XCTAssertTrue(copy.lastPathComponent.contains("conflict"))
        XCTAssertNotEqual(copy.lastPathComponent, url.lastPathComponent)
        XCTAssertTrue(copy.lastPathComponent.hasSuffix(".lunacanvas"))
    }

    func testSaveDocumentFailureKeepsPreviousFile() throws {
        let controller = try makeControllerWithStroke()
        let dir = try tempDir()
        let url = dir.appendingPathComponent("doc.lunacanvas")
        try DocumentFileStore.saveDocument(
            units: controller.units,
            to: url,
            documentId: controller.documentId.uuidString,
            revision: 1,
        )
        let goodBytes = try Data(contentsOf: url)
        // a save into a non-existent directory must fail and keep the file
        let badURL = dir.appendingPathComponent("no-such-dir/doc.lunacanvas")
        XCTAssertThrowsError(
            try DocumentFileStore.saveDocument(
                units: controller.units,
                to: badURL,
                documentId: controller.documentId.uuidString,
                revision: 2,
            ),
        )
        XCTAssertEqual(try Data(contentsOf: url), goodBytes)
    }
}
