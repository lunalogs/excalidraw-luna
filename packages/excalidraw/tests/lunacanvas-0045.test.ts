// 0045-R2 (web side): container refs are owned by the document, not by
// objectId naming rules. parse -> web edit -> serialize must write the
// ORIGINAL refs back verbatim, otherwise a legal document using e.g.
// `ink/asset-v2-x.drawing` would serialize into non-existent entries
// (Codex 0044 independent diagnostic).

import {
  applyInkEdit,
  parseInkObject,
  serializeInkObject,
  type InkHitGeometry,
  type ManifestInkObject,
} from "../lunacanvas/inkModel";
import { validateManifest } from "../lunacanvas/manifest";

const hit: InkHitGeometry = {
  bounds: [0, 0, 100, 10],
  width: 6,
  path: [
    [0, 5],
    [50, 5],
    [100, 5],
  ],
  hasMask: false,
};

const assetV2Entry: ManifestInkObject = {
  objectId: "ink-42",
  // legal, container-managed resource names — NOT derived from objectId
  nativeAssetRef: "ink/asset-v2-7f3a.drawing",
  previewRef: "cache/previews/p-7f3a.png",
  hitGeometryRef: "derived/hit/h-7f3a.json",
  worldTransform: [1, 0, 0, 1, 0, 0],
  order: 0,
  contentVersion: 1,
  contentHash: "c".repeat(64),
};

describe("0045-R2 container refs are preserved verbatim", () => {
  it("parse -> serialize keeps non-objectId refs unchanged", () => {
    const model = parseInkObject(assetV2Entry, hit, "blob:preview");
    expect(model.assetRef).toBe("ink/asset-v2-7f3a.drawing");
    expect(model.previewRef).toBe("cache/previews/p-7f3a.png");
    expect(model.hitRef).toBe("derived/hit/h-7f3a.json");
    expect(serializeInkObject(model)).toEqual(assetV2Entry);
  });

  it("web edits (move) never rewrite the refs", () => {
    const model = parseInkObject(assetV2Entry, hit, "blob:preview");
    const moved = applyInkEdit([model], {
      kind: "set-transform",
      objectId: "ink-42",
      transform: [2, 0, 0, 2, 100, -40],
    });
    if (!Array.isArray(moved)) {
      throw new Error(`unexpected edit failure: ${moved.error}`);
    }
    const back = serializeInkObject(moved[0]);
    expect(back.nativeAssetRef).toBe("ink/asset-v2-7f3a.drawing");
    expect(back.previewRef).toBe("cache/previews/p-7f3a.png");
    expect(back.hitGeometryRef).toBe("derived/hit/h-7f3a.json");
    expect(back.worldTransform).toEqual([2, 0, 0, 2, 100, -40]);
  });

  it("explicitly-absent optional refs stay absent (never fabricated)", () => {
    const entry: ManifestInkObject = {
      objectId: "ink-7",
      nativeAssetRef: "ink/asset-v2-7.drawing",
      worldTransform: [1, 0, 0, 1, 0, 0],
      order: 1,
      contentVersion: 1,
      contentHash: "d".repeat(64),
    };
    const model = parseInkObject(entry, hit, null);
    expect(model.previewRef).toBeNull();
    const back = serializeInkObject(model);
    expect(back).toEqual(entry);
  });

  it("a manifest with non-objectId resource names validates", () => {
    const manifest = {
      type: "lunacanvas",
      schemaVersion: 1,
      documentId: "doc-1",
      revision: 0,
      capabilities: ["ink", "graphics"],
      layerStrategy: "ink-above-graphics",
      sceneRef: "scene/excalidraw.json",
      inkObjects: [assetV2Entry],
      resources: [
        { path: "scene/excalidraw.json", sha256: "e".repeat(64), byteSize: 10 },
        {
          path: "ink/asset-v2-7f3a.drawing",
          sha256: "c".repeat(64),
          byteSize: 100,
        },
        {
          path: "cache/previews/p-7f3a.png",
          sha256: "f".repeat(64),
          byteSize: 50,
        },
        {
          path: "derived/hit/h-7f3a.json",
          sha256: "a".repeat(64),
          byteSize: 20,
        },
      ],
    };
    const result = validateManifest(manifest);
    expect(result.ok).toBe(true);
  });
});
