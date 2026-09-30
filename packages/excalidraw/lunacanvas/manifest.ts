/**
 * .lunacanvas manifest schema — shared type contract between the web
 * coordinator and the native app (SPEC §3.1, N07–N11).
 *
 * The container is a ZIP with extension `.lunacanvas`; this module types
 * and validates `manifest.json` only. Container-level checks (entry counts,
 * decompressed size budgets, path traversal, ZIP bombs) happen at archive
 * layer with the limits recorded in VALIDATION_LIMITS.
 */

export const LUNA_CANVAS_TYPE = "lunacanvas";
export const LUNA_CANVAS_SCHEMA_VERSION = 1;

export interface InkObjectEntry {
  /** Stable identity owned by the adapter layer (ADR-0002) — never an
   * index, coordinate hash, or Apple-internal stroke id. */
  objectId: string;
  /** Container-relative refs only — absolute paths and network URLs are
   * rejected at validation. */
  nativeAssetRef: string;
  previewRef?: string;
  hitGeometryRef?: string;
  /** 6-element affine [a, b, c, d, tx, ty]; v1 write path allows
   * scale+translate only (b === 0 && c === 0, no shear/negative scale). */
  worldTransform: [number, number, number, number, number, number];
  order: number;
  contentVersion: number;
  contentHash: string;
  /** ID replacement graph for local-erase split/modify (N16 / ADR-0002). */
  replacedBy?: string;
  splitFrom?: string;
}

export interface ManifestResource {
  path: string;
  sha256: string;
  byteSize: number;
}

export interface LunaCanvasManifest {
  type: typeof LUNA_CANVAS_TYPE;
  schemaVersion: number;
  documentId: string;
  revision: number;
  capabilities: string[];
  sceneRef: string;
  inkObjects: InkObjectEntry[];
  resources: ManifestResource[];
  /** Explicit layer strategy: v1 pins native ink above graphics. */
  layerStrategy: "ink-above-graphics";
}

/** Closed set of capability strings v1 understands (extensible by version). */
export const KNOWN_CAPABILITIES = [
  "ink",
  "graphics",
  "hit-geometry",
  "preview",
] as const;

export const VALIDATION_LIMITS = {
  // pretty-printed manifest is ~400B per ink object; 20MB supports ~50k
  // objects — real memory is bounded by the decompression total budget
  maxManifestChars: 20_000_000,
  maxInkObjects: 5_000,
  maxResources: 10_000,
  maxEntryPathLength: 512,
  /** Reject transforms that v1 cannot write back (SPEC 3.2). */
  transformEpsilon: 1e-9,
} as const;

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
  manifest?: LunaCanvasManifest;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isRef = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= VALIDATION_LIMITS.maxEntryPathLength &&
  !v.includes("\\") &&
  !v.includes("\0") &&
  !v.startsWith("/") &&
  !/^[a-zA-Z]:/.test(v) &&
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) &&
  !v.split("/").includes("..");

const validateTransform = (
  t: unknown,
  errors: string[],
  where: string,
): t is InkObjectEntry["worldTransform"] => {
  if (
    !Array.isArray(t) ||
    t.length !== 6 ||
    !t.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    errors.push(`${where}: worldTransform must be 6 finite numbers`);
    return false;
  }
  const [a, b, c, d] = t as number[];
  // v1 write path: UNIFORM POSITIVE scale + translate only
  if (
    Math.abs(b) > VALIDATION_LIMITS.transformEpsilon ||
    Math.abs(c) > VALIDATION_LIMITS.transformEpsilon ||
    !(a > 0) ||
    !(d > 0) ||
    Math.abs(a - d) > VALIDATION_LIMITS.transformEpsilon
  ) {
    errors.push(
      `${where}: transform must be uniform positive scale + translate`,
    );
    return false;
  }
  return true;
};

/**
 * Full manifest validation (N11): unknown schema versions and malformed
 * structures are rejected with errors — never coerced, so a failed import
 * can never silently produce a half-parsed document.
 */
