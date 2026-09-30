// Legacy compatibility (W11, N21): .excalidraw import keeps graphics and
// old freedraw untouched (no fake PencilKit conversion); .lunacanvas
// downgrade export emits the scene only and reports the ink-editability
// loss — it never overwrites the hybrid original.

import Foundation

enum CompatImportResult {
    /// a plain .excalidraw file: graphics scene only, zero ink objects
    case legacyExcalidraw(sceneData: Data)
    /// a .lunacanvas container (handled by the normal path)
    case lunacanvas
}

enum CompatImporter {
    /// Detects the file kind from content, never from extension alone.
    static func sniff(_ url: URL) -> CompatImportResult? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        // ZIP containers start with PK\x03\x04
        if data.starts(with: [0x50, 0x4b, 0x03, 0x04]) {
            return .lunacanvas
        }
        // legacy .excalidraw is a JSON object: {"type":"excalidraw",...}
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            object["type"] as? String == "excalidraw"
        else {
            return nil
        }
        return .legacyExcalidraw(sceneData: data)
    }

    /// Wraps a legacy scene into the hybrid model with zero ink objects so
    /// the rest of the pipeline (bridge, editing) sees one shape.
    static func importedDocument(
        fromLegacyScene sceneData: Data,
        documentId: String = UUID().uuidString,
    ) throws -> ImportedDocument {
        ImportedDocument(
            documentId: documentId,
            revision: 0,
            sceneData: sceneData,
            units: [],
            manifestExtras: [:],
            preservedEntries: [],
        )
    }
}

enum DowngradeReport: Equatable {
    /// scene-only export; the number of ink objects left behind
    case sceneOnly(inkObjectCount: Int)
}

enum CompatExporter {
    /// Downgrades to a plain .excalidraw file (scene only). The caller is
    /// responsible for NOT overwriting the hybrid original (N21) — the
    /// report makes the loss explicit for the UI warning.
    static func exportSceneOnly(
        sceneData: Data,
        to url: URL,
        inkObjectCount: Int,
    ) throws -> DowngradeReport {
        try sceneData.write(to: url, options: .atomic)
        return .sceneOnly(inkObjectCount: inkObjectCount)
    }
}
