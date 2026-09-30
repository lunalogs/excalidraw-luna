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
  /**
   * Container refs carried VERBATIM from the manifest and written back on
   * save (0045-R2). A legal document may name its resources anything (e.g.
   * `ink/asset-v2-x.drawing`); re-deriving paths from objectId would point
   * at non-existent entries. Undefined = not bound to a container (tests);
   * serialize then falls back to the objectId-derived path.
   */
  assetRef?: string;
  previewRef?: string | null;
  hitRef?: string | null;
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

/** Is this WORLD point inside the local-erase hole? */
const worldHoleRect = (
  ink: InkObject,
): [[number, number], [number, number]] | null => {
  if (!ink.hit.hasMask || !ink.hit.maskBounds) {
    return null;
  }
  const [mx, my, mw, mh] = ink.hit.maskBounds;
  const [wx, wy] = transformPoint(ink.transform, [mx, my]);
  return [
    [wx, wy],
    [wx + mw * ink.transform[0], wy + mh * ink.transform[3]],
  ];
};

/**
 * Subtract an axis-aligned world rect from a segment: returns the
 * sub-segments OUTSIDE the rect (0, 1 or 2). Used to remove the
 * local-erase hole from capsule geometry. Touches (enter === exit)
 * keep the segment — the boundary still carries visible ink.
 */
const subtractRectFromSegment = (
  a: [number, number],
  b: [number, number],
  min: [number, number],
  max: [number, number],
): Segment[] => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    return pointInWorldHolePoint(a, min, max) ? [] : [[a, b]];
  }
  let tEnter = 0;
  let tExit = 1;
  const slabs: [number, number, number][] = [
    [a[0], dx, 0],
    [a[1], dy, 1],
  ];
  for (const [start, delta, axis] of slabs) {
    const lo = min[axis];
    const hi = max[axis];
    if (Math.abs(delta) < 1e-12) {
      if (start < lo || start > hi) {
        return [[a, b]]; // parallel and outside the slab: never inside
      }
      continue;
    }
    let t1 = (lo - start) / delta;
    let t2 = (hi - start) / delta;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }
    tEnter = Math.max(tEnter, t1);
    tExit = Math.min(tExit, t2);
    if (tEnter > tExit) {
      return [[a, b]]; // no overlap with the rect interior
    }
  }
  if (tEnter >= tExit) {
    return [[a, b]];
  }
  const at = (t: number): [number, number] => [a[0] + dx * t, a[1] + dy * t];
  const parts: Segment[] = [];
  if (tEnter > 1e-9) {
    parts.push([a, at(tEnter)]);
  }
  if (tExit < 1 - 1e-9) {
    parts.push([at(tExit), b]);
  }
  return parts;
};

const pointInWorldHolePoint = (
  p: [number, number],
  min: [number, number],
  max: [number, number],
): boolean =>
  p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1];

/**
 * The VISIBLE portions of the stroke's centerline: the local-erase hole
 * is subtracted segment by segment (the geometry path only knows the
 * hole's bounds — PencilKit does not expose the mask polygon). Capsule
 * tests over these clipped segments give the correct semantics: a point
 * inside the hole only hits when the disc overlaps surviving ink at the
 * hole boundary. Residual error along the hole edge is resolved precisely
 * by the preview-alpha sampler in InkLayer (0046-R4).
 */
const visibleSegments = (ink: InkObject): Segment[] => {
  const hole = worldHoleRect(ink);
  const segments = worldSegments(ink);
  if (!hole) {
    return segments;
  }
  return segments.flatMap(([a, b]) =>
    subtractRectFromSegment(a, b, hole[0], hole[1]),
  );
};

/**
 * Eraser hit (N15): does the eraser disc at `point` with radius `radius`
 * touch this ink's VISIBLE stroke? Segments inside the local-erase hole
 * are invisible and never hit; a point inside the hole only erases when
 * the disc also overlaps surviving (outside-hole) capsules.
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
  return visibleSegments(ink).some(
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
  // only VISIBLE segments participate: a lasso drawn inside a
  // local-erase hole selects nothing (0046-R4)
  const segments = visibleSegments(ink);
  if (segments.length === 0) {
    return false;
  }
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
  // refs are owned by the container, not by objectId naming rules —
  // preserve them verbatim so an unmodified object re-exports identically
  assetRef: entry.nativeAssetRef,
  previewRef: entry.previewRef ?? null,
  hitRef: entry.hitGeometryRef ?? null,
});

export const serializeInkObject = (ink: InkObject): ManifestInkObject => {
  // null = explicitly no such resource (omit); undefined = unbound
  // (legacy fallback to the objectId-derived path)
  const previewRef =
    ink.previewRef === undefined
      ? `previews/${ink.objectId}.png`
      : ink.previewRef;
  const hitRef =
    ink.hitRef === undefined ? `hit/${ink.objectId}.json` : ink.hitRef;
  return {
    objectId: ink.objectId,
    nativeAssetRef: ink.assetRef ?? `ink/${ink.objectId}.drawing`,
    ...(previewRef ? { previewRef } : {}),
    ...(hitRef ? { hitGeometryRef: hitRef } : {}),
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
  };
};

/** schemaVersion marker re-exported so bundlers tree-shake consistently */
export const INK_MODEL_SCHEMA_VERSION = HANDWRITING_SCHEMA_VERSION;