export const validateManifest = (raw: unknown): ManifestValidationResult => {
  const errors: string[] = [];
  // structurally valid ink entries, for the later ref-existence pass
  const validEntries: Record<string, unknown>[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["manifest is not an object"] };
  }
  const m = raw as Record<string, unknown>;

  if (m.type !== LUNA_CANVAS_TYPE) {
    errors.push(`type must be "${LUNA_CANVAS_TYPE}"`);
  }
  if (m.schemaVersion !== LUNA_CANVAS_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${String(m.schemaVersion)}`);
  }
  if (typeof m.documentId !== "string" || !m.documentId) {
    errors.push("documentId is required");
  }
  if (!isFiniteNumber(m.revision) || m.revision < 0) {
    errors.push("revision must be a non-negative finite number");
  }
  if (typeof m.sceneRef !== "string" || !isRef(m.sceneRef)) {
    errors.push("sceneRef must be a valid container-relative ref");
  }
  if (!Array.isArray(m.capabilities)) {
    errors.push("capabilities must be an array of known capability strings");
  } else {
    const known = KNOWN_CAPABILITIES as readonly string[];
    for (const cap of m.capabilities) {
      if (typeof cap !== "string" || !known.includes(cap)) {
        errors.push(`unknown capability: ${String(cap)}`);
      }
    }
  }
  if (m.layerStrategy !== "ink-above-graphics") {
    errors.push(`unknown layerStrategy: ${String(m.layerStrategy)}`);
  }

  const inkObjects = Array.isArray(m.inkObjects) ? m.inkObjects : null;
  if (!inkObjects) {
    errors.push("inkObjects must be an array");
  } else {
    if (inkObjects.length > VALIDATION_LIMITS.maxInkObjects) {
      errors.push(`too many inkObjects (>${VALIDATION_LIMITS.maxInkObjects})`);
    }
    const seen = new Set<string>();
    inkObjects.forEach((entry, i) => {
      const where = `inkObjects[${i}]`;
      if (typeof entry !== "object" || entry === null) {
        errors.push(`${where}: not an object`);
        return;
      }
      validEntries.push(entry as Record<string, unknown>);
      const e = entry as Record<string, unknown>;
      if (typeof e.objectId !== "string" || !e.objectId) {
        errors.push(`${where}: objectId is required`);
      } else if (seen.has(e.objectId)) {
        errors.push(`${where}: duplicate objectId ${e.objectId}`);
      } else {
        seen.add(e.objectId);
      }
      if (!isRef(e.nativeAssetRef)) {
        errors.push(`${where}: invalid nativeAssetRef`);
      }
      if (e.previewRef !== undefined && !isRef(e.previewRef)) {
        errors.push(`${where}: invalid previewRef`);
      }
      if (e.hitGeometryRef !== undefined && !isRef(e.hitGeometryRef)) {
        errors.push(`${where}: invalid hitGeometryRef`);
      }
      if (!validateTransform(e.worldTransform, errors, where)) {
        // error already recorded
      }
      if (!isFiniteNumber(e.order) || e.order < 0) {
        errors.push(`${where}: order must be a non-negative number`);
      }
      if (!isFiniteNumber(e.contentVersion) || e.contentVersion < 1) {
        errors.push(`${where}: contentVersion must be >= 1`);
      }
      if (typeof e.contentHash !== "string" || !e.contentHash) {
        errors.push(`${where}: contentHash is required`);
      }
    });
  }

  const resources = Array.isArray(m.resources) ? m.resources : null;
  const resourcePaths = new Set<string>();
  if (!resources) {
    errors.push("resources must be an array");
  } else {
    if (resources.length > VALIDATION_LIMITS.maxResources) {
      errors.push(`too many resources (>${VALIDATION_LIMITS.maxResources})`);
    }
    resources.forEach((r, i) => {
      const where = `resources[${i}]`;
      if (typeof r !== "object" || r === null) {
        errors.push(`${where}: not an object`);
        return;
      }
      const e = r as Record<string, unknown>;
      if (!isRef(e.path)) {
        errors.push(`${where}: invalid path`);
      } else if (resourcePaths.has(e.path)) {
        errors.push(`${where}: duplicate resource path ${e.path}`);
      } else {
        resourcePaths.add(e.path);
      }
      if (typeof e.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(e.sha256)) {
        errors.push(`${where}: sha256 must be 64 lowercase-hex chars`);
      }
      if (
        !isFiniteNumber(e.byteSize) ||
        e.byteSize <= 0 ||
        !Number.isInteger(e.byteSize)
      ) {
        errors.push(`${where}: byteSize must be a positive integer`);
      }
    });
  }

  // every referenced asset must exist in the resource table (N10);
  // only structurally valid entries are dereferenced (0029-R3)
  if (validEntries.length > 0 && resources) {
    const checkRef = (ref: unknown, where: string) => {
      if (typeof ref === "string" && !resourcePaths.has(ref)) {
        errors.push(`${where}: ref "${ref}" is missing from resources table`);
      }
    };
    checkRef(m.sceneRef, "sceneRef");
    for (const e of validEntries) {
      const where = `inkObjects ${String(e.objectId)}`;
      checkRef(e.nativeAssetRef, `${where} nativeAssetRef`);
      checkRef(e.previewRef, `${where} previewRef`);
      checkRef(e.hitGeometryRef, `${where} hitGeometryRef`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, errors: [], manifest: m as unknown as LunaCanvasManifest };
};
