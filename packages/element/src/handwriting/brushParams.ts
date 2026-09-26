import {
  HANDWRITING_SCHEMA_VERSION,
  isHandwritingBrushKind,
  type HandwritingBrushConfig,
  type HandwritingBrushKind,
  type HandwritingCustomData,
} from "./types";

export const BRUSH_PARAM_RANGES = {
  pressureAmount: { min: 0, max: 100, default: 60 },
  pressureSensitivity: { min: 0, max: 100, default: 50 },
  nibFlatness: { min: 0, max: 100, default: 0 },
  nibAngle: { min: 0, max: 180, default: 45 },
  stabilization: { min: 0, max: 100, default: 30 },
} as const;

/**
 * First-version product defaults (SPEC §3.1). These are deliberate product
 * choices — changing them requires test-write / device evidence recorded in
 * docs/handwriting/changes/.
 */
export const DEFAULT_BRUSH_CONFIGS: Record<
  HandwritingBrushKind,
  HandwritingBrushConfig
> = {
  standard: {
    schemaVersion: HANDWRITING_SCHEMA_VERSION,
    brushKind: "standard",
    pressureAmount: 60,
    pressureSensitivity: 50,
    nibFlatness: 0,
    nibAngle: 45,
    stabilization: 30,
  },
  fountain: {
    schemaVersion: HANDWRITING_SCHEMA_VERSION,
    brushKind: "fountain",
    pressureAmount: 85,
    pressureSensitivity: 50,
    nibFlatness: 40,
    nibAngle: 45,
    stabilization: 30,
  },
  highlighter: {
    schemaVersion: HANDWRITING_SCHEMA_VERSION,
    brushKind: "highlighter",
    pressureAmount: 0,
    pressureSensitivity: 50,
    nibFlatness: 70,
    nibAngle: 45,
    stabilization: 30,
  },
};

export const getDefaultBrushConfig = (
  brushKind: HandwritingBrushKind,
): HandwritingBrushConfig => ({ ...DEFAULT_BRUSH_CONFIGS[brushKind] });

const clampNumber = (value: unknown, min: number, max: number): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return NaN;
  }
  return Math.min(max, Math.max(min, num));
};

/**
 * Normalize arbitrary (possibly imported / restored) data into a valid
 * config. Returns `null` when the input cannot be interpreted at all
 * (unknown brushKind, missing object, NaN values) so callers can fall back to
 * legacy behavior (DATA-04: never crash on bad data).
 */
export const normalizeBrushConfig = (
  input: unknown,
): HandwritingBrushConfig | null => {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const raw = input as Record<string, unknown>;

  const brushKind = isHandwritingBrushKind(raw.brushKind)
    ? raw.brushKind
    : null;
  if (!brushKind) {
    return null;
  }

  const defaults = DEFAULT_BRUSH_CONFIGS[brushKind];
  const pressureAmount = clampNumber(
    raw.pressureAmount ?? defaults.pressureAmount,
    BRUSH_PARAM_RANGES.pressureAmount.min,
    BRUSH_PARAM_RANGES.pressureAmount.max,
  );
  const pressureSensitivity = clampNumber(
    raw.pressureSensitivity ?? defaults.pressureSensitivity,
    BRUSH_PARAM_RANGES.pressureSensitivity.min,
    BRUSH_PARAM_RANGES.pressureSensitivity.max,
  );
  const nibFlatness = clampNumber(
    raw.nibFlatness ?? defaults.nibFlatness,
    BRUSH_PARAM_RANGES.nibFlatness.min,
    BRUSH_PARAM_RANGES.nibFlatness.max,
  );
  const nibAngle = clampNumber(
    raw.nibAngle ?? defaults.nibAngle,
    BRUSH_PARAM_RANGES.nibAngle.min,
    BRUSH_PARAM_RANGES.nibAngle.max,
  );
  const stabilization = clampNumber(
    raw.stabilization ?? defaults.stabilization,
    BRUSH_PARAM_RANGES.stabilization.min,
    BRUSH_PARAM_RANGES.stabilization.max,
  );

  if (
    [pressureAmount, pressureSensitivity, nibFlatness, nibAngle, stabilization]
      .map(Number.isFinite)
      .includes(false)
  ) {
    return null;
  }

  return {
    schemaVersion: HANDWRITING_SCHEMA_VERSION,
    brushKind,
    pressureAmount,
    pressureSensitivity,
    nibFlatness,
    nibAngle,
    stabilization,
  };
};

