/**
 * .lunacanvas container-level validation (W02/W03, N11).
 *
 * The manifest validator (manifest.ts) checks the document contract; this
 * module checks the ZIP envelope itself — entry budgets are enforced from
 * archive metadata BEFORE any payload is decompressed, so a crafted archive
 * cannot force full expansion to discover it is too large.
 */

import { VALIDATION_LIMITS, validateManifest } from "./manifest";

export const CONTAINER_LIMITS = {
  // each ink object carries up to 3 entries (drawing/preview/hit), so the
  // entry budget must exceed 3x the ink-object budget; entry metadata is
  // tiny (path + sizes) — the decompression total is the real bomb guard
  maxEntries: 100_000,
  /** total decompressed budget across all entries */
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxSingleEntryBytes: 128 * 1024 * 1024,
  maxManifestBytes: VALIDATION_LIMITS.maxManifestChars,
  /** image decode budget (previews): side length in px */
  maxImageSidePx: 16_384,
} as const;

export interface ContainerEntryMeta {
  path: string;
  uncompressedSize: number;
}

export type ContainerEntrySource = {
  /** archive metadata without decompressed payloads */
  entries: ContainerEntryMeta[];
  readEntry: (path: string) => Promise<Uint8Array>;
};

export interface ContainerValidationResult {
  ok: boolean;
  errors: string[];
}

/** Normalized container-relative path rules, shared by TS and Swift. */
export const isSafeContainerPath = (path: unknown): path is string => {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }
  if (path.length > VALIDATION_LIMITS.maxEntryPathLength) {
    return false;
  }
  if (
    path.includes("\\") || // backslashes are not container separators
    path.includes("\0") ||
    path.startsWith("/") ||
    /^[a-zA-Z]:/.test(path) || // drive letters
    /^[a-z][a-z0-9+.-]*:\/\//i.test(path) // URLs
  ) {
    return false;
  }
  const segments = path.split("/");
  if (segments.some((s) => s === ".." || (s === "" && path !== ""))) {
    return false;
  }
  // no trailing slash on file entries; directory entries end with "/"
  return true;
};

/**
 * Envelope validation from entry metadata only (no decompression):
 * budgets, duplicate paths, path traversal. Call BEFORE reading payloads.
 */
export const validateContainerMetadata = (
  entries: readonly ContainerEntryMeta[],
): ContainerValidationResult => {
  const errors: string[] = [];
  if (entries.length > CONTAINER_LIMITS.maxEntries) {
    errors.push(`too many entries (>${CONTAINER_LIMITS.maxEntries})`);
  }
  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (!isSafeContainerPath(entry.path)) {
      errors.push(`unsafe entry path: ${JSON.stringify(entry.path)}`);
      continue;
    }
    if (seen.has(entry.path)) {
      errors.push(`duplicate entry path: ${entry.path}`);
    }
    seen.add(entry.path);
    if (
      !Number.isFinite(entry.uncompressedSize) ||
      entry.uncompressedSize < 0
    ) {
      errors.push(`bad uncompressedSize for ${entry.path}`);
      continue;
    }
    if (entry.uncompressedSize > CONTAINER_LIMITS.maxSingleEntryBytes) {
      errors.push(`entry too large: ${entry.path}`);
    }
    total += entry.uncompressedSize;
  }
  if (total > CONTAINER_LIMITS.maxTotalUncompressedBytes) {
    errors.push(
      `decompressed total ${total} exceeds budget ${CONTAINER_LIMITS.maxTotalUncompressedBytes}`,
    );
  }
  return { ok: errors.length === 0, errors };
};

/**
 * Full container validation: metadata budgets first, then manifest rules,
 * then resource byte/hash consistency. `source` provides archive access.
 * Any failure returns errors — the caller keeps the old document (N11).
 */
export const validateContainer = async (
  source: ContainerEntrySource,
): Promise<ContainerValidationResult & { manifest?: unknown }> => {
  const meta = validateContainerMetadata(source.entries);
  if (!meta.ok) {
    return meta;
  }

  const manifestEntry = source.entries.find((e) => e.path === "manifest.json");
  if (!manifestEntry) {
    return { ok: false, errors: ["manifest.json missing"] };
  }
  if (manifestEntry.uncompressedSize > CONTAINER_LIMITS.maxManifestBytes) {
    return {
      ok: false,
      errors: [
        `manifest.json exceeds ${CONTAINER_LIMITS.maxManifestBytes} bytes`,
      ],
    };
  }

  let manifestRaw: unknown;
  try {
    const bytes = await source.readEntry("manifest.json");
    manifestRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, errors: ["manifest.json is not valid JSON"] };
  }

  const manifestResult = validateManifest(manifestRaw);
  if (!manifestResult.ok) {
    return { ok: false, errors: manifestResult.errors };
  }
  const manifest = manifestResult.manifest!;

  // resource byte/hash consistency (bounded by metadata budgets above)
  const errors: string[] = [];
  const cryptoImpl = await import("crypto");
  for (const resource of manifest.resources) {
    let bytes: Uint8Array;
    try {
      bytes = await source.readEntry(resource.path);
    } catch {
      errors.push(`resource unreadable: ${resource.path}`);
      continue;
    }
    if (bytes.byteLength !== resource.byteSize) {
      errors.push(`resource size mismatch: ${resource.path}`);
      continue;
    }
    const actual = cryptoImpl.createHash("sha256").update(bytes).digest("hex");
    if (actual !== resource.sha256.toLowerCase()) {
      errors.push(`resource hash mismatch: ${resource.path}`);
    }
  }

  return { ok: errors.length === 0, errors, manifest: manifestRaw };
};
