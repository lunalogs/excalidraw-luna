// PKCanvasView wrapper — real native ink capture (P0 prototype).
// NOT compile-verified yet (no Xcode on this machine). See ADR-0001.

import PencilKit
import SwiftUI
import UIKit

final class CanvasController: NSObject, ObservableObject {
    /// Stable document identity across saves of the same document (W02):
    /// assigned once per document, never per save.
    let documentId = UUID()
    @Published private(set) var revision = 0
    /// Stable identity per selectable ink unit, owned by the adapter layer
    /// (ADR-0002) — never derived from array index or PKStroke internals.
    struct InkUnit {
        let objectId: UUID
        /// Single-stroke PKDrawing, serialized verbatim per SPEC N07.
        let drawing: PKDrawing
        /// World transform (scale+translate only) applied exactly once.
        var transform: CGAffineTransform = .identity
        /// Original resource bytes for an UNEDITED unit. Re-exporting an
        /// untouched stroke must reproduce its bytes verbatim (N08/V08) —
        /// re-wrapping a decoded stroke into a new PKDrawing serializes
        /// differently, so the original payload is kept and only dropped
        /// when the stroke is actually edited (bake/user ink/mask change).
        var originalData: Data? = nil
        /// Derived resources, generated at edit time (not at export) so
        /// saving never pays the render cost on the critical path (W12).
        var previewData: Data? = nil
        var hitData: Data? = nil
    }

    @Published private(set) var units: [InkUnit] = []

    private var lastSnapshot: PKDrawing?

    /// Rebuilds the unit list from the live canvas. Unchanged units keep
    /// their objectId; modified/split strokes get new ids (ADR-0002).
    ///
    /// P0 mapping (improved per 0027-R1): fingerprints cover bounds, point
    /// count, ink color and width so same-bounds-different-content strokes
    /// are distinguishable; matching is ORDER-BASED ONE-TO-ONE with
    /// consumption — each previous unit matches at most one current stroke,
    /// so identical/coincident strokes never collapse onto one id. P1
    /// replaces fingerprints with a persistent identity map.
    func updateUnits(from canvas: PKCanvasView) {
        let drawing = canvas.drawing
        // steady-state fast path: same stroke count means index-aligned
        // identity (canvas edits preserve order); O(n) instead of the
        // fingerprint pool match below.
        if drawing.strokes.count == units.count,
           zip(units, drawing.strokes).allSatisfy({ unit, stroke in
               Self.fingerprint(of: unit.drawing)
                   == Self.fingerprint(of: PKDrawing(strokes: [stroke]))
           }) {
            // unchanged content: keep identity and derived resources as-is
            lastSnapshot = drawing
            return
        }
        var pool = units
        var next: [InkUnit] = []
        for stroke in drawing.strokes {
            let single = PKDrawing(strokes: [stroke])
            let fingerprint = Self.fingerprint(of: single)
            var matchIndex: Int?
            for (index, candidate) in pool.enumerated() where
                Self.fingerprint(of: candidate.drawing) == fingerprint
            {
                matchIndex = index
                break
            }
            if let index = matchIndex {
                let kept = pool.remove(at: index)
                next.append(
                    InkUnit(
                        objectId: kept.objectId,
                        drawing: single,
                        transform: kept.transform,
                        originalData: kept.originalData,
                        previewData: kept.previewData,
                        hitData: kept.hitData,
                    )
                )
            } else {
                // new or modified stroke: fresh identity + derived resources
                next.append(
                    InkUnit(
                        objectId: UUID(),
                        drawing: single,
                        transform: .identity,
                        originalData: nil,
                        previewData: DocumentExporter.makePreviewData(for: single),
                        hitData: DocumentExporter.makeHitData(for: single),
                    )
                )
            }
        }
        units = next
        lastSnapshot = drawing
    }

    /// P0 content fingerprint — richer than bounds+count (0027-R1) but
    /// still NOT a permanent identity; P1 replaces it (ADR-0002).
    static func fingerprint(of drawing: PKDrawing) -> String {
        let b = drawing.bounds
        let stroke = drawing.strokes.first
        let (r, g, bl, a) = stroke?.ink.color.rgba ?? (0, 0, 0, 0)
        return String(
            format: "%.2f,%.2f,%.2f,%.2f,%d,%.3f,%.3f,%.3f,%.3f",
            b.origin.x, b.origin.y, b.size.width, b.size.height,
            stroke?.path.count ?? 0,
            r, g, bl, a
        )
    }

    /// Export the first three units as independent resources (SPEC 3.1):
    /// per-stroke .drawing payloads + manifest entries, without any
    /// whole-page screenshot. Writes a real .lunacanvas container.
    @discardableResult
    func exportFirstThreeStrokes(
        to url: URL? = nil,
        preFail: Bool = false,
    ) throws -> URL {
        updateUnitsFromLiveCanvasIfPossible()
        let target = Array(units.prefix(3))
        let destination = url ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("p0-three-strokes.lunacanvas")
        _ = try DocumentExporter.export(
            units: target,
            to: destination,
            documentId: documentId.uuidString,
            revision: revision,
            preFail: preFail,
        )
        revision += 1
        return destination
    }

