/**
 * 本地确定性几何识别测试（验收 A16，SPEC SH-12）。
 *
 * 所有随机样本由固定种子的 mulberry32 伪随机数生成（seed = 42），
 * 无任何非确定性输入；recognizeShape 本身也是纯函数。
 */
import { recognizeShape } from "../shapeRecognition";

import type { RecognizedShapeGeometry } from "../shapeRecognition";

/** 固定种子伪随机数（mulberry32）。 */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rng = mulberry32(42);

const rand = (min: number, max: number): number => min + rng() * (max - min);

/** 近似标准正态（12 个均匀分布之和减 6）。 */
const randn = (): number => {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += rng();
  }
  return sum - 6;
};

type Pt = [number, number];

const toDeg = (rad: number): number => (rad * 180) / Math.PI;

const DEG = Math.PI / 180;

/** 角度差（度），按 mod 180（轴向形状的长轴方向）。 */
const axisAngleDistDeg = (aDeg: number, bDeg: number): number => {
  let d = (aDeg - bDeg) % 180;
  if (d > 90) {
    d -= 180;
  }
  if (d < -90) {
    d += 180;
  }
  return Math.abs(d);
};

/** 角度差（度），按 mod 360（直线方向，含用户起笔方向）。 */
const directionAngleDistDeg = (aDeg: number, bDeg: number): number => {
  let d = (aDeg - bDeg) % 360;
  if (d > 180) {
    d -= 360;
  }
  if (d < -180) {
    d += 360;
  }
  return Math.abs(d);
};

const rotatePts = (pts: Pt[], deg: number): Pt[] => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};

const translatePts = (pts: Pt[], dx: number, dy: number): Pt[] =>
  pts.map(([x, y]) => [x + dx, y + dy]);

const scalePts = (pts: Pt[], factor: number): Pt[] =>
  pts.map(([x, y]) => [x * factor, y * factor]);

// ---------------------------------------------------------------------------
// 样本生成：几何 → 沿轮廓采样 → 相对尺度 2%~4% 噪声 + 轻微采样扰动
// ---------------------------------------------------------------------------

/**
 * 直线：沿方向均匀采样 + 平滑低频摆动噪声（模拟手写抖动，
 * 逐点独立白噪声会使路径长度/端点距超过 1.15 上限，不符合真实笔迹）。
 * 噪声 RMS 归一化到 perpRel × length。
 */
const makeLine = (length: number, angleDeg: number, perpRel: number): Pt[] => {
  const theta = angleDeg * DEG;
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  const pts: Pt[] = [];
  const n = 96;
  const f1 = rand(1, 2.5);
  const f2 = rand(2.5, 4.5);
  const p1 = rand(0, 2 * Math.PI);
  const p2 = rand(0, 2 * Math.PI);
  const a1 = rand(0.5, 0.9);
  const a2 = rand(0.25, 0.4);
  const offs: number[] = [];
  for (let k = 0; k < n; k++) {
    const ph = (2 * Math.PI * k) / (n - 1);
    offs.push(
      a1 * Math.sin(f1 * ph + p1) +
        a2 * Math.sin(f2 * ph + p2) +
        0.05 * randn(),
    );
  }
  const rms = Math.sqrt(offs.reduce((s, o) => s + o * o, 0) / n);
  const scale = (perpRel * length) / rms;
  for (let k = 0; k < n; k++) {
    const t = (length * k) / (n - 1);
    const off = offs[k] * scale;
    pts.push([t * ux + off * vx, t * uy + off * vy]);
  }
  return pts;
};

/** 圆：闭合一圈，半径噪声 + 角度采样抖动。 */
const makeCircle = (r: number, noiseRel: number, n = 120): Pt[] => {
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const step = (2 * Math.PI) / n;
    const t = k * step + rand(-0.2, 0.2) * step;
    const rr = r * (1 + randn() * noiseRel);
    pts.push([rr * Math.cos(t), rr * Math.sin(t)]);
  }
  return pts;
};

/** 椭圆：a 长轴、b 短轴、theta 长轴方向（度），径向噪声。 */
const makeEllipse = (
  a: number,
  b: number,
  thetaDeg: number,
  noiseRel: number,
  n = 120,
): Pt[] => {
  const theta = thetaDeg * DEG;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const step = (2 * Math.PI) / n;
    const t = k * step + rand(-0.2, 0.2) * step;
    const rr = 1 + randn() * noiseRel;
    const x = a * Math.cos(t) * rr;
    const y = b * Math.sin(t) * rr;
    pts.push([x * c - y * s, x * s + y * c]);
  }
  return pts;
};

