/**
 * Handwriting brush configuration types (phase two).
 *
 * Data contract (SPEC DATA-01/DATA-02):
 * - Every new freedraw stroke stores a full parameter snapshot under
 *   `element.customData.handwriting` (versioned object).
 * - The legacy `element.customData.handwritingBrush` string is still read for
 *   old files, but never written anymore.
 */

/** Current schema version of the `customData.handwriting` object. */
export const HANDWRITING_SCHEMA_VERSION = 1;

export type HandwritingBrushKind = "standard" | "fountain" | "highlighter";

export const HANDWRITING_BRUSH_KINDS: readonly HandwritingBrushKind[] = [
  "standard",
  "fountain",
  "highlighter",
];

export const isHandwritingBrushKind = (
  value: unknown,
): value is HandwritingBrushKind =>
  HANDWRITING_BRUSH_KINDS.includes(value as HandwritingBrushKind);

/**
 * Versioned brush parameter snapshot stored on each stroke.
 *
 * Width / color / opacity intentionally stay in the existing element fields
 * (strokeWidth, strokeColor, opacity) — this object only carries the new
 * phase-two parameters so there is no duplicated source of truth (DATA-01).
 */
export interface HandwritingBrushConfig {
  schemaVersion: number;
  brushKind: HandwritingBrushKind;
  /** 压力幅度 (pressure amount) 0–100. Amplitude of pressure-driven width
   * change; 0 means constant width regardless of pressure. */
  pressureAmount: number;
  /** 笔尖灵敏度 (pressure sensitivity) 0–100. Shapes the pressure response
   * curve `p ^ gamma` with `gamma = 2 ^ ((50 - sensitivity) / 25)`. */
  pressureSensitivity: number;
  /** 笔尖扁平度 (nib flatness) 0–100. Compression of the minor axis of the
   * elliptical nib relative to its major axis. */
  nibFlatness: number;
  /** 笔尖角度 (nib angle) 0–180 degrees. Fixed orientation of the flat nib
   * in canvas coordinates (phase two does not read hardware tilt). */
  nibAngle: number;
  /** 画笔稳定性 (stabilization) 0–100. Reduces path jitter; 0 keeps the raw
   * path. */
  stabilization: number;
}

export type HandwritingCustomData = {
  handwriting?: Partial<HandwritingBrushConfig> & Record<string, unknown>;
  handwritingBrush?: string;
} & Record<string, unknown>;
