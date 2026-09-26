import { getDefaultBrushConfig } from "@excalidraw/element/handwriting/brushParams";

import type { HandwritingBrushKind } from "@excalidraw/element/handwriting/types";

import {
  BRUSH_PRESETS_FILE_EXTENSION,
  BRUSH_PRESETS_SCHEMA_VERSION,
  BRUSH_PRESETS_STORAGE_KEY,
  BRUSH_PRESETS_TYPE,
  MAX_IMPORT_JSON_CHARS,
  MAX_PERSONAL_PRESETS,
  createPresetLibrary,
  exportPresetsToJSON,
  getDefaultPresetLibrary,
  importPresetsFromJSON,
  suggestUniqueName,
  validateBrushPreset,
  validatePresetName,
  type BrushPreset,
  type BrushPresetInput,
} from "../handwriting/brushPresets";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal in-memory Storage usable as a fake backend. */
const createFakeStorage = (): Storage => {
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

let idCounter = 0;
const makeIdGenerator = () => () => `test-id-${++idCounter}`;

const makeInput = (
  overrides: Partial<BrushPresetInput> = {},
): BrushPresetInput => ({
  name: "My pen",
  brushKind: "standard",
  strokeWidth: 2,
  strokeColor: "#1e1e1e",
  opacity: 100,
  config: getDefaultBrushConfig("standard"),
  ...overrides,
});

const createLibrary = (storage?: Storage) =>
  createPresetLibrary({
    storage,
    now: () => 1_700_000_000_000,
    idGenerator: makeIdGenerator(),
  });

beforeEach(() => {
  localStorage.clear();
  idCounter = 0;
});

// ---------------------------------------------------------------------------
// Built-in presets (PRE-01, read-only)
// ---------------------------------------------------------------------------

describe("built-in presets", () => {
  it("exposes three built-in presets with stable ids and default configs", () => {
    const lib = createLibrary();
    const builtins = lib.getBuiltinPresets();
    expect(builtins).toHaveLength(3);
    expect(builtins.map((p) => p.id)).toEqual([
      "builtin-standard",
      "builtin-fountain",
      "builtin-highlighter",
    ]);
    expect(builtins.map((p) => p.name)).toEqual([
      "Pen",
      "Fountain pen",
      "Highlighter",
    ]);
    for (const preset of builtins) {
      expect(preset.config).toEqual(
        getDefaultBrushConfig(preset.brushKind as HandwritingBrushKind),
      );
    }
    expect(lib.list()).toHaveLength(0);
  });

  it("refuses to update built-in presets", () => {
    const lib = createLibrary();
    const result = lib.update("builtin-standard", { strokeWidth: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/read-only/i);
    }
  });

  it("refuses to rename or remove built-in presets", () => {
    const lib = createLibrary();
    const renamed = lib.rename("builtin-fountain", "Custom");
    expect(renamed.ok).toBe(false);
    expect(lib.remove("builtin-fountain")).toBe(false);
    expect(
      lib.getBuiltinPresets().find((p) => p.id === "builtin-fountain"),
    ).toBeDefined();
  });

  it("gets built-in presets by id via get()", () => {
    const lib = createLibrary();
    expect(lib.get("builtin-highlighter")?.name).toBe("Highlighter");
    expect(lib.get("nope")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// add / capacity (PRE-02)
// ---------------------------------------------------------------------------

describe("add", () => {
  it("adds a valid preset with generated id and timestamp", () => {
    const lib = createLibrary();
    const result = lib.add(makeInput({ name: "Sketch" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preset.id).toBe("test-id-1");
      expect(result.preset.updatedAt).toBe(1_700_000_000_000);
      expect(result.preset.name).toBe("Sketch");
    }
    expect(lib.list()).toHaveLength(1);
  });

  it("rejects the 13th preset without evicting existing ones", () => {
    const lib = createLibrary();
    for (let i = 0; i < MAX_PERSONAL_PRESETS; i++) {
      const result = lib.add(makeInput({ name: `Preset ${i}` }));
      expect(result.ok).toBe(true);
    }
    const overflow = lib.add(makeInput({ name: "One too many" }));
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.errors.join(" ")).toMatch(/full/);
    }
    expect(lib.list()).toHaveLength(MAX_PERSONAL_PRESETS);
  });

  it("returns errors for invalid input instead of throwing", () => {
    const lib = createLibrary();
    const result = lib.add(makeInput({ strokeWidth: Number.NaN, name: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Names (PRE-02)
// ---------------------------------------------------------------------------

describe("preset names", () => {
  it("trims names on add", () => {
    const lib = createLibrary();
    const result = lib.add(makeInput({ name: "  Padded  " }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preset.name).toBe("Padded");
    }
  });

  it("rejects empty names", () => {
    expect(validatePresetName("   ", []).ok).toBe(false);
    const lib = createLibrary();
    expect(lib.add(makeInput({ name: "  " })).ok).toBe(false);
  });

  it("rejects names longer than 40 characters", () => {
    const longName = "a".repeat(41);
    const check = validatePresetName(longName, []);
    expect(check.ok).toBe(false);
    expect(validatePresetName("a".repeat(40), []).ok).toBe(true);
    expect(createLibrary().add(makeInput({ name: longName })).ok).toBe(false);
  });

  it("rejects duplicate names case-insensitively in error mode", () => {
    const lib = createLibrary();
    expect(lib.add(makeInput({ name: "Pen Set" })).ok).toBe(true);
    const dup = lib.add(makeInput({ name: "  pen set " }));
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.errors.join(" ")).toMatch(/already exists/);
    }
  });

  it("auto-suffixes duplicate names in suffix mode", () => {
    const lib = createLibrary();
    expect(
      lib.add(makeInput({ name: "Ink" }), { onNameConflict: "suffix" }).ok,
    ).toBe(true);
    const second = lib.add(makeInput({ name: "Ink" }), {
      onNameConflict: "suffix",
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.preset.name).toBe("Ink (2)");
    }
    const third = lib.add(makeInput({ name: "ink" }), {
      onNameConflict: "suffix",
    });
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.preset.name).toBe("ink (3)");
    }
  });

  it("suggestUniqueName appends numeric suffixes", () => {
    expect(suggestUniqueName("A", [])).toBe("A");
    expect(suggestUniqueName("A", ["a"])).toBe("A (2)");
    expect(suggestUniqueName("A", ["a", "a (2)"])).toBe("A (3)");
  });

  it("rename validates conflicts against other presets", () => {
    const lib = createLibrary();
    const first = lib.add(makeInput({ name: "One" }));
    const second = lib.add(makeInput({ name: "Two" }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const conflict = lib.rename(second.preset.id, "one");
    expect(conflict.ok).toBe(false);
    const suffixed = lib.rename(second.preset.id, "One", {
      onNameConflict: "suffix",
    });
    expect(suffixed.ok).toBe(true);
    if (suffixed.ok) {
      expect(suffixed.preset.name).toBe("One (2)");
    }
    const ok = lib.rename(first.preset.id, "  Renamed  ");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.preset.name).toBe("Renamed");
    }
  });

  it("rename rejects empty / too-long names", () => {
    const lib = createLibrary();
    const added = lib.add(makeInput());
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(lib.rename(added.preset.id, "").ok).toBe(false);
    expect(lib.rename(added.preset.id, "b".repeat(41)).ok).toBe(false);
  });

  it("duplicate appends 'copy' and keeps parameters", () => {
    const lib = createLibrary();
    expect(lib.duplicate("builtin-fountain").ok).toBe(true);
    const again = lib.duplicate("builtin-fountain");
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.preset.name).toBe("Fountain pen copy (2)");
      expect(again.preset.brushKind).toBe("fountain");
      expect(again.preset.config).toEqual(getDefaultBrushConfig("fountain"));
    }
    expect(lib.list()).toHaveLength(2);
  });

  it("duplicate of unknown id returns an error", () => {
    const lib = createLibrary();
    const result = lib.duplicate("missing");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persistence (PRE-04)
// ---------------------------------------------------------------------------

describe("persistence", () => {
  it("round-trips presets through a fake Storage backend", () => {
    const storage = createFakeStorage();
    const lib = createLibrary(storage);
    expect(lib.add(makeInput({ name: "Saved" })).ok).toBe(true);

    const restored = createPresetLibrary({ storage });
    const presets = restored.list();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe("Saved");
    expect(restored.hadCorruptData()).toBe(false);
    expect(restored.getPersistError()).toBeNull();
  });

  it("keeps presets across instances using real localStorage (PRE-04)", () => {
    const first = createPresetLibrary({
      now: () => 42,
      idGenerator: makeIdGenerator(),
    });
    expect(first.add(makeInput({ name: "Persistent" })).ok).toBe(true);
    expect(localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY)).not.toBeNull();

    const second = createPresetLibrary();
    expect(second.list().map((p) => p.name)).toEqual(["Persistent"]);
  });

  it("default singleton library shares the same storage", () => {
    localStorage.clear();
    const lib = getDefaultPresetLibrary();
    expect(lib.add(makeInput({ name: "Singleton" })).ok).toBe(true);
    const other = createPresetLibrary();
    expect(other.list().map((p) => p.name)).toContain("Singleton");
  });
});

// ---------------------------------------------------------------------------
// Corruption recovery
// ---------------------------------------------------------------------------

describe("corrupt data recovery", () => {
  const seedStorage = (raw: string) => {
    const storage = createFakeStorage();
    storage.setItem(BRUSH_PRESETS_STORAGE_KEY, raw);
    return storage;
  };

  it("degrades to an empty library on malformed JSON without throwing", () => {
    const lib = createLibrary(seedStorage("{not json"));
    expect(lib.list()).toHaveLength(0);
    expect(lib.hadCorruptData()).toBe(true);
    expect(() => lib.add(makeInput())).not.toThrow();
  });

  it("degrades on unknown schemaVersion or wrong type", () => {
    const unknownVersion = createLibrary(
      seedStorage(
        JSON.stringify({
          type: BRUSH_PRESETS_TYPE,
          schemaVersion: 999,
          presets: [],
        }),
      ),
    );
    expect(unknownVersion.list()).toHaveLength(0);
    expect(unknownVersion.hadCorruptData()).toBe(true);

    const wrongType = createLibrary(
      seedStorage(
        JSON.stringify({
          type: "something-else",
          schemaVersion: 1,
          presets: [],
        }),
      ),
    );
    expect(wrongType.list()).toHaveLength(0);
    expect(wrongType.hadCorruptData()).toBe(true);
  });

  it("keeps valid entries and counts dropped invalid ones", () => {
    const valid = {
      id: "keep-me",
      name: "Good",
      brushKind: "standard",
      strokeWidth: 2,
      strokeColor: "#123456",
      opacity: 100,
      config: getDefaultBrushConfig("standard"),
      updatedAt: 1,
    };
    const file = {
      type: BRUSH_PRESETS_TYPE,
      schemaVersion: BRUSH_PRESETS_SCHEMA_VERSION,
      presets: [valid, { id: "bad", name: "" }, null, { foo: "bar" }],
    };
    const lib = createLibrary(seedStorage(JSON.stringify(file)));
    const presets = lib.list();
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe("keep-me");
    expect(lib.getDroppedPresetCount()).toBe(3);
    expect(lib.hadCorruptData()).toBe(true);
  });

  it("starts clean with no stored data", () => {
    const lib = createLibrary(createFakeStorage());
    expect(lib.hadCorruptData()).toBe(false);
    expect(lib.list()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Persist failure (PRE-04: no fake success)
// ---------------------------------------------------------------------------

describe("persist failures", () => {
  it("returns ok but reports the error when setItem throws", () => {
    const failing: Storage = {
      ...createFakeStorage(),
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
    } as Storage;
    const lib = createLibrary(failing);
    const result = lib.add(makeInput());
    expect(result.ok).toBe(true);
    expect(lib.getPersistError()).toMatch(/quota/);
  });

  it("clears the persist error after a successful save", () => {
    let shouldThrow = true;
    const storage = createFakeStorage();
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (shouldThrow) {
        throw new Error("quota exceeded");
      }
      originalSetItem(key, value);
    };
    const lib = createLibrary(storage);
    expect(lib.add(makeInput()).ok).toBe(true);
    expect(lib.getPersistError()).toMatch(/quota/);
    shouldThrow = false;
    expect(lib.remove(lib.list()[0].id)).toBe(true);
    expect(lib.getPersistError()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateBrushPreset
// ---------------------------------------------------------------------------

describe("validateBrushPreset", () => {
  const validPreset = {
    id: "p1",
    name: "Valid",
    brushKind: "standard",
    strokeWidth: 2,
    strokeColor: "#abcdef",
    opacity: 100,
    config: getDefaultBrushConfig("standard"),
    updatedAt: 1,
  };

  it("accepts a valid preset and normalizes the config", () => {
    const result = validateBrushPreset(validPreset);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preset.config).toEqual(getDefaultBrushConfig("standard"));
    }
  });

  it("rejects non-object input without throwing", () => {
    for (const raw of [null, undefined, 42, "str", []]) {
      const result = validateBrushPreset(raw);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects NaN / Infinity / out-of-range strokeWidth", () => {
    for (const strokeWidth of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      0.2,
      13,
      "2" as unknown as number,
    ]) {
      const result = validateBrushPreset({ ...validPreset, strokeWidth });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(" ")).toMatch(/strokeWidth/);
      }
    }
  });

  it("rejects out-of-range opacity", () => {
    for (const opacity of [0, 101, Number.NaN]) {
      expect(validateBrushPreset({ ...validPreset, opacity }).ok).toBe(false);
    }
  });

  it("rejects illegal colors", () => {
    for (const strokeColor of ["red", "#12345", "#1234567", 42, "#gggggg"]) {
      const result = validateBrushPreset({ ...validPreset, strokeColor });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(" ")).toMatch(/strokeColor/);
      }
    }
  });

  it("rejects bad configs and bad names / ids", () => {
    expect(validateBrushPreset({ ...validPreset, config: null }).ok).toBe(
      false,
    );
    expect(
      validateBrushPreset({
        ...validPreset,
        config: { brushKind: "unknown" },
      }).ok,
    ).toBe(false);
    expect(validateBrushPreset({ ...validPreset, name: "" }).ok).toBe(false);
    expect(
      validateBrushPreset({ ...validPreset, name: "x".repeat(41) }).ok,
    ).toBe(false);
    expect(validateBrushPreset({ ...validPreset, id: "" }).ok).toBe(false);
    expect(validateBrushPreset({ ...validPreset, id: 7 }).ok).toBe(false);
    expect(validateBrushPreset({ ...validPreset, brushKind: "paint" }).ok).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Import / export (PRE-05)
// ---------------------------------------------------------------------------

describe("export / import", () => {
  const makePreset = (id: string, name: string): BrushPreset => ({
    id,
    name,
    brushKind: "standard",
    strokeWidth: 2,
    strokeColor: "#123abc",
    opacity: 90,
    config: getDefaultBrushConfig("standard"),
    updatedAt: 7,
  });

  it("round-trips presets through JSON", () => {
    const presets = [makePreset("a", "Alpha"), makePreset("b", "Beta")];
    const json = exportPresetsToJSON(presets);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe(BRUSH_PRESETS_TYPE);
    expect(parsed.schemaVersion).toBe(BRUSH_PRESETS_SCHEMA_VERSION);
    expect(parsed.presets).toHaveLength(2);
    expect(typeof BRUSH_PRESETS_FILE_EXTENSION).toBe("string");

    const result = importPresetsFromJSON(json, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.presets).toEqual(presets);
      expect(result.renamed).toBe(0);
      expect(result.skipped).toBe(0);
    }
  });

  it("remaps conflicting ids while keeping names", () => {
    const incoming = makePreset("a", "Alpha");
    const existing = [makePreset("a", "Existing")];
    const result = importPresetsFromJSON(
      exportPresetsToJSON([incoming]),
      existing,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.presets).toHaveLength(1);
      expect(result.presets[0].id).not.toBe("a");
      expect(result.presets[0].name).toBe("Alpha");
    }
    // The existing entry is untouched.
    expect(existing[0].id).toBe("a");
    expect(existing[0].name).toBe("Existing");
  });

  it("handles name conflicts in suffix / skip / error modes", () => {
    const existing = [makePreset("a", "Alpha")];
    const incoming = exportPresetsToJSON([makePreset("b", "alpha")]);

    const suffix = importPresetsFromJSON(incoming, existing, {
      onNameConflict: "suffix",
    });
    expect(suffix.ok).toBe(true);
    if (suffix.ok) {
      expect(suffix.presets[0].name).toBe("alpha (2)");
      expect(suffix.renamed).toBe(1);
    }

    const skipped = importPresetsFromJSON(incoming, existing, {
      onNameConflict: "skip",
    });
    expect(skipped.ok).toBe(true);
    if (skipped.ok) {
      expect(skipped.presets).toHaveLength(0);
      expect(skipped.skipped).toBe(1);
    }

    const errored = importPresetsFromJSON(incoming, existing, {
      onNameConflict: "error",
    });
    expect(errored.ok).toBe(false);
    if (!errored.ok) {
      expect(errored.errors.join(" ")).toMatch(/already exists/);
    }
  });

  it("rejects malformed JSON, wrong shape, and oversized files", () => {
    expect(importPresetsFromJSON("{oops", []).ok).toBe(false);
    expect(importPresetsFromJSON("42", []).ok).toBe(false);
    expect(importPresetsFromJSON("null", []).ok).toBe(false);
    expect(
      importPresetsFromJSON(
        JSON.stringify({ type: "wrong", schemaVersion: 1, presets: [] }),
        [],
      ).ok,
    ).toBe(false);
    expect(
      importPresetsFromJSON(
        JSON.stringify({ type: BRUSH_PRESETS_TYPE, presets: "nope" }),
        [],
      ).ok,
    ).toBe(false);

    const tooBig = " ".repeat(MAX_IMPORT_JSON_CHARS + 1);
    const big = importPresetsFromJSON(tooBig, []);
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.errors.join(" ")).toMatch(/too large/);
    }
  });

  it("rejects files with more than 200 presets", () => {
    const presets = Array.from({ length: 201 }, (_, i) =>
      makePreset(`p${i}`, `Preset ${i}`),
    );
    const result = importPresetsFromJSON(exportPresetsToJSON(presets), []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/too many/);
    }
  });

  it("skips invalid entries without failing the whole import", () => {
    const file = {
      type: BRUSH_PRESETS_TYPE,
      schemaVersion: BRUSH_PRESETS_SCHEMA_VERSION,
      presets: [makePreset("ok", "Fine"), { id: "bad" }],
    };
    const result = importPresetsFromJSON(JSON.stringify(file), []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.presets.map((p) => p.id)).toEqual(["ok"]);
      expect(result.skipped).toBe(1);
    }
  });

  it("does not mutate the existing array on import", () => {
    const existing = [makePreset("a", "Alpha")];
    const snapshot = JSON.parse(JSON.stringify(existing));
    importPresetsFromJSON(
      exportPresetsToJSON([makePreset("b", "Beta"), makePreset("c", "alpha")]),
      existing,
    );
    expect(existing).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

describe("update / remove", () => {
  it("updates parameters and bumps updatedAt, keeping the id stable", () => {
    const lib = createLibrary();
    const added = lib.add(makeInput({ name: "Before" }));
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const updated = lib.update(added.preset.id, {
      name: "After",
      strokeWidth: 4,
      opacity: 80,
      config: getDefaultBrushConfig("fountain"),
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.preset.id).toBe(added.preset.id);
      expect(updated.preset.name).toBe("After");
      expect(updated.preset.strokeWidth).toBe(4);
      expect(updated.preset.opacity).toBe(80);
      expect(updated.preset.brushKind).toBe("standard");
      expect(updated.preset.config.brushKind).toBe("fountain");
      expect(updated.preset.updatedAt).toBe(1_700_000_000_000);
    }
  });

  it("returns an error when updating a missing preset", () => {
    const lib = createLibrary();
    const result = lib.update("missing", { strokeWidth: 3 });
    expect(result.ok).toBe(false);
  });

  it("remove deletes personal presets and persists the change", () => {
    const storage = createFakeStorage();
    const lib = createLibrary(storage);
    const added = lib.add(makeInput());
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(lib.remove(added.preset.id)).toBe(true);
    expect(lib.remove(added.preset.id)).toBe(false);
    expect(lib.list()).toHaveLength(0);
    expect(createLibrary(storage).list()).toHaveLength(0);
  });

  it("returns defensive copies that cannot mutate library state", () => {
    const lib = createLibrary();
    const added = lib.add(makeInput());
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const fetched = lib.get(added.preset.id);
    expect(fetched).toBeDefined();
    if (!fetched) {
      return;
    }
    fetched.name = "Hacked";
    fetched.config.stabilization = 99;
    expect(lib.get(added.preset.id)?.name).toBe("My pen");
    expect(lib.get(added.preset.id)?.config.stabilization).toBe(30);
  });
});
