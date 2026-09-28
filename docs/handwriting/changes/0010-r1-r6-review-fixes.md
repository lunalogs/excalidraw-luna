# 0010 — Kimi 第二批：R1–R6 review 修复（边界/命中、密度无关稳定、代表线宽、试写隔离、存储诚实、生命周期回归）

- 日期/执行者：2026-09-27 / Kimi
- 阶段：review 修复（承接 0009 的 R1–R6 任务清单）
- 父提交 / 起始 SHA：`5e49d5a4`（Kimi M5 交付点；工作区含 0009 的 Codex 未提交修复，本批与其同批验证）
- 本次提交标题：见交付时填写（本批与 0009 工作区修改同批处理，是否提交由用户/Codex 决定）
- 对应需求 ID 与验收 ID：R1/A07、R2/A09、R3/A16、R4/A04/A08、R5/A11、R6/A13/A17/A20
- 状态：R1–R5 代码项完成；R6 代码/自动化项完成，浏览器实测与截图录屏证据仍待补（不冒充）

## 本批解决的问题

### R1 / A07 — 宽笔画边界与命中使用真实轮廓
- `bounds.ts` freedraw 分支改为以共享轮廓（`computeHandwritingOutlineBounds`，经由无循环依赖的 `handwriting/outline.ts` 元素胶水函数）计算可见边界：水平笔画零高度问题消除，宽笔外缘进入命中粗筛；元素 x/y 与旋转中心不动，旧文件外观不变（渲染路径未改，只改边界报告）。
- `distance.ts` freedraw 命中距离减去名义半宽（`strokeWidth × 4.25 / 2`），粗笔外缘可点中、橡皮可擦到外缘。
- 新增 5 项测试（handwriting-bounds.test.tsx）：轮廓边界对齐、外缘命中/外偏失、旋转宽扁笔覆盖、legacy 笔画边界不位移、SVG 导出完整包含宽笔。
- **既有测试调整（2 处，均已注释说明）**：`lasso.test.tsx` “Intersects some and encloses some” 期望 4→3——记录下的套索路径实际并未完全包住该 freedraw 的可见墨迹，旧中心线边界误判为“已包围”，新行为更忠实；`resize.test.tsx` 多项线性元素缩放改用实际 common bounds 计算缩放因子（锚点语义不变，仅输入尺寸随墨迹边界变化）。

### R2 / A09 — 稳定性与输入采样密度解耦
- `outline.ts` 新路径在 stabilization > 0 时先做**有界等弧长重采样**（间距 `max(1, size/16)` 场景单位，压力随位置线性插值；零长度但压力变化的样本保留，BR-07），再进入 perfect-freehand；stabilization 0 不附加任何滤波（原始路径）。持久化规则不变：element.points 仍存原始采样，规范化在共享轮廓函数内完成，对已规范化输入幂等（无二次稳定）。
- 探针复测：同轨迹 61/241 点、稳定性 100 的轮廓双向最大距离从 4.566px 降至 **0.354px**（证据 `evidence/0010-geometry-probe.json`）。新增 4 项测试：60/120/240Hz 一致性（<2px）、stability 0 保路径、重算一致性、定点压力跳变保留。

### R3 / A16 — 规整图形的代表性视觉线宽
- 新增 `getRepresentativeStrokeWidth`：按 perfect-freehand 真实半径公式对笔画压力采样求平均（速度模拟笔回退基础半宽），扁笔乘 `(1+axisRatio)/2`（各向异性部分有损，按 SPEC 允许以恒定描边表达），钳制 0.25–12；legacy 笔画保持旧行为（复制 strokeWidth）。
- 预览（ShapePreviewTrail）与提交使用同一函数，所见即所得。新增 3 项测试：恒宽笔画规整后宽度不变（8→8）、压感笔取中间代表值、扁笔收窄到均值。

### R4 / A04/A08 — 试写区指针隔离与取消
- 试写 canvas 改为单一活动 pointer（pointerId 引用计数）：掌托/其他指针 down/move/up 全部忽略；pointercancel 丢弃中断笔画；lostpointercapture 收尾已落墨部分；Clear 同时终止活动笔画。
- 压力策略与主画布（Codex 0009 修复版）对齐：pen 始终保留真实压力（含 0 与定点变化），非 pen 的 0/0.5 走模拟。新增交错 palm+pen 与取消/零压测试。

### R5 / A11 — 预设存储三级状态，不假成功
- `brushPresets.ts`：`resolveDefaultStorage` 区分不可用（getter 抛错）→ `isStorageAvailable()===false`；新增 `getSessionPresetLibrary()` 会话共享库（面板关闭重开不丢，`storageAvailable: false` 标记）；面板按可用性选择“每次挂载新读”或“会话共享”。
- 持久化失败（配额）在保存动作后**即时**显示（原 effect 只在挂载时跑一次，看不到事后失败）。
- 损坏数据：加载时逐条恢复并给出 kept/dropped 计数提示，打开时**不重写**原始备份（有测试断言存储原样）。新增 i18n 两条（sessionOnly / recovered，中英）。
- 新增 3 项 UI 测试：存储封锁 + 面板重开保留 + 会话提示；setItem 抛错 → 配额提示；坏 JSON → 恢复计数 + 原始备份不被覆盖。

