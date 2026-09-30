/**
 * Web-side .lunacanvas document open/save for the editor host (0049-R1).
 *
 * OPEN: validate the real ZIP (0048 adapter), parse the manifest into
 * runtime InkObjects (hit geometry from the hit JSON entries, previews as
 * blob URLs in browsers), and hand the host the parsed scene JSON.
 *
 * SAVE: regenerate the container from the ORIGINAL entries — untouched
 * resource bytes are copied verbatim (N08), the scene JSON is replaced by
 * the editor's current scene, deleted ink objects drop out of the manifest
 * together with their exclusive entries (resource lifecycle follows the
 * delete transaction), and unknown manifest/inkObject extensions survive.
 */

import JSZip from "jszip";

import { defaultHashBytes } from "./container";
import { openLunacanvasContainer } from "./zipContainer";
import {
  parseInkObject,
  serializeInkObject,
  type InkHitGeometry,
  type InkObject,
} from "./inkModel";
import {
  LUNA_CANVAS_SCHEMA_VERSION,
  LUNA_CANVAS_TYPE,
  type LunaCanvasManifest,
} from "./manifest";

export interface OpenedLunacanvasDocument {
  ok: true;
  documentId: string;
  revision: number;
  manifest: LunaCanvasManifest;
  /** raw manifest for unknown-field preservation */
  manifestRaw: Record<string, unknown>;
  scene: Record<string, unknown>;
  objects: InkObject[];
  /** read any container entry (scene files, foreign resources) */
  readEntry: (path: string) => Promise<Uint8Array>;
  /** entries not consumed by the ink model (foreign resources etc.) */
  preservedEntries: { path: string; data: Uint8Array }[];
}

export type OpenLunacanvasResult =
  | OpenedLunacanvasDocument
  | { ok: false; errors: string[] };

export const openLunacanvasDocument = async (
  data: ArrayBuffer | Uint8Array,
): Promise<OpenLunacanvasResult> => {
  const opened = await openLunacanvasContainer(data);
  if (!opened.ok || !opened.manifest) {
    return { ok: false, errors: opened.errors };
  }
  const manifest = opened.manifest as LunaCanvasManifest;
  const manifestRaw = opened.manifest as unknown as Record<string, unknown>;

  const scene = JSON.parse(
    new TextDecoder().decode(await opened.readEntry(manifest.sceneRef)),
  ) as Record<string, unknown>;

  const objects: InkObject[] = [];
  for (const entry of manifest.inkObjects) {
    const hitBytes = entry.hitGeometryRef
      ? await opened.readEntry(entry.hitGeometryRef)
      : null;
    const hit = (
      hitBytes ? JSON.parse(new TextDecoder().decode(hitBytes)) : null
    ) as (InkHitGeometry & { type?: string }) | null;
    let previewUrl: string | null = null;
    if (
      entry.previewRef &&
      typeof URL !== "undefined" &&
      URL.createObjectURL
    ) {
      const previewBytes = await opened.readEntry(entry.previewRef);
      previewUrl = URL.createObjectURL(
        new Blob([
          previewBytes.buffer.slice(
            previewBytes.byteOffset,
            previewBytes.byteOffset + previewBytes.byteLength,
          ) as ArrayBuffer,
        ]),
      );
    }
    objects.push(
      parseInkObject(
        entry,
        hit
          ? {
              bounds: hit.bounds,
              width: hit.width,
              path: hit.path,
              hasMask: hit.hasMask,
              maskBounds: hit.maskBounds,
            }
          : {
              bounds: [0, 0, 1, 1],
              width: 1,
              path: [
                [0, 0],
                [1, 1],
              ],
              hasMask: false,
            },
        previewUrl,
      ),
    );
  }

  // entries the ink model does not consume — carried through save
  const owned = new Set<string>([
    "manifest.json",
    manifest.sceneRef,
    ...manifest.inkObjects.flatMap((o) =>
      [o.nativeAssetRef, o.previewRef, o.hitGeometryRef].filter(
        (r): r is string => typeof r === "string",
      ),
    ),
  ]);
  const preservedEntries: { path: string; data: Uint8Array }[] = [];
  for (const resource of manifest.resources) {
    if (!owned.has(resource.path)) {
      preservedEntries.push({
        path: resource.path,
        data: await opened.readEntry(resource.path),
      });
    }
  }

  return {
    ok: true,
    documentId: manifest.documentId,
    revision: manifest.revision,
    manifest,
    manifestRaw,
    scene,
    objects,
    readEntry: opened.readEntry,
    preservedEntries,
  };
};

