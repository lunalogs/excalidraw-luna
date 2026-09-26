/**
 * Local deterministic geometry recognition for the handwriting phase-two
 * "pen-up regularization" feature (SPEC SH-07 ~ SH-10).
 *
 * The recognizer is a pure function: identical input always yields identical
 * output. No clocks, no randomness, no I/O. All quality thresholds are
 * *relative* to the stroke's own bounding-box diagonal (or radius / span), so
 * every decision is invariant to rotation, translation and uniform scaling.
 * The user's original orientation is preserved — nothing is snapped to
 * horizontal/vertical axes (SH-10).
 *
 * Threshold table (SPEC SH-09 initial suggestions → final calibrated values,
 * calibrated with the fixed-seed samples in `shapeRecognition.test.ts`):
 *
 * | 判据 | SH-09 建议 | 实际采用 | 说明 |
 * |---|---|---|---|
 * | 最小包围盒对角线 | 24 CSS px | 24（默认值） | 未改动；调用方负责 zoom 换算 |
 * | 直线 RMS 残差/主轴跨度 | <= 0.04 | 0.04 | 未改动；另加 max 偏差/跨度 <= 0.10 辅助判据，防止低频缓波被误识别为直线 |
 * | 直线 路径长度/端点距离 | <= 1.15 | 1.15 | 未改动；平滑手写抖动的幅度需满足该约束（逐点白噪声会使其超限） |
 * | 闭合 首末间隙/周长 | <= 0.12 | 0.12 | 未改动 |
 * | 圆 径向 RMS/半径 | <= 0.08 | 0.08 | 未改动；另有 8 扇区方位角覆盖 + 4 次谐波 + 质心锚定检查 |
 * | 圆/椭圆轴比分界 | >= 0.9（圆） | 0.9 | 椭圆侧另设 0.82 上限，0.82~0.9 之间为"模糊区"返回 null（保守，SH-09） |
 * | 椭圆 归一化径向 RMS | 自定 | 0.10 | rho = sqrt(x'^2/a^2 + y'^2/b^2)；另有 4 次谐波检查 |
 * | 圆/椭圆 4 次谐波幅值 | —（新增） | 0.015 | 匹配滤波器 (2/n)|Σ(rho-1)e^{i4φ}|；圆角矩形 ≥0.019，真实圆/椭圆 ≤0.011（固定种子标定） |
 * | 矩形 单角偏差 | 15°~20° | 20° | 另要求平均角偏差/90° <= 0.20 才具备候选资格 |
 * | 矩形 对边方向差 | —（新增） | 30°（mod π） | 边是无向直线，按 mod π 比较方向 |
 * | 模糊竞争返回 null 的残差差 | ~15% | 0.15（相对较大者） | 椭圆族 vs 矩形族竞争时生效 |
 * | RDP 角点简化 epsilon | 自定 | 0.05 × 包围盒对角线 | 圆角矩形（角半径 > 边长 30%）得到 135° 伪角或保留弧中点，均被淘汰 |
 * | 矩形 角点去重阈值 | —（新增） | 0.12 × 对角线 | RDP 大 epsilon 会在同一物理角两侧各留一个角点（分裂角），需合并 |
 * | 矩形 边覆盖容差 | —（新增） | 0.06 × 对角线 | 每条边 >= 10 个重采样点落在容差内 |
 * | 矩形 边直度中位数 | —（新增） | 0.025 × 边长 | 边中段（t∈[0.25,0.75]）覆盖点做 PCA 拟合直线后的残差中位数；弓形边 ≈0.07+ |
 * | 矩形 轮廓越界比例 | —（新增） | 越界 > 0.07×对角线 的点占比 <= 0.18 | 圆角矩形圆弧/星形尖端系统性越界；容差需 > RDP epsilon，避免真角点切角区误判 |
 * | 正方形 边长比 | —（新增） | 短边/长边 >= 0.9 | 边长取对边平均以降低角点噪声抖动；统一边长为中心/方向不变 |
 */

/** 重采样点数上限（SH-08）。 */
const MAX_RESAMPLE_POINTS = 128;

/** 输入点少于该数直接返回 null（SH-08）。 */
const MIN_POINTS = 3;

/** 默认路径最小包围盒对角线（SH-09，CSS px，调用方已按 zoom 换算）。 */
const DEFAULT_MIN_DIAGONAL = 24;

/** 闭合判定：首末点间隙 / 周长（SH-09 建议 0.12）。 */
const CLOSURE_GAP_RATIO_MAX = 0.12;

/** 直线：RMS 残差 / 主轴跨度（SH-09 建议 0.04）。 */
const LINE_RMS_OVER_SPAN_MAX = 0.04;

/** 直线：最大偏差 / 主轴跨度（辅助判据，防止低频正弦波误判为直线）。 */
const LINE_MAX_DEVIATION_OVER_SPAN = 0.1;

/** 直线：路径长度 / 端点距离（SH-09 建议 1.15）。 */
const LINE_LENGTH_OVER_CHORD_MAX = 1.15;

