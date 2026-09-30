// 0047-R5: ONE ordered document command stack (SPEC N17).
// Codex's independent diagnostic (0044): ink move → graphics add → undo
// undid the INK first because the controller preferred its own stack.
// These probes are formal tests of the interleaving contract.

import { DocumentHistory } from "../lunacanvas/documentHistory";
import { InkEditingController } from "../lunacanvas/inkEditing";

import type { InkHitGeometry, InkObject } from "../lunacanvas/inkModel";

const hit = (overrides: Partial<InkHitGeometry> = {}): InkHitGeometry => ({
  bounds: [0, 0, 100, 10],
  width: 6,
  path: [
    [0, 5],
    [100, 5],
  ],
  hasMask: false,
  ...overrides,
});

const makeInk = (x: number, overrides: Partial<InkObject> = {}): InkObject => ({
  objectId: `ink-${x}`,
  transform: [1, 0, 0, 1, x, 0],
  order: 0,
  contentHash: "a".repeat(64),
  contentVersion: 1,
  hit: hit(),
  previewUrl: null,
  deleted: false,
  ...overrides,
});

describe("0047-R5 unified document history", () => {
  it("ink move -> graphics add -> undo undoes the GRAPHICS first (0044 probe)", () => {
    const ink = makeInk(0);
    const controller = new InkEditingController([ink]);
    controller.moveSelection(new Set([ink.objectId]), 10, 0);

    const events: string[] = [];
    controller.recordGraphics(
      "add-rect",
      () => events.push("undo-graphics"),
      () => events.push("redo-graphics"),
    );
    expect(controller.getHistoryDepth().undo).toBe(2);

    expect(controller.undo()).toEqual({ kind: "graphics" });
    expect(events).toEqual(["undo-graphics"]);
    // the ink move is still applied
    expect(controller.getObjects()[0].transform[4]).toBe(10);

    expect(controller.undo()).toEqual({ kind: "ink" });
    expect(controller.getObjects()[0].transform[4]).toBe(0);
  });

  it("mixed interleaving: ink -> graphics -> ink, continuous undo/redo in exact reverse order", () => {
    const a = makeInk(0);
    const b = makeInk(300);
    const controller = new InkEditingController([a, b]);
    const events: string[] = [];

    controller.moveSelection(new Set([a.objectId]), 10, 0); // 1 ink
    controller.recordGraphics(
      "rect",
      () => events.push("g1-undo"),
      () => events.push("g1-redo"),
    ); // 2 graphics
    controller.eraseStrokeAt([[300, 5]], 4); // 3 ink (deletes b)
    controller.recordGraphics(
      "text",
      () => events.push("g2-undo"),
      () => events.push("g2-redo"),
    ); // 4 graphics

    expect(controller.getHistoryDepth()).toEqual({ undo: 4, redo: 0 });
    expect(controller.getObjects()[1].deleted).toBe(true);

    // full undo walk: exact reverse chronological order
    expect(controller.undo()).toEqual({ kind: "graphics" });
    expect(controller.undo()).toEqual({ kind: "ink" });
    expect(controller.getObjects()[1].deleted).toBe(false);
    expect(controller.undo()).toEqual({ kind: "graphics" });
    expect(controller.undo()).toEqual({ kind: "ink" });
    expect(controller.getHistoryDepth()).toEqual({ undo: 0, redo: 4 });

    // full redo walk mirrors it
    expect(controller.redo()).toEqual({ kind: "ink" });
    expect(controller.redo()).toEqual({ kind: "graphics" });
    expect(controller.redo()).toEqual({ kind: "ink" });
    expect(controller.getObjects()[1].deleted).toBe(true);
    expect(controller.redo()).toEqual({ kind: "graphics" });
    expect(controller.getHistoryDepth()).toEqual({ undo: 4, redo: 0 });
    expect(events).toEqual(["g2-undo", "g1-undo", "g1-redo", "g2-redo"]);
  });

  it("a new command invalidates the redo branch (standard semantics)", () => {
    const ink = makeInk(0);
    const controller = new InkEditingController([ink]);
    controller.moveSelection(new Set([ink.objectId]), 10, 0);
    controller.undo();
    expect(controller.getHistoryDepth().redo).toBe(1);
    controller.moveSelection(new Set([ink.objectId]), 5, 0);
    expect(controller.getHistoryDepth()).toEqual({ undo: 1, redo: 0 });
  });

  it("onChanged reports commit/undo/redo for host sync", () => {
    const ink = makeInk(0);
    const causes: string[] = [];
    const controller = new InkEditingController(
      [ink],
      new DocumentHistory(),
      (_o, cause) => causes.push(cause),
    );
    controller.moveSelection(new Set([ink.objectId]), 10, 0);
    controller.undo();
    controller.redo();
    expect(causes).toEqual(["commit", "undo", "redo"]);
  });
});
