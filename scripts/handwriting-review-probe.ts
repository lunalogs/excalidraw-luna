/** Reproducible review diagnostics. Not an iPad/browser performance benchmark.
 * Run: node node_modules/vite-node/vite-node.mjs scripts/handwriting-review-probe.ts
 */
import { cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";

import { getDefaultBrushConfig } from "../packages/element/src/handwriting/brushParams";
import { computeHandwritingOutline } from "../packages/element/src/handwriting/outline";
import { recognizeShape } from "../packages/element/src/handwriting/shapeRecognition";

type Point = [number, number];
const config = {
  ...getDefaultBrushConfig("standard"),
  pressureAmount: 0,
  stabilization: 100,
};
const path = (n: number): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => [
    (400 * i) / n,
    50 * Math.sin((4 * Math.PI * i) / n),
  ]);
const outline = (points: Point[]) =>
  computeHandwritingOutline({
    points,
    pressures: points.map(() => 0.5),
    size: 8.5,
    config,
    simulatePressure: false,
  });
const segmentDistance = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const directedDistance = (a: Point[], b: Point[]) =>
  Math.max(
    ...a.map((p) =>
      Math.min(
        ...b.map((q, i) => segmentDistance(p, q, b[(i + 1) % b.length])),
      ),
    ),
  );
const a = outline(path(60));
const b = outline(path(240));
const measure = (run: () => unknown, iterations: number) => {
  for (let i = 0; i < 5; i++) {
    run();
  }
  const samples = [];
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((x, y) => x - y);
  return {
    iterations,
    p50Ms: samples[Math.floor(iterations * 0.5)],
    p95Ms: samples[Math.floor(iterations * 0.95)],
    heapDeltaBytes: process.memoryUsage().heapUsed - before,
  };
};
const shortPath = path(120);
const longPath = path(4999);
process.stdout.write(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        os: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
      },
      sampleDensity: {
        description:
          "Same 400px two-wave sine path, amplitude 50px, constant pressure; symmetric vertex-to-segment outline distance",
        samples: [61, 241],
        maxDistancePx: Math.max(directedDistance(a, b), directedDistance(b, a)),
      },
      thousandStrokeOutlineBatch: measure(() => {
        for (let i = 0; i < 1000; i++) {
          outline(shortPath);
        }
      }, 20),
      fiveThousandPointOutline: measure(() => outline(longPath), 100),
      fiveThousandPointRecognition: measure(
        () => recognizeShape(longPath),
        100,
      ),
      limitation:
        "Node pure geometry only; heap delta is GC-dependent, not retained-memory usage. No scene rendering, pointer latency, export or iPad performance claim.",
    },
    null,
    2,
  ),
);
