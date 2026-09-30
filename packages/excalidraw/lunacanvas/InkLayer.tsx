/**
 * InkLayer (W05, 0046-R4): displays native-ink preview PNGs at their
 * worldTransform on top of the canvas, and reports whole-object pointer
 * selection.
 *
 * The preview PNG is rendered at the ink's LOCAL bounds, so display =
 * anchor (world translate in viewport px) + size (local bounds * world
 * scale * zoom). The host supplies the definitive scene→viewport mapping
 * (ADR-0003; the native shell refines it in W08), keeping this layer
 * render-only and unit-testable.
 *
 * Precision (0046-R4): the hit JSON geometry is coarse (centerline
 * capsules + hole bounds). The AUTHORITATIVE visible mask is the preview
 * PNG's alpha channel; `createAlphaSampler` samples it so lasso/eraser/
 * tap can refuse transparent pixels (hole interiors, gaps between
 * capsules). Error policy: any decode failure yields `null` (unknown) —
 * the caller falls back to the geometry result and NEVER loses a
 * document over a sampling error.
 */

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";

import type { InkObject } from "./inkModel";

export type ViewportMapper = (scenePoint: readonly [number, number]) => {
  x: number;
  y: number;
};

/** scene point -> preview-image pixel coordinates (null when unmapped). */
export const sceneToPreviewPixel = (
  ink: InkObject,
  scenePoint: readonly [number, number],
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } | null => {
  const [a, , , d, tx, ty] = ink.transform;
  const [bx, by, bw, bh] = ink.hit.bounds;
  if (!(bw > 0) || !(bh > 0) || !(a > 0) || !(d > 0)) {
    return null;
  }
  const lx = (scenePoint[0] - tx) / a;
  const ly = (scenePoint[1] - ty) / d;
  return {
    x: ((lx - bx) / bw) * imageWidth,
    y: ((ly - by) / bh) * imageHeight,
  };
};

/**
 * Alpha refine policy: a definitive `false` (sampled transparent)
 * overrides a geometry hit; `true` and `unknown` (null) keep it.
 */
export const combineAlpha = (
  geometryHit: boolean,
  alpha: boolean | null,
): boolean => (alpha === false ? false : geometryHit);

export type AlphaSampler = (
  ink: InkObject,
  scenePoint: readonly [number, number],
) => Promise<boolean | null>;

interface PreviewSample {
  width: number;
  height: number;
  /** per-pixel alpha channel only */
  alpha: Uint8Array;
}

const defaultLoadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${url}`));
    img.src = url;
  });

/**
 * Preview-alpha sampler with per-(objectId, url) caching. The load+decode
 * happens at most once per object; concurrent callers share one promise.
 * Any environment without canvas 2D (tests, workers) yields `unknown`.
 */
export const createAlphaSampler = (
  loadImage: (url: string) => Promise<HTMLImageElement> = defaultLoadImage,
  alphaThreshold = 12,
): AlphaSampler => {
  const cache = new Map<string, Promise<PreviewSample | null>>();
  const getSample = (ink: InkObject): Promise<PreviewSample | null> => {
    const key = `${ink.objectId}|${ink.previewUrl ?? ""}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = (async (): Promise<PreviewSample | null> => {
        const url = ink.previewUrl;
        if (!url || typeof document === "undefined") {
          return null;
        }
        try {
          const img = await loadImage(url);
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            return null;
          }
          ctx.drawImage(img, 0, 0);
          const pixels = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          const alpha = new Uint8Array(canvas.width * canvas.height);
          for (let i = 0; i < alpha.length; i++) {
            alpha[i] = pixels[i * 4 + 3];
          }
          return { width: canvas.width, height: canvas.height, alpha };
        } catch {
          return null; // unknown — caller falls back to geometry
        }
      })();
      cache.set(key, pending);
    }
    return pending;
  };
  return async (ink, scenePoint) => {
    const sample = await getSample(ink);
    if (!sample) {
      return null;
    }
    const pixel = sceneToPreviewPixel(
      ink,
      scenePoint,
      sample.width,
      sample.height,
    );
    if (!pixel) {
      return null;
    }
    const x = Math.round(pixel.x);
    const y = Math.round(pixel.y);
    if (x < 0 || y < 0 || x >= sample.width || y >= sample.height) {
      return false;
    }
    return sample.alpha[y * sample.width + x] > alphaThreshold;
  };
};

export interface InkLayerProps {
  objects: readonly InkObject[];
  /** scene -> CSS px in editor container coordinates */
  toViewport: ViewportMapper;
  /** CSS px per scene unit */
  zoom: number;
  selectedObjectIds?: ReadonlySet<string>;
  onSelectObject?: (objectId: string, additive: boolean) => void;
  /** optional alpha refinement: a tap on a transparent pixel of the
   * preview (hole interior, between capsules) does NOT select */
  alphaSampler?: AlphaSampler;
  /** viewport CSS px -> scene coordinates (required with alphaSampler) */
  toScene?: (viewportPoint: {
    x: number;
    y: number;
  }) => readonly [number, number];
  /** drag/tracking hook: fires before selection on every img
   * pointerdown (the host decides whether a drag begins) */
  onObjectPointerDown?: (ink: InkObject, event: ReactPointerEvent) => void;
}

export const InkLayer = ({
  objects,
  toViewport,
  zoom,
  selectedObjectIds,
  onSelectObject,
  alphaSampler,
  toScene,
  onObjectPointerDown,
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
              onObjectPointerDown?.(ink, event);
              if (!onSelectObject) {
                return;
              }
              const finish = (allow: boolean) => {
                if (!allow) {
                  return; // transparent pixel: let the event reach the canvas
                }
                event.stopPropagation();
                onSelectObject(ink.objectId, event.shiftKey);
              };
              if (alphaSampler && toScene) {
                const scenePoint = toScene({
                  x: event.clientX,
                  y: event.clientY,
                });
                alphaSampler(ink, scenePoint)
                  .then((alpha) => finish(combineAlpha(true, alpha)))
                  .catch(() => finish(true)); // sampler failure: geometry wins
              } else {
                finish(true);
              }
            }}
          />
        );
      })}
    </div>
  );
};
