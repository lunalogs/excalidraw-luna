// 0046-R4: hit geometry must represent VISIBLE ink on the web too.
// Codex's independent diagnostics (0044) found a lasso inside a
// local-erase hole still selected the stroke — these probes are formal
// tests now, plus the alpha-refinement policy and pixel mapping.

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import {
  InkLayer,
  combineAlpha,
  createAlphaSampler,
  sceneToPreviewPixel,
  type AlphaSampler,
} from "../lunacanvas/InkLayer";
import {
  isInkHitByEraser,
  isInkSelectedByLasso,
  type InkHitGeometry,
  type InkObject,
} from "../lunacanvas/inkModel";

const hit = (overrides: Partial<InkHitGeometry> = {}): InkHitGeometry => ({
  bounds: [0, 0, 100, 10],
  width: 6,
  path: [
    [0, 5],
    [50, 5],
    [100, 5],
  ],
  hasMask: false,
  ...overrides,
});

const makeInk = (overrides: Partial<InkObject> = {}): InkObject => ({
  objectId: "ink-1",
  transform: [1, 0, 0, 1, 0, 0],
  order: 0,
  contentHash: "a".repeat(64),
  contentVersion: 1,
  hit: hit(),
  previewUrl: null,
  deleted: false,
  ...overrides,
});

/** stroke y=5 from x 0..100, hole over x 40..60 */
const holedInk = () =>
  makeInk({ hit: hit({ hasMask: true, maskBounds: [40, 0, 20, 10] }) });

describe("0046-R4 mask holes hide ink from selection and eraser", () => {
  it("a lasso drawn inside the hole selects nothing (0044 probe)", () => {
    const ink = holedInk();
    expect(
      isInkSelectedByLasso(ink, [
        [44, 1],
        [56, 1],
        [56, 9],
        [44, 9],
      ]),
    ).toBe(false);
  });

  it("the visible remnant outside the hole is still selectable", () => {
    const ink = holedInk();
    expect(
      isInkSelectedByLasso(ink, [
        [-5, -5],
        [35, -5],
        [35, 15],
        [-5, 15],
      ]),
    ).toBe(true);
    expect(
      isInkSelectedByLasso(ink, [
        [65, -5],
        [105, -5],
        [105, 15],
        [65, 15],
      ]),
    ).toBe(true);
  });

  it("eraser inside the hole misses; at the hole boundary it still hits", () => {
    const ink = holedInk();
    expect(isInkHitByEraser(ink, [50, 5], 0)).toBe(false);
    expect(isInkHitByEraser(ink, [41, 5], 0)).toBe(true); // disc overlaps remnant
    expect(isInkHitByEraser(ink, [10, 5], 0)).toBe(true); // visible segment
  });

  it("holes transform with the ink's world transform", () => {
    const ink = makeInk({
      transform: [2, 0, 0, 2, 100, 0],
      hit: hit({ hasMask: true, maskBounds: [40, 0, 20, 10] }),
    });
    // world hole: x in [180, 220], y in [0, 20]
    expect(isInkHitByEraser(ink, [200, 10], 0)).toBe(false);
    expect(isInkHitByEraser(ink, [100, 10], 0)).toBe(true);
  });
});

describe("0046-R4 alpha refinement policy", () => {
  it("sceneToPreviewPixel maps through bounds, transform and image size", () => {
    const ink = makeInk({
      transform: [2, 0, 0, 2, 10, 20],
      hit: hit({ bounds: [10, 20, 100, 50] }),
    });
    // scene (70, 70) -> local ((70-10)/2, (70-20)/2) = (30, 25)
    // -> pixel ((30-10)/100*200, (25-20)/50*100) = (40, 10)
    expect(sceneToPreviewPixel(ink, [70, 70], 200, 100)).toEqual({
      x: 40,
      y: 10,
    });
    expect(sceneToPreviewPixel(ink, [70, 70], 0, 0)).toEqual({ x: 0, y: 0 });
    // degenerate local bounds cannot be mapped
    const flat = makeInk({ hit: hit({ bounds: [0, 0, 0, 10] }) });
    expect(sceneToPreviewPixel(flat, [0, 0], 100, 100)).toBeNull();
  });

  it("combineAlpha: only a definitive transparent sample overrides geometry", () => {
    expect(combineAlpha(true, false)).toBe(false);
    expect(combineAlpha(true, true)).toBe(true);
    expect(combineAlpha(true, null)).toBe(true); // unknown: geometry wins
    expect(combineAlpha(false, true)).toBe(false);
  });

  it("sampler returns null (unknown) without canvas 2d or on decode error", async () => {
    const sampler = createAlphaSampler(() =>
      Promise.reject(new Error("no decode")),
    );
    const ink = makeInk({ previewUrl: "blob:x" });
    expect(await sampler(ink, [50, 5])).toBeNull();
  });

  it("sampler caches one decode per object (concurrent calls share it)", async () => {
    let decodes = 0;
    const sampler = createAlphaSampler(async () => {
      decodes += 1;
      throw new Error("no decode");
    });
    const ink = makeInk({ previewUrl: "blob:x" });
    await Promise.all([
      sampler(ink, [1, 1]),
      sampler(ink, [2, 2]),
      sampler(ink, [3, 3]),
    ]);
    expect(decodes).toBe(1);
  });

  it("InkLayer tap on a transparent pixel does NOT select", async () => {
    const transparentSampler: AlphaSampler = () => Promise.resolve(false);
    const onSelectObject = vi.fn();
    const ink = makeInk({ previewUrl: "blob:p" });
    const { getByTestId } = render(
      <InkLayer
        objects={[ink]}
        toViewport={() => ({ x: 0, y: 0 })}
        zoom={1}
        onSelectObject={onSelectObject}
        alphaSampler={transparentSampler}
        toScene={() => [50, 5]}
      />,
    );
    // jsdom lacks PointerEvent; dispatch pointerdown via MouseEvent
    fireEvent(
      getByTestId("lunacanvas-ink-layer").children[0],
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    await waitFor(() => expect(onSelectObject).not.toHaveBeenCalled());
    expect(onSelectObject).not.toHaveBeenCalled();
  });

  it("InkLayer tap on ink DOES select", async () => {
    const opaqueSampler: AlphaSampler = () => Promise.resolve(true);
    const onSelectObject = vi.fn();
    const ink = makeInk({ previewUrl: "blob:p" });
    const { getByTestId } = render(
      <InkLayer
        objects={[ink]}
        toViewport={() => ({ x: 0, y: 0 })}
        zoom={1}
        onSelectObject={onSelectObject}
        alphaSampler={opaqueSampler}
        toScene={() => [50, 5]}
      />,
    );
    fireEvent(
      getByTestId("lunacanvas-ink-layer").children[0],
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    await waitFor(() =>
      expect(onSelectObject).toHaveBeenCalledWith("ink-1", false),
    );
  });
});
