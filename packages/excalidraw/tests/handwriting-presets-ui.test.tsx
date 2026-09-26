import { Excalidraw } from "../index";
import { BRUSH_PRESETS_STORAGE_KEY } from "../handwriting/brushPresets";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { fireEvent, render, screen, within } from "./test-utils";

const h = window.h;
const pen = new Pointer("pen", 10);

beforeEach(async () => {
  localStorage.clear();
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
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "4" },
  });
  saveAs("One more");
  expect(screen.getByText(/up to 12 personal presets/i)).toBeInTheDocument();
});
