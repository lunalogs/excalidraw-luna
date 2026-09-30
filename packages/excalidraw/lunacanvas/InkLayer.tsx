/**
 * InkLayer (W05): displays native-ink preview PNGs at their worldTransform
 * on top of the canvas, and reports whole-object pointer selection.
 *
 * The preview PNG is rendered at the ink's LOCAL bounds, so display =
 * anchor (world translate in viewport px) + size (local bounds * world
 * scale * zoom). The host supplies the definitive scene→viewport mapping
 * (ADR-0003; the native shell refines it in W08), keeping this layer
 * render-only and unit-testable. Full lasso/arrange interactions W06.
 */

import { useMemo } from "react";

import type { InkObject } from "./inkModel";

export type ViewportMapper = (scenePoint: readonly [number, number]) => {
  x: number;
  y: number;
};

export interface InkLayerProps {
  objects: readonly InkObject[];
  /** scene -> CSS px in editor container coordinates */
  toViewport: ViewportMapper;
  /** CSS px per scene unit */
  zoom: number;
  selectedObjectIds?: ReadonlySet<string>;
  onSelectObject?: (objectId: string, additive: boolean) => void;
}

export const InkLayer = ({
  objects,
  toViewport,
  zoom,
  selectedObjectIds,
  onSelectObject,
}: InkLayerProps) => {
  const visible = useMemo(
    () => objects.filter((o) => !o.deleted && o.previewUrl),
    [objects],
  );

  return (
    <div
      className="lunacanvas-ink-layer"
      data-testid="lunacanvas-ink-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {visible.map((ink) => {
        const [a, , , d, tx, ty] = ink.transform;
        const [bx, by, bw, bh] = ink.hit.bounds;
        const anchor = toViewport([bx * a + tx, by * d + ty]);
        const selected = selectedObjectIds?.has(ink.objectId) ?? false;
        return (
          <img
            key={ink.objectId}
            src={ink.previewUrl!}
            data-object-id={ink.objectId}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: anchor.x,
              top: anchor.y,
              width: Math.max(1, bw * a * zoom),
              height: Math.max(1, bh * d * zoom),
              opacity: selected ? 0.75 : 1,
              outline: selected
                ? "2px solid var(--color-primary, #6965db)"
                : "none",
              pointerEvents: "auto",
              touchAction: "none",
              userSelect: "none",
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectObject?.(ink.objectId, event.shiftKey);
            }}
          />
        );
      })}
    </div>
  );
};
