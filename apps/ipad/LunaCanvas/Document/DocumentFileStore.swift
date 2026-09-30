// Local drafts + file coordination (W10, N19/N20).
// Drafts are keyed by documentId, written atomically, and never let a
// corrupted draft destroy the only copy. File access goes through security
// scope + atomic replace; failures keep the previous bytes.

import Foundation

enum DocumentFileStoreError: Error {
    case unreadable
    case writeFailed
}

struct LocalDraftStore {
    private let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("LunaCanvasDrafts", isDirectory: true)
    }

    private func draftURL(for documentId: String) -> URL {
        directory.appendingPathComponent("\(documentId).lunacanvas")
    }

    private func backupURL(for documentId: String) -> URL {
        directory.appendingPathComponent("\(documentId).bak")
    }

    /// Persists a draft atomically. The previous draft becomes .bak so a
    /// half-written new draft can never destroy the only recoverable copy.
    func saveDraft(
        documentId: String,
        archiveURL: URL,
    ) throws {
        let fileManager = FileManager()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let target = draftURL(for: documentId)
        if fileManager.fileExists(atPath: target.path) {
            _ = try? fileManager.replaceItemAt(
                backupURL(for: documentId),
                withItemAt: target,
            )
        }
        _ = try fileManager.replaceItemAt(target, withItemAt: archiveURL)
    }

    /// Loads and fully validates a draft. Corrupt or missing drafts return
    /// nil (caller falls back to the last saved file); the .bak copy stays.
    func loadDraft(documentId: String) -> ImportedDocument? {
        let url = draftURL(for: documentId)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        guard let document = try? DocumentExporter.open(url: url) else { return nil }
        guard document.documentId == documentId else { return nil }
        return document
    }

    func discardDraft(documentId: String) {
        let fileManager = FileManager()
        try? fileManager.removeItem(at: draftURL(for: documentId))
        try? fileManager.removeItem(at: backupURL(for: documentId))
    }
}

enum DocumentFileStore {
    /// Opens a user-picked file under a security scope (no-op for sandbox-
    /// granted simulator paths, required for UIDocumentPicker URLs).
    static func openDocument(at url: URL) throws -> ImportedDocument {
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing { url.stopAccessingSecurityScopedResource() }
        }
        return try DocumentExporter.open(url: url)
    }

    /// Atomic save: LunaArchive.export already writes temp-then-replace;
    /// here we add security-scope handling and never report success before
    /// the replace returns.
    static func saveDocument(
        units: [CanvasController.InkUnit],
        to url: URL,
        documentId: String,
        revision: Int,
        manifestExtras: [String: Any] = [:],
    ) throws {
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing { url.stopAccessingSecurityScopedResource() }
        }
        try DocumentExporter.export(
            units: units,
            to: url,
            documentId: documentId,
            revision: revision,
            manifestExtras: manifestExtras,
        )
    }

    /// Conflict-safe copy naming (N20): two devices editing produce
    /// "name (conflict).lunacanvas" instead of overwriting the other side.
    static func conflictCopyURL(for url: URL) -> URL {
        let base = url.deletingPathExtension().lastPathComponent
        let stamp = ISO8601DateFormatter()
            .string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
        return url.deletingLastPathComponent()
            .appendingPathComponent("\(base) (conflict \(stamp)).lunacanvas")
    }
}
