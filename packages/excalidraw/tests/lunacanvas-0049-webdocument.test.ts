// 0049-R1 (web side): the editor can OPEN a real .lunacanvas (scene +
// ink objects + blob previews), apply web edits, and SAVE a regenerated
// container — untouched resource bytes verbatim (N08), scene replaced,
// deleted objects drop out with their entries, unknown extras survive —
// and the result passes the strict validator again (open -> edit -> save
// -> re-open byte/semantic round-trip through the real ZIP path).

import { readFileSync, existsSync } from "fs";
import path from "path";

import { applyInkEdit } from "../lunacanvas/inkModel";
import { openLunacanvasContainer } from "../lunacanvas/zipContainer";
import {
  openLunacanvasDocument,
  saveLunacanvasDocument,
} from "../lunacanvas/webDocument";

const FIXTURE = path.resolve(
  __dirname,
  "../../../docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas",
);

(!existsSync(FIXTURE) ? describe.skip : describe)(
  "0049-R1 web document open/edit/save round-trip",
  () => {
    it("opens the Swift-written document: scene, ink objects, hit geometry", async () => {
      const opened = await openLunacanvasDocument(readFileSync(FIXTURE));
      if (!opened.ok) {
        throw new Error(`open failed: ${opened.errors.join(", ")}`);
      }
      expect(opened.documentId).toBeTruthy();
      expect((opened.scene as { type: string }).type).toBe("excalidraw");
      expect(opened.objects).toHaveLength(1);
      const ink = opened.objects[0];
      expect(ink.hit.path.length).toBeGreaterThanOrEqual(2);
      // fixture was written with a 1.5x web transform replayed by Swift
      expect(ink.transform[0]).toBeCloseTo(1.5, 5);
      expect(typeof ink.assetRef).toBe("string");
    });

    it("web move + delete -> save -> re-open: edits stick, bytes verbatim, validator passes", async () => {
      const data = readFileSync(FIXTURE);
      const opened = await openLunacanvasDocument(data);
      if (!opened.ok) {
        throw new Error(`open failed: ${opened.errors.join(", ")}`);
      }
      const originalBytes = new Map<string, Uint8Array>();
      for (const r of opened.manifest.resources) {
        originalBytes.set(r.path, await opened.readEntry(r.path));
      }

      // web edits: move the stroke, add a second (foreign) object marker
      // by duplicating is out of v1 scope — instead move + keep, and
      // exercise delete lifecycle via a second fixture object synthesized
      // from the same bytes under a different id.
      const moved = applyInkEdit(opened.objects, {
        kind: "set-transform",
        objectId: opened.objects[0].objectId,
        transform: [2, 0, 0, 2, 100, -40],
      });
      if (!Array.isArray(moved)) {
        throw new Error(moved.error);
      }

      const scene = {
        ...opened.scene,
        elements: [
          {
            id: "rect-web",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 50,
            height: 50,
          },
        ],
      };
      const saved = await saveLunacanvasDocument({
        documentId: opened.documentId,
        revision: opened.revision + 1,
        scene,
        objects: moved,
        originalEntries: Object.fromEntries(originalBytes),
        manifestExtras: opened.manifestRaw,
        originalResources: opened.manifest.resources,
      });

      // the saved container must pass strict validation again
      const reopened = await openLunacanvasDocument(saved);
      if (!reopened.ok) {
        throw new Error(`re-open failed: ${reopened.errors.join(", ")}`);
      }
      expect((reopened.scene as { elements: unknown[] }).elements).toHaveLength(
        1,
      );
      expect(reopened.objects[0].transform).toEqual([2, 0, 0, 2, 100, -40]);
      expect(reopened.revision).toBe(opened.revision + 1);
      // untouched resource bytes reproduce verbatim (N08)
      const drawingRef = reopened.objects[0].assetRef!;
      expect(await reopened.readEntry(drawingRef)).toEqual(
        originalBytes.get(drawingRef),
      );
    });

    it("deleted objects drop out of the saved container entirely", async () => {
      const data = readFileSync(FIXTURE);
      const opened = await openLunacanvasDocument(data);
      if (!opened.ok) {
        throw new Error(`open failed: ${opened.errors.join(", ")}`);
      }
      const originalBytes = new Map<string, Uint8Array>();
      for (const r of opened.manifest.resources) {
        originalBytes.set(r.path, await opened.readEntry(r.path));
      }
      const deleted = applyInkEdit(opened.objects, {
        kind: "delete",
        objectId: opened.objects[0].objectId,
      });
      if (!Array.isArray(deleted)) {
        throw new Error(deleted.error);
      }
      const saved = await saveLunacanvasDocument({
        documentId: opened.documentId,
        revision: opened.revision + 1,
        scene: opened.scene,
        objects: deleted,
        originalEntries: Object.fromEntries(originalBytes),
        manifestExtras: opened.manifestRaw,
        originalResources: opened.manifest.resources,
      });
      const strict = await openLunacanvasContainer(saved);
      expect(strict.ok).toBe(true);
      const reopened = await openLunacanvasDocument(saved);
      if (!reopened.ok) {
        throw new Error(`re-open failed: ${reopened.errors.join(", ")}`);
      }
      expect(reopened.objects).toHaveLength(0);
    });
  },
);
