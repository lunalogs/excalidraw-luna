// Native editing transactions + unified history closure (W09, N16/N17).
// Wraps CanvasController snapshots into exactly-one undoable commands and
// emits typed bridge payloads for the web side. cancel() rolls a
// transaction back without touching history or emitting anything.

import Foundation
import PencilKit

struct InkObjectDescriptor: Codable, Equatable {
    public let objectId: String
    public let nativeAssetRef: String
    public let order: Int
    public let contentHash: String
}

enum NativeHistoryError: Error {
    case noOpenTransaction
}

final class NativeInkHistory {
    struct Command {
        let label: String
        let before: [CanvasController.InkUnit]
        let after: [CanvasController.InkUnit]
        let payload: [InkObjectDescriptor]
    }

    private(set) var undoStack: [Command] = []
    private(set) var redoStack: [Command] = []
    private(set) var emittedPayloads: [[InkObjectDescriptor]] = []

    private var openSnapshot: [CanvasController.InkUnit]?
    private var openLabel = ""

    init() {}

    var hasOpenTransaction: Bool { openSnapshot != nil }

    /// Opens a transaction capturing the CURRENT units as the rollback
    /// snapshot. Edits happen after this call; commit/cancel ends it.
    func beginTransaction(
        label: String,
        units: [CanvasController.InkUnit],
    ) {
        openSnapshot = units
        openLabel = label
    }

    /// Commits the current canvas state as one command. `units` is the
    /// post-edit unit list; identity/version replacement (new ids for
    /// modified strokes) already happened in updateUnits.
    func commit(
        label: String? = nil,
        units: [CanvasController.InkUnit],
        emit: Bool = true,
    ) {
        guard let snapshot = openSnapshot else { return }
        let command = Command(
            label: label ?? openLabel,
            before: snapshot,
            after: units,
            payload: units.enumerated().map { order, unit in
                InkObjectDescriptor(
                    objectId: unit.objectId.uuidString,
                    nativeAssetRef: "ink/\(unit.objectId.uuidString).drawing",
                    order: order,
                    contentHash: LunaArchive.sha256Hex(
                        unit.originalData ?? unit.drawing.dataRepresentation()
                    ),
                )
            },
        )
        undoStack.append(command)
        redoStack = []
        if emit {
            emittedPayloads.append(command.payload)
        }
        openSnapshot = nil
    }

    /// Cancel (N17): roll back without history or emissions.
    func cancel(units: inout [CanvasController.InkUnit]) {
        guard let snapshot = openSnapshot else { return }
        units = snapshot
        openSnapshot = nil
    }

    func undo(
        units: inout [CanvasController.InkUnit],
    ) -> Bool {
        guard let command = undoStack.popLast() else { return false }
        units = command.before
        redoStack.append(command)
        return true
    }

    func redo(
        units: inout [CanvasController.InkUnit],
    ) -> Bool {
        guard let command = redoStack.popLast() else { return false }
        units = command.after
        undoStack.append(command)
        return true
    }
}
