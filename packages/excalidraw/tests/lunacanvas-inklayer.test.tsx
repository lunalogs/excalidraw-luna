import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InkLayer } from "../lunacanvas/InkLayer";

import type { InkObject } from "../lunacanvas/inkModel";

const makeInk = (overrides: Partial<InkObject> = {}): InkObject => ({
  objectId: "ink-1",
  transform: [1.5, 0, 0, 1.5, 100, -40],
  order: 0,
  contentHash: "a".repeat(64),
  contentVersion: 1,
  hit: {
    bounds: [10, 20, 100, 10],
    width: 6,
    path: [
      [10, 25],
      [110, 25],
    ],
    hasMask: false,
  },
  previewUrl: "blob:ink-1",
  deleted: false,
  ...overrides,
});

const toViewport = ([x, y]: readonly [number, number]) => ({
  x: x * 2,
  y: y * 2,
});

describe("InkLayer (W05)", () => {
  it("renders previews at world-anchored positions with world scale", () => {
    render(<InkLayer objects={[makeInk()]} toViewport={toViewport} zoom={2} />);
    const img = screen
      .getByTestId("lunacanvas-ink-layer")
      .querySelector("img")!;
    // anchor: (10*1.5+100, 20*1.5-40) = (115, -10) scene -> (230, -20) viewport
    expect(img.style.left).toBe("230px");
    expect(img.style.top).toBe("-20px");
    // size: 100x10 local * 1.5 world * 2 zoom
    expect(img.style.width).toBe("300px");
    expect(img.style.height).toBe("30px");
  });

  it("hides deleted inks and reports whole-object selection", () => {
    const onSelect = vi.fn();
    render(
      <InkLayer
        objects={[
          makeInk(),
          makeInk({ objectId: "ink-2", deleted: true, previewUrl: "blob:2" }),
        ]}
        toViewport={toViewport}
        zoom={1}
        onSelectObject={onSelect}
      />,
    );
    const layer = screen.getByTestId("lunacanvas-ink-layer");
    const imgs = layer.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    // jsdom lacks PointerEvent; React 18 still dispatches pointerdown via
    // MouseEvent with the same init semantics
    fireEvent(
      imgs[0],
      new MouseEvent("pointerdown", { shiftKey: true, bubbles: true }),
    );
    expect(onSelect).toHaveBeenCalledWith("ink-1", true);
  });

  it("shows selection feedback", () => {
    render(
      <InkLayer
        objects={[makeInk()]}
        toViewport={toViewport}
        zoom={1}
        selectedObjectIds={new Set(["ink-1"])}
      />,
    );
    const img = screen
      .getByTestId("lunacanvas-ink-layer")
      .querySelector("img")!;
    expect(img.style.opacity).toBe("0.75");
  });
});
