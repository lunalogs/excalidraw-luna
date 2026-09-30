import {
  LUNA_CANVAS_SCHEMA_VERSION,
  LUNA_CANVAS_TYPE,
  validateManifest,
  type LunaCanvasManifest,
} from "../lunacanvas/manifest";

const SHA = "a".repeat(64);

const validManifest = (): Record<string, unknown> => ({
  type: LUNA_CANVAS_TYPE,
  schemaVersion: LUNA_CANVAS_SCHEMA_VERSION,
  documentId: "doc-1",
  revision: 3,
  capabilities: ["ink", "graphics"],
  sceneRef: "scene/excalidraw.json",
  layerStrategy: "ink-above-graphics",
  inkObjects: [
    {
      objectId: "ink-1",
      nativeAssetRef: "ink/ink-1.drawing",
      previewRef: "previews/ink-1.png",
      hitGeometryRef: "hit/ink-1.json",
      worldTransform: [1, 0, 0, 1, 10, 20],
      order: 0,
      contentVersion: 1,
      contentHash: SHA,
    },
  ],
  resources: [
    { path: "ink/ink-1.drawing", sha256: SHA, byteSize: 128 },
    { path: "previews/ink-1.png", sha256: SHA, byteSize: 64 },
    { path: "hit/ink-1.json", sha256: SHA, byteSize: 32 },
    { path: "scene/excalidraw.json", sha256: SHA, byteSize: 256 },
  ],
});

describe("validateManifest (N11)", () => {
  it("accepts a valid manifest", () => {
    const result = validateManifest(validManifest());
    expect(result.ok).toBe(true);
    expect(result.manifest?.inkObjects).toHaveLength(1);
  });

  it("rejects unknown schema versions instead of coercing", () => {
    const result = validateManifest({
      ...validManifest(),
      schemaVersion: 999,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/schemaVersion/);
  });

  it("rejects duplicate objectIds", () => {
    const m = validManifest();
    const ink = m.inkObjects as Record<string, unknown>[];
    ink.push({ ...ink[0] });
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicate objectId/);
  });

  it("rejects absolute paths and network URLs in refs (N10/N11)", () => {
    for (const bad of [
      "/etc/passwd",
      "https://evil.example/x.drawing",
      "../escape.drawing",
    ]) {
      const m = validManifest();
      (m.inkObjects as Record<string, unknown>[])[0].nativeAssetRef = bad;
      const result = validateManifest(m);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects shear, non-uniform, negative-scale and non-finite transforms (SPEC 3.2)", () => {
    for (const t of [
      [1, 0.5, 0, 1, 0, 0], // shear
      [-1, 0, 0, 1, 0, 0], // negative scale
      [2, 0, 0, 1, 0, 0], // non-uniform (0027-R3)
      [-1, 0, 0, -1, 0, 0], // negative on both axes (0027-R3)
      [1, 0, 0, 1, NaN, 0], // non-finite
      [1, 0, 0, 1], // wrong length
    ]) {
      const m = validManifest();
      (m.inkObjects as Record<string, unknown>[])[0].worldTransform = t;
      expect(validateManifest(m).ok).toBe(false);
    }
  });

  it("accepts scale+translate transforms at any zoom anchor", () => {
    const m = validManifest();
    (m.inkObjects as Record<string, unknown>[])[0].worldTransform = [
      1.5, 0, 0, 1.5, -200.25, 88.5,
    ];
    expect(validateManifest(m).ok).toBe(true);
  });

  it("rejects malformed input without throwing", () => {
    for (const raw of [null, undefined, "x", 42, []]) {
      expect(validateManifest(raw).ok).toBe(false);
    }
  });

  it("rejects non-array and unknown capabilities (0027-R3)", () => {
    for (const caps of [42, "ink", ["ink", "telepathy"]]) {
      const m = validManifest();
      m.capabilities = caps;
      expect(validateManifest(m).ok).toBe(false);
    }
  });

  it("enforces resource table integrity: unique paths, sha256 format, positive integer sizes, ref existence", () => {
    const dup = validManifest();
    const res = dup.resources as Record<string, unknown>[];
    res.push({ ...res[0] });
    expect(validateManifest(dup).ok).toBe(false);

    const badHash = validManifest();
    (badHash.resources as Record<string, unknown>[])[0].sha256 = "abc";
    expect(validateManifest(badHash).ok).toBe(false);

    const badSize = validManifest();
    (badSize.resources as Record<string, unknown>[])[0].byteSize = -1;
    expect(validateManifest(badSize).ok).toBe(false);

    const missingRef = validManifest();
    (missingRef.resources as unknown[]).splice(0, 1); // drop ink/ink-1.drawing
    const r = validateManifest(missingRef);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/missing from resources/);
  });

  it("null ink entries return structured errors, never throw (0029-R3)", () => {
    const m = validManifest();
    (m.inkObjects as unknown[]).push(null);
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("not an object"))).toBe(true);
  });

  it("records split/replace identity relations (ADR-0002)", () => {
    const m = validManifest() as unknown as LunaCanvasManifest;
    m.inkObjects.push({
      ...m.inkObjects[0],
      objectId: "ink-2",
      splitFrom: "ink-1",
      contentVersion: 2,
    });
    expect(validateManifest(m).ok).toBe(true);
  });
});
