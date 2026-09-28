import { decodeBrushConfig } from "@excalidraw/element/handwriting/brushParams";
import { getFreedrawOutlinePointsForElement } from "@excalidraw/element/handwriting/outline";
import {
  getElementAbsoluteCoords,
  getElementBounds,
} from "@excalidraw/element";
import { hitElementItself } from "@excalidraw/element/collision";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { exportToSvg } from "../scene/export";
import { Excalidraw } from "../index";

import { render } from "./test-utils";
import { API } from "./helpers/api";
import { UI } from "./helpers/ui";

const h = window.h;

/**
 * F1: API.createElement does not forward pressures/simulatePressure/customData
 * for freedraw — build the fixture explicitly and assert the parameters are
 * really installed.
 */
const stroke = (overrides: Record<string, unknown> = {}) => {
  const element = API.createElement({
    type: "freedraw",
    x: 100,
    y: 100,
    strokeWidth: 8,
    points: [pointFrom(0, 0), pointFrom(100, 0)],
    ...overrides,
  }) as ExcalidrawFreeDrawElement;
  const mutable = element as unknown as Record<string, unknown>;
  mutable.pressures = (overrides.pressures as number[]) ?? [0.5, 0.5];
  mutable.simulatePressure =
    (overrides.simulatePressure as boolean | undefined) ?? false;
  if (overrides.customData !== undefined) {
    mutable.customData = overrides.customData;
  }
  return element;
};

beforeEach(async () => {
  await render(<Excalidraw />);
  API.setAppState({ width: 1024, height: 768 });
});

it("uses the visible outline for freedraw bounds (R1/A07)", () => {
  const element = stroke();
  API.setElements([element]);
  const el = h.elements[0] as ExcalidrawFreeDrawElement;
  const [, y1, , y2] = getElementBounds(
    el,
    h.app.scene.getNonDeletedElementsMap(),
  );
  // horizontal stroke previously produced zero-height bounds; now the ink
  // width is included
  expect(y2 - y1).toBeGreaterThan(10);
  expect((y1 + y2) / 2).toBeCloseTo(100, 0);
});

it("hits the outer edge of a wide stroke (R1/A07)", () => {
  const element = stroke();
  API.setElements([element]);
  const map = h.app.scene.getNonDeletedElementsMap();
  const el = h.elements[0] as ExcalidrawFreeDrawElement;
  const [, oy1, , oy2] = getElementBounds(el, map);
  const halfInk = (oy2 - oy1) / 2;
  const midY = (oy1 + oy2) / 2;
  const onInk = hitElementItself({
    point: pointFrom(150, midY + halfInk - 2),
    element: el,
    threshold: 4,
    elementsMap: map,
  });
  const offInk = hitElementItself({
    point: pointFrom(150, midY + halfInk + 10),
    element: el,
    threshold: 4,
    elementsMap: map,
  });
  expect(onInk).toBe(true);
  expect(offInk).toBe(false);
});

it("covers every rotated outline vertex (F1/A07)", () => {
  const flatConfig = {
    schemaVersion: 1,
    brushKind: "standard",
    pressureAmount: 0,
    pressureSensitivity: 50,
    nibFlatness: 80,
    nibAngle: 90,
    stabilization: 0,
  };
  const element = stroke({
    angle: Math.PI / 4,
    points: [pointFrom(0, 0), pointFrom(60, 0), pointFrom(120, 0)],
    customData: { handwriting: flatConfig },
  });
  // the fixture must actually carry the flat-nib config
  expect(decodeBrushConfig(element.customData)?.nibFlatness).toBe(80);
  API.setElements([element]);
  const el = h.elements[0] as ExcalidrawFreeDrawElement;
  const map = h.app.scene.getNonDeletedElementsMap();
  const [x1, y1, x2, y2] = getElementBounds(el, map);
  // rotate every outline vertex around the SAME pivot the renderer/bounds use
  // (the element center from absolute coords) and assert containment
  const [, , , , cx, cy] = getElementAbsoluteCoords(el, map);
  const center = pointFrom(cx, cy);
  const outline = getFreedrawOutlinePointsForElement(el);
  expect(outline.length).toBeGreaterThan(10);
  let contained = 0;
  for (const [lx, ly] of outline) {
    const [gx, gy] = pointRotateRads(
      pointFrom(el.x + lx, el.y + ly),
      center,
      el.angle,
    );
    if (
      gx >= x1 - 1e-6 &&
      gx <= x2 + 1e-6 &&
      gy >= y1 - 1e-6 &&
      gy <= y2 + 1e-6
    ) {
      contained++;
    }
  }
  expect(contained).toBe(outline.length);
});

it("hits heavy-pressure ink beyond the nominal half width (F2/A07)", () => {
  const heavyPoints = Array.from({ length: 11 }, (_, i) =>
    pointFrom(i * 10, 0),
  );
  const element = stroke({
    points: heavyPoints,
    pressures: Array(11).fill(1),
    customData: {
      handwriting: {
        schemaVersion: 1,
        brushKind: "standard",
        pressureAmount: 100,
        pressureSensitivity: 50,
        nibFlatness: 0,
        nibAngle: 45,
        stabilization: 0,
      },
    },
  });
  expect(decodeBrushConfig(element.customData)?.pressureAmount).toBe(100);
  API.setElements([element]);
  const el = h.elements[0] as ExcalidrawFreeDrawElement;
  const map = h.app.scene.getNonDeletedElementsMap();
  // derive the probe points from the REAL outline (dense samples so the per-
  // sample pressure is honored — sparse inputs interpolate interior
  // pressure to 0.5 inside perfect-freehand)
  const outline = getFreedrawOutlinePointsForElement(el);
  const midOutline = outline.filter(([x]) => x > 40 && x < 60);
  const halfWidth = Math.max(...midOutline.map(([, y]) => Math.abs(y)));
  expect(halfWidth).toBeGreaterThan(20); // well beyond the nominal 17px
  const insideInk = hitElementItself({
    point: pointFrom(150, 100 + halfWidth - 2),
    element: el,
    threshold: 0,
    elementsMap: map,
  });
  const outsideInk = hitElementItself({
    point: pointFrom(150, 100 + halfWidth + 10),
    element: el,
    threshold: 0,
    elementsMap: map,
  });
  expect(insideInk).toBe(true);
  expect(outsideInk).toBe(false);
});

it("legacy strokes get accurate ink bounds without moving (R1/A07)", () => {
  const element = stroke({ strokeWidth: 4 });
  // no customData → legacy branch, appearance untouched
  API.setElements([element]);
  const el = h.elements[0] as ExcalidrawFreeDrawElement;
  const [, y1, , y2] = getElementBounds(
    el,
    h.app.scene.getNonDeletedElementsMap(),
  );
  expect(y2 - y1).toBeGreaterThan(8);
  expect(el.x).toBe(100);
  expect(el.y).toBe(100);
});

it("SVG export keeps the full wide stroke (R1/A07)", async () => {
  const element = stroke();
  API.setElements([element]);
  UI.clickTool("selection");
  const svg = await exportToSvg(
    h.app.scene.getNonDeletedElements(),
    { ...h.state, exportBackground: false, exportEmbedScene: false },
    h.app.files,
  );
  const height = Number(svg.getAttribute("height"));
  expect(height).toBeGreaterThan(10);
});
