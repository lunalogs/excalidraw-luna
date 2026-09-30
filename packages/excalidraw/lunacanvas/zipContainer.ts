/**
 * Real-ZIP adapter for .lunacanvas containers (0048-R6).
 *
 * `openLunacanvasContainer` validates an actual ZIP archive in the browser
 * (jszip works in browsers and Node): entry budgets are enforced from the
 * central-directory metadata BEFORE any payload is decompressed, and the
 * read path independently enforces per-entry/total byte budgets on the
 * decompressed bytes — budgets are never "trusted from a test stub".
 * Hashing goes through Web Crypto by default (see container.ts).
 */

import JSZip from "jszip";

import {
  ContainerBudgetError,
  CONTAINER_LIMITS,
  validateContainer,
  type ContainerValidationResult,
} from "./container";

export interface OpenedLunacanvasContainer {
  ok: boolean;
  errors: string[];
  manifest?: unknown;
  /** read a validated entry's bytes (budgets re-enforced per read) */
  readEntry: (path: string) => Promise<Uint8Array>;
}

const zipEntrySize = (entry: JSZip.JSZipObject): number => {
  // jszip keeps the central-directory size on the internal record; when
  // it is unavailable (generated in-memory entries) the read-path byte
  // budgets below still bound real memory.
  const internal = entry as unknown as {
    _data?: { uncompressedSize?: number };
  };
  return typeof internal._data?.uncompressedSize === "number"
    ? internal._data.uncompressedSize
    : 0;
};

export const openLunacanvasContainer = async (
  data: ArrayBuffer | Uint8Array,
  options: { hashBytes?: (bytes: Uint8Array) => Promise<string> } = {},
): Promise<OpenedLunacanvasContainer> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return {
      ok: false,
      errors: ["not a readable ZIP archive"],
      readEntry: () => Promise.reject(new Error("archive invalid")),
    };
  }

  const files = new Map<string, JSZip.JSZipObject>();
  const entries = Object.values(zip.files)
    .filter((file) => !file.dir)
    .map((file) => {
      files.set(file.name, file);
      return { path: file.name, uncompressedSize: zipEntrySize(file) };
    });

  // byte budgets enforced again on the ACTUAL decompressed bytes —
  // metadata can under-report (unknown sizes count as 0 above)
  let readTotal = 0;
  const readEntry = async (path: string): Promise<Uint8Array> => {
    const file = files.get(path);
    if (!file) {
      throw new Error(`entry missing: ${path}`);
    }
    const bytes: Uint8Array = await file.async("uint8array");
    if (bytes.byteLength > CONTAINER_LIMITS.maxSingleEntryBytes) {
      throw new ContainerBudgetError(`entry exceeds budget: ${path}`);
    }
    readTotal += bytes.byteLength;
    if (readTotal > CONTAINER_LIMITS.maxTotalUncompressedBytes) {
      throw new ContainerBudgetError(`decompressed total exceeds budget`);
    }
    return bytes;
  };

  const result: ContainerValidationResult & { manifest?: unknown } =
    await validateContainer(
      { entries, readEntry },
      {
        hashBytes: options.hashBytes,
      },
    );

  return { ...result, readEntry };
};
