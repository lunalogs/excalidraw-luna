import { pointFrom } from "@excalidraw/math";

import {
  getElementBounds,
  getElementAbsoluteCoords,
} from "@excalidraw/element";
import { getDefaultBrushConfig } from "@excalidraw/element/handwriting/brushParams";
import {
  getFreedrawOutlinePointsForElement,
  getRepresentativeStrokeWidth,
} from "@excalidraw/element/handwriting/outline";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import { fireEvent, render, screen } from "./test-utils";

const h = window.h;
beforeEach(async () => {
  localStorage.clear();
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
});
afterEach(() => vi.restoreAllMocks());

it("R1: rotated bounds contain every independently rotated ink vertex", () => {
  const element = API.createElement({
    type: "freedraw",
    x: 100,
    y: 100,
    strokeWidth: 8,
    points: [pointFrom(0, 0), pointFrom(100, 0)],
    angle: Math.PI / 4,
  });
  Object.assign(element, {
    pressures: [0.5, 0.5],
    simulatePressure: false,
    customData: {
      handwriting: { ...getDefaultBrushConfig("standard"), pressureAmount: 0 },
    },
  });
  API.setElements([element]);
  const bounds = getElementBounds(
    element,
    h.app.scene.getNonDeletedElementsMap(),
  );
  const c = Math.cos(element.angle);
  const s = Math.sin(element.angle);
  const [, , , , cx, cy] = getElementAbsoluteCoords(
    element,
    h.app.scene.getNonDeletedElementsMap(),
  );
  const rotated = getFreedrawOutlinePointsForElement(element).map(([x, y]) => {
    const dx = x + element.x - cx;
    const dy = y + element.y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
  const outside = rotated.filter(
    ([x, y]) =>
      x < bounds[0] - 1e-6 ||
      x > bounds[2] + 1e-6 ||
      y < bounds[1] - 1e-6 ||
      y > bounds[3] + 1e-6,
  );
  expect(outside).toHaveLength(0);
});

it("R3: a 34px constant ink stroke becomes a 34px native stroke", () => {
  const stroke = {
    strokeWidth: 8,
    pressures: [0.5, 0.5],
    simulatePressure: false,
    customData: {
      handwriting: {
        ...getDefaultBrushConfig("standard"),
        pressureAmount: 0,
        nibFlatness: 0,
      },
    },
  };
  expect(getRepresentativeStrokeWidth(stroke)).toBeCloseTo(34);
});

it("R5: quota-failed preset survives closing and reopening the panel", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  UI.clickTool("freedraw");
  fireEvent.click(screen.getByRole("button", { name: "Save as new preset" }));
  fireEvent.change(screen.getByLabelText("Preset name"), {
    target: { value: "Quota session pen" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    screen.getByRole("option", { name: "Quota session pen" }),
  ).toBeInTheDocument();
  UI.clickTool("rectangle");
  UI.clickTool("freedraw");
  expect(
    screen.queryByRole("option", { name: "Quota session pen" }),
  ).not.toBeNull();
});

it("R4: stationary pen pressure reaches the test-write renderer", async () => {
  const outlineModule = await import("@excalidraw/element/handwriting/outline");
  const spy = vi.spyOn(outlineModule, "computeHandwritingOutline");
  UI.clickTool("freedraw");
  const area = screen.getByLabelText("Test write");
  // NOTE: jsdom/testing-library only carries `pressure` on pointer events
  // that include button/buttons init (a moving pen has buttons pressed)
  fireEvent.pointerDown(area, {
    pointerType: "pen",
    pointerId: 10,
    clientX: 20,
    clientY: 20,
    pressure: 0.2,
    button: 0,
    buttons: 1,
  });
  spy.mockClear();
  fireEvent.pointerMove(area, {
    pointerType: "pen",
    pointerId: 10,
    clientX: 20,
    clientY: 20,
    pressure: 0.9,
    button: 0,
    buttons: 1,
  });
  expect(spy.mock.calls.some(([input]) => input.pressures.includes(0.9))).toBe(
    true,
  );
});

it("R1: heavy-pressure visible ink is hittable, ink outside is not", async () => {
  const { hitElementItself } = await import("@excalidraw/element/collision");
  // dense samples so per-sample pressure is honored (perfect-freehand 1.2.0
  // interpolates interior pressure of sparse strokes to 0.5 — verified via
  // getStrokePoints — so the VISIBLE ink of a 2-point stroke is only ~34px
  // tall at mid-segment regardless of endpoint pressure)
  const points = Array.from({ length: 11 }, (_, i) =>
    pointFrom<LocalPoint>(i * 10, 0),
  );
  const element = API.createElement({
    type: "freedraw",
    x: 100,
    y: 100,
    strokeWidth: 8,
    points,
  });
  Object.assign(element, {
    simulatePressure: false,
    pressures: Array(11).fill(1),
    customData: {
      handwriting: {
        ...getDefaultBrushConfig("standard"),
        pressureAmount: 100,
        nibFlatness: 0,
        stabilization: 0,
      },
    },
  });
  API.setElements([element]);
  const outline = getFreedrawOutlinePointsForElement(
    element as ExcalidrawFreeDrawElement,
  );
  const midInk = Math.max(
    ...outline.filter(([x]) => x > 40 && x < 60).map(([, y]) => Math.abs(y)),
  );
  expect(
    hitElementItself({
      element,
      elementsMap: h.app.scene.getNonDeletedElementsMap(),
      point: pointFrom(150, 100 + midInk - 2),
      threshold: 0,
    }),
  ).toBe(true);
  expect(
    hitElementItself({
      element,
      elementsMap: h.app.scene.getNonDeletedElementsMap(),
      point: pointFrom(150, 100 + midInk + 10),
      threshold: 0,
    }),
  ).toBe(false);
});
