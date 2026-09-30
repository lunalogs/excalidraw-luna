/**
 * Hybrid editing controller + unified history (W06, 0047-R5; N14/N15/N17).
 *
 * Model-level operations: lasso selection, move/scale around a fixed
 * anchor, whole-stroke eraser sweeps (one history entry per sweep),
 * multi-object delete. ALL commands — ink AND graphics — live in ONE
 * ordered DocumentHistory (SPEC N17): undo walks reverse chronological
 * order across subsystems, never "ink stack first, graphics when empty".
 */

import { DocumentHistory } from "./documentHistory";
import {
  applyInkEdit,
  isInkHitByEraser,
  isInkSelectedByLasso,
  type InkEdit,
  type InkObject,
  type WorldTransform,
} from "./inkModel";

const moveTransform = (
  t: WorldTransform,
  dx: number,
  dy: number,
): WorldTransform => [t[0], t[1], t[2], t[3], t[4] + dx, t[5] + dy];

const scaleTransform = (
  t: WorldTransform,
  factor: number,
  anchor: readonly [number, number],
): WorldTransform => {
  // world-space scale around a fixed anchor; world point p maps to
  // anchor + (p - anchor) * factor
  const [a, , , d, tx, ty] = t;
  const [ax, ay] = anchor;
  return [
    a * factor,
    0,
    0,
    d * factor,
    ax + (tx - ax) * factor,
    ay + (ty - ay) * factor,
  ];
};

export type ControllerResult =
  | { ok: true; objects: InkObject[] }
  | { ok: false; error: string };

const applyAll = (
  objects: readonly InkObject[],
  edits: InkEdit[],
): ControllerResult => {
  let current: InkObject[] = objects.map((o) => ({ ...o }));
  for (const edit of edits) {
    const result = applyInkEdit(current, edit);
    if (!Array.isArray(result)) {
      return { ok: false, error: result.error };
    }
    current = result;
  }
  return { ok: true, objects: current };
};

export class InkEditingController {
  private objects: InkObject[];

  constructor(
    objects: InkObject[],
    /**
     * THE document history (shared with the graphics host). Pass the
     * host's coordinator so ink and graphics commands interleave in one
     * ordered stack; a private one is created for standalone use/tests.
     */
    private history: DocumentHistory = new DocumentHistory(),
    /** called after any state change (commit/undo/redo) for host sync */
    private onChanged: (
      objects: readonly InkObject[],
      cause: "commit" | "undo" | "redo",
    ) => void = () => {},
  ) {
    this.objects = objects;
  }

  /** the shared coordinator — the graphics host records its commands here */
  getHistory(): DocumentHistory {
    return this.history;
  }

  getObjects(): readonly InkObject[] {
    return this.objects;
  }

  getHistoryDepth(): { undo: number; redo: number } {
    return this.history.depth();
  }

  /** Graphics commands enter the SAME ordered stack through this entry
   * point (one user action = one entry; N17). */
  recordGraphics(label: string, undo: () => void, redo: () => void): void {
    this.history.push({ kind: "graphics", label, undo, redo });
  }

  /**
   * Lasso (N13): returns the ids of whole strokes intersected/contained by
   * the closed polygon. Selection itself is host state; this computes it.
   */
  selectByLasso(polygon: [number, number][]): string[] {
    return this.objects
      .filter((ink) => isInkSelectedByLasso(ink, polygon))
      .map((ink) => ink.objectId);
  }

  /** Move the selection by a scene-space delta (N14). One history entry. */
  moveSelection(
    ids: ReadonlySet<string>,
    dx: number,
    dy: number,
  ): ControllerResult {
    const edits: InkEdit[] = [];
    for (const ink of this.objects) {
      if (!ids.has(ink.objectId) || ink.deleted) {
        continue;
      }
      edits.push({
        kind: "set-transform",
        objectId: ink.objectId,
        transform: moveTransform(ink.transform, dx, dy),
      });
    }
    if (edits.length === 0) {
      return { ok: true, objects: this.objects };
    }
    const result = applyAll(this.objects, edits);
    if (!result.ok) {
      return result;
    }
    return this.commit("move-ink", result.objects);
  }

