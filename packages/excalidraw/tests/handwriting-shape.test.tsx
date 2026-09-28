import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  act,
  fireEvent,
  GlobalTestState,
  render,
  screen,
  within,
} from "./test-utils";

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

// Review regressions: isolate timeout scheduling from animation frames.
it.each(["pointercancel", "lostpointercapture", "visibilitychange"])(
  "cancels hold recognition after %s and never revives it on lift",
  (eventName) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      pen.downAt(100, 100);
      pen.moveTo(300, 100);
      if (eventName === "visibilitychange") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        fireEvent(document, new Event(eventName));
      } else {
        fireEvent(
          GlobalTestState.interactiveCanvas,
          new PointerEvent(eventName, {
            bubbles: true,
            pointerId: 10,
            pointerType: "pen",
          }),
        );
      }
      act(() => vi.advanceTimersByTime(600));
      expect(document.querySelector(".shape-preview-trail line")).toBeNull();
      pen.upAt();
      expect(visibleElements()[0].type).toBe("freedraw");
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  },
);

it("preserves reverse line direction with normalized local points", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    pen.downAt(300, 250);
    pen.moveTo(100, 100);
    act(() => vi.advanceTimersByTime(600));
    pen.upAt();
    const line = visibleElements()[0];
    expect(line.type).toBe("line");
    if (line.type !== "line") {
      throw new Error("Expected line");
    }
    expect(line.points[0]).toEqual([0, 0]);
    expect(line.x).toBeCloseTo(300);
    expect(line.y).toBeCloseTo(250);
    expect(line.points[1][0]).toBeCloseTo(-200);
    expect(line.points[1][1]).toBeCloseTo(-150);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the visual weight for constant-width strokes when tidying (R3/A16)", async () => {
  fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
  fireEvent.change(screen.getByRole("slider", { name: "Pressure amount" }), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "8" },
  });
  await drawLineAndHold(650);
  pen.upAt();
  const shape = visibleElements()[0];
  expect(shape.type).toBe("line");
  // constant width: representative width equals the REAL visual width, so the
  // tidied native line keeps the same 34px the ink had (strokeWidth 8 → 34)
  expect(shape.strokeWidth).toBeCloseTo(34, 0);
});

it("uses a representative visual width for pressure strokes (R3/A16)", async () => {
  const canvas = GlobalTestState.interactiveCanvas;
  const base = {
    pointerType: "pen",
    pointerId: 10,
    clientY: 100,
    button: 0,
    buttons: 1,
  };
  fireEvent.pointerDown(canvas, { ...base, clientX: 100, pressure: 0.3 });
  for (let i = 1; i <= 20; i++) {
    fireEvent.pointerMove(canvas, {
      ...base,
      clientX: 100 + i * 10,
      pressure: 0.3 + (0.6 * i) / 20,
    });
  }
  await holdStill(650);
  fireEvent.pointerUp(canvas, { ...base, clientX: 300, pressure: 0.9 });
  const shape = visibleElements()[0];
  expect(shape.type).toBe("line");
  // default pen (strokeWidth 2, pressureAmount 60) with a 0.3→0.9 ramp:
  // the representative width reflects the mean ink in PIXELS (native shape
  // units), i.e. wider than the 8.5px base but well under the heaviest ink
  expect(shape.strokeWidth).toBeGreaterThan(9);
  expect(shape.strokeWidth).toBeLessThan(25);
});

it("narrows flat-nib strokes to their mean visual width (R3/A16)", async () => {
  fireEvent.click(screen.getByRole("button", { name: "Highlighter" }));
  fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
  fireEvent.change(screen.getByRole("slider", { name: "Width" }), {
    target: { value: "8" },
  });
  // enable recognition for the highlighter to exercise the commit path
  fireEvent.click(screen.getByRole("checkbox", { name: /Hold-to-shape/i }));
  await drawLineAndHold(650);
  pen.upAt();
  const shape = visibleElements()[0];
  expect(shape.type).toBe("line");
  // highlighter flatness 70 → axisRatio ≈ 0.405 → mean factor ≈ 0.70 of the
  // 34px constant ink (amount 0 for highlighter) ≈ 23.8px
  expect(shape.strokeWidth).toBeLessThan(30);
  expect(shape.strokeWidth).toBeGreaterThan(15);
});

// ---------------------------------------------------------------------------
// R6 — lifecycle coverage: precise default boundary, zoom-scaled tolerance,
// stale timers across strokes, unmount/atom isolation
// ---------------------------------------------------------------------------