/** 圆：径向 RMS 残差 / 半径（SH-09 建议 0.08）。 */
const CIRCLE_RADIAL_RMS_MAX = 0.08;

/** 圆：8 扇区方位角覆盖，每个扇区至少 1 个采样点。 */
const CIRCLE_SECTOR_COUNT = 8;

/** 圆/椭圆轴比分界：拟合轴比 >= 0.9 优先输出 circle（SH-09 建议 0.9）。 */
const CIRCLE_MIN_AXIS_RATIO = 0.9;

/** 椭圆轴比上限：轴比 <= 0.82 才可能输出 ellipse；0.82~0.9 为模糊区 → null。 */
const ELLIPSE_MAX_AXIS_RATIO = 0.82;

/** 椭圆：归一化径向 RMS（自定阈值，记录于上方表格）。 */
const ELLIPSE_RADIAL_RMS_MAX = 0.1;

/** 矩形：单角允许偏离 90° 的最大角度（SH-09 建议 15°~20°，取 20°）。 */
const RECT_ANGLE_TOLERANCE_DEG = 20;

/** 矩形：平均角偏差/90° 上限（候选资格门槛）。 */
const RECT_RESIDUAL_MAX = 0.2;

/** 矩形：对边方向允许偏差（角度）。 */
const RECT_OPPOSITE_EDGE_TOLERANCE_DEG = 30;

/** 矩形：RDP 简化的 epsilon（相对包围盒对角线）。 */
const RECT_RDP_EPSILON_RATIO = 0.05;

/** 矩形：边覆盖判定距离容差（相对包围盒对角线）。 */
const RECT_EDGE_COVERAGE_TOLERANCE_RATIO = 0.06;

/** 矩形：每条边至少需要覆盖的（重采样）点数。 */
const RECT_MIN_EDGE_POINTS = 10;

/**
 * 矩形：边直度上限（覆盖容差内的各点到边线的 RMS 距离 / 边长）。
 * 圆/椭圆被 RDP 简化成四边形时边是弓形的（覆盖点集 RMS ≈0.08），真实直边 ≈ 噪声水平（<0.03），
 * 该判据把它们区分开。
 */
const RECT_EDGE_STRAIGHTNESS_MEDIAN_MAX = 0.025;

/**
 * 椭圆族：rho(phi) 的 4 次谐波幅值上限（匹配滤波器 (2/n)·|Σ(rho-1)·e^{i4φ}|）。
 * 圆角矩形套进圆/椭圆拟合后，rho 在四个边中方向下凹、对角方向上凸，
 * 产生强 4 次谐波（>= 0.019，角半径越大越圆但仍 >= 0.019）；
 * 真实圆/椭圆的噪声残差 4 次谐波 <= 0.011（标定自固定种子样本）。
 */
const OVAL_FOURFOLD_MAX = 0.015;

/** 正方形：短边/长边 >= 0.9 时 kind 记为 "square"（统一边长为均值）。 */
const SQUARE_MIN_SIDE_RATIO = 0.9;

/** 拟合几何中心偏离路径质心的最大距离（相对对角线），防止结果漂移。 */
const CENTER_ANCHOR_TOLERANCE_RATIO = 0.25;

/** 椭圆族 vs 矩形族竞争：残差相对差小于该值时宁可返回 null（SH-09 建议 ~15%）。 */
const AMBIGUITY_RELATIVE_GAP = 0.15;

/** 数值求解的奇异阈值。 */
const SINGULAR_EPSILON = 1e-12;

export type RecognizedShapeGeometry =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      angle: number;
    }
  | {
      kind: "rectangle";
      cx: number;
      cy: number;
      width: number;
      height: number;
      angle: number;
    };

export interface ShapeCandidate {
  geometry: RecognizedShapeGeometry;
  /** 0..1 置信度 */
  score: number;
  /** 用于调试/记录的形状类别："line"|"circle"|"ellipse"|"rectangle"|"square" */
  kind: string;
}

export interface RecognizeOptions {
  /** 路径最小屏幕包围盒对角线（CSS px），默认 24。调用方传入已按 zoom 换算的值。 */
  minDiagonal?: number;
}

type Vec = readonly [number, number];

type MutableVec = [number, number];

const dist = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 将弧度角归一化到 (-PI/2, PI/2]，使 a >= b 的椭圆/矩形长轴方向唯一。 */
const normalizeAxisAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI / 2) {
    a -= Math.PI;
  }
  while (a <= -Math.PI / 2) {
    a += Math.PI;
  }
  return a;
};

/**
 * 高斯消元（部分主元）求解 n x n 线性方程组。
 * 返回 null 表示奇异/病态矩阵。
 */