/** 矩形（含旋转）：沿周长均匀采样，垂边噪声。 */
const makeRect = (
  w: number,
  h: number,
  thetaDeg: number,
  noiseRel: number,
): Pt[] => {
  const theta = thetaDeg * DEG;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const perp = noiseRel * Math.min(w, h);
  const corners: Pt[] = [
    [w / 2, h / 2],
    [-w / 2, h / 2],
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
  ];
  const pts: Pt[] = [];
  const perEdge = 28;
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      const off = randn() * perp;
      const along = randn() * perp * 0.3;
      const x = a[0] + dx * t + nx * off + (dx / len) * along;
      const y = a[1] + dy * t + ny * off + (dy / len) * along;
      pts.push([x * c - y * s, x * s + y * c]);
    }
  }
  return pts;
};

const makeSquare = (side: number, thetaDeg: number, noiseRel: number): Pt[] =>
  makeRect(side, side, thetaDeg, noiseRel);

/** 手写文字状波浪：多条正弦叠加（开放笔画）。 */
const makeWave = (L: number): Pt[] => {
  const f1 = Math.floor(rand(5, 8));
  const f2 = Math.floor(rand(11, 14));
  const a1 = 0.045 * L;
  const a2 = 0.022 * L;
  const p2 = rand(0, Math.PI);
  const pts: Pt[] = [];
  for (let k = 0; k <= 150; k++) {
    const x = (L * k) / 150;
    const y =
      a1 * Math.sin((2 * Math.PI * f1 * x) / L) +
      a2 * Math.sin((2 * Math.PI * f2 * x) / L + p2) +
      randn() * 0.15;
    pts.push([x, y]);
  }
  return pts;
};

/** 锯齿线。 */
const makeZigzag = (teeth: number, amp: number, L: number): Pt[] => {
  const steps = teeth * 2;
  const pts: Pt[] = [];
  for (let k = 0; k <= steps; k++) {
    const x = (L * k) / steps;
    const y = k % 2 === 0 ? 0 : k % 4 === 1 ? amp : -amp;
    pts.push([x, y + randn() * 0.5]);
  }
  return pts;
};

/** 开放圆弧：缺 20%+ 弧长（sweepDeg < 360）。 */
const makeArc = (r: number, sweepDeg: number): Pt[] => {
  const pts: Pt[] = [];
  const n = Math.max(40, Math.floor((sweepDeg / 360) * 140));
  for (let k = 0; k <= n; k++) {
    const t = (sweepDeg * DEG * k) / n;
    pts.push([
      r * Math.cos(t) + randn() * 0.4,
      r * Math.sin(t) + randn() * 0.4,
    ]);
  }
  return pts;
};

/** 螺旋：绕 2~3 圈，半径单调收缩（自交）。 */
const makeSpiral = (rOut: number, rIn: number, turns: number): Pt[] => {
  const pts: Pt[] = [];
  const n = 240;
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * turns * k) / n;
    const r = rOut + ((rIn - rOut) * k) / n;
    pts.push([
      r * Math.cos(t) + randn() * 0.3,
      r * Math.sin(t) + randn() * 0.3,
    ]);
  }
  return pts;
};

/** 星形：points 个角，内外径交替。 */
const makeStar = (points: number, R: number, innerRatio: number): Pt[] => {
  const pts: Pt[] = [];
  const perEdge = 18;
  const vertex = (i: number): Pt => {
    const r = i % 2 === 0 ? R : R * innerRatio;
    const t = (Math.PI * i) / points - Math.PI / 2;
    return [r * Math.cos(t), r * Math.sin(t)];
  };
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const a = vertex(i);
    const b = vertex(i + 1);
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      pts.push([
        a[0] + (b[0] - a[0]) * t + randn() * 0.4,
        a[1] + (b[1] - a[1]) * t + randn() * 0.4,
      ]);
    }
  }
  return pts;
};

