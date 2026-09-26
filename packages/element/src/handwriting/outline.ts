import { getStroke } from "perfect-freehand";

import {
  flatnessToAxisRatio,
  pressureResponse,
  stabilizationToStreamline,
} from "./brushParams";

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

  const inputPoints: StrokeInputPoint[] = input.points.length
    ? input.points.map(([x, y], i) => {
        const [nx, ny] = useFlatNib ? toNibSpace(x, y) : ([x, y] as const);
        return input.simulatePressure
          ? [nx, ny]
          : [
              nx,
              ny,
              pressureResponse(input.pressures[i], config.pressureSensitivity),
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
