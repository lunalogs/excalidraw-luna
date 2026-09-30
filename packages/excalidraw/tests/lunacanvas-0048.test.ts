// 0048-R6: the container validator must run in a real browser — no
// node:crypto, no stub-provided metadata. openLunacanvasContainer reads a
// REAL ZIP (jszip, browser-compatible), enforces budgets from central-
// directory metadata AND on the actual decompressed bytes, and hashes via
// Web Crypto (Node fallback only when subtle is absent).

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "fs";
import path from "path";

import JSZip from "jszip";

import { defaultHashBytes, validateContainer } from "../lunacanvas/container";
import { openLunacanvasContainer } from "../lunacanvas/zipContainer";

const FIXTURE = path.resolve(
  __dirname,
  "../../../docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas",
);

describe("0048-R6 browser-safe hashing", () => {
  it("default hash matches node:crypto SHA-256 (whichever path runs here)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(await defaultHashBytes(bytes)).toBe(expected);
  });

  it("validateContainer accepts an injected hash (no ambient crypto needed)", async () => {
    const data = readFileSync(FIXTURE);
    const zip = await JSZip.loadAsync(data);
    const source = {
      entries: Object.values(zip.files)
        .filter((f) => !f.dir)
        .map((f: { name: string }) => ({ path: f.name, uncompressedSize: 1 })),
      readEntry: async (p: string) =>
        new Uint8Array(await zip.file(p)!.async("nodebuffer")),
    };
    // metadata sizes intentionally wrong here; the byte+hash pass is what
    // matters — per-resource byteSize comes from the MANIFEST, not entries
    const result = await validateContainer(source, {
      hashBytes: async (b) => createHash("sha256").update(b).digest("hex"),
    });
    expect(result.ok).toBe(true);
  });
});

(!existsSync(FIXTURE) ? describe.skip : describe)(
  "0048-R6 real-ZIP adapter (Swift-written fixture)",
  () => {
    it("openLunacanvasContainer validates the real archive end-to-end", async () => {
      const data = readFileSync(FIXTURE);
      const opened = await openLunacanvasContainer(data);
      expect(opened.errors).toEqual([]);
      expect(opened.ok).toBe(true);
      const manifest = opened.manifest as { sceneRef: string };
      const scene = JSON.parse(
        new TextDecoder().decode(await opened.readEntry(manifest.sceneRef)),
      );
      expect(scene.type).toBe("excalidraw");
    });

    it("a tampered resource fails hash validation and keeps errors visible", async () => {
      const data = readFileSync(FIXTURE);
      const zip = await JSZip.loadAsync(data);
      const drawingEntry = Object.keys(zip.files).find((k) =>
        k.startsWith("ink/"),
      )!;
      // same byte length as the original so the manifest's byteSize still
      // matches — only the hash can catch this
      const original = await zip.file(drawingEntry)!.async("uint8array");
      zip.file(drawingEntry, new Uint8Array(original.length).fill(65));
      const tampered = await zip.generateAsync({ type: "uint8array" });
      const opened = await openLunacanvasContainer(tampered);
      expect(opened.ok).toBe(false);
      expect(opened.errors.some((e) => e.includes("hash mismatch"))).toBe(true);
    });

    it("non-ZIP input returns a structured error, never throws", async () => {
      const opened = await openLunacanvasContainer(
        new Uint8Array([0, 1, 2, 3, 4, 5]),
      );
      expect(opened.ok).toBe(false);
      expect(opened.errors).toEqual(["not a readable ZIP archive"]);
    });

    it("path-traversal entries are rejected at the validator (jszip sanitizes on write; foreign archives can still carry them)", async () => {
      const manifest = {
        type: "lunacanvas",
        schemaVersion: 1,
        documentId: "d",
        revision: 0,
        capabilities: ["ink"],
        layerStrategy: "ink-above-graphics",
        sceneRef: "scene/excalidraw.json",
        inkObjects: [],
        resources: [
          {
            path: "scene/excalidraw.json",
            sha256: "e".repeat(64),
            byteSize: 2,
          },
        ],
      };
      const source = {
        entries: [
          { path: "manifest.json", uncompressedSize: 10 },
          { path: "scene/excalidraw.json", uncompressedSize: 2 },
          { path: "../evil.txt", uncompressedSize: 1 },
        ],
        readEntry: async (p: string) => {
          if (p === "manifest.json") {
            return new Uint8Array(Buffer.from(JSON.stringify(manifest)));
          }
          return new Uint8Array(Buffer.from("{}"));
        },
      };
      const result = await validateContainer(source);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("unsafe entry path"))).toBe(
        true,
      );
    });
  },
);
