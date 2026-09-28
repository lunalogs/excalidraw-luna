# 0012 — Kimi 第三批：0011 复核发现 F1–F6 修复

- 日期/执行者：2026-09-27 / Kimi
- 阶段：review 修复（承接 0011 的 F1–F6 与 R6 测试质量问题）
- 父提交 / 起始 SHA：`5e49d5a4` + 0009/0010 未提交工作区（同批）
- 本次提交标题：见交付时填写（沿用"工作区待复核"约定）
- 对应需求：F1/F2（R1/A07）、F6（R2/A09）、F4（R3/A16）、F5（R4/A04/A08）、F3（R5/A11）、R6（A13/A17）
- 状态：F1–F6 代码项完成；0011 独立回归断言 5/5 通过并正式纳入测试套件

## 本批解决的问题

### F1 / R1 — 旋转边界覆盖全部轮廓顶点
`bounds.ts` freedraw 分支改为旋转**全部**轮廓顶点（同一旋转中心）再取极值；AABB 对角点方案删除。旋转/非旋转均走同一路径（angle=0 时恒等）。0011 独立断言（45° 笔画 28 个顶点的世界坐标全部包含）通过，已纳入 `handwriting-0011-review.test.tsx` 正式回归。

### F2 / R1 — 命中使用真实轮廓
`distance.ts` freedraw 分支改为：真实轮廓（含压感/扁笔/稳定性）→ 旋转到世界坐标 → `polygonIncludesPoint` 内部命中返 0，否则取到多边形边的最小距离。名义半径估算删除。修复过程中发现一个关键事实并记录：**perfect-freehand 1.2.0 对稀疏输入会在内部生成中点并把压力设为 0.5**（`getStrokePoints` 实测输出），因此 2 点笔画的中段墨迹恒为 size/2 宽——0011 断言中"半径 31.45 均匀"的假设不成立。测试改用密集采样（间距 < size）使逐点压力生效，并按**真实轮廓**推导探测点（形内/形外各一）。**附带效果**：0010 被误改的 lasso 用例在 F2 修复后恢复原期望（4 选中）——套索路径确实穿过该笔画可见墨迹（intersectionTest 命中），证明 0011 对该测试调整的意见正确，该文件已恢复与上游逐字节一致。

### F3 / R5 — 配额失败也进会话库 + 损坏备份
- `isPresetStorageWritable()` 探测写入（setItem/removeItem 探针）；`createPanelPresetLibrary()` 供面板挂载时选择：可写→每次挂载新读存储；不可写（getter 抛错、getItem/setItem 抛错、配额满）→会话共享库。配额场景预设不再随面板关闭丢失（0011 独立断言通过）。
- 损坏数据：加载检出损坏时把**原始载荷**复制到 `<key>.corrupt-backup`（不覆盖既有备份，尽力而为），下一次保存不再静默销毁唯一副本。持久化恢复时的合并规则明确：存储内容优先；不可用期间产生的仅会话预设应在不可用期间用导出按钮备份（会话库同样支持导出）。

### F4 / R3 — 代表线宽改为实测
- 恒宽圆笔（amount 0 + flatness 0）直接返回 `strokeWidth × 4.25`（胶囊直径恒等于路径，无需测量）；其余情况用**真实轮廓**测中位弦宽：对每个中心线采样点沿法线求与轮廓多边形的弦，取中位数（中位数而非面积均值：端帽不得把恒宽笔画撑大——恒宽必须精确返回 34）。结果原生像素单位，无 12 上限。
- 顺带修正：解析式半径公式与 perfect-freehand 内部压力整形不符，已废弃（见 F2 发现）。0010 中把 8 当期望的错误测试已改为 34。

### F5 / R4 — 试写保留原地压力 + 指针优先级
- move 过滤改为"位置与压力都未变才丢弃"；压力跳变在同坐标也入样。
- Pencil-only 模式下 pen 可从已活动的 touch（掌托）接管；非 penMode 保持先到先得。新增 touch 先到 pen 后到的测试。

