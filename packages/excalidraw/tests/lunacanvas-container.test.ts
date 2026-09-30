import {
  CONTAINER_LIMITS,
  isSafeContainerPath,
  validateContainer,
  validateContainerMetadata,
} from "../lunacanvas/container";
import { validateManifest } from "../lunacanvas/manifest";

import type { ContainerEntryMeta } from "../lunacanvas/container";

describe("container path rules (N11)", () => {
  it("accepts normalized container-relative paths", () => {
    for (const ok of [
      "manifest.json",
      "ink/a.drawing",
      "scene/excalidraw.json",
      "a-b_c.d/1.png",
    ]) {
      expect(isSafeContainerPath(ok)).toBe(true);
    }
  });
  it("rejects traversal, absolute, URL, drive, backslash, NUL", () => {
    for (const bad of [
      "../escape",
      "a/../../b",
      "/etc/passwd",
      "https://evil/x",
      "C:\\win",
      "a\\b",
      "a\0b",
      "",
    ]) {
      expect(isSafeContainerPath(bad)).toBe(false);
    }
  });
});

describe("container metadata budgets", () => {
  const entry = (path: string, size = 10): ContainerEntryMeta => ({
    path,
    uncompressedSize: size,
  });

  it("accepts a healthy archive", () => {
    const r = validateContainerMetadata([
      entry("manifest.json"),
      entry("ink/a.drawing"),
    ]);
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it("rejects duplicates and over-budget totals without reading payloads", () => {
    const dup = validateContainerMetadata([entry("a"), entry("a")]);
    expect(dup.ok).toBe(false);

    const huge = validateContainerMetadata([
      entry("a", CONTAINER_LIMITS.maxSingleEntryBytes + 1),
    ]);
    expect(huge.ok).toBe(false);

    const many = validateContainerMetadata(
      Array.from({ length: CONTAINER_LIMITS.maxEntries + 1 }, (_, i) =>
        entry(`f${i}`),
      ),
    );
    expect(many.ok).toBe(false);
  });
});

describe("validateContainer (full, in-memory source)", () => {
  const SHA = "a".repeat(64);
  const manifest = {
    type: "lunacanvas",
    schemaVersion: 1,
    documentId: "d1",
    revision: 1,
    capabilities: ["ink", "graphics"],
    sceneRef: "scene/excalidraw.json",
    layerStrategy: "ink-above-graphics",
    inkObjects: [
      {
        objectId: "ink-1",
        nativeAssetRef: "ink/ink-1.drawing",
        worldTransform: [1, 0, 0, 1, 0, 0],
        order: 0,
        contentVersion: 1,
        contentHash: SHA,
      },
    ],
    resources: [
      { path: "ink/ink-1.drawing", sha256: SHA, byteSize: 5 },
      { path: "scene/excalidraw.json", sha256: SHA, byteSize: 2 },
    ],
  };
  const scene = Buffer.from("{}");
  const ink = Buffer.from("bytes");

  const sourceOf = (
    files: Record<string, Buffer>,
    sizes?: Record<string, number>,
  ) => ({
    entries: Object.keys(files).map((path) => ({
      path,
      uncompressedSize: sizes?.[path] ?? files[path].length,
    })),
    readEntry: async (path: string) => new Uint8Array(files[path]),
  });

  it("validates manifest + resource hashes end to end", async () => {
    // scene "{}" hashes to a fixed value; compute real hashes instead of
    // hardcoding so this test proves consistency, not a fixed fixture
    const crypto = await import("crypto");
    const manifest2 = JSON.parse(JSON.stringify(manifest));
    manifest2.resources = [
      {
        path: "ink/ink-1.drawing",
        sha256: crypto.createHash("sha256").update(ink).digest("hex"),
        byteSize: ink.length,
      },
      {
        path: "scene/excalidraw.json",
        sha256: crypto.createHash("sha256").update(scene).digest("hex"),
        byteSize: scene.length,
      },
    ];
    const files = {
      "manifest.json": Buffer.from(JSON.stringify(manifest2)),
      "ink/ink-1.drawing": ink,
      "scene/excalidraw.json": scene,
    };
    const result = await validateContainer(sourceOf(files));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails on hash mismatch and keeps errors structured", async () => {
    const files = {
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "ink/ink-1.drawing": Buffer.from("tampered"),
      "scene/excalidraw.json": scene,
    };
    const result = await validateContainer(sourceOf(files));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/hash mismatch/);
  });

  it("fails on metadata budget violation before reading payloads", async () => {
    const files = {
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "ink/ink-1.drawing": ink,
      "scene/excalidraw.json": scene,
    };
    const sizes = {
      "manifest.json": files["manifest.json"].length,
      "ink/ink-1.drawing": CONTAINER_LIMITS.maxSingleEntryBytes + 1,
      "scene/excalidraw.json": 2,
    };
    const result = await validateContainer(sourceOf(files, sizes));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/too large/);
  });

  it("unknown top-level and inkObject fields survive validation (N09)", () => {
    const m = JSON.parse(JSON.stringify(manifest));
    m.futureExtension = { keep: "me" };
    m.inkObjects[0].futureInkField = [1, 2, 3];
    const result = validateManifest(m);
    expect(result.ok).toBe(true);
    expect(
      (result.manifest as unknown as Record<string, unknown>).futureExtension,
    ).toEqual({
      keep: "me",
    });
  });
});
