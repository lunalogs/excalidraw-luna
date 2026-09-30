/**
 * Editor host store (0049-R1): the single bridge between the excalidraw
 * host (file open/save in data/blob.ts + data/json.ts) and the lunacanvas
 * ink model. Module-level so the class-based App and the save action can
 * reach the active document without prop drilling; React subscribers get
 * notified when a document opens/closes or its ink state commits.
 */

import { InkEditingController } from "./inkEditing";

import { openLunacanvasDocument, saveLunacanvasDocument } from "./webDocument";

import type { InkObject } from "./inkModel";

export interface ActiveLunacanvasDocument {
  documentId: string;
  revision: number;
  manifestRaw: Record<string, unknown>;
  /** original container bytes by path — untouched entries re-export verbatim */
  originalEntries: Record<string, Uint8Array>;
  originalResources: { path: string; sha256: string; byteSize: number }[];
  controller: InkEditingController;
}

let active: ActiveLunacanvasDocument | null = null;
let inkVersion = 0;

const listeners = new Set<() => void>();

export const subscribeLunacanvasDocument = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getLunacanvasDocument = (): ActiveLunacanvasDocument | null =>
  active;

/** bumped on every ink commit so React overlays re-render */
export const getLunacanvasInkVersion = (): number => inkVersion;

const notify = () => {
  inkVersion += 1;
  listeners.forEach((listener) => listener());
};

/**
 * Opens a .lunacanvas container in the editor: validates the real ZIP,
 * installs the ink objects behind an editing controller, and returns the
 * embedded scene for the host to load into the canvas.
 */
export const openLunacanvasInEditor = async (
  data: ArrayBuffer | Uint8Array,
): Promise<{ scene: Record<string, unknown> }> => {
  const opened = await openLunacanvasDocument(data);
  if (!opened.ok) {
    throw new Error(opened.errors.join("; "));
  }
  const originalEntries: Record<string, Uint8Array> = {};
  for (const resource of opened.manifest.resources) {
    originalEntries[resource.path] = await opened.readEntry(resource.path);
  }
  const controller = new InkEditingController(opened.objects, undefined, () =>
    notify(),
  );
  active = {
    documentId: opened.documentId,
    revision: opened.revision,
    manifestRaw: opened.manifestRaw,
    originalEntries,
    originalResources: opened.manifest.resources,
    controller,
  };
  notify();
  return { scene: opened.scene };
};

export const closeLunacanvasDocument = (): void => {
  active = null;
  notify();
};

/**
 * Serializes the editor's current scene + the ink objects (with all web
 * edits applied) into a regenerated .lunacanvas container. Returns null
 * when no document is active (caller falls back to plain .excalidraw).
 */
export const saveLunacanvasFromEditor = async (
  scene: Record<string, unknown>,
): Promise<Uint8Array | null> => {
  if (!active) {
    return null;
  }
  const objects = active.controller.getObjects() as InkObject[];
  const bytes = await saveLunacanvasDocument({
    documentId: active.documentId,
    revision: active.revision + 1,
    scene,
    objects,
    originalEntries: active.originalEntries,
    manifestExtras: active.manifestRaw,
    originalResources: active.originalResources,
  });
  active.revision += 1;
  notify();
  return bytes;
};
