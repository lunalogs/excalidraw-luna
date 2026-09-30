/**
 * Web-side ink object model (W04/W05).
 *
 * The web never decodes PencilKit: each ink object displays through its
 * preview PNG at the object's worldTransform, and hit-testing uses the hit
 * JSON geometry (stroke centerline capsules — the authoritative visible
 * mask incl. local-erase holes is the preview alpha, refined in browsers
 * via InkLayer.alphaHit; jsdom tests use the deterministic geometry path).
 *
 * Transforms follow the same v1 write rule as the manifest: uniform
 * positive scale + translate only.
 */

import { HANDWRITING_SCHEMA_VERSION } from "@excalidraw/element/handwriting/types";

export type WorldTransform = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface InkHitGeometry {
  bounds: [number, number, number, number];
  width: number;
  path: [number, number][];
  hasMask: boolean;
  maskBounds?: [number, number, number, number];
}

export interface InkObject {
  objectId: string;
  /** uniform positive scale + translate, scene coordinates */
  transform: WorldTransform;
  order: number;
  contentHash: string;
  contentVersion: number;
  hit: InkHitGeometry;
  /** resolved object URLs (browser only; null in tests) */
  previewUrl: string | null;
  deleted: boolean;
  /** identity replacement graph (ADR-0002) */
  splitFrom?: string;
  replacedBy?: string;
}

const TRANSFORM_EPSILON = 1e-9;

export const isWritableTransform = (t: WorldTransform): boolean => {
  const [a, b, c, d] = t;
  return (
    [a, b, c, d, t[4], t[5]].every((n) => Number.isFinite(n)) &&
    Math.abs(b) <= TRANSFORM_EPSILON &&
    Math.abs(c) <= TRANSFORM_EPSILON &&
    a > 0 &&
    d > 0 &&
    Math.abs(a - d) <= TRANSFORM_EPSILON
  );
};

/** Web edit rule (N08): the web may only move/scale/delete/reorder ink. */
export type InkEdit =
  | { kind: "set-transform"; objectId: string; transform: WorldTransform }
  | { kind: "delete"; objectId: string }
  | { kind: "set-order"; objectId: string; order: number };

export const applyInkEdit = (
  objects: readonly InkObject[],
  edit: InkEdit,
): InkObject[] | { error: string } => {
  const index = objects.findIndex((o) => o.objectId === edit.objectId);
  if (index === -1) {
    return { error: `unknown objectId ${edit.objectId}` };
  }
  const next = objects.map((o) => ({ ...o }));
  switch (edit.kind) {
    case "set-transform":
      if (!isWritableTransform(edit.transform)) {
        return {
          error: "transform must be uniform positive scale + translate",
        };
      }
      next[index] = { ...next[index], transform: edit.transform };
      break;
    case "delete":
      next[index] = { ...next[index], deleted: true };
      break;
    case "set-order":
      next[index] = { ...next[index], order: edit.order };
      break;
  }
  return next;
};

// ---------------------------------------------------------------------------
// Selection geometry (SPEC N13): whole-stroke selection, lasso does not cut.
// ---------------------------------------------------------------------------

type Segment = [[number, number], [number, number]];

const transformPoint = (
  t: WorldTransform,
  p: [number, number],
): [number, number] => [t[0] * p[0] + t[4], t[3] * p[1] + t[5]];

const worldSegments = (ink: InkObject): Segment[] => {
  const segments: Segment[] = [];
  for (let i = 1; i < ink.hit.path.length; i++) {
    segments.push([
      transformPoint(ink.transform, ink.hit.path[i - 1]),
      transformPoint(ink.transform, ink.hit.path[i]),
    ]);
  }
  return segments;
};

const distToSegment = (p: [number, number], [a, b]: Segment): number => {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lengthSq),
        );
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
};

const segmentsIntersect = (s1: Segment, s2: Segment): boolean => {
  const [[ax, ay], [bx, by]] = s1;
  const [[cx, cy], [dx, dy]] = s2;
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-12) {
    return false;
  }
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