const solveLinear = (matrix: number[][], rhs: number[]): number[] | null => {
  const n = rhs.length;
  const rows = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) {
        pivot = r;
      }
    }
    if (Math.abs(rows[pivot][col]) < SINGULAR_EPSILON) {
      return null;
    }
    if (pivot !== col) {
      const tmp = rows[col];
      rows[col] = rows[pivot];
      rows[pivot] = tmp;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) {
        continue;
      }
      const factor = rows[r][col] / rows[col][col];
      for (let c = col; c <= n; c++) {
        rows[r][c] -= factor * rows[col][c];
      }
    }
  }
  return rows.map((row, i) => row[n] / rows[i][i]);
};

/**
 * SH-08 预处理：按弧长等距重采样。
 * - 去除相邻重复点；去重后 < 3 点或总长度过小 → null。
 * - 重采样点数 = min(128, 原点数)，路径很短时保留原点数（均匀化分布）。
 * - 输出首末点与输入首末点一致，保留用户方向与闭合间隙。
 */
const resampleByArcLength = (
  points: readonly Vec[],
  maxPoints: number,
): MutableVec[] | null => {
  const deduped: MutableVec[] = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (!last || dist(last, p) > 1e-9) {
      deduped.push([p[0], p[1]]);
    }
  }
  if (deduped.length < MIN_POINTS) {
    return null;
  }
  const n = deduped.length;
  const cumulative: number[] = new Array(n);
  cumulative[0] = 0;
  for (let i = 1; i < n; i++) {
    cumulative[i] = cumulative[i - 1] + dist(deduped[i - 1], deduped[i]);
  }
  const total = cumulative[n - 1];
  if (!Number.isFinite(total) || total <= 1e-9) {
    return null;
  }
  const count = Math.min(maxPoints, n);
  if (count < MIN_POINTS) {
    return null;
  }
  const out: MutableVec[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (seg < n - 2 && cumulative[seg + 1] < target) {
      seg++;
    }
    const segLen = cumulative[seg + 1] - cumulative[seg];
    const t = segLen > 0 ? (target - cumulative[seg]) / segLen : 0;
    out.push([
      lerp(deduped[seg][0], deduped[seg + 1][0], t),
      lerp(deduped[seg][1], deduped[seg + 1][1], t),
    ]);
  }
  return out;
};

const pathLength = (points: readonly Vec[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
  }
  return total;
};

const boundingBoxDiagonal = (points: readonly Vec[]): number => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) {
      minX = x;
    }
    if (y < minY) {
      minY = y;
    }
    if (x > maxX) {
      maxX = x;
    }
    if (y > maxY) {
      maxY = y;
    }
  }
  return Math.hypot(maxX - minX, maxY - minY);
};

const centroidOf = (points: readonly Vec[]): MutableVec => {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
};

/**
 * 2x2 协方差矩阵的主轴方向（PCA）。
 * 返回单位主方向向量 (ux, uy)。
 */
const principalAxis = (
  points: readonly Vec[],
): { cx: number; cy: number; ux: number; uy: number } => {
  const [cx, cy] = centroidOf(points);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { cx, cy, ux: Math.cos(theta), uy: Math.sin(theta) };
};

interface CircleFit {
  cx: number;
  cy: number;
  r: number;
}

