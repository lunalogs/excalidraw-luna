import { InkEditingController } from "../lunacanvas/inkEditing";

import type { InkObject } from "../lunacanvas/inkModel";

let seq = 0;
const makeInk = (x: number, overrides: Partial<InkObject> = {}): InkObject => ({
  objectId: `ink-${seq++}`,
  transform: [1, 0, 0, 1, x, 0],
  order: seq,
  contentHash: `${seq}`.repeat(64).slice(0, 64),
  contentVersion: 1,
  hit: {
    bounds: [0, 0, 100, 10],
    width: 6,
    path: [
      [0, 5],
      [100, 5],
    ],
    hasMask: false,
    ...overrides.hit,
  },
  previewUrl: null,
  deleted: false,
  ...overrides,
});

describe("InkEditingController (W06)", () => {
  it("lasso selection returns whole strokes and move is one history entry", () => {
    const a = makeInk(0);
    const b = makeInk(300);
    const c = makeInk(0, {
      hit: {
        bounds: [0, 100, 100, 10],
        width: 6,
        path: [
          [0, 105],
          [100, 105],
        ],
        hasMask: false,
      },
    });
    const controller = new InkEditingController([a, b, c]);

    const ids = controller.selectByLasso([
      [-10, -10],
      [150, -10],
      [150, 130],
      [-10, 130],
    ]);
    expect(new Set(ids)).toEqual(new Set([a.objectId, c.objectId]));

    const moved = controller.moveSelection(new Set(ids), 40, -20);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      const byId = new Map(moved.objects.map((o) => [o.objectId, o]));
      expect(byId.get(a.objectId)!.transform[4]).toBe(40);
      expect(byId.get(c.objectId)!.transform[5]).toBe(-20);
      expect(byId.get(b.objectId)!.transform[4]).toBe(300); // untouched
    }
    expect(controller.getHistoryDepth().undo).toBe(1);

    // undo restores both transforms in one step
    controller.undo();
    const restored = controller.getObjects();
    expect(restored.find((o) => o.objectId === a.objectId)!.transform[4]).toBe(
      0,
    );
    expect(restored.find((o) => o.objectId === c.objectId)!.transform[5]).toBe(
      0,
    );
  });

  it("scales uniformly around a fixed anchor", () => {
    const a = makeInk(100);
    const controller = new InkEditingController([a]);
    const result = controller.scaleSelection(
      new Set([a.objectId]),
      1.5,
      [0, 0],
    );
    expect(result.ok).toBe(true);
    const scaled = controller.getObjects()[0];
    expect(scaled.transform[0]).toBeCloseTo(1.5);
    expect(scaled.transform[4]).toBeCloseTo(150); // 100*1.5 anchored at origin
    expect(scaled.contentHash).toBe(a.contentHash); // bytes untouched (N08)
  });

  it("rejects negative/non-finite scale factors", () => {
    const a = makeInk(0);
    const controller = new InkEditingController([a]);
    expect(
      controller.scaleSelection(new Set([a.objectId]), -1, [0, 0]),
    ).toHaveProperty("error");
    expect(
      controller.scaleSelection(new Set([a.objectId]), NaN, [0, 0]),
    ).toHaveProperty("error");
  });

  it("eraser sweep over multiple strokes is one transaction, one undo restores all", () => {
    const a = makeInk(0);
    const b = makeInk(0, { transform: [1, 0, 0, 1, 0, 100] });
    const controller = new InkEditingController([a, b]);

    const sweep: [number, number][] = [
      [10, 5],
      [50, 5],
      [10, 105],
      [50, 105],
    ];
    const erased = controller.eraseStrokeAt(sweep, 4);
    expect(erased.ok).toBe(true);
    expect(controller.getObjects().every((o) => o.deleted)).toBe(true);
    expect(controller.getHistoryDepth().undo).toBe(1);

    controller.undo();
    expect(controller.getObjects().every((o) => !o.deleted)).toBe(true);
    expect(controller.getHistoryDepth().undo).toBe(0);

    controller.redo();
    expect(controller.getObjects().every((o) => o.deleted)).toBe(true);
  });

  it("eraser points inside local-erase holes never delete (N15)", () => {
    const a = makeInk(0, {
      hit: {
        bounds: [0, 0, 100, 10],
        width: 6,
        path: [
          [0, 5],
          [100, 5],
        ],
        hasMask: true,
        maskBounds: [0, 0, 100, 10],
      },
    });
    const controller = new InkEditingController([a]);
    controller.eraseStrokeAt([[50, 5]], 0);
    expect(controller.getObjects()[0].deleted).toBe(false);
  });

  it("undo delegates to the host graphics stack when ink history is empty (N17 facade)", () => {
    let graphicsUndos = 0;
    let graphicsRedos = 0;
    const controller = new InkEditingController(
      [],
      () => graphicsUndos++,
      () => graphicsRedos++,
    );
    expect(controller.undo()).toEqual({ kind: "graphics" });
    expect(graphicsUndos).toBe(1);
    expect(controller.redo()).toEqual({ kind: "graphics" });
    expect(graphicsRedos).toBe(1);
  });

  it("cancel/rollback: reset drops in-flight state and history (N17)", () => {
    const a = makeInk(0);
    const controller = new InkEditingController([a]);
    controller.moveSelection(new Set([a.objectId]), 10, 0);
    controller.reset([a]);
    expect(controller.getHistoryDepth()).toEqual({ undo: 0, redo: 0 });
    expect(controller.getObjects()[0].transform[4]).toBe(0);
  });
});
