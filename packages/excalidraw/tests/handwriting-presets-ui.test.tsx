import { Excalidraw } from "../index";
import {
  __resetUnifiedPresetLibraryForTests,
  BRUSH_PRESETS_STORAGE_KEY,
  createPanelPresetLibrary,
  createPresetLibrary,
  MAX_CORRUPT_BACKUPS,
} from "../handwriting/brushPresets";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { fireEvent, render, screen, within } from "./test-utils";

const h = window.h;
const pen = new Pointer("pen", 10);

beforeEach(async () => {
  localStorage.clear();
  __resetUnifiedPresetLibraryForTests();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
});

const presetSelect = () => screen.getByRole("combobox", { name: "Presets" });

const saveAs = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Save as new preset" }));
  fireEvent.change(screen.getByLabelText("Preset name"), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
};

it("saves the current brush as a personal preset and persists it", () => {
  fireEvent.click(screen.getByRole("button", { name: "Fountain pen" }));
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  expect(screen.getByText("Modified")).toBeInTheDocument();
  saveAs("My pen");
  expect((presetSelect() as HTMLSelectElement).value).toBe(
    h.state.currentItemBrushPreset,
  );
  expect(presetSelect()).toHaveDisplayValue("My pen");
  // PRE-04: stored in localStorage under the versioned namespace
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  expect(stored).toMatchObject({
    type: "excalidraw-brush-presets",
    schemaVersion: 1,
  });
  expect(stored.presets).toHaveLength(1);
  expect(stored.presets[0]).toMatchObject({
    name: "My pen",
    brushKind: "fountain",
    strokeWidth: 4,
  });
});

it("updates a personal preset without touching strokes drawn with it", () => {
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("P1");
  pen.downAt(100, 100);
  pen.moveTo(200, 100);
  pen.upAt();
  expect(h.elements[0].strokeWidth).toBe(4);
  // modify + update the preset
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update preset" }));
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  expect(stored.presets[0].strokeWidth).toBe(8);
  // the already-drawn stroke keeps its own snapshot (DATA-01)
  expect(h.elements[0].strokeWidth).toBe(4);
});

it("renames, duplicates and deletes personal presets", () => {
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("P1");
  // rename
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  fireEvent.change(screen.getByLabelText("Preset name"), {
    target: { value: "Marker bold" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(presetSelect()).toHaveDisplayValue("Marker bold");
  // duplicate
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  expect(stored.presets).toHaveLength(2);
  expect(stored.presets[1].name).toBe("Marker bold copy");
  // delete current → falls back to the built-in default (PRE-03)
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(presetSelect()).toHaveDisplayValue("Pen");
  expect(screen.getByText(/Preset deleted/)).toBeInTheDocument();
});

it("asks before switching presets with unsaved modifications", () => {
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("P1");
  // modify again, then attempt to switch back to the built-in Pen
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "6" },
  });
  fireEvent.change(presetSelect(), { target: { value: "builtin-standard" } });
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toBeInTheDocument();
  // cancel keeps the current state
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(h.state.currentItemStrokeWidth).toBe(6);
  // attempt again and discard
  fireEvent.change(presetSelect(), { target: { value: "builtin-standard" } });
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Discard",
    }),
  );
  expect(h.state.currentItemBrushPreset).toBe("builtin-standard");
  expect(h.state.currentItemStrokeWidth).toBe(1);
});

