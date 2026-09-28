import { getStroke } from "perfect-freehand";

import {
  flatnessToAxisRatio,
  normalizeBrushConfig,
  pressureResponse,
  stabilizationToStreamline,
} from "./brushParams";
import { isHandwritingBrushKind } from "./types";

import type { ExcalidrawFreeDrawElement } from "../types";

import type { HandwritingBrushConfig } from "./types";

/**
 * Input for {@link computeHandwritingOutline} (phase-two handwriting brush).
 *
 * The caller is responsible for decoding the element's customData with
 * `decodeBrushConfig` and passing the result as `config` (`null` for legacy
 * strokes); `legacyBrushKind` covers phase-one files that only carry the
 * `customData.handwritingBrush` string.
 */
export interface HandwritingOutlineInput {
  /** 中心线点（本地坐标） */
  points: readonly (readonly [number, number])[];
  /** 与 points 逐点对应的原始压力（simulatePressure=false 时有效） */
  pressures: readonly number[];
  /** 基础尺寸直径（调用方传 element.strokeWidth * 4.25，与旧行为一致） */
  size: number;
  simulatePressure: boolean;
  /** 新版笔刷参数；null 表示老笔画（无 customData.handwriting 且无 legacy handwritingBrush） */
  config: HandwritingBrushConfig | null;
  /** 可选：老笔画 legacy brush kind（"standard"|"fountain"|"highlighter"），config 为 null 但存在 legacy handwritingBrush 字段时由调用方传入 */
  legacyBrushKind?: "standard" | "fountain" | "highlighter" | null;
}

/** https://easings.net/#easeOutSine — matches the legacy stroke behavior. */
const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);

/**
 * R2/A09: bounded arc-length resampling. perfect-freehand interpolates per
 * input point with a fixed coefficient, so its output still depends on the
 * pointer event rate. Resampling to a fixed scene-unit spacing (relative to
 * the stroke size) before stroking makes the result a pure function of the
 * path geometry, not of how many move events the device produced. Pressures
 * are interpolated alongside positions so pressure tracks stay aligned.
 */
const resampleByArcLength = (
  points: readonly (readonly [number, number])[],
  pressures: readonly number[],
  spacing: number,
  /** F6: target budget for arc-length samples; zero-length samples are still
   * kept individually, so total complexity is O(output) + O(input) */
  maxSamples = 1024,
): { points: [number, number][]; pressures: number[] } => {
  // target the output budget up front: a single huge segment (imported art,
  // extreme zoom) is sampled at an adaptively coarser spacing instead of
  // allocating proportionally to its length. Zero-length samples (pressure
  // changes at a fixed position) are always kept, so the guarantee is
  // O(maxSamples) resampled points plus O(input) carried samples — not a
  // strict total cap on every possible input.
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
  }
  if (!(totalLength > 0)) {
    return {
      points: points.map(([x, y]) => [x, y] as [number, number]),
      pressures: [...pressures],
    };
  }
  const boundedSpacing = Math.max(spacing, totalLength / (maxSamples - 1));

  const outPoints: [number, number][] = [[points[0][0], points[0][1]]];
  const outPressures: number[] = [pressures[0] ?? 0.5];
  let carry = 0;

  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [qx, qy] = points[i];
    const segmentLength = Math.hypot(qx - px, qy - py);
    if (segmentLength <= 1e-9) {
      // keep pressure-only changes at a fixed position (BR-07): a zero-length
      // sample still carries a new pressure value and must not be dropped
      outPoints.push([qx, qy]);
      outPressures.push(pressures[i] ?? pressures[i - 1] ?? 0.5);
      continue;
    }
    let distance = boundedSpacing - carry;
    while (distance <= segmentLength) {
      const t = distance / segmentLength;
      outPoints.push([px + (qx - px) * t, py + (qy - py) * t]);
      const p0 = pressures[i - 1] ?? 0.5;
      const p1 = pressures[i] ?? p0;
      outPressures.push(p0 + (p1 - p0) * t);
      distance += boundedSpacing;
    }
    carry = segmentLength - (distance - boundedSpacing);
  }

  const last = points[points.length - 1];
  const lastOut = outPoints[outPoints.length - 1];
  // always end exactly on the real path end (no truncation, SH/BR-08)
  if (lastOut[0] !== last[0] || lastOut[1] !== last[1]) {
    outPoints.push([last[0], last[1]]);
    outPressures.push(pressures[pressures.length - 1] ?? 0.5);
  }
  return { points: outPoints, pressures: outPressures };
};

