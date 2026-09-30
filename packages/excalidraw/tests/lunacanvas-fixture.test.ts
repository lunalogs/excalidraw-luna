/**
 * Cross-end fixture validation (W01): the Swift prototype exports a real
 * .lunacanvas container (env-gated Xcode test writes it to
 * docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas); this test
 * validates it with the TS contract — manifest rules plus real SHA-256
 * checks against the actual bytes inside the ZIP.
 *
 * Run order: xcodebuild test with LUNACANVAS_FIXTURE_OUT set → vitest.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

import JSZip from "jszip";

import { validateContainer } from "../lunacanvas/container";

const FIXTURE = path.resolve(
  __dirname,
  "../../../docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas",
);

(!existsSync(FIXTURE) ? describe.skip : describe)(
  "Swift-exported fixture passes the TS contract (cross-end)",
  () => {
    it("passes the full TS container validator (envelope + manifest + hashes)", async () => {
      const data = readFileSync(FIXTURE);
      const zip = await JSZip.loadAsync(data);
      const source = {
        entries: Object.values(zip.files)
          .filter((f) => !f.dir)
          .map((f: any) => ({
            path: f.name,
            uncompressedSize: f._data.uncompressedSize as number,
          })),
        readEntry: async (path: string) =>
          new Uint8Array(await zip.file(path)!.async("nodebuffer")),
      };
      const result = await validateContainer(source);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);

      const manifest = result.manifest as {
        sceneRef: string;
        inkObjects: { worldTransform: number[] }[];
      };
      const scene = JSON.parse(
        new TextDecoder().decode(await source.readEntry(manifest.sceneRef)),
      );
      expect(scene.type).toBe("excalidraw");
      expect(manifest.inkObjects).toHaveLength(1);
      expect(manifest.inkObjects[0].worldTransform[0]).toBeCloseTo(1.5);
    });
  },
);
