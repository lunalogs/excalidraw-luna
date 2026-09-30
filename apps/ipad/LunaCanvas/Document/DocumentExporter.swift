// Thin PencilKit adapter over the platform-neutral LunaArchive core.
// All container rules live in LunaArchive.swift and are shared with the
// macOS fixture generator — this file only maps PKDrawing <-> bytes.

import CryptoKit
import Foundation
import PencilKit

enum DocumentExporterError: Error {
    case cannotCreateArchive
    case cannotAddEntry(String)
    case invalidManifest(String)
    case missingManifestEntry(String)
    case hashMismatch(String)
    case sizeMismatch(String)

    init(_ core: LunaArchiveError) {
        switch core {
        case .cannotCreateArchive: self = .cannotCreateArchive
        case .cannotAddEntry(let m): self = .cannotAddEntry(m)
        case .invalidManifest(let m): self = .invalidManifest(m)
        case .missingManifestEntry(let m): self = .missingManifestEntry(m)
        case .hashMismatch(let m): self = .hashMismatch(m)
        case .sizeMismatch(let m): self = .sizeMismatch(m)
        }
    }
}

struct ImportedInkUnit {
    let objectId: String
    let drawing: PKDrawing
    let contentHash: String
    /// The exact resource bytes from the container — re-exporting an
    /// untouched unit must reproduce these verbatim (N08/V08).
    let rawData: Data
    /// World transform preserved through the file round-trip (0029-R2).
    let transform: CGAffineTransform
    let order: Int
    /// Derived, rebuildable resources (nil when not present in the file).
    let previewData: Data?
    let hitData: Data?
    /// Identity replacement graph (0045-R3): content derives from this id.
    let splitFrom: String?
    /// Unknown per-object manifest fields carried through saves (0045-R2).
    let inkObjectExtras: [String: Any]
}

struct ImportedDocument {
    let documentId: String
    let revision: Int
    /// The document's REAL excalidraw scene — re-export it, never replace
    /// it with an empty scene (0045-R2).
    let sceneData: Data
    let units: [ImportedInkUnit]
    /// unknown top-level manifest fields preserved for re-export (N09)
    let manifestExtras: [String: Any]
    /// entries this reader does not own (scene image files, foreign
    /// resources) — pass back to export to keep them alive (0045-R2)
    let preservedEntries: [(path: String, data: Data)]
}

enum DocumentExporter {
    /// Derives the rebuildable preview PNG for a unit (W03). Previews are
    /// cache-class resources: the iPad can regenerate them, the web cannot.
    static func makePreviewData(for drawing: PKDrawing) -> Data? {
        let bounds = drawing.bounds
        guard !bounds.isEmpty else { return nil }
        return drawing.image(from: bounds, scale: 2.0).pngData()
    }