it("rejects duplicate preset names explicitly", () => {
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("P1");
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save as new preset" }));
  fireEvent.change(screen.getByLabelText("Preset name"), {
    target: { value: "  P1  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  expect(stored.presets).toHaveLength(1);
});

it("exports and imports presets as versioned JSON files", async () => {
  const filesystem = await import("../data/filesystem");
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("Backup pen");
  const saveSpy = vi.spyOn(filesystem, "fileSave").mockResolvedValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Export presets…" }));
  await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
  const blob = saveSpy.mock.calls[0][0] as File;
  const exported = JSON.parse(
    await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    }),
  );
  expect(exported).toMatchObject({
    type: "excalidraw-brush-presets",
    schemaVersion: 1,
  });
  expect(exported.presets).toHaveLength(1);
  expect(exported.presets[0].name).toBe("Backup pen");
  saveSpy.mockRestore();

  // wipe and import back
  localStorage.removeItem(BRUSH_PRESETS_STORAGE_KEY);
  const openSpy = vi.spyOn(filesystem, "fileOpen").mockResolvedValue({
    text: async () => JSON.stringify(exported),
  } as unknown as File);
  fireEvent.click(screen.getByRole("button", { name: "Import presets…" }));
  await vi.waitFor(() =>
    expect(screen.getByText(/Imported 1 preset/i)).toBeInTheDocument(),
  );
  expect(presetSelect()).toHaveDisplayValue("Backup pen");
  openSpy.mockRestore();
});

it("reports the 12-preset limit instead of silently dropping", async () => {
  // seed the storage before the panel (and its library instance) mounts
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  const seed = {
    type: "excalidraw-brush-presets",
    schemaVersion: 1,
    presets: Array.from({ length: 12 }, (_, i) => ({
      id: `seed-${i}`,
      name: `Seed ${i}`,
      brushKind: "standard",
      strokeWidth: 1,
      strokeColor: "#1b1b1f",
      opacity: 100,
      config: {
        schemaVersion: 1,
        brushKind: "standard",
        pressureAmount: 60,
        pressureSensitivity: 50,
        nibFlatness: 0,
        nibAngle: 45,
        stabilization: 30,
      },
      updatedAt: 1,
    })),
  };
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, JSON.stringify(seed));
  __resetUnifiedPresetLibraryForTests();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("One more");
  expect(screen.getByText(/up to 12 personal presets/i)).toBeInTheDocument();
});

it("protects modified personal settings when switching the brush buttons", () => {
  saveAs("Keep me");
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "7" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Highlighter" }));
  const dialog = screen.getByRole("alertdialog");
  expect(h.state.currentItemStrokeWidth).toBe(7);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(h.state.currentItemBrush).toBe("standard");
  expect(h.state.currentItemStrokeWidth).toBe(7);
});

it("protects edits made before saving the first personal preset", () => {
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "7" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Fountain pen" }));
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
  expect(h.state.currentItemBrush).toBe("fountain");
});

// ---------------------------------------------------------------------------
// R5 / A11 — storage failure honesty: session-only, quota, corrupt recovery
// ---------------------------------------------------------------------------

const blockLocalStorageAccess = () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("localStorage denied");
    },
  });
  return original;
};

const restoreLocalStorageAccess = (original?: PropertyDescriptor) => {
  if (original) {
    Object.defineProperty(window, "localStorage", original);
  }
};

it("warns and keeps presets for the session when storage is unavailable (R5/A11)", async () => {
  const original = blockLocalStorageAccess();
  try {
    // remount under blocked storage so the unified authority is rebuilt
    // without any durable backend
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    __resetUnifiedPresetLibraryForTests();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "4" },
    });
    saveAs("Session preset A");
    expect(screen.getByText(/kept for this session only/i)).toBeInTheDocument();
    // close and reopen the panel: presets must survive within the session
    UI.clickTool("rectangle");
    UI.clickTool("freedraw");
    expect(presetSelect()).toHaveDisplayValue("Session preset A");
    expect(screen.getByText(/kept for this session only/i)).toBeInTheDocument();
  } finally {
    restoreLocalStorageAccess(original);
  }
});

it("reports quota failures instead of faking success (R5/A11)", async () => {
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new Error("quota exceeded");
  };
  try {
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "4" },
    });
    saveAs("Quota preset");
    // H1+H2: a real write failure only affects durability — the warning
    // says the save did not persist, and the preset stays accessible
    expect(
      screen.getByText(/could not be saved to local storage/i),
    ).toBeInTheDocument();
    UI.clickTool("rectangle");
    UI.clickTool("freedraw");
    expect(presetSelect()).toHaveDisplayValue("Quota preset");
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
});

