import type { ExcalidrawElement } from "@excalidraw/element/types";

import { atom } from "../editor-jotai";

export type HandwritingShapeCommitInfo = {
  shapeId: ExcalidrawElement["id"];
  strokeId: ExcalidrawElement["id"];
  at: number;
};

/**
 * The most recent hold-to-shape commit, while the ~5s "restore hand-drawn"
 * window (SH-06) is open. UI-only, never persisted or exported (DATA-06).
 */
export const handwritingRestoreAtom = atom<HandwritingShapeCommitInfo | null>(
  null,
);
