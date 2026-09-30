import {
  applyInkEdit,
  isInkHitByEraser,
  isInkSelectedByLasso,
  isWritableTransform,
  parseInkObject,
  serializeInkObject,
  type InkHitGeometry,
  type InkObject,
  type ManifestInkObject,
} from "../lunacanvas/inkModel";

const hit = (overrides: Partial<InkHitGeometry> = {}): InkHitGeometry => ({
  bounds: [0, 0, 100, 10],
  width: 6,
  path: [
    [0, 5],
    [50, 5],
    [100, 5],
  ],
  hasMask: false,
  ...overrides,
});

const makeInk = (overrides: Partial<InkObject> = {}): InkObject => ({
  objectId: "ink-1",
  transform: [1, 0, 0, 1, 0, 0],
  order: 0,
  contentHash: "a".repeat(64),
  contentVersion: 1,
  hit: hit(),
  previewUrl: null,
  deleted: false,
  ...overrides,
});

describe("ink edit rules (N08)", () => {
  it("allows move/scale/delete/order and preserves drawing-untouched fields", () => {
    const ink = makeInk();
    const moved = applyInkEdit([ink], {
      kind: "set-transform",
      objectId: "ink-1",
      transform: [2, 0, 0, 2, 100, -40],
    });
    expect(Array.isArray(moved)).toBe(true);
    if (Array.isArray(moved)) {
      expect(moved[0].transform).toEqual([2, 0, 0, 2, 100, -40]);
      expect(moved[0].contentHash).toBe(ink.contentHash);
    }

    const deleted = applyInkEdit([ink], { kind: "delete", objectId: "ink-1" });
    expect(Array.isArray(deleted) && deleted[0].deleted).toBe(true);

    const unknown = applyInkEdit([ink], {
      kind: "delete",
      objectId: "nope",
    });
    expect(unknown).toHaveProperty("error");
  });

  it("rejects non-uniform / negative / shear transforms on the web too", () => {
    const ink = makeInk();
    for (const bad of [
      [2, 0, 0, 1, 0, 0],
      [-1, 0, 0, 1, 0, 0],
      [1, 0.4, 0, 1, 0, 0],
    ] as const) {
      const result = applyInkEdit([ink], {
        kind: "set-transform",
        objectId: "ink-1",
        transform: bad,
      });
      expect(result).toHaveProperty("error");
    }
    expect(isWritableTransform([1.5, 0, 0, 1.5, 0, 0])).toBe(true);
  });
});

describe("eraser hit (N15)", () => {
  it("hits the stroke capsule within width+radius, misses far away", () => {
    const ink = makeInk(); // horizontal line y=5, half-width 3
    expect(isInkHitByEraser(ink, [50, 7.9], 0)).toBe(true);
    expect(isInkHitByEraser(ink, [50, 20], 0)).toBe(false);
    expect(isInkHitByEraser(ink, [50, 20], 12)).toBe(true); // disc reaches
  });

  it("scales hit width with the transform", () => {
    const ink = makeInk({ transform: [2, 0, 0, 2, 0, 0] }); // half-width 6
    expect(isInkHitByEraser(ink, [100, 11.9], 0)).toBe(true);
    expect(isInkHitByEraser(ink, [100, 17.5], 0)).toBe(false);
  });

  it("a point inside the local-erase mask hole does not erase (N15)", () => {
    const ink = makeInk({
      hit: hit({
        hasMask: true,
        maskBounds: [40, 0, 20, 10], // hole region over the line
      }),
    });
    expect(isInkHitByEraser(ink, [50, 5], 0)).toBe(false);
    expect(isInkHitByEraser(ink, [10, 5], 0)).toBe(true);
  });

  it("deleted ink is never hit", () => {
    expect(isInkHitByEraser(makeInk({ deleted: true }), [50, 5], 0)).toBe(
      false,
    );
  });
});

describe("lasso selection (N13)", () => {
  it("selects whole stroke when the lasso crosses it or contains it", () => {
    const ink = makeInk();
    // crossing polygon
    expect(
      isInkSelectedByLasso(ink, [
        [40, -20],
        [60, -20],
        [60, 30],
        [40, 30],
      ]),
    ).toBe(true);
    // fully contained
    expect(
      isInkSelectedByLasso(ink, [
        [-10, -10],
        [110, -10],
        [110, 20],
        [-10, 20],
      ]),
    ).toBe(true);
    // disjoint
    expect(
      isInkSelectedByLasso(ink, [
        [200, 0],
        [300, 0],
        [300, 10],
        [200, 10],
      ]),
    ).toBe(false);
  });

  it("transformed ink is selected in world coordinates", () => {
    const ink = makeInk({ transform: [1, 0, 0, 1, 500, 0] });
    expect(
      isInkSelectedByLasso(ink, [
        [540, -5],
        [560, -5],
        [560, 15],
        [540, 15],
      ]),
    ).toBe(true);
  });
});

describe("serialization", () => {
  it("manifest entry -> model -> manifest entry round-trips refs and transform", () => {
    const entry: ManifestInkObject = {
      objectId: "ink-9",
      nativeAssetRef: "ink/ink-9.drawing",
      previewRef: "previews/ink-9.png",
      hitGeometryRef: "hit/ink-9.json",
      worldTransform: [1.5, 0, 0, 1.5, -20, 40],
      order: 3,
      contentVersion: 2,
      contentHash: "b".repeat(64),
      splitFrom: "ink-8",
    };
    const model = parseInkObject(entry, hit(), "blob:preview");
    expect(model.previewUrl).toBe("blob:preview");
    expect(model.transform[0]).toBe(1.5);
    const back = serializeInkObject(model);
    expect(back).toEqual(entry);
  });
});
