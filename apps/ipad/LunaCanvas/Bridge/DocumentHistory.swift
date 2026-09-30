// Document-level ordered command coordinator (0047-R5, SPEC N17).
// ONE stack for the whole hybrid document: native ink transactions,
// graphics commands and web-originated edits are entries in a single
// chronological sequence. Undo walks the sequence in reverse order
// regardless of subsystem — ink write → graphics rect → undo undoes the
// rect first. Per-subsystem stacks cannot express interleaving; this can.
// Every user action is exactly one entry.

import Foundation

enum DocumentHistoryKind: String {
    case ink
    case graphics
    case web
}

struct DocumentHistoryEntry {
    let kind: DocumentHistoryKind
    let label: String
    let undo: () -> Void
    let redo: () -> Void
}

final class DocumentHistory {
    private(set) var undoStack: [DocumentHistoryEntry] = []
    private(set) var redoStack: [DocumentHistoryEntry] = []

    /// A new entry invalidates the redo branch (standard semantics).
    func record(_ entry: DocumentHistoryEntry) {
        undoStack.append(entry)
        redoStack = []
    }

    @discardableResult
    func undo() -> DocumentHistoryEntry? {
        guard let entry = undoStack.popLast() else { return nil }
        entry.undo()
        redoStack.append(entry)
        return entry
    }

    @discardableResult
    func redo() -> DocumentHistoryEntry? {
        guard let entry = redoStack.popLast() else { return nil }
        entry.redo()
        undoStack.append(entry)
        return entry
    }

    func clear() {
        undoStack = []
        redoStack = []
    }
}