/**
 * Identity easing. perfect-freehand applies `easing` to an internal radius
 * value (`0.5 - thinning * (0.5 - pressure)`), not to the raw pressure, so
 * the pressure response curve (`pressureResponse`) is pre-applied to the
 * input pressures instead and this identity is passed through (BR-01).
 */
const identityEasing = (t: number) => t;

type StrokeInputPoint = number[];

const getLegacyThinning = (
  legacyBrushKind: HandwritingOutlineInput["legacyBrushKind"],
) =>
  legacyBrushKind === "highlighter"
    ? 0
    : legacyBrushKind === "fountain"
    ? 0.85
    : 0.6;

/**
 * Shared input preparation for the new-config path: bounded arc-length
 * resampling (only when stabilization is active) with pressures carried
 * alongside positions. Exposed for the representative-width measurement so
 * it measures exactly the centerline the outline was built from.
 */
const prepareOutlinePoints = (
  points: readonly (readonly [number, number])[],
  pressures: readonly number[],
  simulatePressure: boolean,
  size: number,
  config: HandwritingBrushConfig,
): {
  points: readonly (readonly [number, number])[];
  pressures: readonly number[];
} => {
  const hasPressures = !simulatePressure && points.length > 0;
  const basePressures = hasPressures ? pressures : points.map(() => 0.5);
  if (config.stabilization > 0 && points.length > 2) {
    const spacing = Math.max(1, size / 16);
    const resampled = resampleByArcLength(points, basePressures, spacing);
    return { points: resampled.points, pressures: resampled.pressures };
  }
  return { points, pressures: basePressures };
};

/**
 * Compute the outline polygon of a freedraw stroke (phase-two brush engine).
 *
 * Behavior:
 * - `config === null` (legacy stroke): replicates `getFreedrawOutlinePoints`
 *   (shape.ts) bit-for-bit, including the legacy `handwritingBrush`-based
 *   thinning, so old drawings render unchanged (BR-09).
 * - `config` present (new stroke): thinning = 0.85 * pressureAmount / 100,
 *   pressures are pre-shaped with `pressureResponse` (identity easing passed
 *   to perfect-freehand), streamline comes from `stabilization`, and a flat
 *   nib is realized as a true geometric transform: the centerline is rotated
 *   by `-nibAngle` and stretched along the minor axis by `1/ratio` so the
 *   nib becomes round in the stroked space, then the outline is mapped back
 *   (BR-03). This keeps the centerline untouched and sweeps a continuous
 *   ellipse (major = size, minor = size * ratio) per cross-section.
 */