/** Käsa 代数拟合（最小二乘）初值。 */
const fitCircleAlgebraic = (points: readonly Vec[]): CircleFit | null => {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  const n = points.length;
  for (const [x, y] of points) {
    const z = x * x + y * y;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  // 解 [D E F]：x^2+y^2 + D x + E y + F = 0
  const solution = solveLinear(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [-sxz, -syz, -sz],
  );
  if (!solution) {
    return null;
  }
  const [d, e, f] = solution;
  const cx = -d / 2;
  const cy = -e / 2;
  const r2 = cx * cx + cy * cy - f;
  if (!(r2 > SINGULAR_EPSILON)) {
    return null;
  }
  return { cx, cy, r: Math.sqrt(r2) };
};

/** 几何残差（|p - c| - r）上的 Gauss-Newton 精修，固定 3 轮，确定性。 */
const refineCircle = (points: readonly Vec[], fit: CircleFit): CircleFit => {
  let { cx, cy, r } = fit;
  for (let iter = 0; iter < 3; iter++) {
    let a00 = 0;
    let a01 = 0;
    let a02 = 0;
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (const [x, y] of points) {
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.max(Math.hypot(dx, dy), 1e-9);
      const f = d - r;
      const j0 = dx / d;
      const j1 = dy / d;
      const j2 = -1;
      a00 += j0 * j0;
      a01 += j0 * j1;
      a02 += j0 * j2;
      a11 += j1 * j1;
      a12 += j1 * j2;
      a22 += j2 * j2;
      b0 -= j0 * f;
      b1 -= j1 * f;
      b2 -= j2 * f;
    }
    const solution = solveLinear(
      [
        [a00, a01, a02],
        [a01, a11, a12],
        [a02, a12, a22],
      ],
      [b0, b1, b2],
    );
    if (!solution) {
      break;
    }
    const [dcx, dcy, dr] = solution;
    // 步长限制，保证数值稳定
    cx += Math.max(-0.5 * r, Math.min(0.5 * r, dcx));
    cy += Math.max(-0.5 * r, Math.min(0.5 * r, dcy));
    r = Math.max(1e-6, r + Math.max(-0.5 * r, Math.min(0.5 * r, dr)));
  }
  return { cx, cy, r };
};

/** 圆的径向 RMS 残差 / 半径。 */
const circleResidual = (points: readonly Vec[], fit: CircleFit): number => {
  let sum = 0;
  for (const [x, y] of points) {
    const d = dist([x, y], [fit.cx, fit.cy]);
    const dev = (d - fit.r) / fit.r;
    sum += dev * dev;
  }
  return Math.sqrt(sum / points.length);
};

/** 采样点对圆心的方位角是否覆盖 8 个扇区（每扇区至少 1 点）。 */
const hasFullAngularCoverage = (
  points: readonly Vec[],
  fit: CircleFit,
): boolean => {
  const sectors = new Array<boolean>(CIRCLE_SECTOR_COUNT).fill(false);
  for (const [x, y] of points) {
    const angle = Math.atan2(y - fit.cy, x - fit.cx);
    const idx =
      Math.floor(((angle + Math.PI) / (2 * Math.PI)) * CIRCLE_SECTOR_COUNT) %
      CIRCLE_SECTOR_COUNT;
    sectors[idx] = true;
  }
  return sectors.every(Boolean);
};

interface EllipseFit {
  cx: number;
  cy: number;
  a: number;
  b: number;
  theta: number;
}

/**
 * 椭圆拟合：协方差矩阵特征分解给出中心/方向/轴长初值
 * （均匀采样下 var ≈ 轴长²/2），再在归一化径向残差
 * rho = sqrt(x'^2/a^2 + y'^2/b^2) 上做 (a, b) 的 Gauss-Newton 精修。
 * 输出 a >= b，theta 归一化到 (-PI/2, PI/2]。
 */
const fitEllipse = (points: readonly Vec[]): EllipseFit | null => {
  const [cx, cy] = centroidOf(points);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const meanX = sxx / points.length;
  const meanY = syy / points.length;
  const covXY = sxy / points.length;
  const half = (meanX - meanY) / 2;
  const root = Math.hypot(half, covXY);
  const lambda1 = (meanX + meanY) / 2 + root;
  const lambda2 = (meanX + meanY) / 2 - root;
  if (!(lambda1 > SINGULAR_EPSILON) || !(lambda2 > SINGULAR_EPSILON)) {
    return null;
  }
  let a = Math.sqrt(2 * lambda1);
  let b = Math.sqrt(2 * lambda2);
  let theta = 0.5 * Math.atan2(2 * covXY, meanX - meanY);
  if (b > a) {
    const tmp = a;
    a = b;
    b = tmp;
    theta += Math.PI / 2;
  }
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  for (let iter = 0; iter < 3; iter++) {
    let a00 = 0;
    let a01 = 0;
    let a11 = 0;
    let b0 = 0;
    let b1 = 0;
    for (const [x, y] of points) {
      const dx = x - cx;
      const dy = y - cy;
      const xp = dx * cos + dy * sin;
      const yp = -dx * sin + dy * cos;
      const rho = Math.max(Math.hypot(xp / a, yp / b), 1e-9);
      const f = rho - 1;
      const j0 = -(xp * xp) / (rho * a * a * a);
      const j1 = -(yp * yp) / (rho * b * b * b);
      a00 += j0 * j0;
      a01 += j0 * j1;
      a11 += j1 * j1;
      b0 -= j0 * f;
      b1 -= j1 * f;
    }
    const solution = solveLinear(
      [
        [a00, a01],
        [a01, a11],
      ],
      [b0, b1],
    );
    if (!solution) {
      break;
    }
    const [da, db] = solution;
    a = Math.max(1e-6, a + Math.max(-0.3 * a, Math.min(0.3 * a, da)));
    b = Math.max(1e-6, b + Math.max(-0.3 * b, Math.min(0.3 * b, db)));
    if (b > a) {
      const tmp = a;
      a = b;
      b = tmp;
      theta += Math.PI / 2;
    }
  }
  return { cx, cy, a, b, theta: normalizeAxisAngle(theta) };
};

/** 椭圆归一化径向 RMS：sqrt(mean((rho - 1)^2))。 */
const ellipseResidual = (points: readonly Vec[], fit: EllipseFit): number => {
  const cos = Math.cos(fit.theta);
  const sin = Math.sin(fit.theta);
  let sum = 0;
  for (const [x, y] of points) {
    const dx = x - fit.cx;
    const dy = y - fit.cy;
    const xp = dx * cos + dy * sin;
    const yp = -dx * sin + dy * cos;
    const rho = Math.hypot(xp / fit.a, yp / fit.b);
    const dev = rho - 1;
    sum += dev * dev;
  }
  return Math.sqrt(sum / points.length);
};

/**
 * Ramer-Douglas-Peucker 简化（迭代实现，确定性）。
 * 返回保留点的下标（含首末点）。
 */
const rdpIndices = (points: readonly Vec[], epsilon: number): number[] => {
  const n = points.length;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    if (end <= start + 1) {
      continue;
    }
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const abx = bx - ax;
    const aby = by - ay;
    const abLen = Math.hypot(abx, aby);
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d =
        abLen > 1e-12
          ? Math.abs((points[i][0] - ax) * aby - (points[i][1] - ay) * abx) /
            abLen
          : dist(points[i], points[start]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      indices.push(i);
    }
  }
  return indices;
};