const pointInPolygon = (
  p: [number, number],
  polygon: [number, number][],
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const aboveI = yi > p[1];
    const aboveJ = yj > p[1];
    if (
      aboveI !== aboveJ &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

/** Half-width of the stroke capsule in scene units (width scales with x). */
const worldHalfWidth = (ink: InkObject): number =>
  (ink.hit.width * ink.transform[0]) / 2;

/**
 * Eraser hit (N15): does the eraser disc at `point` with radius `radius`
 * touch this ink's visible stroke? Hole-safe: when the point falls inside
 * the mask bounds (a local-erase hole region), the stroke is NOT hit
 * unless the disc also overlaps the surviving capsules.
 */
export const isInkHitByEraser = (
  ink: InkObject,
  point: [number, number],
  radius: number,
): boolean => {
  if (ink.deleted) {
    return false;
  }
  const halfWidth = worldHalfWidth(ink);
  // points inside the mask bounds alone do not count as a hit
  if (ink.hit.hasMask && ink.hit.maskBounds) {
    const [mx, my, mw, mh] = ink.hit.maskBounds;
    const [wx, wy] = transformPoint(ink.transform, [mx, my]);
    const insideHole =
      point[0] >= wx &&
      point[0] <= wx + mw * ink.transform[0] &&
      point[1] >= wy &&
      point[1] <= wy + mh * ink.transform[3];
    if (insideHole) {
      return false;
    }
  }
  return worldSegments(ink).some(
    (segment) => distToSegment(point, segment) <= halfWidth + radius,
  );
};

/**
 * Lasso selection (N13): the closed polygon intersects the stroke capsules
 * (crossing the boundary) or fully contains a capsule sample. Selecting
 * always takes the WHOLE stroke — the lasso never cuts.
 */
export const isInkSelectedByLasso = (
  ink: InkObject,
  polygon: [number, number][],
): boolean => {
  if (ink.deleted || polygon.length < 3) {
    return false;
  }
  const segments = worldSegments(ink);
  const halfWidth = worldHalfWidth(ink);
  for (const segment of segments) {
    for (let i = 0; i < polygon.length; i++) {
      const edge: Segment = [polygon[i], polygon[(i + 1) % polygon.length]];
      // conservative: test segment endpoints against the capsule too
      if (
        segmentsIntersect(segment, edge) ||
        distToSegment(edge[0], segment) <= halfWidth ||
        distToSegment(edge[1], segment) <= halfWidth
      ) {
        return true;
      }
    }
    // fully-contained stroke
    if (
      pointInPolygon(segment[0], polygon) &&
      pointInPolygon(segment[1], polygon)
    ) {
      return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// Serialization: manifest inkObjects <-> runtime model (web never touches
// the drawing bytes — it only carries refs).
// ---------------------------------------------------------------------------

export interface ManifestInkObject {
  objectId: string;
  nativeAssetRef: string;
  previewRef?: string;
  hitGeometryRef?: string;
  worldTransform: WorldTransform;
  order: number;
  contentVersion: number;
  contentHash: string;
  splitFrom?: string;
  replacedBy?: string;
}

export const parseInkObject = (
  entry: ManifestInkObject,
  hit: InkHitGeometry,
  previewUrl: string | null,
): InkObject => ({
  objectId: entry.objectId,
  transform: entry.worldTransform,
  order: entry.order,
  contentHash: entry.contentHash,
  contentVersion: entry.contentVersion,
  hit,
  previewUrl,
  deleted: false,
  splitFrom: entry.splitFrom,
  replacedBy: entry.replacedBy,
});

export const serializeInkObject = (ink: InkObject): ManifestInkObject => ({
  objectId: ink.objectId,
  nativeAssetRef: `ink/${ink.objectId}.drawing`,
  previewRef: `previews/${ink.objectId}.png`,
  hitGeometryRef: `hit/${ink.objectId}.json`,
  worldTransform: [
    ink.transform[0],
    ink.transform[1],
    ink.transform[2],
    ink.transform[3],
    ink.transform[4],
    ink.transform[5],
  ],
  order: ink.order,
  contentVersion: ink.contentVersion,
  contentHash: ink.contentHash,
  splitFrom: ink.splitFrom,
  replacedBy: ink.replacedBy,
});

/** schemaVersion marker re-exported so bundlers tree-shake consistently */
export const INK_MODEL_SCHEMA_VERSION = HANDWRITING_SCHEMA_VERSION;