    /// Derives coarse hit geometry (W03, fixed 0046-R4): TRUE arc-length
    /// centerline sampling (~4pt steps via 0.25-index interpolation) with
    /// BOTH ENDPOINTS ALWAYS kept, so 4-point short strokes export enough
    /// samples for the web to hit-test. `width` is the actual rendered
    /// thickness (max control-point size) — `renderBounds.width` of a long
    /// horizontal line is its LENGTH and turned far-away points into hits
    /// of a fat capsule. The authoritative visible mask (incl. local-erase
    /// holes) remains the preview PNG alpha, refined on the web through
    /// `createAlphaSampler` (InkLayer). Documented in changes/0046.
    static func makeHitData(for drawing: PKDrawing) -> Data? {
        guard let stroke = drawing.strokes.first else { return nil }
        let path = stroke.path
        guard path.count >= 1 else { return nil }

        var points: [[CGFloat]] = []
        var last = CGPoint(x: CGFloat.nan, y: CGFloat.nan)
        let endIndex = CGFloat(path.count - 1)
        var index: CGFloat = 0
        while index <= endIndex {
            let point = path.interpolatedPoint(at: index).location
            if last.x.isNaN || hypot(point.x - last.x, point.y - last.y) >= 3 {
                points.append([point.x, point.y])
                last = point
            }
            index += 0.25
        }
        let final = path.interpolatedPoint(at: endIndex).location
        if points.isEmpty || hypot(final.x - last.x, final.y - last.y) >= 1 {
            points.append([final.x, final.y])
        }
        if points.count == 1 {
            // zero-length stroke: duplicate so the web always has a segment
            points.append(points[0])
        }

        var width: CGFloat = 0.5
        for i in 0..<path.count {
            let size = path.interpolatedPoint(at: CGFloat(i)).size
            width = max(width, max(size.width, size.height))
        }

        let payload: [String: Any] = [
            "type": "lunacanvas-hit",
            "version": 1,
            "bounds": [
                drawing.bounds.origin.x, drawing.bounds.origin.y,
                drawing.bounds.size.width, drawing.bounds.size.height,
            ],
            "width": width,
            "path": points,
            "hasMask": stroke.mask != nil,
            "maskBounds": stroke.mask.map {
                [
                    $0.bounds.origin.x, $0.bounds.origin.y,
                    $0.bounds.size.width, $0.bounds.size.height,
                ]
            } as Any,
        ]
        return try? JSONSerialization.data(
            withJSONObject: payload,
            options: [.sortedKeys],
        )
    }

    static func export(
        units: [CanvasController.InkUnit],
        to url: URL,
        documentId: String,
        revision: Int,
        manifestExtras: [String: Any] = [:],
        preFail: Bool = false,
        /// the ACTUAL document scene (nil writes a valid empty scene —
        /// only acceptable for fixtures/legacy callers; 0045-R2)
        scene: Data? = nil,
        /// entries from the opened container that must survive the save
        preservedEntries: [(path: String, data: Data)] = [],
    ) throws -> Data {
        do {
            return try LunaArchive.export(
                units: units.map {
                    // N08/V08: unedited strokes re-export their original bytes;
                    // derived resources were generated at edit time (W12)
                    let drawing = $0.drawing
                    return LunaArchiveUnit(
                        objectId: $0.objectId.uuidString,
                        data: $0.originalData ?? drawing.dataRepresentation(),
                        transform: $0.transform,
                        previewData: $0.previewData ?? makePreviewData(for: drawing),
                        hitData: $0.hitData ?? makeHitData(for: drawing),
                        splitFrom: $0.replacedObjectId?.uuidString,
                    )
                },
                to: url,
                documentId: documentId,
                revision: revision,
                manifestExtras: manifestExtras,
                preFail: preFail,
                sceneData: scene,
                preservedEntries: preservedEntries,
            )
        } catch let error as LunaArchiveError {
            throw DocumentExporterError(error)
        }
    }

    static func open(url: URL) throws -> ImportedDocument {
        do {
            let core = try LunaArchive.open(url: url)
            return ImportedDocument(
                documentId: core.documentId,
                revision: core.revision,
                sceneData: core.sceneData,
                units: try core.units.enumerated().map { index, unit in
                    ImportedInkUnit(
                        objectId: unit.objectId,
                        drawing: try PKDrawing(data: unit.data),
                        contentHash: LunaArchive.sha256Hex(unit.data),
                        rawData: unit.data,
                        transform: unit.transform,
                        order: core.orders[index],
                        previewData: unit.previewData,
                        hitData: unit.hitData,
                        splitFrom: unit.splitFrom,
                        inkObjectExtras: unit.inkObjectExtras,
                    )
                },
                manifestExtras: core.manifestExtras,
                preservedEntries: core.preservedEntries,
            )
        } catch let error as LunaArchiveError {
            throw DocumentExporterError(error)
        }
    }

    static func sha256Hex(_ data: Data) -> String {
        LunaArchive.sha256Hex(data)
    }
}