/** 闭合顶点环中顶点 i 处的内角（弧度，0..PI）。 */
const interiorAngle = (corners: readonly MutableVec[], i: number): number => {
  const n = corners.length;
  const prev = corners[(i - 1 + n) % n];
  const cur = corners[i];
  const next = corners[(i + 1) % n];
  const ux = prev[0] - cur[0];
  const uy = prev[1] - cur[1];
  const vx = next[0] - cur[0];
  const vy = next[1] - cur[1];
  const cross = ux * vy - uy * vx;
  const dot = ux * vx + uy * vy;
  return Math.atan2(Math.abs(cross), dot);
};

/**
 * 当 RDP 角点多于 4 个时，反复删除最接近共线（内角最接近 180°）的顶点，
 * 直到剩下 4 个。若被删除的顶点中存在锐角（星形尖端 36°~60°、螺旋尖角），
 * 说明原始形状有额外尖角，返回 null 让调用方拒绝（噪声产生的伪角接近 180°，
 * 不受影响）。
 */
const mergeToFourCorners = (
  corners: readonly MutableVec[],
): MutableVec[] | null => {
  const result = corners.slice();
  while (result.length > 4) {
    let worst = 1;
    let worstAngle = -Infinity;
    for (let i = 0; i < result.length; i++) {
      const angle = interiorAngle(result, i);
      if (angle > worstAngle) {
        worstAngle = angle;
        worst = i;
      }
    }
    if (worstAngle < (70 * Math.PI) / 180) {
      return null;
    }
    result.splice(worst, 1);
  }
  return result;
};

interface FamilyCandidate {
  geometry: RecognizedShapeGeometry;
  kind: string;
  /** 归一化残差（相对笔迹尺度），用于族间竞争。 */
  residual: number;
  /** 该族资格阈值，用于评分归一化。 */
  threshold: number;
}

/**
 * score = 1 - clamp01(残差 / (2 × 资格阈值)) - 复杂度惩罚。
 * 残差达到资格阈值时 score ≈ 0.5；复杂度惩罚：line 0（2 自由度），
 * circle 0.01（3 自由度），ellipse/rectangle 0.02（5 自由度）。
 */
const scoreCandidate = (
  kind: string,
  residual: number,
  threshold: number,
): number => {
  const complexityPenalty =
    kind === "line" ? 0 : kind === "circle" ? 0.01 : 0.02;
  return clamp01(1 - clamp01(residual / (2 * threshold)) - complexityPenalty);
};

/** 直线识别（仅对非闭合路径调用）。PCA 主轴拟合，保留用户方向（SH-10）。 */
const recognizeLine = (
  points: readonly Vec[],
  perimeter: number,
): FamilyCandidate | null => {
  const { cx, cy, ux, uy } = principalAxis(points);
  const vx = -uy;
  const vy = ux;
  let tMin = Infinity;
  let tMax = -Infinity;
  let rmsSum = 0;
  let maxDev = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    const t = dx * ux + dy * uy;
    const d = Math.abs(dx * vx + dy * vy);
    if (t < tMin) {
      tMin = t;
    }
    if (t > tMax) {
      tMax = t;
    }
    rmsSum += d * d;
    if (d > maxDev) {
      maxDev = d;
    }
  }
  const span = tMax - tMin;
  if (!(span > 1e-9)) {
    return null;
  }
  const rms = Math.sqrt(rmsSum / points.length);
  const chord = dist(points[0], points[points.length - 1]);
  if (!(chord > 1e-9)) {
    return null;
  }
  if (rms / span > LINE_RMS_OVER_SPAN_MAX) {
    return null;
  }
  if (maxDev / span > LINE_MAX_DEVIATION_OVER_SPAN) {
    return null;
  }
  if (perimeter / chord > LINE_LENGTH_OVER_CHORD_MAX) {
    return null;
  }
  // 端点取主轴方向的极端投影，方向对齐用户实际起笔→收笔方向。
  let x1 = cx + ux * tMin;
  let y1 = cy + uy * tMin;
  let x2 = cx + ux * tMax;
  let y2 = cy + uy * tMax;
  const rawDx = points[points.length - 1][0] - points[0][0];
  const rawDy = points[points.length - 1][1] - points[0][1];
  if ((x2 - x1) * rawDx + (y2 - y1) * rawDy < 0) {
    const tx = x1;
    const ty = y1;
    x1 = x2;
    y1 = y2;
    x2 = tx;
    y2 = ty;
  }
  const residual = rms / span;
  return {
    geometry: { kind: "line", x1, y1, x2, y2 },
    kind: "line",
    residual,
    threshold: LINE_RMS_OVER_SPAN_MAX,
  };
};

