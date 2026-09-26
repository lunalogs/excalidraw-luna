import { getFreedrawOutlinePoints } from "../../shape";

import { computeHandwritingOutline } from "../outline";

import type { ExcalidrawFreeDrawElement } from "../../types";

import type { HandwritingBrushConfig } from "../types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const makeConfig = (
  overrides: Partial<HandwritingBrushConfig> = {},
): HandwritingBrushConfig => ({
  schemaVersion: 1,
  brushKind: "standard",
  pressureAmount: 60,
  pressureSensitivity: 50,
  nibFlatness: 0,
  nibAngle: 45,
  stabilization: 30,
  ...overrides,
});

const makeElement = (
  overrides: Partial<ExcalidrawFreeDrawElement> = {},
): ExcalidrawFreeDrawElement =>
  ({
    type: "freedraw",
    points: [
      [0, 0],
      [20, 3],
      [40, -3],
      [60, 2],
      [80, -2],
      [100, 0],
    ],
    pressures: [0.3, 0.6, 0.2, 0.9, 0.5, 0.7],
    simulatePressure: false,
    strokeWidth: 2,
    customData: {},
    ...overrides,
  } as unknown as ExcalidrawFreeDrawElement);

const outlineOf = (
  element: ExcalidrawFreeDrawElement,
  config: HandwritingBrushConfig | null,
  legacyBrushKind?: "standard" | "fountain" | "highlighter" | null,
) =>
  computeHandwritingOutline({
    points: element.points,
    pressures: element.pressures,
    size: element.strokeWidth * 4.25,
    simulatePressure: element.simulatePressure,
    config,
    ...(legacyBrushKind !== undefined ? { legacyBrushKind } : {}),
  });

type Outline = [number, number][];

const bbox = (pts: Outline) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
};

/** Approximate polygon area via the shoelace formula (robust width proxy). */
const polygonArea = (pts: Outline) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};

/** Sum of absolute turning angles along the closed outline polygon. */
const totalTurning = (pts: Outline) => {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const angle1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const angle2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let diff = angle2 - angle1;
    while (diff > Math.PI) {
      diff -= 2 * Math.PI;
    }
    while (diff < -Math.PI) {
      diff += 2 * Math.PI;
    }
    sum += Math.abs(diff);
  }
  return sum;
};

const allFinite = (pts: Outline) =>
  pts.length > 0 &&
  pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

const HORIZONTAL_POINTS = [
  [0, 0],
  [25, 0],
  [50, 0],
  [75, 0],
  [100, 0],
] as const;

const VERTICAL_POINTS = [
  [0, 0],
  [0, 25],
  [0, 50],
  [0, 75],
  [0, 100],
] as const;

const DIAGONAL_POINTS = [
  [0, 0],
  [25, 25],
  [50, 50],
  [75, 75],
  [100, 100],
] as const;

const VARYING_PRESSURES = [0.2, 0.5, 0.8, 0.3, 0.7, 0.4];

/** A jagged, noisy path (y alternates around the x axis). */
const NOISY_POINTS = Array.from({ length: 41 }, (_, i) => [
  i * 5,
  i % 2 === 0 ? 8 : -8,
]);

// ---------------------------------------------------------------------------
// 1. legacy regression — config === null, no legacyBrushKind
// ---------------------------------------------------------------------------

