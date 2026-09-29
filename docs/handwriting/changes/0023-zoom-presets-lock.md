# 0023 — 快捷缩放（100/200/300%）与缩放锁定

- 日期/执行者：2026-09-28 / Kimi
- 阶段：真机验收新增需求（iPad 试用反馈）
- 父提交 / 起始 SHA：`fa336ca0`
- 本次提交标题：`feat: quick zoom presets and zoom lock`
- 对应需求：用户真机反馈（超出 SPEC 的增量需求，不与手写需求冲突）
- 状态：完成（待真机复验）

## 本批解决的问题

1. **快捷缩放按钮**：左下角百分比旁新增 100% / 200% / 300% 三个按钮，点击即以视口中心为锚点缩放到对应级别（`actionZoomToPreset`，受 MIN/MAX_ZOOM 钳制）。
2. **缩放锁定**：新增 `zoomLocked` appState 字段（browser 持久化，导出/协作不同步）。锁定后**一切缩放入口均被拒绝**：缩放按钮、Ctrl+= / Ctrl+- / Ctrl+0 快捷键、Ctrl+滚轮（含触摸板捏合）、Safari gesture 事件、双指捏合；缩放适应类动作（zoomToFit 系列）同样被阻止。**平移不受锁影响**（普通滚轮、双指拖动照常），锁定仅约束 zoom.value。锁定按钮显示锁图标，`aria-pressed` 反映状态，中英文标签齐全。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| packages/excalidraw/types.ts、appState.ts | `zoomLocked` 字段（默认 false，browser 持久化） |
| packages/excalidraw/actions/actionCanvas.tsx | 既有 zoom 动作守卫 + `actionZoomToPreset` / `actionToggleZoomLock`（含 PanelComponent） |
| packages/excalidraw/actions/types.ts | ActionName 增补 |
| packages/excalidraw/components/Actions.tsx | ZoomActions 第二行渲染快捷缩放 + 锁定按钮 |
| packages/excalidraw/components/App.tsx | gesture / 双指捏合 / ctrl 滚轮三处守卫（捏合时保留平移） |
| packages/excalidraw/locales/en.json、zh-CN.json | zoomQuick / zoomLock / zoomUnlock 词条 |
| packages/excalidraw/tests/handwriting-zoom.test.tsx | 新增 3 项测试 |

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --update --watch=false` + 不带 -u 复验 | 117 文件 / 1548 passed；133 个快照更新经 diff 核查**全部为新增 zoomLocked 字段**（138 行差异，非该字段 0 行） |
| `tsc --noEmit` | 0 |
| `eslint --max-warnings=0 <本批文件>` + prettier | 0 |

真机状态：待 iPad 复验（dev server 已热更新）。

## 风险与未完成项

- 协作场景中跟随他人视口（follow）仍会改变缩放——锁只约束本地操作，记录于此。
- 真机验证点：iPad 双指捏合被锁后仍可双指平移；锁状态刷新后保留。
