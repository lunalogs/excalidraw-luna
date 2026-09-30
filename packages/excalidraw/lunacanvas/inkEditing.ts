/**
 * Hybrid editing controller + unified history (W06, N14/N15/N17).
 *
 * Model-level operations: lasso selection, move/scale around a fixed
 * anchor, whole-stroke eraser sweeps (one history entry per sweep),
 * multi-object delete, undo/redo across ink commands — interleaved with
 * graphics markers so the host can route graphics undo to its own stack
 * through ONE facade entry (SPEC N17).
 */

import {
  applyInkEdit,
  isInkHitByEraser,
  isInkSelectedByLasso,
  type InkEdit,
  type InkObject,
  type WorldTransform,
} from "./inkModel";

export interface InkCommand {
  label: string;
  /** inverse edits, applied in order on undo (delete sweeps use hitIds) */
  undo: InkEdit[];
  /** forward edits, applied in order on redo */
  redo: InkEdit[];
  /** eraser-sweep marker: the set of ids whose deleted flag flips */
  hitIds?: Set<string>;
}

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
  private undoStack: InkCommand[] = [];
  private redoStack: InkCommand[] = [];

  constructor(
    private objects: InkObject[],
    /** graphics-state undo/redo owned by the host (excalidraw) */
    private graphicsUndo: () => void = () => {},
    private graphicsRedo: () => void = () => {},
  ) {}

  getObjects(): readonly InkObject[] {
    return this.objects;
  }

  getHistoryDepth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
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
    const undo: InkEdit[] = [];
    for (const ink of this.objects) {
      if (!ids.has(ink.objectId) || ink.deleted) {
        continue;
      }
      edits.push({
        kind: "set-transform",
        objectId: ink.objectId,
        transform: moveTransform(ink.transform, dx, dy),
      });
      undo.push({
        kind: "set-transform",
        objectId: ink.objectId,
        transform: ink.transform,
      });
    }
    return this.commit({ label: "move-ink", undo, redo: edits });
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
    const undo: InkEdit[] = [];
    for (const ink of this.objects) {
      if (!ids.has(ink.objectId) || ink.deleted) {
        continue;
      }
      edits.push({
        kind: "set-transform",
        objectId: ink.objectId,
        transform: scaleTransform(ink.transform, factor, anchor),
      });
      undo.push({
        kind: "set-transform",
        objectId: ink.objectId,
        transform: ink.transform,
      });
    }
    return this.commit({ label: "scale-ink", undo, redo: edits });
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
    this.objects = next;
    // the command carries the hit set; undo/redo flip deleted directly so
    // object ids, order and content hashes are never touched
    const command: InkCommand & { hitIds: Set<string> } = {
      label: "erase-ink",
      undo: [],
      redo: [],
      hitIds,
    };
    this.undoStack.push(command);
    this.redoStack = [];
    return { ok: true, objects: this.objects };
  }

  private commit(command: InkCommand): ControllerResult {
    const result = applyAll(this.objects, command.redo);
    if (!result.ok) {
      return result;
    }
    this.objects = result.objects;
    this.undoStack.push(command);
    this.redoStack = [];
    return { ok: true, objects: this.objects };
  }

  /**
   * Unified undo/redo (N17): ink commands reverse through this controller;
   * a graphics marker means "delegate to the host graphics history".
   * Returns what happened so the host can update selection/UI.
   */
  undo(): { kind: "ink" | "graphics" | "empty" } {
    const command = this.undoStack.pop();
    if (!command) {
      this.graphicsUndo();
      return { kind: "graphics" };
    }
    if (command.hitIds) {
      this.objects = this.objects.map((ink) =>
        command.hitIds!.has(ink.objectId) ? { ...ink, deleted: false } : ink,
      );
    } else {
      const result = applyAll(this.objects, [...command.undo].reverse());
      if (result.ok) {
        this.objects = result.objects;
      }
    }
    this.redoStack.push(command);
    return { kind: "ink" };
  }

  redo(): { kind: "ink" | "graphics" | "empty" } {
    const command = this.redoStack.pop();
    if (!command) {
      this.graphicsRedo();
      return { kind: "graphics" };
    }
    if (command.hitIds) {
      this.objects = this.objects.map((ink) =>
        command.hitIds!.has(ink.objectId) ? { ...ink, deleted: true } : ink,
      );
    } else {
      const result = applyAll(this.objects, command.redo);
      if (result.ok) {
        this.objects = result.objects;
      }
    }
    this.undoStack.push(command);
    return { kind: "ink" };
  }

  /** Cancel/rollback helper: current in-flight transaction aborts without
   * touching history (host drops pending pointer state). */
  reset(objects: InkObject[]): void {
    this.objects = objects;
    this.undoStack = [];
    this.redoStack = [];
  }
}
