# 0004 — M1 面板重组：笔刷设置迁入左上属性悬浮板，文件入口迁入主菜单

- 日期/执行者：2026-09-25 / Kimi
- 阶段：M1
- 父提交 / 起始 SHA：`2f602d35`（M0 记录提交）
- 本次提交标题：`feat: move handwriting brush settings into properties panel and file actions into main menu`
- 对应需求 ID 与验收 ID：UI-01–UI-08（UI-07 部分）、A01、A02、A03、A04（部分）
- 状态：完成（UI-07 的"禁用状态解释原因"仅笔尖角度一项有 title 提示，其余无禁用项；中英文词条完整）

## 本批解决的问题

1. **UI-01**：删除左下角固定"手写与文件"入口（`HandwritingPanel.tsx/.scss` 已删除，`LayerUI` 不再渲染）。选中顶部自由画笔后，笔刷设置出现在**已有的左上属性悬浮板**：桌面完整布局直接内嵌 `HandwritingBrushPanel`（`SelectedShapeActions` 顶部）；iPad 紧凑布局通过 `CombinedHandwritingProperties` 悬浮按钮（画笔图标）弹出同一组件（`CompactShapeActions`）。两种布局共用同一组件实现。
2. **UI-02**：面板内容依次为：笔触（画笔/钢笔/荧光笔 + 橡皮切换）、预设选择（下拉，当前含内置预设；个人预设 CRUD 属 M3）、粗细滑块、不透明度滑块、可折叠高级区（压力幅度/笔尖灵敏度/笔尖扁平度/笔尖角度/画笔稳定性 + 恢复默认）、试写区、停笔规整开关与等待时间。颜色控制在完整布局沿用现有调色板（"Stroke"），面板不再重复提供取色器。
3. **UI-03**：所有笔刷参数存于 appState 的 `currentItem*` 字段；笔画在 pointerdown 时快照进元素 `customData.handwriting`（见 0005），下笔中改参数只影响下一笔（有自动化测试断言）。
4. **UI-04**：橡皮在笔刷面板内一击切换；切到橡皮后左上显示迷你"返回画笔"面板（`HandwritingEraserPanel`，`LayerUI` 在 `showSelectedShapeActions` 为 false 且工具为橡皮时渲染），返回后粗细/颜色/高级参数/预设选择全部保留（appState 未被重置）。
5. **UI-05**：文件操作与笔刷解耦。"打开文件 / 导入"与"导出可编辑文件"作为主菜单顶部常驻项（`DefaultItems.OpenHandwritingFile / ExportHandwritingFile`，同时挂到库默认菜单 `LayerUI.DefaultMainMenu` 和 excalidraw-app 的 `AppMainMenu`），任意工具下可用；复用 `actionLoadScene`、替换确认、`prepareDataForJSONExport`、内嵌图片检查、`navigator.canShare`/下载降级，无第二套序列化。
6. **UI-06**：面板容器随编辑器容器（非 window）走既有 `showSelectedShapeActions`/stylesPanelMode 布局逻辑；短屏沿用既有 `maxHeight` + 属性面板滚动；主要按钮触控区 44px（SCSS `min-height/width: 44px`）；面板根节点 `onPointerDown` 停止冒泡，控件操作不会落到画布。
7. **UI-08**：试写区 `<canvas>` 使用与画布完全相同的 `computeHandwritingOutline` 渲染路径（见 0005），含固定轻/重压样例笔迹随参数实时更新；试写只存组件本地 state，不进入文档、不污染撤销（自动化测试断言 elements/newElement 不变）。

## 改动文件