export const encodeBrushConfig = (
  config: HandwritingBrushConfig,
): HandwritingBrushConfig => {
  const normalized = normalizeBrushConfig(config);
  if (!normalized) {
    throw new Error("encodeBrushConfig: invalid brush config");
  }
  return normalized;
};

/**
 * Decode the brush config from an element's customData (DATA-02).
 *
 * Reads, in priority order:
 * 1. `customData.handwriting` — versioned phase-two object.
 * 2. `customData.handwritingBrush` — phase-one legacy string; mapped onto the
 *    matching defaults.
 *
 * Returns `null` for elements without handwriting data (regular strokes),
 * and never throws on malformed input. Unknown extra keys inside
 * `customData.handwriting` are ignored here and preserved by the caller
 * (restore/serialize), not dropped.
 */
export const decodeBrushConfig = (
  customData: unknown,
): HandwritingBrushConfig | null => {
  if (typeof customData !== "object" || customData === null) {
    return null;
  }
  const data = customData as HandwritingCustomData;

  if (typeof data.handwriting === "object" && data.handwriting !== null) {
    const normalized = normalizeBrushConfig(data.handwriting);
    if (normalized) {
      return normalized;
    }
    // Unknown / future schema versions and malformed objects fall through to
    // the legacy field below instead of crashing (safe degradation).
  }

  if (isHandwritingBrushKind(data.handwritingBrush)) {
    return getDefaultBrushConfig(data.handwritingBrush);
  }

  return null;
};

/**
 * Pressure response curve (BR-01).
 *
 * Raw pressure is clamped to [0, 1] first, then shaped with
 * `pResponse = p ^ gamma`, where `gamma = 2 ^ ((50 - sensitivity) / 25)`.
 *
 * - sensitivity = 50 → gamma = 1 (linear / neutral).
 * - sensitivity > 50 → gamma < 1, low pressures get a larger response.
 * - sensitivity < 50 → gamma > 1, the stroke needs firmer pressure.
 *
 * With pressureAmount = 0 the response curve does not influence width at all
 * (handled by the outline function using thinning = 0).
 */
export const pressureResponse = (
  pressure: number,
  sensitivity: number,
): number => {
  const p = Number.isFinite(pressure)
    ? Math.min(1, Math.max(0, pressure))
    : 0.5;
  const s = Number.isFinite(sensitivity)
    ? Math.min(100, Math.max(0, sensitivity))
    : 50;
  const gamma = Math.pow(2, (50 - s) / 25);
  return Math.pow(p, gamma);
};

/**
 * Map a 0–100 stabilization value onto a perfect-freehand `streamline`
 * option (BR-02/BR-08). Streamline interpolates by arc length
 * (`runningLength`), not by event count, so the result is decoupled from
 * pointer event frequency and converges to the real path end when the stroke
 * is finalized with `last: true`.
 */
export const stabilizationToStreamline = (stabilization: number): number => {
  const s = Number.isFinite(stabilization)
    ? Math.min(100, Math.max(0, stabilization))
    : BRUSH_PARAM_RANGES.stabilization.default;
  // 0 → 0.05 (near-raw path), 100 → 0.75 (heavily stabilized).
  return 0.05 + 0.7 * (s / 100);
};

/**
 * Map a 0–100 nib flatness value onto a minor/major axis ratio (BR-03).
 * Clamped to >= 0.15 to avoid degenerate slivers.
 */
export const flatnessToAxisRatio = (flatness: number): number => {
  const f = Number.isFinite(flatness)
    ? Math.min(100, Math.max(0, flatness))
    : 0;
  return Math.max(0.15, 1 - 0.85 * (f / 100));
};
