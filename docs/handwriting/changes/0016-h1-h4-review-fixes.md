# 0016 — Kimi 第五批：0015 复核发现 H1–H4 修复（存储统一状态机）

- 日期/执行者：2026-09-28 / Kimi
- 阶段：review 修复（承接 0015 的 H1–H4）
- 父提交 / 起始 SHA：`5e49d5a4` + 0009–0015 全部未提交工作区（同批）
- 本次提交标题：见交付时填写（沿用"工作区待复核"约定）
- 对应需求：H1/H2/H3（F3/R5/A11）、H4（A20/工程检查）
- 状态：H1–H4 完成；0015 独立诊断 4/4 通过并纳入正式测试集

## 本批解决的问题

### 存储状态机重构（H1+H2+H3 统一处理）
不再按"探测→分支→合并→删除"拼装，而是引入 **`UnifiedPresetLibrary`**：共享会话库是**始终可访问的权威内存视图**，持久存储只是它的尽力镜像。`createPanelPresetLibrary()` 返回该单例（跨挂载同一对象，面板关闭重开不可能丢数据）。

- **H1（合并未确认落盘就删会话副本）**：架构上消除——没有"会话副本"概念，权威视图在内存中唯一存在；`getPersistError()` 只反映**持久性**，不影响可访问性。镜像失败绝不再删除任何数据；面板每次挂载调用 `retryPersist()`，存储恢复后下一次打开即自动补写（新增"三次重开无丢失无膨胀"测试）。
- **H2a（只读但可读旧数据）**：统一库构造时只要**能读**就把存储里的预设种子进权威视图（重名自动加后缀）——故障期间可选择、可导出磁盘上的旧预设（0015 独立断言通过）。
- **H2b（合并满额不可访问）**：种子走 `addRecovered`，**越过 12 上限**（上限只约束用户新建，不约束已有数据的可达性）；溢出的恢复项同样在选择列表和导出中可见。
- **H2 恢复合并规则（显式）**：会话期间产生的预设本来就在权威视图里；`retryPersist` 成功后整体写入存储。跨页面重载后以存储为准重新种子。无静默替换。
- **H3（已有备份时当前损坏源丢失）**：备份改为**版本化**——旧备份永不被不同内容覆盖，当前 payload 写入下一个空闲索引（`corrupt-backup`、`.2`…上限 `MAX_CORRUPT_BACKUPS = 5`，重复打开不产生无限备份）；全部槽位不可用或写入失败时置 `preserveCorruptSource`：**拒绝覆盖主键**并给出明确错误（导出仍可用）。部分坏记录（逐条验证丢弃）与顶层损坏走同一备份路径。新增三类边界测试：已有备份、备份写失败但主键可写、重复打开有界。

### H4 — lint 未用声明
`handwriting-0013-review.test.tsx` 删除 7 个未使用声明（pointFrom、getElementBounds、getElementAbsoluteCoords、getFreedrawOutlinePointsForElement、ExcalidrawFreeDrawElement、LocalPoint、h），并对**含全部未跟踪文件**的集合重跑严格 lint——退出 0。0014 的"全绿"结论在 lint 范围上不准确，本记录予以纠正。

### 测试生命周期说明
统一库为模块级单例（正确的产品行为）。为可测性导出 `__resetUnifiedPresetLibraryForTests()`（仅测试用，重建权威并清空内存视图）；涉及存储条件的测试在改变条件并重挂载前调用。0015 诊断文件采用时在其 beforeEach 中加入同一重置（已在记录与代码注释说明）。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| packages/excalidraw/handwriting/brushPresets.ts | UnifiedPresetLibrary 单例、版本化备份（MAX_CORRUPT_BACKUPS）、preserveCorruptSource、addRecovered（越上限恢复）、retryPersist、测试重置入口 |
| packages/excalidraw/components/HandwritingBrushPanel.tsx | 使用统一库；surfacePersistState 简化为纯提示；挂载 effect 增加 retryPersist；删除迁移逻辑 |
| packages/excalidraw/tests/handwriting-0015-review.test.tsx | 0015 独立诊断正式纳入（4 项，beforeEach 加统一库重置） |
| packages/excalidraw/tests/handwriting-0013-review.test.tsx | H4 清理未用声明 |
| packages/excalidraw/tests/handwriting-presets-ui.test.tsx | +3 状态矩阵测试（三次重开/备份写失败/备份有界），5 处测试随统一语义更新（期望从"会话迁移"改为"持久性警告+持续可访问"；备份保障从"主键不变"改为"版本化备份可恢复"） |

## 设计与数据兼容

- 无新依赖；无快照更新；导出格式不变。
- 行为变更：配额/写入失败期间显示"未能保存到本地存储"（presetsNotPersisted）而非"仅本次会话"——数据其实一直在内存中可访问，措辞更准确；存储完全不可用时仍显示"仅本次会话"。
- 0010–0014 各批对存储语义的反复（探测/迁移/合并）由本批统一状态机终结；旧导出（createPresetLibrary/getSessionPresetLibrary 等）保留，模块测试继续覆盖。

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-28, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run --watch=false` | 0；**113 文件 / 1532 passed / 47 skipped / 1 todo** |
| 同上 | `tsc --noEmit` | 0 |
| 同上 | `eslint --max-warnings=0 <全部改动+全部未跟踪 TS/TSX>` | 0（含 H4 修正） |
| 同上 | `vite build`（excalidraw-app） | 0；11.4s |
| 同上 | 0015 回归重放（已纳入正式测试集） | 4/4 通过 |
| 同上 | 0013 回归 | 5/5 通过 |

真机状态：**未验证**（iPad 手感/掌托/横竖屏/iCloud/浏览器性能仍待用户实测）。

## 风险与未完成项

- 统一库单例随页面存活；页面重载后以存储内容重新种子（故障期未镜像成功的数据随页面卸载丢失——与任何纯本地应用一致，故障期间界面已提示导出备份）。
- R6 剩余证据（截图/录屏/浏览器内存）仍待真机。

## 下一批与交付状态

建议 Codex 复核 H1–H4 关闭情况；重点复跑 `handwriting-0015-review.test.tsx` 与 presets-ui 状态矩阵用例。PROGRESS.md 已更新。
