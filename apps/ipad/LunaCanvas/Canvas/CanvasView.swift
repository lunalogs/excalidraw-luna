// PKCanvasView wrapper — real native ink capture (P0 prototype).
// NOT compile-verified yet (no Xcode on this machine). See ADR-0001.

import PencilKit
import SwiftUI
import UIKit

final class CanvasController: NSObject, ObservableObject {
    /// Stable document identity across saves of the same document (W02):
    /// assigned per document; a NEW document gets a fresh id.
    private(set) var documentId = UUID()
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
        /// EXACT content proof (0045-R3): sha256 of the serialized
        /// single-stroke drawing. Covers path, pressure, ink type and mask
        /// — a geometric summary (bounds/count/RGBA) is NOT proof of
        /// content equality and must never gate identity.
        let contentDigest: String
        /// Set on a NEW unit when its content replaces a previous unit's
        /// content (modify/split) — the manifest splitFrom edge (N16).
        let replacedObjectId: UUID?

        /// Kept unit: identity, pristine bytes and derived resources carry
        /// over; the drawing reference is refreshed to the live stroke.
        static func kept(_ unit: InkUnit, drawing: PKDrawing) -> InkUnit {
            InkUnit(
                objectId: unit.objectId,
                drawing: drawing,
                transform: unit.transform,
                originalData: unit.originalData,
                previewData: unit.previewData,
                hitData: unit.hitData,
                contentDigest: unit.contentDigest,
                replacedObjectId: unit.replacedObjectId,
            )
        }

