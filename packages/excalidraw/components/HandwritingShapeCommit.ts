import type { ExcalidrawElement } from "@excalidraw/element/types";

import { atom } from "../editor-jotai";

export type HandwritingShapeCommitInfo = {
  shapeId: ExcalidrawElement["id"];
  strokeId: ExcalidrawElement["id"];
  /** Owning editor instance — the shared store must not leak across editors. */
  appId: string;
  at: number;
};

/**
 * The most recent hold-to-shape commits per editor instance, while each
 * ~5s "restore hand-drawn" window (SH-06) is open. One entry per appId so
 * concurrent editors never overwrite each other's window (R6). UI-only,
 * never persisted or exported (DATA-06).
 */
export const handwritingRestoreAtom = atom<
  Record<string, HandwritingShapeCommitInfo>
>({});