  /** Uniform scale around a fixed world anchor (N14). One history entry. */
  scaleSelection(
    ids: ReadonlySet<string>,
    factor: number,
    anchor: readonly [number, number],
  ): ControllerResult {
    if (!(factor > 0) || !Number.isFinite(factor)) {
      return { ok: false, error: "factor must be positive and finite" };
    }
    const edits: InkEdit[] = [];
    for (const ink of this.objects) {
      if (!ids.has(ink.objectId) || ink.deleted) {
        continue;
      }
      edits.push({
        kind: "set-transform",
        objectId: ink.objectId,
        transform: scaleTransform(ink.transform, factor, anchor),
      });
    }
    if (edits.length === 0) {
      return { ok: true, objects: this.objects };
    }
    const result = applyAll(this.objects, edits);
    if (!result.ok) {
      return result;
    }
    return this.commit("scale-ink", result.objects);
  }

  /**
   * Whole-object delete (N13/N15): the selected objects are marked
   * deleted — ONE history entry, one undo restores all. Resource
   * lifecycle (dropping their entries) happens at save time.
   */
  deleteSelection(ids: ReadonlySet<string>): ControllerResult {
    const edits: InkEdit[] = [];
    for (const ink of this.objects) {
      if (!ids.has(ink.objectId) || ink.deleted) {
        continue;
      }
      edits.push({ kind: "delete", objectId: ink.objectId });
    }
    if (edits.length === 0) {
      return { ok: true, objects: this.objects };
    }
    const result = applyAll(this.objects, edits);
    if (!result.ok) {
      return result;
    }
    return this.commit("delete-ink", result.objects);
  }

  /**
   * Eraser sweep (N15): every (non-deleted, non-duplicate) stroke touched
   * by the swept points is deleted — the whole sweep is ONE history entry,
   * one undo restores all. Points inside local-erase holes never hit.
   */
  eraseStrokeAt(points: [number, number][], radius = 4): ControllerResult {
    const hitIds = new Set<string>();
    for (const point of points) {
      for (const ink of this.objects) {
        if (!hitIds.has(ink.objectId) && isInkHitByEraser(ink, point, radius)) {
          hitIds.add(ink.objectId);
        }
      }
    }
    if (hitIds.size === 0) {
      return { ok: true, objects: this.objects };
    }
    const next = this.objects.map((ink) =>
      hitIds.has(ink.objectId) ? { ...ink, deleted: true } : ink,
    );
    return this.commit("erase-ink", next);
  }

  /**
   * One user action = one history entry: the entry captures the whole
   * before/after object lists (they are immutable copies), so undo/redo
   * restore state exactly — object ids, order and content hashes are
   * never touched by history traversal.
   */
  private commit(label: string, next: InkObject[]): ControllerResult {
    const before = this.objects;
    const after = next;
    this.objects = after;
    this.history.push({
      kind: "ink",
      label,
      undo: () => {
        this.objects = before;
        this.onChanged(this.objects, "undo");
      },
      redo: () => {
        this.objects = after;
        this.onChanged(this.objects, "redo");
      },
    });
    this.onChanged(this.objects, "commit");
    return { ok: true, objects: this.objects };
  }

  /**
   * Unified undo/redo (N17): delegates to THE document coordinator, so
   * graphics commands recorded between ink commands undo in the order
   * they happened. Returns what happened so the host can update UI.
   */
  undo(): { kind: "ink" | "graphics" | "empty" } {
    const entry = this.history.undo();
    return { kind: entry?.kind ?? "empty" };
  }

  redo(): { kind: "ink" | "graphics" | "empty" } {
    const entry = this.history.redo();
    return { kind: entry?.kind ?? "empty" };
  }

  /** Cancel/rollback helper: a new document state replaces everything,
   * including history (host drops pending pointer state). */
  reset(objects: InkObject[]): void {
    this.objects = objects;
    this.history.clear();
  }
}
