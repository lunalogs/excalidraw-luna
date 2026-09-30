/**
 * LunacanvasInkOverlay (0049-R1): mounts the native-ink layer into the
 * excalidraw editor host. Ink renders ABOVE the graphics canvases
 * (layerStrategy "ink-above-graphics"); interactions: tap = select
 * (alpha-refined), drag = move (one history entry per drag), Delete =
 * whole-object delete. The controller's DocumentHistory is the single
 * ordered stack for ink commands (graphics interleave lands with the
 * native bridge; see changes/0047 for the model-level proof).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import { createAlphaSampler, InkLayer, type AlphaSampler } from "./InkLayer";
import {
  getLunacanvasDocument,
  subscribeLunacanvasDocument,
} from "./hostStore";

import type { InkObject } from "./inkModel";
import type { AppState } from "../types";

const isEditableTarget = (): boolean => {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable)
  );
};

export const LunacanvasInkOverlay = ({
  appState,
  alphaSampler: alphaSamplerProp,
}: {
  appState: AppState;
  /** test/host override; defaults to the preview-alpha sampler */
  alphaSampler?: AlphaSampler;
}) => {
  const [, setDocTick] = useState(0);
  useEffect(
    () => subscribeLunacanvasDocument(() => setDocTick((t) => t + 1)),
    [],
  );

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [dragDelta, setDragDelta] = useState<readonly [number, number] | null>(
    null,
  );
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origin: readonly [number, number];
    moved: boolean;
  } | null>(null);

  const sampler: AlphaSampler = useMemo(
    () => alphaSamplerProp ?? createAlphaSampler(),
    [alphaSamplerProp],
  );

  const doc = getLunacanvasDocument();
  const objects = doc ? [...doc.controller.getObjects()] : [];

  // viewport mapping follows the excalidraw canvas transform exactly
  const zoom = appState.zoom.value;
  const mapping = useMemo(
    () => ({
      zoom: appState.zoom,
      offsetLeft: appState.offsetLeft,
      offsetTop: appState.offsetTop,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
    }),
    [
      appState.zoom,
      appState.offsetLeft,
      appState.offsetTop,
      appState.scrollX,
      appState.scrollY,
    ],
  );
  const toViewport = ([x, y]: readonly [number, number]) =>
    sceneCoordsToViewportCoords({ sceneX: x, sceneY: y }, mapping);
  const toScene = ({ x, y }: { x: number; y: number }): [number, number] => [
    (x - appState.offsetLeft) / zoom - appState.scrollX,
    (y - appState.offsetTop) / zoom - appState.scrollY,
  ];

  // Delete/Backspace removes the selected ink objects (one history entry)
  useEffect(() => {
    if (!doc) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedIds.size > 0 &&
        !isEditableTarget()
      ) {
        doc.controller.deleteSelection(selectedIds);
        setSelectedIds(new Set());
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, selectedIds]);

  // drag-move tracking (window-level so the pointer may leave the img)
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(dx, dy) < 3) {
        return;
      }
      drag.moved = true;
      setDragDelta([dx / zoom, dy / zoom]);
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      dragRef.current = null;
      const delta = drag.moved ? dragDelta : null;
      setDragDelta(null);
      if (delta && doc && selectedIds.size > 0) {
        doc.controller.moveSelection(selectedIds, delta[0], delta[1]);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [doc, selectedIds, dragDelta, zoom]);

  if (!doc || objects.length === 0) {
    return null;
  }

  const displayObjects: InkObject[] =
    dragDelta && selectedIds.size > 0
      ? objects.map((ink) =>
          selectedIds.has(ink.objectId)
            ? {
                ...ink,
                transform: [
                  ink.transform[0],
                  ink.transform[1],
                  ink.transform[2],
                  ink.transform[3],
                  ink.transform[4] + dragDelta[0],
                  ink.transform[5] + dragDelta[1],
                ] as InkObject["transform"],
              }
            : ink,
        )
      : objects;

  const onObjectPointerDown = (
    _ink: InkObject,
    event: ReactPointerEvent,
  ): void => {
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: [event.clientX, event.clientY],
      moved: false,
    };
  };

  const onSelectObject = (objectId: string, additive: boolean): void => {
    setSelectedIds((prev) => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(objectId)) {
          next.delete(objectId);
        } else {
          next.add(objectId);
        }
        return next;
      }
      return new Set([objectId]);
    });
  };

  return (
    <div
      data-testid="lunacanvas-ink-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // above the interactive canvas (2), below the UI layer (4):
        // ink-above-graphics without swallowing chrome interactions
        zIndex: 3,
      }}
    >
      <InkLayer
        objects={displayObjects}
        toViewport={toViewport}
        zoom={zoom}
        selectedObjectIds={selectedIds}
        onSelectObject={onSelectObject}
        alphaSampler={sampler}
        toScene={toScene}
        onObjectPointerDown={onObjectPointerDown}
      />
    </div>
  );
};