### R6 — 生命周期与隔离回归
- 恢复手绘 atom 增加 `appId` 归属：多编辑器互不显示对方的恢复按钮；`componentWillUnmount` 清掉本编辑器的 atom 与超时（此前卸载后遗留提示）。
- 新增 6 项测试：默认 1.2s 精确边界（fake timers，1190ms 未触发/1210ms 触发）、25%/100%/400% 缩放下 4 CSS px 容差一致、4x 缩放超容差重置停留窗、旧笔画定时器不波及新笔画、卸载后无残留提示、第二编辑器不显示他人提交提示。

## 改动文件

| 文件 | 改动 | 影响面 |
| --- | --- | --- |
| packages/element/src/handwriting/outline.ts | 等弧长重采样、元素胶水函数、轮廓边界、代表性线宽 | 渲染/数据 |
| packages/element/src/shape.ts | getFreedrawOutlinePoints 委托 outline.ts（去循环） | 渲染 |
| packages/element/src/bounds.ts | freedraw 边界用真实轮廓 | 命中/选择/导出边界 |
| packages/element/src/distance.ts | freedraw 命中距离减名义半宽 | 命中/橡皮 |
| packages/excalidraw/actions/actionHandwriting.tsx | 规整图形用代表性线宽 | 视觉 |
| packages/excalidraw/components/App.tsx | 预览代表线宽、atom 归属与卸载清理 | 撤销/UI |
| packages/excalidraw/components/HandwritingRestoreButton.tsx、HandwritingShapeCommit.ts、LayerUI.tsx | 恢复按钮按 appId 过滤 | 多编辑器隔离 |
| packages/excalidraw/components/HandwritingBrushPanel.tsx | 会话共享库、三级存储提示、试写隔离 | 存储/UI |
| packages/excalidraw/handwriting/brushPresets.ts | 存储可用性、会话库 | 存储 |
| packages/excalidraw/locales/en.json、zh-CN.json | 2 条新词条 | i18n |
| 测试：handwriting-bounds（新 5）、outline（+4）、handwriting-shape（+9）、handwriting-panel（+1）、handwriting-presets-ui（+3）；调整 lasso 1、resize 1 | — | — |
| docs/handwriting/evidence/0010-geometry-probe.json | 复测探针数据 | 证据 |

## 设计与数据兼容

- 无新依赖。旧 `.excalidraw` 文件：渲染分支不变（BR-09），边界/命中变准（不报存外观）；规整线宽仅影响新提交。
- 偏离说明：R2 重采样间距取 `size/16`（下限 1 场景单位），属实现标定值，已记录；扁笔代表线宽的各向异性折损按 SPEC SH-07 允许。
- 既有测试调整 2 处均已加注释说明原因，未跳过/删除任何测试。

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-27, Node v22.19.0, Apple M4 | `node node_modules/vitest/vitest.mjs run --watch=false` | 0；**110 文件 / 1500 passed / 47 skipped / 1 todo**（修复时 2 个既有失败已分析修复，见 R1） | /tmp/final2.log |
| 同上 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 终端输出 |
| 同上 | `eslint --max-warnings=0 <全部改动 ts/tsx>` | 0（含 prettier --write、git diff --check） | 终端输出 |
| 同上 | `cd excalidraw-app && node ../node_modules/vite/bin/vite.js build` | 0；12.09s | /tmp/build2.log |
| 同上 | `node node_modules/vite-node/vite-node.mjs scripts/handwriting-review-probe.ts` | 密度偏差 0.354px；1000 笔批次 p50 69.5ms/p95 73.2ms；5000 点轮廓 p50 0.175ms；识别 p50 0.312ms | docs/handwriting/evidence/0010-geometry-probe.json |

快照差异说明：本批无快照更新。真机状态：**未验证**（R6 的截图/录屏/浏览器实测项仍需真机与人工证据）。

## 风险与未完成项

- R6 剩余：试写/滑块触控目标、中英文、深浅色、横竖屏滚动截图录屏；1000 笔/5000 点浏览器内存与输入延迟；iCloud 面板——全部标未验证，转用户真机。
- 性能：重采样使 1000 笔批次从 p50 13.5ms 升至 69.5ms（纯函数批处理，单笔 ~70µs，可接受；浏览器帧耗时仍待实测）。

## 下一批与交付状态

建议 Codex 复核 R1–R6 关闭情况；通过后进入用户真机验收。PROGRESS.md 已更新。
