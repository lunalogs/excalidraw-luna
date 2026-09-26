import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { fireEvent, render, screen } from "./test-utils";

const h = window.h;
const pen = new Pointer("pen", 10);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const visibleElements = () =>
  h.elements.filter((el: { isDeleted: boolean }) => !el.isDeleted);

/** 在当前位置停留超过规整等待时间（默认 1.2s，测试用 0.5s 档）。 */
const holdStill = async (ms: number) => {
  await sleep(ms);
};

const drawLineAndHold = async (holdMs: number) => {
  pen.downAt(100, 100);
  pen.moveTo(300, 100);
  await holdStill(holdMs);
};

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1024, height: 768 });
  UI.clickTool("freedraw");
  // use the shortest hold delay (0.5s) to keep tests fast
  fireEvent.change(screen.getByRole("slider", { name: /Hold delay/i }), {
    target: { value: "0.5" },
  });
});

it("converts a held straight stroke into a native line element on lift", async () => {
  await drawLineAndHold(650);
  // low-interference preview appears while still holding (SH-04)
  expect(document.querySelector(".shape-preview-trail line")).not.toBeNull();
  pen.upAt();
  expect(visibleElements()).toHaveLength(1);
  expect(visibleElements()[0].type).toBe("line");
  expect(visibleElements()[0]).toMatchObject({ x: 100, y: 100 });
  expect(visibleElements()[0].width).toBeCloseTo(200, 0);
});

it("keeps the freehand stroke when the pen lifts before the hold delay", async () => {
  await drawLineAndHold(200);
  pen.upAt();
  expect(h.elements).toHaveLength(1);
  expect(h.elements[0].type).toBe("freedraw");
  // a stale timer must not tidy a later state (SH-11)
  await sleep(800);
  expect(h.elements[0].type).toBe("freedraw");
});

it("keeps the freehand stroke when the pen keeps moving (dwell resets)", async () => {
  pen.downAt(100, 100);
  pen.moveTo(200, 100);
  await sleep(300);
  // movement within the 6px tolerance restarts the dwell window
  pen.moveTo(201, 100);
  await sleep(300);
  pen.upAt();
  expect(h.elements[0].type).toBe("freedraw");
});

it("does not tidy a stroke drawn below the minimum size", async () => {
  pen.downAt(100, 100);
  pen.moveTo(110, 102);
  await holdStill(650);
  pen.upAt();
  expect(h.elements[0].type).toBe("freedraw");
});

it("converts a held circle into an ellipse element", async () => {
  const cx = 200;
  const cy = 200;
  const r = 60;
  pen.downAt(cx + r, cy);
  const steps = 36;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pen.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  await holdStill(650);
  pen.upAt();
  expect(visibleElements()).toHaveLength(1);
  expect(visibleElements()[0].type).toBe("ellipse");
  const ellipse = visibleElements()[0];
  expect(ellipse.width).toBeGreaterThan(80);
  expect(Math.abs(ellipse.height - ellipse.width)).toBeLessThan(10);
});

it("undo removes the committed shape and redo restores it (single history entry)", async () => {
  await drawLineAndHold(650);
  pen.upAt();
  expect(visibleElements()[0].type).toBe("line");
  const undoDepth = API.getUndoStack().length;
  Keyboard.undo();
  expect(
    h.elements.filter((el: { isDeleted: boolean }) => !el.isDeleted),
  ).toHaveLength(0);
  Keyboard.redo();
  const restored = h.elements.filter(
    (el: { isDeleted: boolean }) => !el.isDeleted,
  );
  expect(restored).toHaveLength(1);
  expect(restored[0].type).toBe("line");
  expect(API.getUndoStack().length).toBe(undoDepth);
});

it("offers a 5-second window to restore the hand-drawn stroke", async () => {
  await drawLineAndHold(650);
  pen.upAt();
  expect(visibleElements()[0].type).toBe("line");
  const restoreButton = screen.getByRole("button", {
    name: "Restore hand-drawn",
  });
  fireEvent.click(restoreButton);
  expect(visibleElements()).toHaveLength(1);
  expect(visibleElements()[0].type).toBe("freedraw");
  // restore is itself undoable
  Keyboard.undo();
  expect(visibleElements()[0].type).toBe("line");
});

it("Esc cancels the candidate and keeps the freehand stroke", async () => {
  await drawLineAndHold(650);
  expect(document.querySelector(".shape-preview-trail line")).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(document.querySelector(".shape-preview-trail line")).toBeNull();
  pen.upAt();
  expect(h.elements[0].type).toBe("freedraw");
});

it("does not recognize while hold-to-shape is disabled (highlighter default)", async () => {
  fireEvent.click(screen.getByRole("button", { name: "Highlighter" }));
  await drawLineAndHold(650);
  pen.upAt();
  expect(h.elements[0].type).toBe("freedraw");
});

it("does not recognize a scribble even when held", async () => {
  pen.downAt(100, 100);
  for (let i = 0; i < 24; i++) {
    pen.moveTo(100 + i * 8, 100 + (i % 2 === 0 ? 30 : -30));
  }
  await holdStill(650);
  pen.upAt();
  expect(h.elements[0].type).toBe("freedraw");
});

it("switching tools cancels a pending candidate without touching the stroke", async () => {
  pen.downAt(100, 100);
  pen.moveTo(300, 100);
  await sleep(650);
  UI.clickTool("rectangle");
  pen.upAt();
  await sleep(200);
  expect(h.elements[0].type).toBe("freedraw");
  expect(document.querySelector(".shape-preview-trail line")).toBeNull();
});
