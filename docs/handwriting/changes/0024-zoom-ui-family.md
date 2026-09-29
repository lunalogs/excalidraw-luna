# 0024 — 缩放控件视觉同系列（真机反馈）

- 日期/执行者：2026-09-28 / Kimi
- 阶段：真机验收修复（iPad 截图反馈）
- 父提交 / 起始 SHA：`9748aebc`
- 本次提交标题：`fix: style zoom presets and lock as a sibling island`
- 对应需求：用户真机反馈（UI 一致性）
- 状态：完成（待真机复验）

## 本批解决的问题

首轮实现把 100/200/300% 与锁定按钮放在第二行，渲染成一组无样式的白方块，与原有"− 100% ＋"圆角岛状控件不统一。调整为**同系列双岛并排**：左侧岛保持 −/百分比/＋ 不动，右侧新岛（复用 `.zoom-actions` 岛底 + `.zoom-button` 按钮体系）容纳 100%/200%/300%/🔒——相同的岛背景、圆角、按钮尺寸与字体体系；首个快捷按钮与锁定按钮分别补左/右端圆角，数字用 0.75rem tabular-nums，锁定按下时主题色高亮。行为无变化。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| packages/excalidraw/components/Actions.tsx | ZoomActions 改单行为两个并排的 zoom-actions 岛 |
| packages/excalidraw/components/Actions.scss | `.zoom-actions--presets` 端圆角、字宽、锁定高亮 |
| packages/excalidraw/actions/actionCanvas.tsx | 首个快捷按钮加 `zoom-preset-first` 类 |

## 补充（0024 同批反馈）

用户追加：当前缩放级别对应的快捷按钮需高亮暗示选中。实现：快捷按钮按 `Math.round(zoom*100)` 匹配级别，`selected` + `zoom-preset-active`（主题色高亮）标记当前项；测试断言高亮类随缩放切换。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 117 文件 / 1548 passed（无快照变化） |
| `tsc --noEmit` + eslint 本批 TS 文件 | 0 |

真机状态：待 iPad 复验。