it("recovers from corrupt storage with counts and keeps the raw backup (R5/A11)", async () => {
  const corrupt = {
    type: "excalidraw-brush-presets",
    schemaVersion: 1,
    presets: [
      {
        id: "ok-1",
        name: "Survivor",
        brushKind: "standard",
        strokeWidth: 2,
        strokeColor: "#1b1b1f",
        opacity: 100,
        config: {
          schemaVersion: 1,
          brushKind: "standard",
          pressureAmount: 60,
          pressureSensitivity: 50,
          nibFlatness: 0,
          nibAngle: 45,
          stabilization: 30,
        },
        updatedAt: 1,
      },
      { id: "broken", name: 42 },
    ],
  };
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, JSON.stringify(corrupt));
  // remount so the unified authority re-seeds from the corrupt storage
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  __resetUnifiedPresetLibraryForTests();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  expect(
    screen.getByText(/recovered 1, could not parse 1/i),
  ).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Survivor" })).toBeInTheDocument();
  // the preservation guarantee is the versioned backup: the original
  // payload (incl. the unparseable entry) must be recoverable from it even
  // though the main key gets overwritten by the recovered list on mount
  const backup = localStorage.getItem(
    `${BRUSH_PRESETS_STORAGE_KEY}.corrupt-backup`,
  );
  expect(JSON.parse(backup!)).toEqual(corrupt);
});

it("keeps presets in the session library when writes fail with quota (F3/A11)", async () => {
  const originalSetItem = Storage.prototype.setItem;
  let blocked = true;
  Storage.prototype.setItem = function (
    ...args: Parameters<Storage["setItem"]>
  ) {
    if (blocked) {
      throw new Error("QuotaExceededError");
    }
    return originalSetItem.apply(this, args);
  };
  try {
    // remount under blocked writes so the panel probe picks the session library
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    __resetUnifiedPresetLibraryForTests();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "4" },
    });
    saveAs("Quota session preset");
    expect(
      screen.getByText(/could not be saved to local storage/i),
    ).toBeInTheDocument();
    UI.clickTool("rectangle");
    UI.clickTool("freedraw");
    expect(presetSelect()).toHaveDisplayValue("Quota session preset");
  } finally {
    blocked = false;
    Storage.prototype.setItem = originalSetItem;
  }
});

it("backs up the raw corrupted payload under a sibling key (F3/A11)", async () => {
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, "{ not json");
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  __resetUnifiedPresetLibraryForTests();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  expect(
    localStorage.getItem(`${BRUSH_PRESETS_STORAGE_KEY}.corrupt-backup`),
  ).toBe("{ not json");
});

it("merges session presets into storage when persistence recovers (G2/A11)", async () => {
  // outage: probe and writes both fail → session library
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (
    ...args: Parameters<Storage["setItem"]>
  ) {
    throw new Error("QuotaExceededError");
  };
  try {
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "4" },
    });
    saveAs("Recovered session pen");
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
  // persistence recovers: remounting retries the mirror and the preset
  // becomes durable (same session — no reload, so no reset)
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  expect(
    screen.getByRole("option", { name: "Recovered session pen" }),
  ).toBeInTheDocument();
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  expect(
    stored.presets.some(
      (p: { name: string }) => p.name === "Recovered session pen",
    ),
  ).toBe(true);
});

it("backs up partially corrupt records before they are overwritten (G3/A11)", async () => {
  const partial = {
    type: "excalidraw-brush-presets",
    schemaVersion: 1,
    presets: [
      {
        id: "ok-1",
        name: "Good one",
        brushKind: "standard",
        strokeWidth: 2,
        strokeColor: "#1b1b1f",
        opacity: 100,
        config: {
          schemaVersion: 1,
          brushKind: "standard",
          pressureAmount: 60,
          pressureSensitivity: 50,
          nibFlatness: 0,
          nibAngle: 45,
          stabilization: 30,
        },
        updatedAt: 1,
      },
      { id: "bad", name: "no-fields" },
    ],
  };
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, JSON.stringify(partial));
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  __resetUnifiedPresetLibraryForTests();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  // a save happens → the raw payload (incl. the bad entry) must have been
  // preserved under the sibling backup key first
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("Fresh preset");
  const backup = localStorage.getItem(
    `${BRUSH_PRESETS_STORAGE_KEY}.corrupt-backup`,
  );
  expect(backup).not.toBeNull();
  expect(JSON.parse(backup!)).toEqual(partial);
});

// ---------------------------------------------------------------------------
// H1/H3 storage state matrix (A11)
// ---------------------------------------------------------------------------

