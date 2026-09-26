# 0006 — M3 个人预设：CRUD UI、未保存切换提示、JSON 备份导入导出

- 日期/执行者：2026-09-25 / Kimi
- 阶段：M3
- 父提交 / 起始 SHA：`6e4432a0`（M1/M2 提交）
- 本次提交标题：`feat: personal brush preset management UI with JSON backup`
- 对应需求 ID 与验收 ID：PRE-01–PRE-06、DATA-06、A11、A12
- 状态：完成（PRE-04 的真机"重开页面"为人工项，标未验证；自动化持久化测试通过）

## 本批解决的问题

1. **PRE-01**：内置预设（画笔/钢笔/荧光笔）只读；参数偏离当前预设时显示"已修改"徽标，并提供"另存为新预设"。无选中预设时也始终提供"另存为"。
2. **PRE-02**：个人预设新增（内联命名输入框）、切换（下拉）、更新当前预设、复制（自动 "copy" 后缀）、重命名、删除；上限 12 个，达到上限给出明确提示（`presetLimitReached`），不静默淘汰。名称 trim、1–40 字符、重名（大小写不敏感）明确报错，不悄悄覆盖。
3. **PRE-03**：切换预设恢复全套参数（brushKind/宽度/颜色/不透明度/五个高级参数）。有未保存修改时切换出现三选提示（保存 / 放弃 / 取消）：取消留在原状态；放弃直接切换；保存对个人预设执行更新、对内置/无预设进入另存流程，完成后自动完成切换。删除当前预设后回到当前笔触种类的内置默认，旧笔画不受影响（笔画快照在创建时已固化，DATA-01，有测试断言）。
4. **PRE-04**：预设库存 localStorage（key `excalidraw.handwriting.brushPresets.v1`，格式 `{type, schemaVersion, presets}`）；持久化失败时面板显示"未能保存到本地存储"警告，不假成功。当前选中预设 id 随 appState browser 通道持久化，刷新后恢复（自动化测试断言写入内容）。
5. **PRE-05**：预设 JSON 导出（`{type:"excalidraw-brush-presets", schemaVersion:1, presets}`，经系统文件选择器保存）与导入（文件选择 → 逐条校验 → 名称冲突自动加后缀 → id 冲突由库重新生成 → 计数提示），畸形文件明确报错，不修改现有文档和历史笔画。
6. **PRE-06**：预设只走 localStorage 与明确的文件导出，无网络请求、不触碰 Google Drive / Supabase。

## 改动文件

| 文件 | 改动及原因 | 影响面 |
| --- | --- | --- |
| packages/excalidraw/components/HandwritingBrushPanel.tsx/.scss | 预设管理 UI：另存/更新/重命名/复制/删除按钮、命名输入框、三选未保存提示、导入导出按钮、状态消息 | 交互/布局 |
| packages/excalidraw/handwriting/brushPresets.ts | 内置预设参数与面板默认对齐（画笔 1/#1b1b1f/100、钢笔 1/#1b1b1f/100、荧光笔 6/#fab005/30），消除"选中即已修改"的假偏差 | 行为 |
| packages/excalidraw/tests/handwriting-presets-ui.test.tsx | 新建 7 项 UI 流程测试 | 测试 |

## 设计与数据兼容

- 预设库实例改为**面板每次挂载创建一个**（`createPresetLibrary()`）：保证读到最新持久化状态，挂载期间内存状态稳定。`getDefaultPresetLibrary()` 单例保留给模块级调用方。
- 偏离 SPEC 记录：PRE-03 的三选提示实现为面板内联 `role="alertdialog"` 区域而非模态对话框，语义一致（保存/放弃/取消齐全，取消保留原状态）；理由：现有模态基建（openConfirmModal）只支持二选，新增三选模态类型超出最小改动范围。
- 文件对话框扩展名用通用 "json"（系统 fileSave/fileOpen 的扩展名白名单限制），文件命名仍为 `brush-presets.json`；格式判别靠文件内 `type` 字段。
- 新依赖：无。

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-25, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-presets-ui.test.tsx` | 0；7/7 通过 | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --watch=false`（全量） | 0；108 文件全过；1456 passed / 47 skipped / 1 todo | 终端输出 |
| 同上 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 终端输出 |
| 同上 | eslint --max-warnings=0 本批文件 + prettier --write + git diff --check | 0 | 终端输出 |

7 项 UI 测试对照：另存+localStorage 持久化（PRE-02/04）、更新预设不改旧笔画（DATA-01）、重命名/复制/删除回退内置（PRE-02/03）、未保存切换三选（PRE-03）、重名明确拒绝（PRE-02）、导出/导入 JSON 往返（PRE-05）、12 上限提示（PRE-02）。逻辑模块测试 43 项全过（A11/A12 的存储损坏恢复、配额失败等）。

快照差异说明：无快照更新（本批不改变既有渲染输出）。真机状态：**未验证，仅桌面 jsdom**。

## 风险与未完成项

- 面板内同时存在预设库实例与通用调色板两处颜色入口，行为一致（同一 appState 字段），无数据冲突。
- 预设导入把名称冲突交给"加后缀"策略（PRE-05 允许"显示或自动加后缀"）。
- 真机验证项（PRE-04 刷新保留、iCloud 文件备份恢复）待用户 iPad 验收。

## 下一批与交付状态

下一批：M4 停笔规整（App.tsx 状态机 + 识别集成 + 撤销/恢复手绘）。PROGRESS.md 已更新。