describe("legacy path (config === null)", () => {
  it("matches getFreedrawOutlinePoints bit-for-bit (explicit pressures)", () => {
    const element = makeElement();
    expect(outlineOf(element, null)).toEqual(getFreedrawOutlinePoints(element));
  });

  it("matches getFreedrawOutlinePoints bit-for-bit (simulatePressure)", () => {
    const element = makeElement({ simulatePressure: true });
    expect(outlineOf(element, null)).toEqual(getFreedrawOutlinePoints(element));
  });

  it("matches getFreedrawOutlinePoints for empty points (dot fallback)", () => {
    const element = makeElement({ points: [], pressures: [] });
    const outline = outlineOf(element, null);
    expect(outline).toEqual(getFreedrawOutlinePoints(element));
    expect(outline.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. legacy handwritingBrush branches (phase-one files)
// ---------------------------------------------------------------------------

describe("legacy brush kinds (BR-09)", () => {
  it("matches getFreedrawOutlinePoints for standard / fountain / highlighter", () => {
    for (const kind of ["standard", "fountain", "highlighter"] as const) {
      const element = makeElement({
        customData: { handwritingBrush: kind },
      });
      expect(outlineOf(element, null, kind)).toEqual(
        getFreedrawOutlinePoints(element),
      );
    }
  });

  it("highlighter ignores pressure (thinning 0)", () => {
    const base = makeElement({
      customData: { handwritingBrush: "highlighter" },
    });
    const light = makeElement({
      customData: { handwritingBrush: "highlighter" },
      pressures: [0.05, 0.1, 0.05, 0.1, 0.05, 0.1],
    });
    const heavy = makeElement({
      customData: { handwritingBrush: "highlighter" },
      pressures: [0.9, 1, 0.95, 1, 0.9, 1],
    });
    expect(outlineOf(light, null, "highlighter")).toEqual(
      outlineOf(heavy, null, "highlighter"),
    );
    expect(outlineOf(base, null, "highlighter")).toEqual(
      getFreedrawOutlinePoints(base),
    );
  });

  it("fountain and highlighter produce different outlines", () => {
    const element = makeElement();
    const fountain = outlineOf(element, null, "fountain");
    const highlighter = outlineOf(element, null, "highlighter");
    expect(fountain).not.toEqual(highlighter);
    expect(polygonArea(fountain)).not.toBeCloseTo(polygonArea(highlighter), 5);
  });
});

// ---------------------------------------------------------------------------
// 3. pressureAmount independence (BR-01)
// ---------------------------------------------------------------------------

describe("pressureAmount (BR-01)", () => {
  const makePressureElement = (pressures: readonly number[]) =>
    makeElement({
      points:
        HORIZONTAL_POINTS as unknown as ExcalidrawFreeDrawElement["points"],
      pressures: pressures as unknown as ExcalidrawFreeDrawElement["pressures"],
    });

  it("amount=0 makes the outline identical for different pressures", () => {
    const config = makeConfig({ pressureAmount: 0 });
    const light = outlineOf(
      makePressureElement([0.05, 0.1, 0.05, 0.1, 0.05]),
      config,
    );
    const heavy = outlineOf(
      makePressureElement([0.9, 1, 0.95, 1, 0.9]),
      config,
    );
    expect(light).toEqual(heavy);
  });

  it("amount=50 and amount=100 produce different outlines", () => {
    const element = makePressureElement(VARYING_PRESSURES);
    const half = outlineOf(element, makeConfig({ pressureAmount: 50 }));
    const full = outlineOf(element, makeConfig({ pressureAmount: 100 }));
    expect(half).not.toEqual(full);
  });

  it("heavy-vs-light width difference grows with amount", () => {
    const widthGap = (amount: number) => {
      const config = makeConfig({ pressureAmount: amount });
      const heavy = bbox(
        outlineOf(makePressureElement([0.85, 0.9, 0.95, 0.9, 0.85]), config),
      );
      const light = bbox(
        outlineOf(makePressureElement([0.1, 0.15, 0.1, 0.15, 0.1]), config),
      );
      return heavy.height - light.height;
    };
    const gap50 = widthGap(50);
    const gap100 = widthGap(100);
    expect(gap50).toBeGreaterThan(0);
    expect(gap100).toBeGreaterThan(gap50);
  });
});

// ---------------------------------------------------------------------------
// 4. pressureSensitivity independence
// ---------------------------------------------------------------------------

describe("pressureSensitivity", () => {
  // Constant pressure so the start/end caps are symmetric: the bounding-box
  // center then sits exactly on the centerline (a varying-pressure stroke
  // shifts the bbox center because the two end caps have different radii).
  const makeLowPressureElement = () =>
    makeElement({
      points:
        HORIZONTAL_POINTS as unknown as ExcalidrawFreeDrawElement["points"],
      pressures: [0.25, 0.25, 0.25, 0.25, 0.25],
    });

  it("sensitivity 0 / 50 / 100 produce different outlines when amount > 0", () => {
    const element = makeElement({
      points:
        HORIZONTAL_POINTS as unknown as ExcalidrawFreeDrawElement["points"],
      pressures: VARYING_PRESSURES,
    });
    const s0 = outlineOf(
      element,
      makeConfig({ pressureAmount: 80, pressureSensitivity: 0 }),
    );
    const s50 = outlineOf(
      element,
      makeConfig({ pressureAmount: 80, pressureSensitivity: 50 }),
    );
    const s100 = outlineOf(
      element,
      makeConfig({ pressureAmount: 80, pressureSensitivity: 100 }),
    );
    expect(s0).not.toEqual(s50);
    expect(s50).not.toEqual(s100);
    expect(s0).not.toEqual(s100);
  });

  it("sensitivity 100 boosts low-pressure width more than sensitivity 0", () => {
    const element = makeLowPressureElement();
    const soft = bbox(
      outlineOf(
        element,
        makeConfig({ pressureAmount: 80, pressureSensitivity: 100 }),
      ),
    );
    const hard = bbox(
      outlineOf(
        element,
        makeConfig({ pressureAmount: 80, pressureSensitivity: 0 }),
      ),
    );
    expect(soft.height).toBeGreaterThan(hard.height);
  });

  it("changing sensitivity does not move the stroke centerline", () => {
    const element = makeLowPressureElement();
    for (const sensitivity of [0, 50, 100]) {
      const box = bbox(
        outlineOf(
          element,
          makeConfig({ pressureAmount: 80, pressureSensitivity: sensitivity }),
        ),
      );
      // vertical position of the (horizontal) centerline is unchanged
      expect(box.centerY).toBeCloseTo(0, 6);
      // no lateral drift: bbox center stays on the segment midpoint
      expect(Math.abs(box.centerX - 50)).toBeLessThan(0.02);
    }
  });

  it("amount=0 makes sensitivity irrelevant", () => {
    const element = makeElement({
      points:
        HORIZONTAL_POINTS as unknown as ExcalidrawFreeDrawElement["points"],
      pressures: VARYING_PRESSURES,
    });
    const soft = outlineOf(
      element,
      makeConfig({ pressureAmount: 0, pressureSensitivity: 100 }),
    );
    const hard = outlineOf(
      element,
      makeConfig({ pressureAmount: 0, pressureSensitivity: 0 }),
    );
    expect(soft).toEqual(hard);
  });
});

// ---------------------------------------------------------------------------
// 5. nib flatness (BR-03)
// ---------------------------------------------------------------------------

describe("nib flatness (BR-03)", () => {
  const makeShapeElement = (
    points: readonly (readonly [number, number])[],
    nibAngle: number,
    nibFlatness: number,
  ) =>
    outlineOf(
      makeElement({
        points: points as unknown as ExcalidrawFreeDrawElement["points"],
        pressures: [0.6, 0.6, 0.6, 0.6, 0.6],
      }),
      makeConfig({ nibAngle, nibFlatness, pressureAmount: 0 }),
    );

  it("flatness 0 and flatness 80 produce different outlines", () => {
    const round = makeShapeElement(DIAGONAL_POINTS, 45, 0);
    const flat = makeShapeElement(DIAGONAL_POINTS, 45, 80);
    expect(round).not.toEqual(flat);
  });

  it("does not scale the centerline: horizontal line keeps its x range", () => {
    const round = bbox(makeShapeElement(HORIZONTAL_POINTS, 0, 0));
    const flat = bbox(makeShapeElement(HORIZONTAL_POINTS, 0, 80));
    expect(round.width).toBeGreaterThan(0);
    expect(flat.width).toBe(round.width);
    // thickness is compressed instead
    expect(flat.height).toBeLessThan(round.height);
  });

  it("nibAngle 0 and 90 produce different outlines", () => {
    const angle0 = makeShapeElement(DIAGONAL_POINTS, 0, 80);
    const angle90 = makeShapeElement(DIAGONAL_POINTS, 90, 80);
    expect(angle0).not.toEqual(angle90);
  });

  it("vertical line: centerline y-extent preserved, x thickness compressed at angle 90", () => {
    // The nib major axis points along `nibAngle`; a vertical line is
    // cross-cut by the minor axis when the nib is turned to 90°. The stroke
    // body spans the full centerline [0, 100]; only the (semicircular) end
    // caps are anisotropically scaled by the inverse flatness transform.
    const angle0 = bbox(makeShapeElement(VERTICAL_POINTS, 0, 80));
    const angle90 = bbox(makeShapeElement(VERTICAL_POINTS, 90, 80));
    expect(angle0.width).toBeGreaterThan(0);
    // minor/major axis ratio for flatness 80
    const ratio = 1 - 0.85 * 0.8;
    expect(angle90.width / angle0.width).toBeCloseTo(ratio, 1);
    // centerline extent covered in both orientations
    for (const box of [angle0, angle90]) {
      expect(box.minY).toBeLessThanOrEqual(0);
      expect(box.maxY).toBeGreaterThanOrEqual(100);
      expect(box.height).toBeLessThan(100 + 8.5 + 1e-6); // 8.5 = size
    }
  });

  it("flatness=100 (ratio floor 0.15) stays non-degenerate", () => {
    const outline = makeShapeElement(DIAGONAL_POINTS, 45, 100);
    expect(allFinite(outline)).toBe(true);
  });

  it("single-point stroke with high flatness does not crash", () => {
    const outline = makeShapeElement([[10, 10]], 45, 80);
    expect(allFinite(outline)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. stabilization (BR-02)
// ---------------------------------------------------------------------------

describe("stabilization", () => {
  const makeNoisyElement = () =>
    makeElement({
      points: NOISY_POINTS as unknown as ExcalidrawFreeDrawElement["points"],
      pressures: NOISY_POINTS.map(() => 0.6),
    });

  it("stabilization 0 and 100 produce different outlines", () => {
    const element = makeNoisyElement();
    const raw = outlineOf(element, makeConfig({ stabilization: 0 }));
    const stable = outlineOf(element, makeConfig({ stabilization: 100 }));
    expect(raw).not.toEqual(stable);
  });

  it("stabilization 100 yields a smoother outline than stabilization 0", () => {
    const element = makeNoisyElement();
    const raw = outlineOf(element, makeConfig({ stabilization: 0 }));
    const stable = outlineOf(element, makeConfig({ stabilization: 100 }));
    expect(totalTurning(stable)).toBeLessThan(totalTurning(raw));
  });
});

// ---------------------------------------------------------------------------
// 7. combined parameters
// ---------------------------------------------------------------------------

describe("combined parameters", () => {
  it("flatness + pressure + stabilization produces finite output", () => {
    const element = makeElement({
      points: NOISY_POINTS as unknown as ExcalidrawFreeDrawElement["points"],
      pressures: NOISY_POINTS.map((_, i) => 0.3 + (0.5 * ((i * 7) % 11)) / 11),
    });
    const outline = outlineOf(
      element,
      makeConfig({
        pressureAmount: 100,
        pressureSensitivity: 80,
        nibFlatness: 80,
        nibAngle: 120,
        stabilization: 70,
      }),
    );
    expect(allFinite(outline)).toBe(true);
  });

  it("empty points with a config produce a non-empty finite dot", () => {
    const element = makeElement({ points: [], pressures: [] });
    const outline = outlineOf(element, makeConfig({ nibFlatness: 80 }));
    expect(allFinite(outline)).toBe(true);
  });
});