export interface SaveLunacanvasInput {
  documentId: string;
  revision: number;
  /** the editor's current excalidraw scene (will be serialized) */
  scene: Record<string, unknown>;
  /** runtime ink objects (transforms/orders/deleted applied) */
  objects: readonly InkObject[];
  /** original container entries — untouched bytes are copied verbatim */
  originalEntries: Record<string, Uint8Array>;
  /** unknown top-level manifest fields to preserve */
  manifestExtras?: Record<string, unknown>;
  /** the original manifest's resources table (for copied entries) */
  originalResources: { path: string; sha256: string; byteSize: number }[];
}

const encoder = new TextEncoder();

export const saveLunacanvasDocument = async (
  input: SaveLunacanvasInput,
): Promise<Uint8Array> => {
  const zip = new JSZip();
  const resourceTable: { path: string; sha256: string; byteSize: number }[] =
    [];
  const usedPaths = new Set<string>();

  const addEntry = async (path: string, bytes: Uint8Array) => {
    usedPaths.add(path);
    // jszip's node build wants Buffer (Uint8Array/ArrayBuffer fall afoul
    // of cross-realm checks in some test environments); browsers accept
    // ArrayBuffer. Pick per environment.
    if (typeof Buffer !== "undefined") {
      zip.file(path, Buffer.from(bytes));
    } else {
      zip.file(
        path,
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
    }
    resourceTable.push({
      path,
      sha256: await defaultHashBytes(bytes),
      byteSize: bytes.byteLength,
    });
  };

  // scene
  await addEntry(
    "scene/excalidraw.json",
    encoder.encode(JSON.stringify(input.scene)),
  );

  // ink objects (deleted ones drop out with their exclusive entries)
  const alive = input.objects.filter((o) => !o.deleted);
  const deadRefs = new Set(
    input.objects
      .filter((o) => o.deleted)
      .flatMap((o) =>
        [o.assetRef, o.previewRef, o.hitRef].filter(
          (r): r is string => typeof r === "string",
        ),
      ),
  );
  const inkObjectEntries = alive.map((ink, index) => {
    const entry = serializeInkObject(ink);
    entry.order = index;
    return entry;
  });
  for (const entry of inkObjectEntries) {
    for (const ref of [
      entry.nativeAssetRef,
      entry.previewRef,
      entry.hitGeometryRef,
    ]) {
      if (!ref) {
        continue;
      }
      const original = input.originalEntries[ref];
      if (original && !usedPaths.has(ref)) {
        await addEntry(ref, original);
      }
    }
  }

  // foreign resources from the original container (deleted ink entries
  // are NOT carried: the delete transaction ends their lifecycle)
  for (const resource of input.originalResources) {
    if (usedPaths.has(resource.path) || deadRefs.has(resource.path)) {
      continue;
    }
    const original = input.originalEntries[resource.path];
    if (original) {
      await addEntry(resource.path, original);
    }
  }

  const manifest: Record<string, unknown> = {
    ...(input.manifestExtras ?? {}),
    type: LUNA_CANVAS_TYPE,
    schemaVersion: LUNA_CANVAS_SCHEMA_VERSION,
    documentId: input.documentId,
    revision: input.revision,
    capabilities: ["ink", "graphics"],
    sceneRef: "scene/excalidraw.json",
    layerStrategy: "ink-above-graphics",
    inkObjects: inkObjectEntries,
    resources: resourceTable,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "uint8array" });
};
