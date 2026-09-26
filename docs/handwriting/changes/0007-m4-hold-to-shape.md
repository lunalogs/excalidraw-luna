# 0007 — M4 停笔规整：状态机、本地识别、预览叠层、原子提交与恢复手绘

- 日期/执行者：2026-09-25 / Kimi
- 阶段：M4
- 父提交 / 起始 SHA：`fddd89d1`（M3 提交）
- 本次提交标题：`feat: hold-to-shape recognition with preview, atomic commit, and restore`
- 对应需求 ID 与验收 ID：SH-01–SH-12、A13、A14、A15、A16（A16 样本测试在 M2 批次已随识别模块入库）、A17
- 状态：完成（虚拟时钟测试一项以真实定时器替代，见偏离说明；真机手感未验证）

## 本批解决的问题

1. **SH-01/02/03 状态机**：`idle → drawing → holding → preview → committed`。等待时间从**最后一次有效移动**起算（anchor + 时间戳）；静止容差 6 CSS px（`6 / zoom` 换算场景坐标，25%/100%/400% 缩放下手感一致，SH-03）；累计漂移以 anchor 计算，不按相邻点比较；压力变化而位置不变不会重置等待。计时器在 anchor 设立/重置时调度，不依赖后续 move 事件（修复了"停住后不再产生 move 事件导致永不触发"的缺陷）。画笔/钢笔默认开启、荧光笔默认关闭（M1 已接），开关即时生效。
2. **SH-04 预览**：识别出候选后在 SVGLayer 上绘制虚线幽灵图形（`ShapePreviewTrail`，scene→viewport 每帧坐标换算），附"直线 · 抬笔确认"类低干扰标签；不污染 scene、不进历史。**刻意不用 toast 做提示**：setState 会造成历史捕获边界、把提交拆成两条撤销记录（实现中发现并记录）。
3. **SH-05**：预览期间移动超容差 → 撤候选回原笔迹并重新计时；Esc 取消候选保留原笔迹（在全局 onKeyDown 和绘制期 keydown 两处处理，无 `handleKeyboardGlobally` 也可用）；候选未达置信度不强制转换（识别器保守返回 null，见 0005 模块标定）。
4. **SH-06**：抬笔提交为**一条历史记录**（`actionCommitHandwritingShape`，`captureUpdate: IMMEDIATELY`，删除原笔画+插入图形同入一个增量）；普通 Ctrl/Cmd+Z 一次撤销整笔、Redo 完整恢复（自动化断言）；提交后 5 秒内显示"恢复手绘"按钮（`handwritingRestoreAtom`，UI 态不进持久化/导出，DATA-06），点击经 `actionRestoreHandDrawn` 原位恢复笔画、同样一条历史记录；用户已手动撤销时恢复按钮静默失效。
5. **SH-07/10 输出**：直线 → 原生 `line`（无端点箭头，保留用户方向，不归一化到水平/垂直）；圆/椭圆 → `ellipse`（保中心/轴长/方向，近圆轴比≥0.9 优先圆）；矩形/正方形（含旋转）→ `rectangle`（保中心/方向，正方形统一边长）；位置锚定拟合中心不漂移、不偏移原点；frameId/颜色/不透明度/粗细继承；roughness 0 表达恒定描边（变宽/扁笔尖效果无原生几何等价物，按 SPEC 允许以恒定描边表达并记录）。
6. **SH-11 取消**：切工具（`setActiveTool`）、窗口失焦（`onBlur`）、卸载（`componentWillUnmount`）均清理计时器与候选；识别回调重新校验 strokeId/pointerId 与"笔画仍在绘制中"，过期定时器绝不改旧笔画（有测试：未到时间抬笔后再推进时间无变化）。
7. **SH-12**：识别样本测试（60 正例/36 负例/变换不变性）在 M2 批次随 `shapeRecognition.ts` 入库并通过；本批补 11 项端到端状态机测试（见验证表）。

## 改动文件

| 文件 | 改动及原因 | 影响面 |
| --- | --- | --- |
| packages/excalidraw/actions/actionHandwriting.tsx | 注册提交/恢复两个 action，原子历史记录 | 历史/数据 |
| packages/excalidraw/actions/index.ts、types.ts | 导出 + ActionName 增补 | 注册表 |
| packages/excalidraw/components/App.tsx | 停笔状态机（字段 + begin/update/fire/cancel）、pointerdown/move/up 接线、Esc、blur、unmount、setActiveTool 取消、恢复窗口调度 | 指针生命周期/历史 |
| packages/excalidraw/components/ShapePreviewTrail.ts | SVGLayer 幽灵预览叠层 | 渲染叠层 |
| packages/excalidraw/components/HandwritingShapeCommit.ts、HandwritingRestoreButton.tsx、HandwritingRestore.scss | 恢复手绘按钮（jotai atom，5 秒窗口） | UI |
| packages/excalidraw/components/LayerUI.tsx | 挂载恢复按钮 | 布局 |
| packages/excalidraw/types.ts | AppClassProperties 增加 restoreHandDrawn | 类型 |
| packages/element/src/handwriting/shapeRecognition.ts | 恰为 2 个不同点的退化输入按完美直线处理（快速一划/单 move 笔画），尺寸门槛仍拦截点状输入 | 识别 |
| packages/excalidraw/tests/handwriting-shape.test.tsx | 新建 11 项端到端测试 | 测试 |

## 设计与数据兼容

- 计时基准：`Date.now()`；延迟范围钳制 0.5–3s。容差/最小对角线按 `zoom.value` 换算，保持"CSS px 手感"（SH-03/SH-09）。
- 偏离 SPEC 记录：①SH-12 要求"定时器用虚拟时钟"，实现中选择真实定时器 + 最短 0.5s 延迟 + 边界行为断言（未到/重置/过期），理由：App 的热路径依赖 requestAnimationFrame 与 lodash throttle 的 mock，fake timers 下整树渲染不稳定；识别正确性由纯函数样本测试覆盖，计时语义由边界测试覆盖。②预览提示用 SVG 标签而非 toast（原因见 SH-04 条）。
- 新依赖：无。

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-25, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-shape.test.tsx` | 0；11/11 通过 | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --watch=false`（全量） | 0；109 文件全过；1467 passed / 47 skipped / 1 todo | 终端输出 |
| 同上 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 终端输出 |
| 同上 | eslint --max-warnings=0 本批文件 + prettier --write + git diff --check | 0 | 终端输出 |

11 项测试对照：直线/圆转换（SH-07）、未到延迟不识别+过期定时器无害（SH-02/11）、移动重置停留（SH-03/05）、小笔画不识别（SH-09）、撤销/重做单条历史（SH-06）、恢复手绘+可再撤销（SH-06）、Esc 取消（SH-05）、荧光笔默认关（SH-01）、涂鸦不误转（SH-08 保守性）、切工具取消（SH-11）。

快照差异说明：无快照更新。真机状态：**未验证，仅桌面 jsdom**；1.2s 默认等待手感、掌托共存需 iPad 真机。

## 风险与未完成项

- 预览叠层在候选出现后按 setCandidate 时快照绘制；按住期间缩放/平移（另一手双指）不会实时重绘预览，抬笔提交的几何不受影响（记录为已知限制）。
- 识别在停留时同步运行，长笔迹重采样上限 128 点（模块内），性能测量在 M5 统一记录。

## 下一批与交付状态

下一批：M5 集成验收（全量复验、构建、A01–A20 矩阵、最终交付信息）。PROGRESS.md 已更新。
