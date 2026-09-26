import {
  encodeBrushConfig,
  getDefaultBrushConfig,
  normalizeBrushConfig,
} from "@excalidraw/element/handwriting/brushParams";
import {
  HANDWRITING_BRUSH_KINDS,
  isHandwritingBrushKind,
  type HandwritingBrushConfig,
} from "@excalidraw/element/handwriting/types";

/**
 * Personal brush preset library (phase two, SPEC PRE-01~PRE-06 / DATA-06).
 *
 * Pure logic module: no network, no account database. Personal presets are
 * persisted to a Storage backend (localStorage by default, in-memory fallback)
 * under a versioned, namespaced key. Built-in presets are read-only.
 *
 * All methods return error objects instead of throwing on bad input, so a
 * broken preset store can never prevent drawing (PRE-04).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage-style key for the personal preset store (DATA-06). */
export const BRUSH_PRESETS_STORAGE_KEY =
  "excalidraw.handwriting.brushPresets.v1";

/** Discriminator used both for persistence and import/export files. */
export const BRUSH_PRESETS_TYPE = "excalidraw-brush-presets";

/** Current file/schema version. Unknown versions degrade gracefully. */
export const BRUSH_PRESETS_SCHEMA_VERSION = 1;

/** Suggested file extension for exported preset files. */
export const BRUSH_PRESETS_FILE_EXTENSION = "brush-presets.json";

export const PRESET_NAME_MIN_LENGTH = 1;
export const PRESET_NAME_MAX_LENGTH = 40;
export const MAX_PERSONAL_PRESETS = 12;
export const MAX_IMPORT_PRESETS = 200;
export const MAX_IMPORT_JSON_CHARS = 2_000_000;

export const STROKE_WIDTH_RANGE = { min: 0.25, max: 12 } as const;
export const OPACITY_RANGE = { min: 1, max: 100 } as const;
export const STROKE_COLOR_PATTERN = /^#[\da-f]{6}$/i;

