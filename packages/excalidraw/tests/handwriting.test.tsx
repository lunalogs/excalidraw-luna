import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { loadFromBlob } from "../data/blob";
import { serializeAsJSON } from "../data/json";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { act, fireEvent, render, screen } from "./test-utils";

const h = window.h;
const pen = new Pointer("pen", 10);
const finger = new Pointer("touch", 20);
const secondFinger = new Pointer("touch", 21);

beforeEach(async () => {
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
});

it("keeps a Pencil stroke intact when a palm moves and lifts", () => {
  UI.clickTool("freedraw");
  pen.downAt(100, 100);
  pen.moveTo(110, 110);
  const strokeId = h.state.newElement?.id;
  finger.downAt(300, 300);
  finger.moveTo(350, 350);
  finger.upAt();
  expect(h.state.newElement?.id).toBe(strokeId);
  pen.moveTo(130, 130);
  pen.upAt();
  expect(h.elements).toHaveLength(1);
  expect(h.elements[0].width).toBeLessThan(100);
  expect(h.state.newElement).toBeNull();
});

it("pans with one finger and zooms with two in Pencil-only mode without drawing", () => {
  UI.clickTool("freedraw");
  act(() => h.setState({ penMode: true }));
  const initialScroll = h.state.scrollX;
  finger.downAt(100, 100);
  finger.moveTo(140, 100);
  expect(h.state.scrollX).toBeGreaterThan(initialScroll);
  secondFinger.downAt(240, 100);
  const initialZoom = h.state.zoom.value;
  secondFinger.moveTo(340, 100);
  expect(h.state.zoom.value).toBeGreaterThan(initialZoom);
  secondFinger.upAt();
  finger.upAt();
  expect(h.elements).toHaveLength(0);
});

it("creates a translucent highlighter, keeps its style across export/import, and returns from eraser", async () => {
  UI.clickTool("freedraw");
  fireEvent.click(screen.getByRole("button", { name: "Highlighter" }));
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "8" },
  });
  pen.downAt(100, 100);
  pen.moveTo(120, 110);
  pen.moveTo(150, 120);
  pen.upAt();
  const stroke = h.elements[0];
  expect(stroke).toMatchObject({
    type: "freedraw",
    strokeWidth: 8,
    opacity: 30,
  });
  expect(stroke.customData?.handwriting).toMatchObject({
    schemaVersion: 1,
    brushKind: "highlighter",
    pressureAmount: 0,
  });
  const restored = await loadFromBlob(
    new Blob([serializeAsJSON(h.elements, h.state, {}, "local")], {
      type: "application/json",
    }),
    null,
    null,
  );
  expect(restored.elements[0]).toMatchObject({
    customData: stroke.customData,
    opacity: 30,
    strokeWidth: 8,
  });
  fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
  expect(h.state.activeTool.type).toBe("eraser");
  fireEvent.click(screen.getByRole("button", { name: "Back to pen" }));
  expect(h.state.activeTool.type).toBe("freedraw");
  expect(h.state.currentItemBrush).toBe("highlighter");
});

it("uses constant width for highlighter and pressure variation for fountain pen", async () => {
  const { getFreedrawOutlinePoints } = await import(
    "@excalidraw/element/shape"
  );
  const stroke = {
    ...API.createElement({
      type: "freedraw",
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(20, 0),
        pointFrom<LocalPoint>(40, 0),
      ],
    }),
    pressures: [0.1, 0.5, 0.9],
    simulatePressure: false,
  };
  const marker = { ...stroke, customData: { handwritingBrush: "highlighter" } };
  const outline = getFreedrawOutlinePoints(marker);
  expect(
    getFreedrawOutlinePoints({ ...marker, pressures: [0.9, 0.9, 0.9] }),
  ).toEqual(outline);
  expect(
    getFreedrawOutlinePoints({
      ...stroke,
      customData: { handwritingBrush: "fountain" },
    }),
  ).not.toEqual(outline);
});

it("exports an editable file through the main menu and loads it back including embedded images", async () => {
  const { MIME_TYPES } = await import("@excalidraw/common");
  const filesystem = await import("../data/filesystem");
  const { waitFor } = await import("./test-utils");
  const saveSpy = vi.spyOn(filesystem, "fileSave").mockResolvedValue(null);
  const image = API.createElement({
    type: "image",
    fileId: "embedded-image" as import("@excalidraw/element/types").FileId,
  });
  const file = {
    id: image.fileId!,
    dataURL: "data:image/png;base64,aGVsbG8=" as import("../types").DataURL,
    mimeType: MIME_TYPES.png,
    created: 1,
    lastRetrieved: 1,
  };
  act(() => h.app.addFiles([file]));
  API.setElements([image]);
  // file actions live in the main menu and are reachable from any tool
  UI.clickTool("rectangle");
  fireEvent.click(screen.getByTestId("main-menu-trigger"));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Export editable file" }),
  );
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
  const blob = saveSpy.mock.calls[0][0] as Blob;
  const restored = await loadFromBlob(blob, null, null);
  expect(restored.elements[0]).toMatchObject({
    type: "image",
    fileId: image.fileId,
  });
  expect(restored.files?.[image.fileId!].dataURL).toBe(file.dataURL);
  saveSpy.mockRestore();
});

it("opens the file picker from the main menu and restores editable strokes", async () => {
  const filesystem = await import("../data/filesystem");
  const { waitFor } = await import("./test-utils");
  const stroke = API.createElement({ type: "freedraw" });
  const file = new File(
    [serializeAsJSON([stroke], h.state, {}, "local")],
    "note.excalidraw",
    { type: "application/json" },
  );
  const openSpy = vi.spyOn(filesystem, "fileOpen").mockResolvedValue(file);
  fireEvent.click(screen.getByTestId("main-menu-trigger"));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Open file / import" }),
  );
  await waitFor(() => expect(h.elements[0]?.id).toBe(stroke.id));
  expect(openSpy).toHaveBeenCalledTimes(1);
  openSpy.mockRestore();
});

it("leaves the canvas intact when the file picker is cancelled", async () => {
  const filesystem = await import("../data/filesystem");
  const { waitFor } = await import("./test-utils");
  const openSpy = vi
    .spyOn(filesystem, "fileOpen")
    .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  fireEvent.click(screen.getByTestId("main-menu-trigger"));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Open file / import" }),
  );
  await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
  expect(h.elements).toHaveLength(0);
  expect(h.state.errorMessage).toBeNull();
  openSpy.mockRestore();
});

it("erases a stroke with Pencil while finger navigation does not erase", () => {
  UI.clickTool("freedraw");
  pen.downAt(100, 100);
  pen.moveTo(150, 100);
  pen.upAt();
  UI.clickTool("eraser");
  finger.downAt(120, 100);
  finger.upAt();
  expect(h.elements[0].isDeleted).toBe(false);
  pen.downAt(120, 100);
  pen.moveTo(140, 100);
  pen.upAt();
  expect(h.elements[0].isDeleted).toBe(true);
});