it("holds through the default 1.2s delay and fires just after it (fake timers)", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    // restore the default 1.2s delay first
    fireEvent.change(screen.getByRole("slider", { name: /Hold delay/i }), {
      target: { value: "1.2" },
    });
    pen.downAt(100, 100);
    pen.moveTo(300, 100);
    act(() => vi.advanceTimersByTime(1190));
    expect(document.querySelector(".shape-preview-trail line")).toBeNull();
    act(() => vi.advanceTimersByTime(20));
    expect(document.querySelector(".shape-preview-trail line")).not.toBeNull();
    pen.upAt();
    expect(visibleElements()[0].type).toBe("line");
  } finally {
    vi.useRealTimers();
  }
});

it.each([0.25, 1, 4])(
  "uses the same 6 CSS px dwell tolerance at %sx zoom",
  (zoomValue) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      act(() => {
        h.setState({ zoom: { value: zoomValue as typeof h.state.zoom.value } });
      });
      // hold delay 0.5s (set in beforeEach); Pointer.moveTo takes CLIENT
      // (CSS) coordinates, so +4 is 4 CSS px at every zoom
      pen.downAt(100, 100);
      pen.moveTo(200, 100);
      pen.moveTo(204, 100);
      act(() => vi.advanceTimersByTime(600));
      pen.upAt();
      expect(visibleElements()[0].type).toBe("line");
    } finally {
      vi.useRealTimers();
    }
  },
);

it("resets the dwell window when movement exceeds the tolerance at 4x zoom", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    act(() => {
      h.setState({ zoom: { value: 4 as typeof h.state.zoom.value } });
    });
    pen.downAt(100, 100);
    pen.moveTo(200, 100);
    act(() => vi.advanceTimersByTime(400));
    // 8 CSS px > 6px tolerance → the dwell window restarts; only 200ms of
    // the new 500ms window elapse before lift, so no recognition may fire
    pen.moveTo(208, 100);
    act(() => vi.advanceTimersByTime(200));
    pen.upAt();
    expect(visibleElements()[0].type).toBe("freedraw");
  } finally {
    vi.useRealTimers();
  }
});

it("never lets a previous stroke's timer tidy the next stroke", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    // stroke A: timer scheduled, then lifted before firing
    pen.downAt(100, 100);
    pen.moveTo(200, 100);
    act(() => vi.advanceTimersByTime(300));
    pen.upAt();
    expect(visibleElements()[0].type).toBe("freedraw");
    // stroke B drawn and finished while A's old timer is still pending
    pen.downAt(100, 200);
    pen.moveTo(200, 200);
    pen.upAt();
    expect(visibleElements()).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(visibleElements().every((el) => el.type === "freedraw")).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("clears the restore prompt when the editor unmounts (no cross-editor leak)", async () => {
  await drawLineAndHold(650);
  pen.upAt();
  expect(visibleElements()[0].type).toBe("line");
  expect(
    screen.getByRole("button", { name: "Restore hand-drawn" }),
  ).toBeInTheDocument();
  const { unmountComponent } = await import("./test-utils");
  unmountComponent();
  // a brand-new editor must not inherit the stale restore prompt
  await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1024, height: 768 });
  expect(
    screen.queryByRole("button", { name: "Restore hand-drawn" }),
  ).toBeNull();
});

it("does not show the restore prompt in a second editor for another editor's commit", async () => {
  await drawLineAndHold(650);
  pen.upAt();
  expect(visibleElements()[0].type).toBe("line");
  // mount a second editor alongside the first: the prompt belongs to the
  // first editor only and must not leak into the second editor's UI
  const second = await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1024, height: 768 });
  expect(
    within(second.container).queryByRole("button", {
      name: "Restore hand-drawn",
    }),
  ).toBeNull();
  // …while the committing editor keeps its own prompt
  expect(
    screen.getAllByRole("button", { name: "Restore hand-drawn" }).length,
  ).toBe(1);
});

it("keeps both editors' restore windows independent (R6)", async () => {
  // commit in the first editor
  await drawLineAndHold(650);
  pen.upAt();
  expect(visibleElements()[0].type).toBe("line");
  // mount a second editor and commit there too
  const second = await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1024, height: 768 });
  const secondUi = within(second.container);
  fireEvent.click(secondUi.getByTestId("toolbar-freedraw"));
  fireEvent.change(secondUi.getByRole("slider", { name: /Hold delay/i }), {
    target: { value: "0.5" },
  });
  pen.downAt(100, 100);
  pen.moveTo(300, 100);
  await holdStill(650);
  pen.upAt();
  // both editors still offer their own restore button
  expect(
    screen.getAllByRole("button", { name: "Restore hand-drawn" }),
  ).toHaveLength(2);
  // using the second editor's button does not clear the first editor's
  fireEvent.click(
    within(second.container).getByRole("button", {
      name: "Restore hand-drawn",
    }),
  );
  expect(
    screen.getAllByRole("button", { name: "Restore hand-drawn" }),
  ).toHaveLength(1);
});
