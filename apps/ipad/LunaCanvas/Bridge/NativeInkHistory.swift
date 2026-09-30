// Native editing transactions routed through THE document coordinator
// (W09, 0047-R5; N16/N17). Transactions commit as single entries in the
// shared ordered DocumentHistory (ink + graphics + web in one stack);
// cancel() rolls a transaction back without touching history or emitting
// anything. `emittedPayloads` carries the bridge payloads for the web
// side — actual bridge transmission is the shell's job (R1 wiring).

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

    /// Box for the current unit list: entry closures capture it, so undo
    /// and redo of ANY entry (ink/graphics/web) mutate one shared state.
    final class UnitState {
        var units: [CanvasController.InkUnit] = []
    }

    /// THE document history — graphics and web commands are recorded into
    /// the same coordinator by their owners (ShellViewModel in R1 wiring).
    let coordinator: DocumentHistory
    private let state: UnitState
    private(set) var emittedPayloads: [[InkObjectDescriptor]] = []

    private var openSnapshot: [CanvasController.InkUnit]?
    private var openLabel = ""

    var units: [CanvasController.InkUnit] { state.units }

    init(coordinator: DocumentHistory = DocumentHistory()) {
        self.coordinator = coordinator
        self.state = UnitState()
    }

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

    /// Commits the current canvas state as ONE entry in the shared
    /// document stack. `units` is the post-edit unit list; identity/
    /// version replacement (new ids for modified strokes) already happened
    /// in updateUnits.
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
        let box = state
        coordinator.record(
            DocumentHistoryEntry(
                kind: .ink,
                label: command.label,
                undo: { [weak box] in box?.units = command.before },
                redo: { [weak box] in box?.units = command.after },
            )
        )
        state.units = units
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

    /// Undo through THE document coordinator: whichever subsystem made
    /// the most recent command (ink, graphics, web) is undone first. Ink
    /// state is copied back through the inout for the caller's canvas.
    @discardableResult
    func undo(
        units: inout [CanvasController.InkUnit],
    ) -> Bool {
        guard coordinator.undo() != nil else { return false }
        units = state.units
        return true
    }

    @discardableResult
    func redo(
        units: inout [CanvasController.InkUnit],
    ) -> Bool {
        guard coordinator.redo() != nil else { return false }
        units = state.units
        return true
    }
}