/** 矩形识别（仅对闭合路径调用）。RDP 提取角点并校验几何证据。 */
const recognizeRectangle = (
  points: readonly Vec[],
  diagonal: number,
): FamilyCandidate | null => {
  const epsilon = RECT_RDP_EPSILON_RATIO * diagonal;
  const indices = rdpIndices(points, epsilon);
  if (indices.length < 4) {
    return null;
  }
  let corners: MutableVec[] = indices.map((i) => [points[i][0], points[i][1]]);
  // 去除过近的相邻角点（RDP 大 epsilon 可能在同一物理角两侧各保留一个角点，
  // 间距可达 ~2×epsilon，阈值需明显大于 epsilon 才能合并分裂角）
  corners = corners.filter((c, i) => {
    const next = corners[(i + 1) % corners.length];
    return dist(c, next) > 0.12 * diagonal;
  });
  if (corners.length < 4) {
    return null;
  }
  const merged = mergeToFourCorners(corners);
  if (!merged || merged.length !== 4) {
    return null;
  }
  corners = merged;

  // 四角近直角（偏差 <= RECT_ANGLE_TOLERANCE_DEG）
  const toleranceRad = (RECT_ANGLE_TOLERANCE_DEG * Math.PI) / 180;
  let deviationSum = 0;
  for (let i = 0; i < 4; i++) {
    const angle = interiorAngle(corners, i);
    const deviation = Math.abs(angle - Math.PI / 2);
    deviationSum += deviation;
    if (deviation > toleranceRad) {
      return null;
    }
  }
  const residual = deviationSum / 4 / (Math.PI / 2);
  if (residual > RECT_RESIDUAL_MAX) {
    return null;
  }

  // 对边方向一致（边是无向直线，方向角按 mod PI 比较；循环序遍历下
  // 对边在路径方向上本就应该反平行，差 180° 等价于 0°）
  const edgeAngle = (a: Vec, b: Vec): number => {
    let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) % Math.PI;
    if (angle < 0) {
      angle += Math.PI;
    }
    return angle;
  };
  const oppTolerance = (RECT_OPPOSITE_EDGE_TOLERANCE_DEG * Math.PI) / 180;
  const lineAngleDelta = (a: number, b: number): number => {
    const d = Math.abs(a - b) % Math.PI;
    return Math.min(d, Math.PI - d);
  };
  if (
    lineAngleDelta(
      edgeAngle(corners[0], corners[1]),
      edgeAngle(corners[2], corners[3]),
    ) > oppTolerance ||
    lineAngleDelta(
      edgeAngle(corners[1], corners[2]),
      edgeAngle(corners[3], corners[0]),
    ) > oppTolerance
  ) {
    return null;
  }

  // 四边有点覆盖（重采样点落在边线段容差范围内）且边足够直（排除弓形边）。
  // 直度用中位数（对 RDP 切角产生的离群点稳健）；弓形边（圆/椭圆被简化成
  // 四边形）的中位偏差仍可达边长的 ~0.19，真实直边中位数 ≈ 噪声水平（<0.02）。
  const coverageTolerance = RECT_EDGE_COVERAGE_TOLERANCE_RATIO * diagonal;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const edgeLen = dist(a, b);
    let count = 0;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    for (const p of points) {
      const perp =
        len2 > SINGULAR_EPSILON
          ? Math.abs((p[0] - a[0]) * aby - (p[1] - a[1]) * abx) /
            Math.sqrt(len2)
          : dist(p, a);
      if (perp > coverageTolerance) {
        continue;
      }
      count++;
    }
    if (count < RECT_MIN_EDGE_POINTS) {
      return null;
    }
    // 边直度：对边中段核心点做 PCA 拟合直线（角点切角造成的弦倾斜
    // 会使角点弦产生系统性斜坡残差，PCA 直线不受端点位置影响），
    // 再取残差中位数 / 边长。弓形边（圆/椭圆/圆弧角）残差中位数 ≈ 0.05+。
    {
      const core = points.filter((p) => {
        const perp =
          len2 > SINGULAR_EPSILON
            ? Math.abs((p[0] - a[0]) * aby - (p[1] - a[1]) * abx) /
              Math.sqrt(len2)
            : dist(p, a);
        if (perp > coverageTolerance) {
          return false;
        }
        const t =
          len2 > SINGULAR_EPSILON
            ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2
            : 0;
        return t >= 0.25 && t <= 0.75;
      });
      if (core.length >= 5) {
        const { cx: pcx, cy: pcy, ux, uy } = principalAxis(core);
        const vx = -uy;
        const vy = ux;
        const residuals = core.map((p) =>
          Math.abs((p[0] - pcx) * vx + (p[1] - pcy) * vy),
        );
        residuals.sort((x, y) => x - y);
        const median = residuals[Math.floor(residuals.length / 2)];
        if (median / edgeLen > RECT_EDGE_STRAIGHTNESS_MEDIAN_MAX) {
          return null;
        }
      }
    }
  }

  // 拟合旋转矩形：中心取角点平均，并锚定路径质心防止漂移到远处/原点
  const pathCentroid = centroidOf(points);
  const cx =
    (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4;
  const cy =
    (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
  if (dist([cx, cy], pathCentroid) > CENTER_ANCHOR_TOLERANCE_RATIO * diagonal) {
    return null;
  }
  // 边长取对边平均，降低角点噪声导致的边长抖动（正方形判定更稳）
  const sideA =
    (dist(corners[0], corners[1]) + dist(corners[2], corners[3])) / 2;
  const sideB =
    (dist(corners[1], corners[2]) + dist(corners[3], corners[0])) / 2;
  let angle = edgeAngle(corners[0], corners[1]);
  let width = sideA;
  let height = sideB;
  // 长边作为 width，方向角唯一化到 (-PI/2, PI/2]
  if (height > width) {
    const tmp = width;
    width = height;
    height = tmp;
    angle += Math.PI / 2;
  }
  angle = normalizeAxisAngle(angle);

  // 轮廓越界检查：真实矩形的笔迹除切角区微小越界（<= eps 级）都落在四边形内；
  // 圆角矩形的圆弧、星形被裁掉的尖端会系统性越界，据此拒绝。
  {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const outsideTolerance = 0.07 * diagonal; // 需 > RDP epsilon（0.05×对角线），避免真角点切角区被误判
    let outside = 0;
    for (const p of points) {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const du = dx * cosA + dy * sinA;
      const dv = -dx * sinA + dy * cosA;
      const excess = Math.max(
        Math.abs(du) - sideA / 2,
        Math.abs(dv) - sideB / 2,
        0,
      );
      if (excess > outsideTolerance) {
        outside++;
      }
    }
    if (outside / points.length > 0.18) {
      return null;
    }
  }

  let kind = "rectangle";
  if (
    Math.min(sideA, sideB) / Math.max(sideA, sideB) >=
    SQUARE_MIN_SIDE_RATIO
  ) {
    kind = "square";
    width = height = (sideA + sideB) / 2;
  }
  return {
    geometry: { kind: "rectangle", cx, cy, width, height, angle },
    kind,
    residual,
    threshold: RECT_RESIDUAL_MAX,
  };
};

/**
 * rho(phi) 的 4 次谐波幅值：fit 坐标系下 phi = atan2(y'/b, x'/a)，
 * 返回 (2/n)·|Σ (rho-1)·e^{i·4φ}|。圆角矩形等 4 折对称形状会产生强响应。
 */
const fourFoldResidual = (
  points: readonly Vec[],
  fit: { cx: number; cy: number; a: number; b: number; theta: number },
): number => {
  const cos = Math.cos(fit.theta);
  const sin = Math.sin(fit.theta);
  let c4 = 0;
  let s4 = 0;
  let n = 0;
  for (const [x, y] of points) {
    const dx = x - fit.cx;
    const dy = y - fit.cy;
    const xp = dx * cos + dy * sin;
    const yp = -dx * sin + dy * cos;
    const rho = Math.hypot(xp / fit.a, yp / fit.b);
    if (rho < 1e-6) {
      continue;
    }
    const phi = Math.atan2(yp / fit.b, xp / fit.a);
    c4 += (rho - 1) * Math.cos(4 * phi);
    s4 += (rho - 1) * Math.sin(4 * phi);
    n++;
  }
  return n > 0 ? (2 / n) * Math.hypot(c4, s4) : 0;
};

/** 椭圆族候选（circle / ellipse）选择，含模糊区与保守策略（SH-09）。 */
const selectOvalCandidate = (
  points: readonly Vec[],
  diagonal: number,
): FamilyCandidate | null => {
  const circleFit0 = fitCircleAlgebraic(points);
  const circleFit = circleFit0 ? refineCircle(points, circleFit0) : null;
  const ellipseFit = fitEllipse(points);
  if (!ellipseFit) {
    return null;
  }
  const axisRatio = ellipseFit.b / ellipseFit.a;
  const centroid = centroidOf(points);
  const anchorTolerance = CENTER_ANCHOR_TOLERANCE_RATIO * diagonal;
  const anchorOk =
    dist([ellipseFit.cx, ellipseFit.cy], centroid) <= anchorTolerance &&
    (!circleFit ||
      dist([circleFit.cx, circleFit.cy], centroid) <= anchorTolerance);

  const ellipseResidualValue = ellipseResidual(points, ellipseFit);
  const ellipseEligible =
    anchorOk && ellipseResidualValue <= ELLIPSE_RADIAL_RMS_MAX;

  if (axisRatio >= CIRCLE_MIN_AXIS_RATIO) {
    if (!circleFit || !anchorOk) {
      return null;
    }
    const circleResidualValue = circleResidual(points, circleFit);
    const coverage = hasFullAngularCoverage(points, circleFit);
    if (
      circleResidualValue <= CIRCLE_RADIAL_RMS_MAX &&
      coverage &&
      fourFoldResidual(points, {
        cx: circleFit.cx,
        cy: circleFit.cy,
        a: circleFit.r,
        b: circleFit.r,
        theta: 0,
      }) <= OVAL_FOURFOLD_MAX
    ) {
      // circle 候选成立
      return {
        geometry: {
          kind: "ellipse",
          cx: circleFit.cx,
          cy: circleFit.cy,
          rx: circleFit.r,
          ry: circleFit.r,
          angle: 0,
        },
        kind: "circle",
        residual: circleResidualValue,
        threshold: CIRCLE_RADIAL_RMS_MAX,
      };
    }
    // 近圆但圆拟合不达标：形状可疑（螺旋/波浪闭合等），保守不转换。
    return null;
  }
  if (axisRatio <= ELLIPSE_MAX_AXIS_RATIO) {
    if (
      !ellipseEligible ||
      fourFoldResidual(points, ellipseFit) > OVAL_FOURFOLD_MAX
    ) {
      return null;
    }
    return {
      geometry: {
        kind: "ellipse",
        cx: ellipseFit.cx,
        cy: ellipseFit.cy,
        rx: ellipseFit.a,
        ry: ellipseFit.b,
        angle: ellipseFit.theta,
      },
      kind: "ellipse",
      residual: ellipseResidualValue,
      threshold: ELLIPSE_RADIAL_RMS_MAX,
    };
  }
  // 0.82 < 轴比 < 0.9：圆/椭圆模糊区，宁可不转换。
  return null;
};

/**
 * 本地确定性几何识别（SPEC SH-07~SH-10，验收 A16 / SH-12）。
 *
 * @param points 笔迹采样点 [x, y]（canvas 坐标）。
 * @param options.minDiagonal 路径最小包围盒对角线（CSS px），默认 24。
 * @returns 识别候选；不确定或不符合任何形状时返回 null。
 */
export const recognizeShape = (
  points: readonly (readonly [number, number])[],
  options?: RecognizeOptions,
): ShapeCandidate | null => {
  const minDiagonal = options?.minDiagonal ?? DEFAULT_MIN_DIAGONAL;
  if (!points || points.length < 2) {
    return null;
  }
  for (const p of points) {
    if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return null;
    }
  }

  // 恰好两个不同点的退化输入：视为完美直线（手写单笔画通常有更多点，
  // 但快速一划或测试输入可能只有 2 个采样）。点/极小抖动仍被尺寸门槛拦截。
  const distinct: [number, number][] = [];
  for (const p of points) {
    const last = distinct[distinct.length - 1];
    if (!last || dist(last, p as [number, number]) > 1e-9) {
      distinct.push([p[0], p[1]]);
    }
  }
  if (distinct.length === 2) {
    const chord = dist(distinct[0], distinct[1]);
    if (!(chord >= minDiagonal)) {
      return null;
    }
    return {
      geometry: {
        kind: "line",
        x1: distinct[0][0],
        y1: distinct[0][1],
        x2: distinct[1][0],
        y2: distinct[1][1],
      },
      kind: "line",
      score: 1,
    };
  }

  // SH-08 预处理：弧长等距重采样（≤128 点）。
  const resampled = resampleByArcLength(points, MAX_RESAMPLE_POINTS);
  if (!resampled) {
    return null;
  }
  const perimeter = pathLength(resampled);
  const diagonal = boundingBoxDiagonal(resampled);
  // SH-09 尺寸门槛：点、小抖点不识别（同时拦截 NaN 退化）。
  if (!Number.isFinite(perimeter) || !(diagonal >= minDiagonal)) {
    return null;
  }

  // 闭合判定：首末点间隙 / 周长 <= 0.12 才算闭合候选。
  const gap = dist(resampled[0], resampled[resampled.length - 1]);
  const isClosed = gap <= CLOSURE_GAP_RATIO_MAX * perimeter;

  if (!isClosed) {
    const line = recognizeLine(resampled, perimeter);
    return line
      ? {
          geometry: line.geometry,
          kind: line.kind,
          score: scoreCandidate(line.kind, line.residual, line.threshold),
        }
      : null;
  }

  const oval = selectOvalCandidate(resampled, diagonal);
  const rect = recognizeRectangle(resampled, diagonal);

  const candidates: FamilyCandidate[] = [];
  if (oval) {
    candidates.push(oval);
  }
  if (rect) {
    candidates.push(rect);
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => a.residual - b.residual);

  // SH-09 保守性：两族残差相对差 < 15% 时模糊，宁可返回 null。
  if (candidates.length >= 2) {
    const best = candidates[0];
    const second = candidates[1];
    if (
      (second.residual - best.residual) / Math.max(second.residual, 1e-12) <
      AMBIGUITY_RELATIVE_GAP
    ) {
      return null;
    }
  }

  const winner = candidates[0];
  return {
    geometry: winner.geometry,
    kind: winner.kind,
    score: scoreCandidate(winner.kind, winner.residual, winner.threshold),
  };
};