| 文件 | 改动及原因 | 影响面 |
| --- | --- | --- |
| packages/excalidraw/components/HandwritingBrushPanel.tsx/.scss | 新建笔刷面板 + 橡皮迷你面板 | 布局/交互 |
| packages/excalidraw/components/HandwritingFileMenuItems.tsx | 新建文件操作 hook（自旧面板提取） | 菜单/文件 |
| packages/excalidraw/components/Actions.tsx | 完整/紧凑布局接入面板；freedraw 工具下隐藏通用 changeStrokeWidth/changeOpacity（避免与面板滑块重复），保留 changeStrokeColor 调色板 | 布局 |
| packages/excalidraw/components/LayerUI.tsx | 删除旧面板渲染；默认主菜单加文件两项；橡皮迷你面板挂载 | 布局/菜单 |
| packages/excalidraw/components/main-menu/DefaultItems.tsx | 新增 OpenHandwritingFile / ExportHandwritingFile 菜单项 | 菜单 |
| excalidraw-app/components/AppMainMenu.tsx | 菜单顶部插入文件两项 | 菜单 |
| packages/excalidraw/components/HandwritingPanel.tsx/.scss | 删除（废弃入口） | — |
| packages/excalidraw/types.ts、appState.ts | 新增 currentItemPressureAmount/Sensitivity/NibFlatness/NibAngle/Stabilization/ShapeRecognition/ShapeRecognitionDelay/BrushPreset 字段，仅 browser 持久化，不导出 | 持久化 |
| packages/excalidraw/locales/en.json、zh-CN.json | 新增约 40 个词条（高级参数/预设/试写/停笔规整/文件提示） | i18n |
| packages/excalidraw/tests/handwriting.test.tsx | 旧面板引用改到新位置；customData 断言改 handwriting 对象 | 测试 |
| packages/excalidraw/tests/handwriting-panel.test.tsx | 新建 6 项 UI 行为测试（见验证表） | 测试 |

## 设计与数据兼容

- 状态边界：`currentItemShapeRecognitionDelay` 存秒（0.5–3，步进 0.1，默认 1.2）；停笔规整默认画笔/钢笔开、荧光笔关（切笔触时设置，用户可改）。识别计时器/预览等运行时状态本期不进 appState（DATA-06）。
- **发现并修复**：菜单项组件在菜单关闭时立即卸载，原"卸载即中止导出"的 AbortController 清理会静默取消导出；已移除该清理（控制器在 finally 中复位居中），导出完成后正常中止。
- 偏离 SPEC 记录：UI-02 面板顺序中"粗细/颜色/不透明度"在完整布局由既有调色板/面板滑块组合提供，颜色取色器未在面板内重复实现（既有"Stroke"调色板功能更完整，且被 history 等既有测试依赖）；紧凑布局 changeStrokeWidth/changeOpacity 仍在其通用悬浮层，与笔刷面板分属不同弹层。
- 新依赖：无。

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-25, Node v22.19.0 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --update --watch=false` | 0；107 文件全过；1449 passed / 47 skipped / 1 todo；151 个快照更新 | 终端输出 |
| 同上 | `node node_modules/eslint/bin/eslint.js --max-warnings=0 <本批文件>` | 0（0 警告） | 终端输出 |
| 同上 | `node node_modules/prettier/bin-prettier.js --write <本批文件>` + `git diff --check` | 0 | 终端输出 |

快照差异说明：151 个快照更新全部经逐文件 diff 核查，仅含两类预期变化——(1) appState 快照新增 `currentItem*` 字段（M1 新状态）；(2) DOM 快照新增两个主菜单项。无外观/行为异常被固化。

关键测试：`handwriting-panel.test.tsx` 6 项（左上面板出现且左下入口消失、高级参数/停笔规整/试写区、参数只作用下一笔且下笔中锁定快照、完整快照写入、tablet 紧凑弹层、荧光笔默认关规整）；`handwriting.test.tsx` 8 项全过（含文件导出往返图片、导入取消不丢图、橡皮返回保留笔触）。

真机状态：**未验证，仅桌面 jsdom 模拟**。横竖屏/分屏手感需 iPad 真机（用户验收项）。

## 风险与未完成项

- 预设下拉当前列出内置预设；个人预设的保存/重命名/删除/导入导出 UI 属 M3（逻辑模块已就绪）。
- 紧凑布局下通用 stroke 控件与笔刷面板滑块分属两个弹层，存在功能重叠（已知，接受）。
- M6 原生 App 不做（按 SPEC 仅后续阶段）。

## 下一批与交付状态

下一批：M2 笔刷模型（记录 0005，与本批同提交）。PROGRESS.md 已更新。