/** 随机折线：方向交替大幅偏转的多段线。 */
const makePolyline = (segments: number, segLen: number): Pt[] => {
  const pts: Pt[] = [[0, 0]];
  let angle = rand(-0.3, 0.3);
  let x = 0;
  let y = 0;
  for (let i = 0; i < segments; i++) {
    angle += (i % 2 === 0 ? 1 : -1) * rand(0.9, 1.5);
    x += Math.cos(angle) * segLen;
    y += Math.sin(angle) * segLen;
    pts.push([x + randn() * 0.5, y + randn() * 0.5]);
  }
  return pts;
};

/** 圆角矩形：角半径 = cornerRel × 短边（cornerRel > 0.3 为严重圆化）。 */
const makeRoundedRect = (w: number, h: number, cornerRel: number): Pt[] => {
  const rc = cornerRel * Math.min(w, h);
  const pts: Pt[] = [];
  const centers: Pt[] = [
    [w / 2 - rc, h / 2 - rc],
    [-w / 2 + rc, h / 2 - rc],
    [-w / 2 + rc, -h / 2 + rc],
    [w / 2 - rc, -h / 2 + rc],
  ];
  const push = (x: number, y: number) =>
    pts.push([x + randn() * 0.5, y + randn() * 0.5]);
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = centers[i];
    const start = (i * Math.PI) / 2;
    for (let k = 0; k <= 12; k++) {
      const ang = start + (k / 12) * (Math.PI / 2);
      push(cx + rc * Math.cos(ang), cy + rc * Math.sin(ang));
    }
    const [nx, ny] = centers[(i + 1) % 4];
    const nextStart = (((i + 1) % 4) * Math.PI) / 2;
    const sx = cx + rc * Math.cos(start + Math.PI / 2);
    const sy = cy + rc * Math.sin(start + Math.PI / 2);
    const ex = nx + rc * Math.cos(nextStart);
    const ey = ny + rc * Math.sin(nextStart);
    for (let k = 1; k < 8; k++) {
      push(sx + ((ex - sx) * k) / 8, sy + ((ey - sy) * k) / 8);
    }
  }
  return pts;
};

/** 交叉"8"字（伯努利双纽线，自交闭合）。 */
const makeFigure8 = (a: number): Pt[] => {
  const pts: Pt[] = [];
  const n = 160;
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * k) / n;
    const d = 1 + Math.sin(t) * Math.sin(t);
    pts.push([
      (a * Math.cos(t)) / d + randn() * 0.3,
      (a * Math.sin(t) * Math.cos(t)) / d + randn() * 0.3,
    ]);
  }
  return pts;
};

// ---------------------------------------------------------------------------
// 正例（每类 >= 10 条）
// ---------------------------------------------------------------------------

describe("正例", () => {
  it("识别直线（含斜线）>= 10 条", () => {
    for (let i = 0; i < 12; i++) {
      const length = rand(100, 320);
      const angle = rand(-89, 89);
      const pts = makeLine(length, angle, rand(0.01, 0.025));
      const result = recognizeShape(pts);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("line");
      const g = result?.geometry as Extract<
        RecognizedShapeGeometry,
        { kind: "line" }
      >;
      const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
      expect(Math.abs(len - length) / length).toBeLessThan(0.15);
    }
  });

  it("识别圆 >= 10 条", () => {
    for (let i = 0; i < 12; i++) {
      const r = rand(30, 80);
      const pts = makeCircle(r, rand(0.015, 0.04));
      const result = recognizeShape(pts);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("circle");
      const g = result?.geometry as Extract<
        RecognizedShapeGeometry,
        { kind: "ellipse" }
      >;
      expect(g.rx).toBe(g.ry);
      expect(g.angle).toBe(0);
      expect(Math.abs(g.rx - r) / r).toBeLessThan(0.12);
      expect(Math.hypot(g.cx, g.cy)).toBeLessThan(0.15 * r);
    }
  });

  it("识别椭圆（轴比 0.3~0.8）>= 10 条", () => {
    for (let i = 0; i < 12; i++) {
      const a = rand(50, 85);
      const b = a * rand(0.3, 0.8);
      const theta = rand(-80, 80);
      const pts = makeEllipse(a, b, theta, rand(0.015, 0.04));
      const result = recognizeShape(pts);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("ellipse");
      const g = result?.geometry as Extract<
        RecognizedShapeGeometry,
        { kind: "ellipse" }
      >;
      expect(Math.abs(g.rx - a) / a).toBeLessThan(0.12);
      expect(Math.abs(g.ry - b) / b).toBeLessThan(0.12);
      expect(axisAngleDistDeg(toDeg(g.angle), theta)).toBeLessThan(6);
    }
  });

  it("识别矩形（含旋转矩形）>= 10 条", () => {
    for (let i = 0; i < 12; i++) {
      const w = rand(80, 160);
      const h = w * rand(0.45, 0.8);
      const theta = rand(-85, 85);
      const pts = makeRect(w, h, theta, rand(0.012, 0.025));
      const result = recognizeShape(pts);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("rectangle");
      const g = result?.geometry as Extract<
        RecognizedShapeGeometry,
        { kind: "rectangle" }
      >;
      const fitted = [g.width, g.height].sort((x, y) => x - y);
      const truth = [w, h].sort((x, y) => x - y);
      expect(Math.abs(fitted[0] - truth[0]) / truth[0]).toBeLessThan(0.12);
      expect(Math.abs(fitted[1] - truth[1]) / truth[1]).toBeLessThan(0.12);
      expect(axisAngleDistDeg(toDeg(g.angle), theta)).toBeLessThan(6);
    }
  });

  it("识别正方形（含旋转正方形）>= 10 条", () => {
    for (let i = 0; i < 12; i++) {
      const side = rand(50, 140);
      const theta = rand(-85, 85);
      const pts = makeSquare(side, theta, rand(0.012, 0.02));
      const result = recognizeShape(pts);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("square");
      const g = result?.geometry as Extract<
        RecognizedShapeGeometry,
        { kind: "rectangle" }
      >;
      expect(Math.abs(g.width - g.height) / g.width).toBeLessThan(0.08);
      expect(Math.abs(g.width - side) / side).toBeLessThan(0.12);
    }
  });
});

