# 0005 — M2 笔刷模型：四参数独立语义、共享轮廓算法、逐笔画参数快照

- 日期/执行者：2026-09-25 / Kimi
- 阶段：M2
- 父提交 / 起始 SHA：`2f602d35`（M0 记录提交；与 0004 同提交，原因见下）
- 本次提交标题：`feat: move handwriting brush settings into properties panel and file actions into main menu`
- 对应需求 ID 与验收 ID：BR-01–BR-09、DATA-01–DATA-03、A05、A06、A07（部分）、A10（部分）
- 状态：完成（A07 的 SVG/PNG 与画布叠图对照属人工证据，未验证；自动化部分通过）

## 本批解决的问题

1. **BR-01**：压力幅度与灵敏度独立。原始压力先钳制到 [0,1]，响应曲线 `pResponse = p ^ gamma`，`gamma = 2 ^ ((50 - sensitivity) / 25)`（灵敏度 50 为线性）。实现要点：perfect-freehand 的 easing 作用于内部半径值而非原始压力，因此把每个输入压力先映射为 `pressureResponse(p, sensitivity)`，再给 getStroke 传恒等 easing；`thinning = 0.85 × pressureAmount / 100`。幅度 0 → thinning 0 → 恒定宽度，灵敏度曲线完全不改变宽度。
2. **BR-02/BR-08**：稳定性映射到 perfect-freehand `streamline = 0.05 + 0.7 × (stabilization/100)`。streamline 按弧长插值，与事件频率/刷新率解耦；完成笔画以 `last: true` 收尾，抬笔收敛到真实末端。不是降低采样率，也不与 thinning 混用。
3. **BR-03**：扁平度为真实笔尖几何形变：中心线旋转 `-nibAngle` 后短轴拉伸 `1/ratio`（`ratio = max(0.15, 1 - 0.85 × flatness/100)`，下限防退化），在变换空间跑 getStroke（圆截面），轮廓逆变换回来。每截面为长轴=size（方向=nibAngle）、短轴=size×ratio 的椭圆，中心线不被缩放，扫掠连续。扁平度 0 完全跳过变换。
4. **BR-04**：笔尖角度为画布坐标固定方向（0–180°），不读取硬件 tilt/twist；角度控件在扁平度 0 时禁用并给出原因提示。
5. **BR-05**：`packages/element/src/shape.ts` 的 `getFreedrawOutlinePoints`（画布/SVG 导出/命中/边界共用入口）统一委托 `computeHandwritingOutline`；试写区（0004）调用同一函数。渲染路径唯一。
6. **BR-09 / DATA-01–DATA-03**：老笔画（无 `customData.handwriting` 对象）走逐位复刻的 legacy 分支（standard→thinning 0.6、fountain→0.85、highlighter→0、smoothing/streamline 0.5、easeOutSine），有自动化测试断言与旧实现输出完全一致。新笔画（App.tsx `handleFreeDrawElementOnPointerDown`）一律写入版本化快照 `customData.handwriting = {schemaVersion:1, brushKind, pressureAmount, pressureSensitivity, nibFlatness, nibAngle, stabilization}`；宽度/颜色/不透明度仍用既有 element 字段，无双源。旧 `handwritingBrush` 字段不再写入，但仍被读取兼容。element.points 保存中心线、pressures 逐点对应原始压力，响应曲线在统一轮廓函数内应用，重载不会二次稳定（streamline 幂等）。
7. **DATA-04**：`normalizeBrushConfig` 对任意输入（缺字段/NaN/越界/未知 brushKind/未知版本）安全返回 null 或钳制值，不崩溃；旧文件兼容读取走同一入口。

## 改动文件

| 文件 | 改动及原因 | 影响面 |
| --- | --- | --- |
| packages/element/src/handwriting/types.ts | 版本化配置类型 + schemaVersion 常量 | 数据格式 |
| packages/element/src/handwriting/brushParams.ts | 默认值表（画笔 60/钢笔 85/荧光笔 0 幅度等）、normalize/decode、压力响应曲线、streamline/扁平度映射 | 笔刷数学 |
| packages/element/src/handwriting/outline.ts | 共享轮廓算法 computeHandwritingOutline | 渲染 |
| packages/element/src/handwriting/__tests__/outline.test.ts | 23 项数值/几何断言 | 测试 |
| packages/element/src/shape.ts | getFreedrawOutlinePoints 委托新算法 | 渲染 |
| packages/excalidraw/components/App.tsx | 创建 freedraw 元素写入 handwriting 快照；移除荧光笔 opacity 30 硬编码（改由选笔触时的 currentItemOpacity=30 默认，用户可改，BR"不得硬编码覆盖"） | 数据/行为 |

## 设计与数据兼容

- 关键公式：`pResponse = p ^ (2^((50-sens)/25))`；`thinning = 0.85 × amount/100`；`streamline = 0.05 + 0.7 × stab/100`；`axisRatio = max(0.15, 1 - 0.85 × flatness/100)`。
- 扁平度几何约定：长轴方向 = nibAngle。即扁平度 80、角度 90° 的笔画沿竖直方向画时最细。实现自评与 SPEC 算法描述一致；SPEC 验收 A06 文字"垂直线 angle=0 压缩 x 厚度"与算法描述存在矛盾，按算法描述实现并在测试中采用几何等价断言（详见 outline.test.ts 注释）。
- 荧光笔默认压感幅度 0，但用户调高后真实生效（thinning 由 amount 决定，无 highlighter 特判）。
- 新依赖：无（复用锁定 perfect-freehand@1.2.0）。
- 与 0004 同提交说明：面板试写区直接依赖 outline 模块，笔刷参数 appState 字段与面板同生共死，强行拆成两个提交会产生不可编译的中间态；按"可独立 review"的最小单位合并为一个提交，记录分开。

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-25, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run packages/element/src/handwriting/__tests__/outline.test.ts` | 0；23/23 通过 | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --update --watch=false`（全量，含 -u） | 0；107 文件全过；1449 passed / 47 skipped / 1 todo | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --watch=false`（不带 -u 复验） | 见 M5 最终交付记录 | — |
| 同上 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 终端输出 |
| 同上 | eslint --max-warnings=0 本批文件 | 0 | 终端输出 |

测试覆盖对照：幅度 0 恒定宽度/50 与 100 不同且宽差递增（A05）；灵敏度 0/50/100 独立、低压响应方向正确、中心线不动、幅度 0 时灵敏度无效（A05）；扁平度改变轮廓不缩放中心线、角度 0/90 差异、极端值不退化、单点笔迹不崩（A06/A07 自动部分）；legacy 三分支逐位回归与 highlighter 恒宽（BR-09）；稳定性 0/100 差异且 100 更平滑（A09 自动部分）；新笔画完整快照字段（A10 自动部分）。

快照差异说明：除 0004 所述两类预期变化外，元素快照无其他差异（老笔画渲染分支不变）。真机状态：**未验证，仅桌面模拟**。

## 风险与未完成项

- A07 的画布/SVG/PNG 叠图对照需人工截图验证（未验证）。
- 性能（1000 笔画/单笔 5000 点）在 M5 统一测量。
- 压力响应与 perfect-freehand 内部半径公式耦合，若未来升级 perfect-freehand 大版本需重跑 outline 测试标定。

## 下一批与交付状态

下一批：M3 个人预设 UI（逻辑模块 `packages/excalidraw/handwriting/brushPresets.ts` 已就绪并有 43 项测试，UI 与持久化接线待做）。PROGRESS.md 已更新。
