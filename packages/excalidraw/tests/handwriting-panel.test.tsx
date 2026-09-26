import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { act, fireEvent, render, screen } from "./test-utils";

const h = window.h;
const pen = new Pointer("pen", 10);

beforeEach(async () => {
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
});

it("shows brush settings in the top-left properties panel and removes the bottom-left entry", () => {
  expect(
    screen.queryByRole("button", { name: /Handwriting & files/i }),
  ).toBeNull();
  UI.clickTool("freedraw");
  // brush kind buttons live in the top-left properties panel now
  for (const name of ["Pen", "Fountain pen", "Highlighter", "Eraser"]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  // width / opacity / advanced sliders with visible current values
  expect(screen.getByRole("slider", { name: "Width" })).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Opacity" })).toBeInTheDocument();
  // switching to another tool restores that tool's property panel
  UI.clickTool("rectangle");
  expect(screen.queryByRole("button", { name: "Highlighter" })).toBeNull();
  // rectangle's own stroke controls are back
  expect(document.querySelector(".selected-shape-actions")).not.toBeNull();
});

it("exposes the advanced parameters, hold-to-shape settings and test-write area", () => {
  UI.clickTool("freedraw");
  fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
  for (const name of [
    "Pressure amount",
    "Pressure sensitivity",
    "Nib flatness",
    "Nib angle",
    "Stabilization",
  ]) {
    expect(screen.getByRole("slider", { name })).toBeInTheDocument();
  }
  // nib angle disabled while flatness is 0
  expect(screen.getByRole("slider", { name: "Nib angle" })).toBeDisabled();
  fireEvent.change(screen.getByRole("slider", { name: "Nib flatness" }), {
    target: { value: "40" },
  });
  expect(screen.getByRole("slider", { name: "Nib angle" })).not.toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: /Hold-to-shape/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("slider", { name: /Hold delay/i }),
  ).toBeInTheDocument();
  // test-write area never enters the document
  const testArea = screen.getByLabelText("Test write");
  fireEvent.pointerDown(testArea, { clientX: 10, clientY: 10, pressure: 0.5 });
  fireEvent.pointerMove(testArea, { clientX: 30, clientY: 20, pressure: 0.5 });
  fireEvent.pointerUp(testArea, { clientX: 30, clientY: 20, pressure: 0.5 });
  expect(h.elements).toHaveLength(0);
  expect(h.state.newElement).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(h.elements).toHaveLength(0);
});

it("applies parameter changes to the next stroke only and locks the snapshot mid-stroke", () => {
  UI.clickTool("freedraw");
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "1" },
  });
  pen.downAt(100, 100);
  pen.moveTo(150, 100);
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "8" },
  });
  pen.moveTo(200, 100);
  pen.upAt();
  expect(h.elements).toHaveLength(1);
  // the stroke in progress kept the width snapshot from pointerdown
  expect(h.elements[0].strokeWidth).toBe(1);
  pen.downAt(100, 200);
  pen.moveTo(200, 200);
  pen.upAt();
  expect(h.elements).toHaveLength(2);
  expect(h.elements[1].strokeWidth).toBe(8);
  // already-drawn strokes are not modified retroactively
  expect(h.elements[0].strokeWidth).toBe(1);
});

it("stores a full versioned brush snapshot on every new stroke", () => {
  UI.clickTool("freedraw");
  fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
  fireEvent.change(screen.getByRole("slider", { name: "Nib flatness" }), {
    target: { value: "40" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "Nib angle" }), {
    target: { value: "90" },
  });
  pen.downAt(100, 100);
  pen.moveTo(200, 100);
  pen.upAt();
  expect(h.elements[0].customData?.handwriting).toEqual({
    schemaVersion: 1,
    brushKind: "standard",
    pressureAmount: 60,
    pressureSensitivity: 50,
    nibFlatness: 40,
    nibAngle: 90,
    stabilization: 30,
  });
});

it("shows the brush panel in the compact properties popover on tablet form factor", () => {
  // jsdom lacks ResizeObserver (used by radix popover)
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // emulate an iPad-sized editor container so the styles panel goes compact
  const container = document.querySelector(
    ".excalidraw-container",
  ) as HTMLElement;
  container.getBoundingClientRect = () =>
    ({
      width: 768,
      height: 1024,
      top: 0,
      left: 0,
      right: 768,
      bottom: 1024,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  act(() => {
    h.app.refreshEditorInterface();
    h.setState({});
  });
  UI.clickTool("freedraw");
  const trigger = screen.getByRole("button", { name: "Brush" });
  fireEvent.click(trigger);
  expect(screen.getByRole("slider", { name: "Width" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Highlighter" }),
  ).toBeInTheDocument();
});

it("defaults hold-to-shape on for pen and off for highlighter", () => {
  UI.clickTool("freedraw");
  expect(
    screen.getByRole("checkbox", { name: /Hold-to-shape/i }),
  ).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Highlighter" }));
  expect(
    screen.getByRole("checkbox", { name: /Hold-to-shape/i }),
  ).not.toBeChecked();
});