// ---------------------------------------------------------------------------
// 负例（>= 30 条）
// ---------------------------------------------------------------------------

describe("负例", () => {
  it("手写文字状波浪（多条正弦叠加）→ null", () => {
    for (let i = 0; i < 5; i++) {
      expect(recognizeShape(makeWave(rand(260, 380)))).toBeNull();
    }
  });

  it("锯齿线 → null", () => {
    for (let i = 0; i < 4; i++) {
      expect(
        recognizeShape(makeZigzag(7, rand(24, 40), rand(240, 320))),
      ).toBeNull();
    }
  });

  it("弧线/开放圆（缺 20%+ 弧长）→ null", () => {
    for (let i = 0; i < 5; i++) {
      const sweep = rand(245, 288);
      expect(recognizeShape(makeArc(rand(55, 80), sweep))).toBeNull();
    }
  });

  it("孤立点与极小圆（< 24px）→ null", () => {
    expect(recognizeShape([[10, 10]])).toBeNull();
    expect(
      recognizeShape([
        [10, 10],
        [20, 15],
      ]),
    ).toBeNull();
    // 半径 7px 的圆，包围盒对角线 ≈ 14 < 24
    expect(recognizeShape(makeCircle(7, 0.02, 60))).toBeNull();
  });

  it("绕 2~3 圈的螺旋（自交）→ null", () => {
    for (let i = 0; i < 4; i++) {
      expect(
        recognizeShape(makeSpiral(rand(55, 70), rand(18, 30), rand(2, 3))),
      ).toBeNull();
    }
  });

  it("星形（5/6 角）→ null", () => {
    expect(recognizeShape(makeStar(5, rand(55, 75), 0.42))).toBeNull();
    expect(recognizeShape(makeStar(5, rand(55, 75), 0.5))).toBeNull();
    expect(recognizeShape(makeStar(6, rand(55, 75), 0.42))).toBeNull();
    expect(recognizeShape(makeStar(6, rand(55, 75), 0.5))).toBeNull();
  });

  it("随机折线（多重折线）→ null", () => {
    for (let i = 0; i < 4; i++) {
      expect(recognizeShape(makePolyline(8, rand(28, 45)))).toBeNull();
    }
  });

  it("角严重圆化的矩形（角半径 > 边长 30%）→ null", () => {
    for (let i = 0; i < 4; i++) {
      const w = rand(100, 160);
      const h = rand(100, 170);
      const cr = rand(0.32, 0.45);
      expect(recognizeShape(makeRoundedRect(w, h, cr))).toBeNull();
    }
  });

  it('交叉"8"字（自交）→ null', () => {
    for (let i = 0; i < 3; i++) {
      expect(recognizeShape(makeFigure8(rand(60, 85)))).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 变换不变性（旋转/平移/均匀缩放后 kind 不变，几何参数随之变化）
// ---------------------------------------------------------------------------

describe("变换不变性", () => {
  const transforms: Array<{
    name: string;
    apply: (pts: Pt[]) => Pt[];
    rotDeg: number;
    scale: number;
  }> = [
    { name: "identity", apply: (pts) => pts, rotDeg: 0, scale: 1 },
    {
      name: "rotate37",
      apply: (pts) => rotatePts(pts, 37),
      rotDeg: 37,
      scale: 1,
    },
    {
      name: "translate",
      apply: (pts) => translatePts(pts, 500, -300),
      rotDeg: 0,
      scale: 1,
    },
    {
      name: "scale0.5",
      apply: (pts) => scalePts(pts, 0.5),
      rotDeg: 0,
      scale: 0.5,
    },
    { name: "scale3", apply: (pts) => scalePts(pts, 3), rotDeg: 0, scale: 3 },
  ];

  const runCase = (
    base: Pt[],
    expectedKind: string,
    check: (g: RecognizedShapeGeometry, rotDeg: number, scale: number) => void,
  ) => {
    for (const t of transforms) {
      const result = recognizeShape(t.apply(base));
      expect(result).not.toBeNull();
      expect(result?.kind).toBe(expectedKind);
      check(result?.geometry as RecognizedShapeGeometry, t.rotDeg, t.scale);
    }
  };

  it("圆：缩放后 rx 按比例，旋转/平移不变", () => {
    const base = makeCircle(60, 0.02);
    runCase(base, "circle", (g, _rot, s) => {
      const e = g as Extract<RecognizedShapeGeometry, { kind: "ellipse" }>;
      expect(Math.abs(e.rx - 60 * s) / (60 * s)).toBeLessThan(0.12);
      expect(e.ry).toBe(e.rx);
      expect(e.angle).toBe(0);
    });
  });

  it("椭圆：缩放后轴长按比例，旋转后 angle 相应变化（mod 180°）", () => {
    const base = makeEllipse(70, 38, 15, 0.02);
    runCase(base, "ellipse", (g, rot, s) => {
      const e = g as Extract<RecognizedShapeGeometry, { kind: "ellipse" }>;
      expect(Math.abs(e.rx - 70 * s) / (70 * s)).toBeLessThan(0.12);
      expect(Math.abs(e.ry - 38 * s) / (38 * s)).toBeLessThan(0.12);
      expect(axisAngleDistDeg(toDeg(e.angle), 15 + rot)).toBeLessThan(6);
    });
  });

  it("旋转矩形：缩放后边长按比例，旋转后 angle 相应变化（mod 180°）", () => {
    const base = makeRect(110, 64, 25, 0.015);
    runCase(base, "rectangle", (g, rot, s) => {
      const r = g as Extract<RecognizedShapeGeometry, { kind: "rectangle" }>;
      const fitted = [r.width / s, r.height / s].sort((x, y) => x - y);
      expect(Math.abs(fitted[0] - 64) / 64).toBeLessThan(0.12);
      expect(Math.abs(fitted[1] - 110) / 110).toBeLessThan(0.12);
      expect(axisAngleDistDeg(toDeg(r.angle), 25 + rot)).toBeLessThan(6);
    });
  });

  it("旋转正方形：缩放后边长按比例，旋转后 angle 相应变化（mod 90°）", () => {
    const base = makeSquare(80, 40, 0.015);
    runCase(base, "square", (g, rot, s) => {
      const r = g as Extract<RecognizedShapeGeometry, { kind: "rectangle" }>;
      expect(Math.abs(r.width - 80 * s) / (80 * s)).toBeLessThan(0.12);
      expect(Math.abs(r.height - 80 * s) / (80 * s)).toBeLessThan(0.12);
      expect(
        Math.min(
          axisAngleDistDeg(toDeg(r.angle), 40 + rot),
          axisAngleDistDeg(toDeg(r.angle), 40 + rot + 90),
        ),
      ).toBeLessThan(8);
    });
  });

  it("直线：缩放后长度按比例，旋转后方向角相应变化", () => {
    const base = makeLine(180, 30, 0.02);
    runCase(base, "line", (g, rot, s) => {
      const l = g as Extract<RecognizedShapeGeometry, { kind: "line" }>;
      const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      expect(Math.abs(len - 180 * s) / (180 * s)).toBeLessThan(0.12);
      const dir = toDeg(Math.atan2(l.y2 - l.y1, l.x2 - l.x1));
      expect(directionAngleDistDeg(dir, 30 + rot)).toBeLessThan(4);
    });
  });
});

// ---------------------------------------------------------------------------
// 方向保留（SH-10）：不吸水平/垂直
// ---------------------------------------------------------------------------

describe("方向保留（SH-10）", () => {
  it("斜线端点方向角保持原方向（30° 示例，±3°）", () => {
    const pts = makeLine(220, 30, 0.02);
    const result = recognizeShape(pts);
    expect(result?.kind).toBe("line");
    const g = result?.geometry as Extract<
      RecognizedShapeGeometry,
      { kind: "line" }
    >;
    const dir = toDeg(Math.atan2(g.y2 - g.y1, g.x2 - g.x1));
    expect(directionAngleDistDeg(dir, 30)).toBeLessThan(3);
  });

  it("多组角度均不被吸附到水平/垂直", () => {
    const angles = [5, 20, 30, 45, 60, 75, 100, 120, 150, 170];
    for (const angle of angles) {
      const pts = makeLine(200, angle, 0.02);
      const result = recognizeShape(pts);
      expect(result?.kind).toBe("line");
      const g = result?.geometry as Extract<
        RecognizedShapeGeometry,
        { kind: "line" }
      >;
      const dir = toDeg(Math.atan2(g.y2 - g.y1, g.x2 - g.x1));
      expect(directionAngleDistDeg(dir, angle)).toBeLessThan(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 保守性（SH-09）：模糊时宁可不转换
// ---------------------------------------------------------------------------

describe("保守性（SH-09）", () => {
  it("正圆加轻微椭圆扰动（轴比 0.93）：只能是 circle 或 null", () => {
    for (let i = 0; i < 10; i++) {
      const pts = makeEllipse(60, 60 * 0.93, rand(-80, 80), rand(0.02, 0.035));
      const result = recognizeShape(pts);
      if (result !== null) {
        expect(result.kind).toBe("circle");
        const g = result.geometry as Extract<
          RecognizedShapeGeometry,
          { kind: "ellipse" }
        >;
        expect(g.rx).toBe(g.ry);
        expect(g.angle).toBe(0);
      }
    }
  });

  it("直线加微小弯折（中点偏移 5% 跨度）：只能是 line 或 null", () => {
    for (let i = 0; i < 10; i++) {
      const pts = makeLine(200, rand(-60, 60), 0.015);
      const mid = Math.floor(pts.length / 2);
      // 垂直于线方向偏移 5% 跨度 ≈ 10px
      const theta = rand(0, Math.PI);
      pts[mid] = [
        pts[mid][0] + 10 * Math.cos(theta),
        pts[mid][1] + 10 * Math.sin(theta),
      ];
      const result = recognizeShape(pts);
      if (result !== null) {
        expect(result.kind).toBe("line");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 鲁棒性：NaN/Infinity/退化输入安全返回 null，不崩溃
// ---------------------------------------------------------------------------

describe("鲁棒性", () => {
  it("NaN / Infinity 输入 → null", () => {
    expect(
      recognizeShape([
        [NaN, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toBeNull();
    expect(
      recognizeShape([
        [0, Infinity],
        [1, 1],
        [2, 2],
      ]),
    ).toBeNull();
  });

  it("空输入 / 点数过少 → null", () => {
    expect(recognizeShape([])).toBeNull();
    expect(
      recognizeShape([
        [0, 0],
        [10, 10],
      ]),
    ).toBeNull();
  });

  it("重复点 / 过小路径 → null", () => {
    expect(
      recognizeShape([
        [5, 5],
        [5, 5],
        [5, 5],
      ]),
    ).toBeNull();
    // 对角线 14.1 < 24
    expect(
      recognizeShape([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBeNull();
  });

  it("自定义 minDiagonal 生效", () => {
    const pts = makeLine(200, 20, 0.02);
    expect(recognizeShape(pts)).not.toBeNull();
    expect(recognizeShape(pts, { minDiagonal: 500 })).toBeNull();
  });
});