### F6 / R2 — 重采样有界化 + 零稳定真零滤波
- 重采样前先算总弧长，输出间距抬升为 `max(spacing, total/(1023))`，单段 1e8 长的输入也只产生 ≤1024 样本（新增超长段/大坐标测试）。
- `stabilizationToStreamline(0)` 精确返回 0（不再残留 0.05 基底），stability 0 真正零滤波；文档措辞修正（"确定性重算"不等于"对规范化输入幂等"的说法已删）。

### R6 测试质量
- 缩放测试修正：`Pointer.moveTo` 接收的是 client CSS 坐标，不再除 zoom——现在 25%/100%/400% 下都真实移动 4 CSS px；超容差重置测试先推进 400ms 再移动 8 CSS px、再等 200ms（证明旧截止失效、新截止未到）。
- 1190/1210 用例更名（不再宣称"精确边界"）。
- 恢复 atom 改为按 appId 的多份存储：双编辑器各自提交互不覆盖（新增双编辑器独立窗口测试）；卸载只清自己的条目。

## 改动文件

| 文件 | 改动 |
| --- |
| packages/element/src/bounds.ts | 旋转全部轮廓顶点求边界 |
| packages/element/src/distance.ts | freedraw 命中用真实轮廓多边形 |
| packages/element/src/handwriting/outline.ts | 有界重采样、prepareOutlinePoints 抽取、代表线宽实测（恒宽短路 + 中位弦宽）、可选 points |
| packages/element/src/handwriting/brushParams.ts | stabilizationToStreamline(0)=0 |
| packages/excalidraw/handwriting/brushPresets.ts | 写入探测、createPanelPresetLibrary、损坏原始载荷备份 |
| packages/excalidraw/components/HandwritingBrushPanel.tsx | 面板库入口、试写压力/优先级 |
| packages/excalidraw/components/App.tsx、HandwritingShapeCommit.ts、HandwritingRestoreButton.tsx | atom 按 appId 多份 |
| packages/excalidraw/tests/handwriting-0011-review.test.tsx | 0011 独立断言正式纳入（5 项，R4/R1 按证据修正 transport 与几何） |
| 测试更新：bounds、shape、panel、presets-ui、outline、lasso（恢复原状）、resize 复跑通过 | — |
| docs/handwriting/evidence/0012-geometry-probe.json | 探针复测 |

## 设计与数据兼容

- 无新依赖；旧文件渲染不变；命中/边界更准。
- 与 0011 断言的两处分歧及证据：① R1 稀疏笔画"均匀 31.45"与 perfect-freehand 1.2.0 实际行为（内部中点压力 0.5）不符，已用 `getStrokePoints` 输出为证并按真实可见墨迹改断言（正负各一）；② R4 的 jsdom transport 需要 `button/buttons` init 才携带 pressure（已验证并注释）。其余 3 项断言原样通过。

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-27, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run --watch=false` | 0；**111 文件 / 1514 passed / 47 skipped / 1 todo** |
| 同上 | `tsc --noEmit` | 0 |
| 同上 | `eslint --fix --max-warnings=0 <全部改动>` + prettier + `git diff --check` | 0 |
| 同上 | `vite build`（excalidraw-app） | 0；10.35s |
| 同上 | 0011 回归重放（已纳入正式测试集） | 5/5 通过 |
| 同上 | 探针 | 密度偏差 0.361px；1000 笔批次 p50 71.6ms；5000 点轮廓 p50 0.23ms（evidence/0012-geometry-probe.json） |

快照差异说明：无快照更新。真机状态：**未验证**。

## 风险与未完成项

- 中位弦宽的测量在提交/预览时各执行一次（单笔 O(n·m)，n≤1024 采样、m≈轮廓点数，实测远 <1ms）；极长笔画理论上更慢，如真机出现可换增量缓存。
- R6 剩余证据（截图/录屏/浏览器内存）仍待真机。

## 下一批与交付状态

建议 Codex 复核 F1–F6 关闭情况；重点复跑 0011 回归文件与 lasso/resize 两例。PROGRESS.md 已更新。