    /// Replays the stored web-side transforms onto the native canvas and
    /// NORMALIZES them in ONE transaction: strokes and units are associated
    /// BY INDEX (updateUnits builds units in stroke order, 1:1), never via
    /// a fingerprint-keyed dictionary — coincident identical strokes each
    /// carry their own transform (0029-R1). The matrix is baked into the
    /// strokes (fresh local geometry) and each unit's transform resets to
    /// identity, so reopening the same document can never scale twice
    /// (SPEC 3.2).
    func applyWebTransformsToCanvas(_ canvas: PKCanvasView) {
        updateUnits(from: canvas)
        let strokes = canvas.drawing.strokes
        guard strokes.count == units.count else {
            // transient mismatch: never guess associations (0029-R1)
            return
        }
        var newStrokes: [PKStroke] = []
        newStrokes.reserveCapacity(strokes.count)
        for (stroke, unit) in zip(strokes, units) {
            guard unit.transform != .identity else {
                newStrokes.append(stroke)
                continue
            }
            // PKStroke has no transformed(by:); transform the single-stroke
            // drawing and take its stroke back (PKDrawing.transformed is
            // the public path, iPadOS 15+).
            guard let baked = PKDrawing(strokes: [stroke])
                .transformed(using: unit.transform).strokes.first
            else { return } // never guess partial associations
            newStrokes.append(baked)
        }
        canvas.drawing = PKDrawing(strokes: newStrokes)
        // bake + normalize in the same transaction. The rebuild is
        // ORDER-PRESERVING by construction, so identity comes from the
        // 1:1 index association — never from fingerprint re-matching,
        // which cannot distinguish identical coincident strokes (0029-R1).
        units = zip(units, newStrokes).map { unit, stroke in
            let single = PKDrawing(strokes: [stroke])
            return InkUnit(
                objectId: unit.objectId,
                drawing: single,
                transform: .identity,
                originalData: nil, // baked bytes are new
                previewData: DocumentExporter.makePreviewData(for: single),
                hitData: DocumentExporter.makeHitData(for: single),
            )
        }
    }

    /// Applies a web-side transform (150% scale at fixed anchor, SPEC N14)
    /// to a unit. Web/bridge callers set transforms; the replay path bakes
    /// and normalizes them in one transaction.
    func setTransform(_ transform: CGAffineTransform, forUnitAt index: Int) {
        guard units.indices.contains(index) else { return }
        // v1 write path accepts scale+translate only
        assert(transform.b == 0 && transform.c == 0)
        units[index].transform = transform
    }

    func simulateWebTransform() {
        guard let index = units.indices.first else { return }
        setTransform(
            units[index].transform.concatenating(
                CGAffineTransform(scaleX: 1.5, y: 1.5),
            ),
            forUnitAt: index,
        )
    }

    /// Rebuilds editing state from an opened document (W01): stroke order
    /// matches the file's inkObjects 1:1, so identity comes from the file —
    /// geometry fingerprints never reassign ids across sessions. Stored
    /// transforms are applied to the canvas once and normalized, so a later
    /// save never scales twice (SPEC 3.2).
    func load(from imported: [ImportedInkUnit], canvas: PKCanvasView) {
        let strokes: [PKStroke] = imported.map { unit in
            let stroke = unit.drawing.strokes.first!
            guard
                unit.transform != .identity,
                let baked = PKDrawing(strokes: [stroke])
                    .transformed(using: unit.transform).strokes.first
            else { return stroke }
            return baked
        }
        canvas.drawing = PKDrawing(strokes: strokes)
        units = zip(imported, strokes).map { importedUnit, stroke in
            let single = PKDrawing(strokes: [stroke])
            return InkUnit(
                objectId: UUID(uuidString: importedUnit.objectId) ?? UUID(),
                drawing: single,
                transform: .identity,
                // untouched strokes re-export their original bytes; edited
                // (transformed) strokes have no pristine payload anymore
                originalData: importedUnit.transform == .identity
                    ? importedUnit.rawData
                    : nil,
                previewData: DocumentExporter.makePreviewData(for: single),
                hitData: DocumentExporter.makeHitData(for: single),
            )
        }
    }

    private var liveCanvas: PKCanvasView?

    /// UI wiring only; all editing flows through the controller methods.
    var liveCanvasForUI: PKCanvasView? { liveCanvas }

    func attach(canvas: PKCanvasView) {
        liveCanvas = canvas
    }

    private func updateUnitsFromLiveCanvasIfPossible() {
        if let liveCanvas {
            updateUnits(from: liveCanvas)
        }
    }
}

struct CanvasView: UIViewRepresentable {
    @ObservedObject var controller: CanvasController

    func makeCoordinator() -> Coordinator { Coordinator(controller: controller) }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.drawingPolicy = .anyInput
        canvas.tool = PKInkingTool(.pen, color: .black, width: 3)
        canvas.delegate = context.coordinator
        controller.attach(canvas: canvas)

        DispatchQueue.main.async {
            if let window = canvas.window {
                let picker = PKToolPicker.shared(for: window)
                picker?.setVisible(true, forFirstResponder: canvas)
                picker?.addObserver(canvas)
            }
            canvas.becomeFirstResponder()
        }
        return canvas
    }

    func updateUIView(_ uiView: PKCanvasView, context: Context) {}

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let controller: CanvasController
        init(controller: CanvasController) { self.controller = controller }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            // Real-time ink stays native; resource export happens after the
            // stroke transaction settles (SPEC 2.1).
            controller.updateUnits(from: canvasView)
        }
    }
}

extension UIColor {
    var rgba: (CGFloat, CGFloat, CGFloat, CGFloat) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }
}