const presetInput = (name: string) => ({
  name,
  brushKind: "standard" as const,
  strokeWidth: 2,
  strokeColor: "#1b1b1f",
  opacity: 100,
  config: {
    schemaVersion: 1,
    brushKind: "standard" as const,
    pressureAmount: 60,
    pressureSensitivity: 50,
    nibFlatness: 0,
    nibAngle: 45,
    stabilization: 30,
  },
});

it("keeps presets accessible across three panel reopens while writes fail (H1)", async () => {
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === BRUSH_PRESETS_STORAGE_KEY) {
      throw new DOMException("full", "QuotaExceededError");
    }
    return originalSetItem.call(this, key, value);
  };
  try {
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "4" },
    });
    saveAs("Three reopen pen");
    for (let i = 0; i < 3; i++) {
      UI.clickTool("rectangle");
      UI.clickTool("freedraw");
      expect(presetSelect()).toHaveDisplayValue("Three reopen pen");
    }
    // no duplicate inflation
    const unified = createPanelPresetLibrary();
    expect(
      unified.list().filter((p) => p.name === "Three reopen pen"),
    ).toHaveLength(1);
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
});

it("refuses to overwrite the only corrupt copy when backup writes fail (H3)", () => {
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, "{ broken");
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key.includes(".corrupt-backup")) {
      throw new Error("backup quota");
    }
    return originalSetItem.call(this, key, value);
  };
  try {
    const library = createPresetLibrary();
    expect(library.isPreservingCorruptSource()).toBe(true);
    const result = library.add(presetInput("Blocked save"));
    expect(result.ok).toBe(true); // logical add still works
    expect(library.getPersistError()).toMatch(/refusing to overwrite/i);
    // the original corrupted payload is still in place
    expect(localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY)).toBe("{ broken");
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
});

it("bounds corrupt backups across repeated opens with distinct payloads (H3)", () => {
  for (let i = 0; i < MAX_CORRUPT_BACKUPS + 3; i++) {
    localStorage.setItem(
      BRUSH_PRESETS_STORAGE_KEY,
      `{"type":"excalidraw-brush-presets","schemaVersion":1,"presets":[{"name":"payload ${i}"}]`,
    );
    const library = createPresetLibrary();
    expect(library.hadCorruptData()).toBe(true);
  }
  const backupKeys = Array.from(
    { length: localStorage.length },
    (_, i) => localStorage.key(i)!,
  ).filter((k) => k.includes(".corrupt-backup"));
  expect(backupKeys.length).toBeLessThanOrEqual(MAX_CORRUPT_BACKUPS);
  // the newest payload is retained either in a backup slot or, once the
  // slots are full, in the preserved main key (writes are refused then)
  const allValues = [
    ...backupKeys.map((k) => localStorage.getItem(k)!),
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY)!,
  ];
  expect(
    allValues.some((v) => v.includes(`payload ${MAX_CORRUPT_BACKUPS + 2}`)),
  ).toBe(true);
});

it("panel mount refuses to overwrite a sole corrupt source (J1, panel entry)", async () => {
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, "{ sole corrupt source");
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key.includes(".corrupt-backup")) {
      throw new Error("backup blocked");
    }
    return originalSetItem.call(this, key, value);
  };
  try {
    // opening the brush panel triggers the mount retry — it must NOT
    // overwrite the only copy even though the user never clicked save
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    __resetUnifiedPresetLibraryForTests();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    expect(localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY)).toBe(
      "{ sole corrupt source",
    );
    // the failure is surfaced, and the current session stays exportable
    expect(
      screen.getByText(/could not be saved to local storage/i),
    ).toBeInTheDocument();
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
});