/** Display names for the read-only built-in presets (UI maps to i18n). */
export const BUILTIN_PRESET_NAMES: Record<string, string> = {
  standard: "Pen",
  fountain: "Fountain pen",
  highlighter: "Highlighter",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrushPreset {
  /** Stable id: generated on creation, unchanged by rename/update. */
  id: string;
  /** Trimmed, 1–40 characters, unique within the library (case-insensitive). */
  name: string;
  brushKind: "standard" | "fountain" | "highlighter";
  strokeWidth: number;
  strokeColor: string;
  opacity: number;
  /** pressureAmount/pressureSensitivity/nibFlatness/nibAngle/stabilization. */
  config: HandwritingBrushConfig;
  updatedAt: number;
}

export type BrushPresetInput = Omit<BrushPreset, "id" | "updatedAt">;

export type BrushPresetMutationResult =
  | { ok: true; preset: BrushPreset }
  | { ok: false; errors: string[] };

export type PresetNameConflictPolicy = "error" | "suffix";

export type ImportNameConflictPolicy = "suffix" | "skip" | "error";

export type ImportPresetsResult =
  | { ok: true; presets: BrushPreset[]; renamed: number; skipped: number }
  | { ok: false; errors: string[] };

export interface PresetLibraryOptions {
  storage?: Storage;
  storageKey?: string;
  now?: () => number;
  idGenerator?: () => string;
}

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

export type PresetNameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Validate a preset name (PRE-02): trims, rejects empty / >40 chars, and
 * reports case-insensitive duplicates against `existingNames`. Never renames
 * silently — the caller decides between erroring or appending a suffix via
 * `suggestUniqueName`.
 */
export const validatePresetName = (
  name: unknown,
  existingNames: readonly string[],
): PresetNameValidation => {
  if (typeof name !== "string") {
    return { ok: false, error: "Preset name must be a string" };
  }
  const trimmed = name.trim();
  if (trimmed.length < PRESET_NAME_MIN_LENGTH) {
    return { ok: false, error: "Preset name cannot be empty" };
  }
  if (trimmed.length > PRESET_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Preset name must be at most ${PRESET_NAME_MAX_LENGTH} characters`,
    };
  }
  const lower = trimmed.toLowerCase();
  if (existingNames.some((existing) => existing.toLowerCase() === lower)) {
    return { ok: false, error: `Preset name "${trimmed}" already exists` };
  }
  return { ok: true, name: trimmed };
};

/**
 * Return `name` trimmed, or with a " (2)" / " (3)" … suffix until it no
 * longer conflicts (case-insensitive) with `existingNames`.
 */
export const suggestUniqueName = (
  name: string,
  existingNames: readonly string[],
): string => {
  const trimmed = name.trim();
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  let suffix = 2;
  while (taken.has(`${trimmed} (${suffix})`.toLowerCase())) {
    suffix += 1;
  }
  return `${trimmed} (${suffix})`;
};

// ---------------------------------------------------------------------------
// Preset validation
// ---------------------------------------------------------------------------

const validatePresetShape = (
  raw: unknown,
  opts: { requireId: boolean; requireUpdatedAt?: boolean },
): { errors: string[]; value?: Record<string, unknown> } => {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { errors: ["Preset must be an object"] };
  }
  const value = raw as Record<string, unknown>;

  if (opts.requireId) {
    if (typeof value.id !== "string" || value.id.trim().length === 0) {
      errors.push("Preset id must be a non-empty string");
    }
  }

  const nameCheck = validatePresetName(value.name, []);
  if (!nameCheck.ok) {
    errors.push(nameCheck.error);
  }

  if (!isHandwritingBrushKind(value.brushKind)) {
    errors.push(
      `brushKind must be one of: ${HANDWRITING_BRUSH_KINDS.join(", ")}`,
    );
  }

  const strokeWidth = value.strokeWidth;
  if (
    typeof strokeWidth !== "number" ||
    !Number.isFinite(strokeWidth) ||
    strokeWidth < STROKE_WIDTH_RANGE.min ||
    strokeWidth > STROKE_WIDTH_RANGE.max
  ) {
    errors.push(
      `strokeWidth must be a finite number between ${STROKE_WIDTH_RANGE.min} and ${STROKE_WIDTH_RANGE.max}`,
    );
  }

  if (
    typeof value.strokeColor !== "string" ||
    !STROKE_COLOR_PATTERN.test(value.strokeColor)
  ) {
    errors.push('strokeColor must be a "#rrggbb" color string');
  }

  const opacity = value.opacity;
  if (
    typeof opacity !== "number" ||
    !Number.isFinite(opacity) ||
    opacity < OPACITY_RANGE.min ||
    opacity > OPACITY_RANGE.max
  ) {
    errors.push(
      `opacity must be a finite number between ${OPACITY_RANGE.min} and ${OPACITY_RANGE.max}`,
    );
  }

  if (normalizeBrushConfig(value.config) === null) {
    errors.push("config is not a valid handwriting brush config");
  }

  if (opts.requireUpdatedAt !== false) {
    const updatedAt = value.updatedAt;
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
      errors.push("updatedAt must be a finite number");
    }
  }

  return { errors, value };
};

/**
 * Validate arbitrary (possibly restored / imported) data as a complete
 * `BrushPreset`. Returns the normalized preset on success; bad data yields
 * `{ ok: false, errors }` — this function never throws.
 */
export const validateBrushPreset = (
  raw: unknown,
): BrushPresetMutationResult => {
  const { errors, value } = validatePresetShape(raw, { requireId: true });
  if (errors.length > 0 || !value) {
    return { ok: false, errors };
  }
  const config = encodeBrushConfig(value.config as HandwritingBrushConfig);
  return {
    ok: true,
    preset: {
      id: value.id as string,
      name: (value.name as string).trim(),
      brushKind: value.brushKind as BrushPreset["brushKind"],
      strokeWidth: value.strokeWidth as number,
      strokeColor: value.strokeColor as string,
      opacity: value.opacity as number,
      config,
      updatedAt: value.updatedAt as number,
    },
  };
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/** Minimal in-memory Storage used when no real one is available. */
const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  } as Storage;
};

const resolveDefaultStorage = (): Storage => {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      return globalThis.localStorage;
    }
  } catch {
    // Accessing localStorage can throw (e.g. blocked cookies) — fall through.
  }
  return createMemoryStorage();
};

let fallbackIdCounter = 0;

const defaultIdGenerator = (): string => {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  fallbackIdCounter += 1;
  return `preset-${Date.now().toString(36)}-${fallbackIdCounter.toString(
    36,
  )}-${Math.random().toString(36).slice(2, 8)}`;
};

const clonePreset = (preset: BrushPreset): BrushPreset => ({
  ...preset,
  config: { ...preset.config },
});

const createBuiltinPresets = (): readonly BrushPreset[] =>
  HANDWRITING_BRUSH_KINDS.map((kind) => ({
    id: `builtin-${kind}`,
    name: BUILTIN_PRESET_NAMES[kind] ?? kind,
    brushKind: kind,
    // Keep these in sync with the brush panel defaults
    // (HandwritingBrushPanel.tsx BUILTIN_* tables): selecting a built-in
    // preset must not immediately show as "modified".
    strokeWidth: kind === "highlighter" ? 6 : 1,
    strokeColor: kind === "highlighter" ? "#fab005" : "#1b1b1f",
    opacity: kind === "highlighter" ? 30 : 100,
    config: getDefaultBrushConfig(kind),
    updatedAt: 0,
  }));

// ---------------------------------------------------------------------------
// Preset library
// ---------------------------------------------------------------------------

interface PersistedPresetFile {
  type: typeof BRUSH_PRESETS_TYPE;
  schemaVersion: number;
  presets: BrushPreset[];
}

export class BrushPresetLibrary {
  private readonly storage: Storage;
  private readonly storageKey: string;
  private readonly now: () => number;
  private readonly idGenerator: () => string;
  private readonly builtinPresets: readonly BrushPreset[];
  private personalPresets: BrushPreset[] = [];
  private corruptData = false;
  private droppedPresetCount = 0;
  private persistError: string | null = null;

  constructor(options: PresetLibraryOptions = {}) {
    this.storage = options.storage ?? resolveDefaultStorage();
    this.storageKey = options.storageKey ?? BRUSH_PRESETS_STORAGE_KEY;
    this.now = options.now ?? (() => Date.now());
    this.idGenerator = options.idGenerator ?? defaultIdGenerator;
    this.builtinPresets = createBuiltinPresets();
    this.load();
  }

  /** Personal presets only (built-ins excluded), as defensive copies. */
  list(): BrushPreset[] {
    return this.personalPresets.map(clonePreset);
  }

  /** The three read-only built-in presets. */
  getBuiltinPresets(): readonly BrushPreset[] {
    return this.builtinPresets;
  }

  /** Look up a preset by id; searches personal presets, then built-ins. */
  get(id: string): BrushPreset | undefined {
    const preset =
      this.personalPresets.find((p) => p.id === id) ??
      this.builtinPresets.find((p) => p.id === id);
    return preset ? clonePreset(preset) : undefined;
  }

  /**
   * Add a personal preset (max `MAX_PERSONAL_PRESETS`). Name conflicts are
   * rejected in "error" mode (default) or auto-suffixed in "suffix" mode.
   */
  add(
    input: BrushPresetInput,
    opts: { onNameConflict?: PresetNameConflictPolicy } = {},
  ): BrushPresetMutationResult {
    if (this.personalPresets.length >= MAX_PERSONAL_PRESETS) {
      return {
        ok: false,
        errors: [
          `Preset library is full (maximum ${MAX_PERSONAL_PRESETS} personal presets)`,
        ],
      };
    }
    const onNameConflict = opts.onNameConflict ?? "error";
    const { errors, value } = validatePresetShape(input, {
      requireId: false,
      requireUpdatedAt: false,
    });
    if (errors.length > 0 || !value) {
      return { ok: false, errors };
    }
    const nameResult = this.resolveName(
      value.name as string,
      undefined,
      onNameConflict,
    );
    if (!nameResult.ok) {
      return nameResult;
    }
    const preset: BrushPreset = {
      id: this.idGenerator(),
      name: nameResult.name,
      brushKind: value.brushKind as BrushPreset["brushKind"],
      strokeWidth: value.strokeWidth as number,
      strokeColor: value.strokeColor as string,
      opacity: value.opacity as number,
      config: encodeBrushConfig(value.config as HandwritingBrushConfig),
      updatedAt: this.now(),
    };
    this.personalPresets.push(preset);
    this.persist();
    return { ok: true, preset: clonePreset(preset) };
  }

  /**
   * Update parameters / name of a personal preset. Built-in ids are
   * read-only. Name conflicts exclude the preset being updated.
   */
  update(
    id: string,
    patch: Partial<BrushPresetInput>,
    opts: { onNameConflict?: PresetNameConflictPolicy } = {},
  ): BrushPresetMutationResult {
    const index = this.personalPresets.findIndex((p) => p.id === id);
    if (index === -1) {
      if (this.builtinPresets.some((p) => p.id === id)) {
        return { ok: false, errors: ["Built-in presets are read-only"] };
      }
      return { ok: false, errors: [`Preset "${id}" not found`] };
    }
    const current = this.personalPresets[index];
    const merged: Record<string, unknown> = { ...current, ...patch, id };
    const { errors, value } = validatePresetShape(merged, { requireId: true });
    if (errors.length > 0 || !value) {
      return { ok: false, errors };
    }
    const onNameConflict = opts.onNameConflict ?? "error";
    const nameResult = this.resolveName(
      value.name as string,
      id,
      onNameConflict,
    );
    if (!nameResult.ok) {
      return nameResult;
    }
    const preset: BrushPreset = {
      ...current,
      name: nameResult.name,
      brushKind: value.brushKind as BrushPreset["brushKind"],
      strokeWidth: value.strokeWidth as number,
      strokeColor: value.strokeColor as string,
      opacity: value.opacity as number,
      config: encodeBrushConfig(value.config as HandwritingBrushConfig),
      updatedAt: this.now(),
    };
    this.personalPresets[index] = preset;
    this.persist();
    return { ok: true, preset: clonePreset(preset) };
  }

  /** Rename a preset; same validation as update. */
  rename(
    id: string,
    newName: string,
    opts: { onNameConflict?: PresetNameConflictPolicy } = {},
  ): BrushPresetMutationResult {
    return this.update(id, { name: newName }, opts);
  }

  /**
   * Duplicate a preset (personal or built-in) as a new personal preset with
   * an auto-suffixed name ("X copy", "X copy (2)", …).
   */
  duplicate(id: string): BrushPresetMutationResult {
    const source =
      this.personalPresets.find((p) => p.id === id) ??
      this.builtinPresets.find((p) => p.id === id);
    if (!source) {
      return { ok: false, errors: [`Preset "${id}" not found`] };
    }
    if (this.personalPresets.length >= MAX_PERSONAL_PRESETS) {
      return {
        ok: false,
        errors: [
          `Preset library is full (maximum ${MAX_PERSONAL_PRESETS} personal presets)`,
        ],
      };
    }
    const name = suggestUniqueName(
      `${source.name} copy`,
      this.personalPresets.map((p) => p.name),
    );
    const input: BrushPresetInput = {
      name,
      brushKind: source.brushKind,
      strokeWidth: source.strokeWidth,
      strokeColor: source.strokeColor,
      opacity: source.opacity,
      config: { ...source.config },
    };
    return this.add(input);
  }

  /** Delete a personal preset. Built-ins are read-only. Returns success. */
  remove(id: string): boolean {
    const index = this.personalPresets.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }
    this.personalPresets.splice(index, 1);
    this.persist();
    return true;
  }

  /**
   * Message of the last failed save attempt, or null when the last persist
   * succeeded (or nothing was persisted yet). Lets the UI report "changes are
   * not saved" instead of showing fake success (PRE-04).
   */
  getPersistError(): string | null {
    return this.persistError;
  }

  /**
   * True when stored data had to be recovered: malformed JSON, unknown
   * schemaVersion, or invalid entries that were dropped.
   */
  hadCorruptData(): boolean {
    return this.corruptData;
  }

  /** Number of individual invalid entries dropped while loading. */
  getDroppedPresetCount(): number {
    return this.droppedPresetCount;
  }

  // -- internals -----------------------------------------------------------

  private resolveName(
    rawName: string,
    excludeId: string | undefined,
    policy: PresetNameConflictPolicy,
  ): { ok: true; name: string } | { ok: false; errors: string[] } {
    const existingNames = this.personalPresets
      .filter((p) => p.id !== excludeId)
      .map((p) => p.name);
    const check = validatePresetName(rawName, existingNames);
    if (check.ok) {
      return { ok: true, name: check.name };
    }
    if (!check.error.includes("already exists")) {
      return { ok: false, errors: [check.error] };
    }
    if (policy === "suffix") {
      return { ok: true, name: suggestUniqueName(rawName, existingNames) };
    }
    return { ok: false, errors: [check.error] };
  }

  private load(): void {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch {
      this.corruptData = true;
      return;
    }
    if (raw === null) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.corruptData = true;
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      this.corruptData = true;
      return;
    }
    const file = parsed as Partial<PersistedPresetFile>;
    if (
      file.type !== BRUSH_PRESETS_TYPE ||
      file.schemaVersion !== BRUSH_PRESETS_SCHEMA_VERSION ||
      !Array.isArray(file.presets)
    ) {
      this.corruptData = true;
      return;
    }
    const valid: BrushPreset[] = [];
    for (const entry of file.presets) {
      const result = validateBrushPreset(entry);
      if (result.ok) {
        valid.push(result.preset);
      } else {
        this.droppedPresetCount += 1;
      }
    }
    if (this.droppedPresetCount > 0) {
      this.corruptData = true;
    }
    this.personalPresets = valid;
  }

  private persist(): void {
    const file: PersistedPresetFile = {
      type: BRUSH_PRESETS_TYPE,
      schemaVersion: BRUSH_PRESETS_SCHEMA_VERSION,
      presets: this.personalPresets,
    };
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(file));
      this.persistError = null;
    } catch (error) {
      // Quota / serialization failures must never break drawing (PRE-04):
      // remember the failure so the UI can surface it.
      this.persistError =
        error instanceof Error ? error.message : String(error);
    }
  }
}

/** Create a preset library over the given (or default) storage backend. */
export const createPresetLibrary = (
  options: PresetLibraryOptions = {},
): BrushPresetLibrary => new BrushPresetLibrary(options);

let defaultLibrary: BrushPresetLibrary | null = null;

/** Lazily-created shared library over the default storage (UI entry point). */
export const getDefaultPresetLibrary = (): BrushPresetLibrary => {
  if (!defaultLibrary) {
    defaultLibrary = createPresetLibrary();
  }
  return defaultLibrary;
};

// ---------------------------------------------------------------------------
// Import / export (PRE-05)
// ---------------------------------------------------------------------------

/** Serialize presets to the versioned JSON file format. */
export const exportPresetsToJSON = (presets: BrushPreset[]): string =>
  JSON.stringify({
    type: BRUSH_PRESETS_TYPE,
    schemaVersion: BRUSH_PRESETS_SCHEMA_VERSION,
    presets,
  });

/**
 * Parse a preset JSON file without touching the library or any document /
 * stroke data. `existing` is only consulted for id/name conflict detection
 * and is never mutated; the caller decides how to merge the returned array.
 */
export const importPresetsFromJSON = (
  json: string,
  existing: readonly BrushPreset[],
  opts: { onNameConflict?: ImportNameConflictPolicy } = {},
): ImportPresetsResult => {
  if (json.length > MAX_IMPORT_JSON_CHARS) {
    return {
      ok: false,
      errors: [
        `Preset file is too large (maximum ${MAX_IMPORT_JSON_CHARS} characters)`,
      ],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["Preset file is not valid JSON"] };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, errors: ["Preset file must be a JSON object"] };
  }
  const file = parsed as Partial<PersistedPresetFile>;
  if (file.type !== BRUSH_PRESETS_TYPE) {
    return {
      ok: false,
      errors: [`Preset file has unknown type: ${String(file.type)}`],
    };
  }
  if (!Array.isArray(file.presets)) {
    return { ok: false, errors: ["Preset file must contain a presets array"] };
  }
  if (file.presets.length > MAX_IMPORT_PRESETS) {
    return {
      ok: false,
      errors: [
        `Preset file contains too many presets (maximum ${MAX_IMPORT_PRESETS})`,
      ],
    };
  }
  const onNameConflict = opts.onNameConflict ?? "suffix";

  const takenIds = new Set(existing.map((p) => p.id));
  const takenNames = new Set(existing.map((p) => p.name.toLowerCase()));
  const imported: BrushPreset[] = [];
  let renamed = 0;
  let skipped = 0;

  for (const entry of file.presets) {
    const result = validateBrushPreset(entry);
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    const preset = result.preset;
    if (takenIds.has(preset.id)) {
      // Id collision: remap to a fresh id but keep the original name.
      preset.id = `imported-${takenIds.size + imported.length}-${String(
        preset.updatedAt,
      )}`;
      let attempt = 0;
      while (takenIds.has(preset.id)) {
        attempt += 1;
        preset.id = `imported-${attempt}-${String(preset.updatedAt)}`;
      }
    }
    takenIds.add(preset.id);

    const lowerName = preset.name.toLowerCase();
    if (takenNames.has(lowerName)) {
      if (onNameConflict === "error") {
        return {
          ok: false,
          errors: [`Preset name "${preset.name}" already exists`],
        };
      }
      if (onNameConflict === "skip") {
        skipped += 1;
        continue;
      }
      preset.name = suggestUniqueName(preset.name, [...takenNames]);
      renamed += 1;
    }
    takenNames.add(preset.name.toLowerCase());
    imported.push(preset);
  }

  return { ok: true, presets: imported, renamed, skipped };
};
