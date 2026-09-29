import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { fireEvent, render, screen } from "./test-utils";

import { GlobalTestState } from "./test-utils";

const h = window.h;

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1024, height: 768 });
});

it("quick zoom buttons set the zoom to 100 / 200 / 300 percent", () => {
  fireEvent.click(screen.getByRole("button", { name: "Zoom to 200%" }));
  expect(h.state.zoom.value).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "Zoom to 100%" }));
  expect(h.state.zoom.value).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Zoom to 300%" }));
  expect(h.state.zoom.value).toBe(3);
});

it("zoom lock blocks buttons, shortcuts and wheel zoom", () => {
  const zoomOut = () =>
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  const zoomIn = () =>
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

  zoomIn();
  zoomIn();
  expect(h.state.zoom.value).toBeGreaterThan(1);

  fireEvent.click(screen.getByRole("button", { name: "Lock zoom" }));
  expect(h.state.zoomLocked).toBe(true);
  const locked = h.state.zoom.value;

  // toolbar buttons
  zoomIn();
  zoomOut();
  fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom to 300%" }));
  expect(h.state.zoom.value).toBe(locked);

  // keyboard shortcut (ctrl/cmd +)
  fireEvent.keyDown(document, { code: "Equal", ctrlKey: true });
  expect(h.state.zoom.value).toBe(locked);

  // ctrl+wheel zoom
  fireEvent.wheel(GlobalTestState.interactiveCanvas, {
    deltaY: -100,
    ctrlKey: true,
  });
  expect(h.state.zoom.value).toBe(locked);

  // unlock restores zooming
  fireEvent.click(screen.getByRole("button", { name: "Unlock zoom" }));
  expect(h.state.zoomLocked).toBe(false);
  zoomIn();
  expect(h.state.zoom.value).toBeGreaterThan(locked);
});

it("locked zoom still allows panning via wheel without ctrl", () => {
  fireEvent.click(screen.getByRole("button", { name: "Lock zoom" }));
  const scrollX = h.state.scrollX;
  fireEvent.wheel(GlobalTestState.interactiveCanvas, { deltaY: 100 });
  expect(h.state.scrollX).toBe(scrollX);
  expect(h.state.zoom.value).toBe(1);
});