export const computeHandwritingOutline = (
  input: HandwritingOutlineInput,
): [number, number][] => {
  const { config } = input;

  // Legacy strokes (config === null): replicate getFreedrawOutlinePoints
  // (shape.ts) exactly so regular and phase-one strokes do not change.
  if (!config) {
    const inputPoints: StrokeInputPoint[] = input.simulatePressure
      ? (input.points as unknown as StrokeInputPoint[])
      : input.points.length
      ? input.points.map(([x, y], i) => [x, y, input.pressures[i]])
      : [[0, 0, 0.5]];

    return getStroke(inputPoints, {
      simulatePressure: input.simulatePressure,
      size: input.size,
      thinning: getLegacyThinning(input.legacyBrushKind),
      smoothing: 0.5,
      streamline: 0.5,
      easing: easeOutSine,
      last: true,
    }) as [number, number][];
  }

  const thinning = 0.85 * (config.pressureAmount / 100);
  const streamline = stabilizationToStreamline(config.stabilization);

  // R2/A09: when stabilization is active, resample to a fixed arc-length
  // spacing so the stroke is a function of the path geometry rather than the
  // pointer event rate. Stabilization 0 keeps the raw samples untouched
  // ("0 接近原始路径"), and the resampled output is itself on the same
  // spacing, so re-rendering persisted points never re-stabilizes (DATA-03).
  const prepared = prepareOutlinePoints(
    input.points,
    input.pressures,
    input.simulatePressure,
    input.size,
    config,
  );
  const preparedPoints = prepared.points;
  const preparedPressures = prepared.pressures;

  // Flat-nib geometry (BR-03): perfect-freehand produces circular cross
  // sections. An elliptical nib (major axis = size at `nibAngle`, minor axis
  // = size * ratio) is obtained by transforming the centerline into a space
  // where the nib is a round circle (rotate by -angle, then divide y by
  // ratio), stroking there, and applying the inverse transform to the
  // outline. The centerline itself is never scaled.
  const ratio = flatnessToAxisRatio(config.nibFlatness);
  const useFlatNib = ratio !== 1;
  const angle = (config.nibAngle * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const toNibSpace = (x: number, y: number): [number, number] => [
    x * cos + y * sin,
    (-x * sin + y * cos) / ratio,
  ];

  const fromNibSpace = (x: number, y: number): [number, number] => {
    const ny = y * ratio;
    return [x * cos - ny * sin, x * sin + ny * cos];
  };

  const inputPoints: StrokeInputPoint[] = preparedPoints.length
    ? preparedPoints.map(([x, y], i) => {
        const [nx, ny] = useFlatNib ? toNibSpace(x, y) : ([x, y] as const);
        return input.simulatePressure
          ? [nx, ny]
          : [
              nx,
              ny,
              pressureResponse(
                preparedPressures[i] ?? 0.5,
                config.pressureSensitivity,
              ),
            ];
      })
    : [[0, 0, 0.5]];

  const outline = getStroke(inputPoints, {
    simulatePressure: input.simulatePressure,
    size: input.size,
    thinning,
    smoothing: 0.5,
    streamline,
    easing: identityEasing,
    last: true,
  }) as [number, number][];

  if (!useFlatNib) {
    return outline;
  }

  return outline.map(([x, y]) => fromNibSpace(x, y));
};

/**
 * Compute the outline of a freedraw element the same way the renderers do
 * (phase-two config when present, legacy branch otherwise). Extracted from
 * shape.ts so bounds.ts can use it without an import cycle.
 */
export const getFreedrawOutlinePointsForElement = (
  element: Pick<
    ExcalidrawFreeDrawElement,
    "points" | "pressures" | "strokeWidth" | "simulatePressure" | "customData"
  >,
): [number, number][] =>
  computeHandwritingOutline({
    points: element.points,
    pressures: element.pressures,
    size: element.strokeWidth * 4.25,
    simulatePressure: element.simulatePressure,
    config: normalizeBrushConfig(element.customData?.handwriting),
    legacyBrushKind: isHandwritingBrushKind(
      element.customData?.handwritingBrush,
    )
      ? element.customData.handwritingBrush
      : null,
  });

/**
 * Local-coordinate bounds of the visible stroke outline (R1/A07): the ink
 * extent including the nib width, used for element bounds / hit-test
 * pre-filtering so wide strokes are selectable and erasable out to their
 * visible edge. Returns null when the outline is empty.
 */
export const computeHandwritingOutlineBounds = (
  input: HandwritingOutlineInput,
): [number, number, number, number] | null => {
  const outline = computeHandwritingOutline(input);
  if (!outline.length) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
};

/**
 * R3/A16: representative visual stroke width when a variable-width / flat-nib
 * hand stroke is tidied into a constant-width native shape (SH-07).
 *
 * perfect-freehand's per-sample radius is `size * r` with
 * `r = 0.5 - thinning * (0.5 - pressureResponse(p, sensitivity))`; we average
 * that radius over the stroke's pressure samples (velocity-simulated strokes
 * fall back to the base half width), then convert back to strokeWidth units
 * (`× 2 / 4.25`). A flat nib narrows the ink perpendicular to its axis, so
 * the mean is scaled by `(1 + axisRatio) / 2` — this part is lossy by
 * definition (native geometry cannot express anisotropic nibs) and is noted
 * in the change record. Legacy strokes (no phase-two config) keep the old
 * behavior of copying `strokeWidth` unchanged.
 */
export const getRepresentativeStrokeWidth = (
  stroke: Pick<
    ExcalidrawFreeDrawElement,
    "strokeWidth" | "simulatePressure" | "customData"
  > & {
    points?: readonly (readonly [number, number])[];
    pressures?: readonly number[];
  },
): number => {
  const config = normalizeBrushConfig(stroke.customData?.handwriting);
  if (!config) {
    // legacy strokes keep the old behavior of copying strokeWidth unchanged
    return stroke.strokeWidth;
  }
  // F4/A16: constant-width round strokes have an exactly known diameter —
  // the capsule width — regardless of the path, so skip the measurement.
  // The result is a NATIVE shape strokeWidth (pixels): the freedraw ×4.25
  // scale must NOT be divided back out.
  if (config.pressureAmount === 0 && config.nibFlatness === 0) {
    return Math.max(0.25, stroke.strokeWidth * 4.25);
  }
  const strokePoints = stroke.points ?? [];
  if (strokePoints.length < 2) {
    // cannot measure without a path: fall back to the nominal ink width
    return Math.max(0.25, stroke.strokeWidth * 4.25);
  }

  // F4/A16: measure the REAL ink. Analytic radius formulas do not match
  // perfect-freehand's internal pressure shaping, and the result must be in
  // NATIVE shape pixels (the freedraw ×4.25 scale does not apply to native
  // line/ellipse/rectangle strokeWidth). For each centerline sample we cast
  // a ray along the local normal and measure the chord through the actual
  // outline polygon; the MEDIAN chord is the representative visual width.
  // (Median, not mean over area: end caps must not inflate a constant-width
  // stroke — a 34px capsule must report 34, not 34+cap area.)
  const outline = computeHandwritingOutline({
    points: strokePoints,
    pressures: stroke.pressures ?? [],
    size: stroke.strokeWidth * 4.25,
    simulatePressure: stroke.simulatePressure,
    config,
  });
  if (outline.length < 3) {
    return Math.max(0.25, stroke.strokeWidth * 4.25);
  }

  const prepared = prepareOutlinePoints(
    strokePoints,
    stroke.pressures ?? [],
    stroke.simulatePressure,
    stroke.strokeWidth * 4.25,
    config,
  );
  const widths: number[] = [];
  for (let i = 0; i < prepared.points.length; i++) {
    const [px, py] = prepared.points[i];
    const prev = prepared.points[Math.max(0, i - 1)];
    const next = prepared.points[Math.min(prepared.points.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty);
    if (len < 1e-9) {
      continue;
    }
    const nx = -ty / len;
    const ny = tx / len;
    // G1: measure only the LOCAL ink. For closed contours (circles, boxes)
    // the normal also crosses the far side of the outline — taking the
    // global min/max spans the empty interior and reports the diameter.
    // The local ink around the centerline sample is bounded by the NEAREST
    // outline crossing on each side: smallest s > 0 and largest s < 0.
    // Intersection math (ray P+s·n vs segment A+t·E, E=B-A):
    //   s = ((A-P)×E)/(n×E),  t = ((A-P)×n)/(n×E),  u×v = ux·vy − uy·vx
    let minPositive = Infinity;
    let maxNegative = -Infinity;
    for (let e = 0; e < outline.length; e++) {
      const [ax, ay] = outline[e];
      const [bx, by] = outline[(e + 1) % outline.length];
      const ex = bx - ax;
      const ey = by - ay;
      const denom = nx * ey - ny * ex;
      if (Math.abs(denom) < 1e-12) {
        continue;
      }
      const s = ((ax - px) * ey - (ay - py) * ex) / denom;
      const t = ((ax - px) * ny - (ay - py) * nx) / denom;
      if (t < 0 || t > 1) {
        continue;
      }
      if (s > 1e-9) {
        minPositive = Math.min(minPositive, s);
      } else if (s < -1e-9) {
        maxNegative = Math.max(maxNegative, s);
      }
    }
    if (Number.isFinite(minPositive) && Number.isFinite(maxNegative)) {
      widths.push(minPositive - maxNegative);
    }
  }
  if (!widths.length) {
    return Math.max(0.25, stroke.strokeWidth * 4.25);
  }
  widths.sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)];
  return Math.max(0.25, median);
};