it("merges stored presets after a temporary read outage without inflation (J2)", async () => {
  // storage holds a preset from before the outage
  const seeded = createPresetLibrary();
  seeded.add(presetInput("Existing saved pen"));
  // read outage: getItem fails, writes still work
  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (this: Storage, key: string) {
    if (key === BRUSH_PRESETS_STORAGE_KEY) {
      throw new Error("read blocked");
    }
    return originalGetItem.call(this, key);
  };
  try {
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    __resetUnifiedPresetLibraryForTests();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    // during the outage the user creates a preset (kept in the authority)
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "4" },
    });
    saveAs("Offline pen");
  } finally {
    Storage.prototype.getItem = originalGetItem;
  }
  // reads recover: reopening the panel retries read-merge-mirror
  for (let attempt = 0; attempt < 2; attempt++) {
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
  }
  // both presets survive, no duplicates across retries
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  const names = stored.presets.map((p: { name: string }) => p.name);
  expect(names).toContain("Existing saved pen");
  expect(names).toContain("Offline pen");
  expect(names.filter((n: string) => n === "Existing saved pen")).toHaveLength(
    1,
  );
  expect(names.filter((n: string) => n === "Offline pen")).toHaveLength(1);
});

it("keeps both same-name presets across a read outage (K1, UI recovery)", async () => {
  // disk holds "My pen" at width 2
  const disk = createPresetLibrary();
  disk.add({ ...presetInput("My pen"), strokeWidth: 2 });
  const diskId = (
    JSON.parse(localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null")
      .presets[0] as { id: string }
  ).id;
  // read outage begins
  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (this: Storage, key: string) {
    if (key === BRUSH_PRESETS_STORAGE_KEY) {
      throw new Error("read blocked");
    }
    return originalGetItem.call(this, key);
  };
  let sessionId = "";
  try {
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    __resetUnifiedPresetLibraryForTests();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    // the user cannot see the disk preset and creates a same-name one (width 8)
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "8" },
    });
    saveAs("My pen");
    sessionId = window.h.state.currentItemBrushPreset!;
  } finally {
    Storage.prototype.getItem = originalGetItem;
  }
  // reads recover: reopening retries read-merge-mirror twice — both survive
  for (let attempt = 0; attempt < 2; attempt++) {
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
  }
  // list contains both, the session one keeps the name
  // both presets are listed (the select falls back to Default because
  // jsdom does not persist appState across remounts — not a product bug)
  expect(screen.getByRole("option", { name: "My pen" })).toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: "My pen (2)" }),
  ).toBeInTheDocument();
  // both ids and their parameters are durably persisted
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  const byId = new Map<string, { strokeWidth: number }>(
    stored.presets.map((p: { id: string; strokeWidth: number }) => [p.id, p]),
  );
  expect(byId.has(diskId)).toBe(true);
  expect(byId.has(sessionId)).toBe(true);
  expect(byId.get(diskId)?.strokeWidth).toBe(2);
  expect(byId.get(sessionId)?.strokeWidth).toBe(8);
  expect(stored.presets).toHaveLength(2);
});

it("recovers a same-name preset even when the library is at the cap (K1)", async () => {
  // disk is full (12) and contains "Dup"; the authority also has "Dup"
  const disk = createPresetLibrary();
  for (let i = 0; i < 11; i++) {
    disk.add(presetInput(`Stored ${i}`));
  }
  disk.add(presetInput("Dup"));
  const diskDupId = (
    JSON.parse(
      localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
    ).presets.find((p: { name: string }) => p.name === "Dup") as {
      id: string;
    }
  ).id;
  // read outage while the session creates its own "Dup"
  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (this: Storage, key: string) {
    if (key === BRUSH_PRESETS_STORAGE_KEY) {
      throw new Error("read blocked");
    }
    return originalGetItem.call(this, key);
  };
  try {
    const { unmountComponent } = await import("./test-utils");
    unmountComponent();
    __resetUnifiedPresetLibraryForTests();
    await render(<Excalidraw />);
    API.setAppState({ width: 1024, height: 768 });
    UI.clickTool("freedraw");
    fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
      target: { value: "8" },
    });
    saveAs("Dup");
  } finally {
    Storage.prototype.getItem = originalGetItem;
  }
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  // both "Dup" presets are accessible: session under the name, disk suffixed
  expect(screen.getByRole("option", { name: "Dup" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Dup (2)" })).toBeInTheDocument();
  const stored = JSON.parse(
    localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY) ?? "null",
  );
  expect(
    stored.presets.some(
      (p: { id: string; name: string }) =>
        p.id === diskDupId && p.name === "Dup (2)",
    ),
  ).toBe(true);
  expect(stored.presets).toHaveLength(13);
});