        /// New unit: fresh identity + derived resources, optionally linked
        /// to the replaced unit via the identity graph. The stroke is
        /// pristine at creation, so its initial serialization is kept as
        /// the re-export payload until an actual edit occurs (N08).
        static func fresh(
            drawing: PKDrawing,
            replacedObjectId: UUID? = nil,
        ) -> InkUnit {
            InkUnit(
                objectId: UUID(),
                drawing: drawing,
                transform: .identity,
                originalData: drawing.dataRepresentation(),
                previewData: DocumentExporter.makePreviewData(for: drawing),
                hitData: DocumentExporter.makeHitData(for: drawing),
                contentDigest: CanvasController.contentDigest(of: drawing),
                replacedObjectId: replacedObjectId,
            )
        }
    }

    @Published private(set) var units: [InkUnit] = []

    private var lastSnapshot: PKDrawing?

    /// Rebuilds the unit list from the live canvas. Unchanged units keep
    /// their objectId AND pristine bytes; modified/split strokes get new
    /// ids linked to the replaced unit (ADR-0002, 0045-R3).
    ///
    /// Identity is proven by `contentDigest` — a sha256 over every visible
    /// stroke property (path, pressure, ink, mask), not a geometric
    /// summary and not serialized bytes (unstable metadata). Matching
    /// is one-to-one with consumption, then unmatched new strokes pair with
    /// unmatched old units IN DOCUMENT ORDER inside the spans between
    /// matched anchors (an LCS-style diff — PencilKit exposes no per-stroke
    /// mutation events, so positional pairing inside unmatched spans is the
    /// strongest available attribution; extras in a 1→m span share the
    /// parent, which is exactly the split relation).
    func updateUnits(from canvas: PKCanvasView) {
        let drawing = canvas.drawing
        let strokes = drawing.strokes
        let digests = strokes.map {
            Self.contentDigest(of: PKDrawing(strokes: [$0]))
        }
        // steady-state fast path: same stroke count and every index-aligned
        // digest equal means NOTHING changed — O(n) exact proof.
        if strokes.count == units.count,
           zip(units, digests).allSatisfy({ $0.contentDigest == $1 }) {
            lastSnapshot = drawing
            return
        }
        // pass 1: exact one-to-one digest matching with consumption
        var pool: [Int] = Array(units.indices)
        var match: [Int?] = []
        match.reserveCapacity(strokes.count)
        for digest in digests {
            var found: Int?
            for index in pool where units[index].contentDigest == digest {
                found = index
                break
            }
            if let index = found {
                match.append(index)
                pool.removeAll { $0 == index }
            } else {
                match.append(nil)
            }
        }
        // pass 2: rebuild, pairing unmatched new strokes with unmatched old
        // units in document order within each span between matched anchors.
        var next: [InkUnit] = []
        next.reserveCapacity(strokes.count)
        var cursor = 0
        while cursor < strokes.count {
            if let oldIndex = match[cursor] {
                next.append(
                    .kept(units[oldIndex], drawing: PKDrawing(strokes: [strokes[cursor]]))
                )
                cursor += 1
                continue
            }
            var end = cursor
            while end < strokes.count && match[end] == nil { end += 1 }
            let leftAnchor = cursor > 0 ? match[cursor - 1]! : -1
            let rightAnchor = end < strokes.count ? match[end]! : units.count
            // unmatched old units strictly inside the anchor span, in order
            let spanCandidates = pool
                .filter { $0 > leftAnchor && $0 < rightAnchor }
                .sorted()
                .map { units[$0] }
            for (offset, newIndex) in (cursor..<end).enumerated() {
                let parent: UUID?
                if spanCandidates.isEmpty {
                    parent = nil // pure insertion: no replaced content
                } else {
                    // in-order pairing; 1→m spans share the parent (split)
                    parent = spanCandidates[min(offset, spanCandidates.count - 1)]
                        .objectId
                }
                next.append(
                    .fresh(
                        drawing: PKDrawing(strokes: [strokes[newIndex]]),
                        replacedObjectId: parent,
                    )
                )
            }
            cursor = end
        }
        units = next
        lastSnapshot = drawing
    }

    /// Exact content digest (0045-R3): sha256 over a canonical binary
    /// encoding of every visible stroke property. Equal digests prove
    /// equal content (path, pressure, ink, mask); unequal digests prove a
    /// real edit. Never derived from serialized bytes (unstable metadata)
    /// or geometry summaries (blind to pressure edits).
    static func contentDigest(of drawing: PKDrawing) -> String {
        var data = Data()
        func append(_ value: Double) {
            var bits = value.bitPattern
            withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) }
        }
        for stroke in drawing.strokes {
            data.append(contentsOf: Array(stroke.ink.inkType.rawValue.utf8))
            let (r, g, b, a) = stroke.ink.color.rgba
            for component in [Double(r), Double(g), Double(b), Double(a)] {
                append(component)
            }
            var transform = stroke.transform
            withUnsafeBytes(of: &transform) { data.append(contentsOf: $0) }
            if let mask = stroke.mask {
                data.append(1)
                for v in [
                    Double(mask.bounds.origin.x), Double(mask.bounds.origin.y),
                    Double(mask.bounds.size.width), Double(mask.bounds.size.height),
                ] {
                    append(v)
                }
            } else {
                data.append(0)
            }
            let path = stroke.path
            var count = path.count
            withUnsafeBytes(of: &count) { data.append(contentsOf: $0) }
            for index in 0..<path.count {
                let p = path.interpolatedPoint(at: CGFloat(index))
                for v in [
                    Double(p.location.x), Double(p.location.y),
                    p.timeOffset,
                    Double(p.size.width), Double(p.size.height),
                    Double(p.opacity), Double(p.force),
                    Double(p.azimuth), Double(p.altitude),
                ] {
                    append(v)
                }
            }
        }
        return LunaArchive.sha256Hex(data)
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
                contentDigest: Self.contentDigest(of: single),
                replacedObjectId: unit.replacedObjectId,
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
    func load(
        from imported: [ImportedInkUnit],
        canvas: PKCanvasView,
        documentId: String? = nil,
        revision: Int = 0,
    ) {
        if let documentId, let uuid = UUID(uuidString: documentId) {
            self.documentId = uuid
        }
        self.revision = revision
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
                contentDigest: Self.contentDigest(of: single),
                replacedObjectId: importedUnit.splitFrom
                    .flatMap(UUID.init(uuidString:)),
            )
        }
    }

    private var liveCanvas: PKCanvasView?

    /// UI wiring only; all editing flows through the controller methods.
    var liveCanvasForUI: PKCanvasView? { liveCanvas }

    func attach(canvas: PKCanvasView) {
        liveCanvas = canvas
    }

    /// Starts a NEW document: fresh identity, empty canvas and units.
    func resetForNewDocument(canvas: PKCanvasView) {
        canvas.drawing = PKDrawing()
        units = []
        lastSnapshot = nil
        revision = 0
        documentId = UUID()
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
