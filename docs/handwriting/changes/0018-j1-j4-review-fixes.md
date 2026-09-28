# 0018 — Kimi 第六批：0017 复核发现 J1–J4 修复（读取状态机贯穿统一入口）

- 日期/执行者：2026-09-28 / Kimi
- 阶段：review 修复（承接 0017 的 J1–J4）
- 父提交 / 起始 SHA：`5e49d5a4` + 0009–0017 全部未提交工作区（同批）
- 本次提交标题：见交付时填写（沿用"工作区待复核"约定）
- 对应需求：J1/J2/J3（H3/H2/R5/A11）、J4（A20/工程检查）
- 状态：J1–J4 完成；0017 独立诊断 4/4 通过并纳入正式测试集

## 本批解决的问题

### J1 / H3 — 统一镜像尊重源数据保护
- `UnifiedPresetLibrary` 构造时保留 `preserveSource` **状态**与 `preservedRaw`（原始损坏 payload，经由 `BrushPresetLibrary.getPreservedCorruptRaw()` 暴露），不再只复制错误字符串。
- 所有写路径（add/update/rename/duplicate/remove/import 及挂载重试）都汇聚到同一个受保护的 `mirror()`：源未安全备份时**先重试备份**（存储可能刚恢复可写；备份成功即解除保护并继续写入），仍失败则拒绝覆盖并给出"立即导出"的明确错误。
- 备份写入逻辑提取为共享的 `writeCorruptBackup()`（版本化、上限 5），旧库加载器与统一镜像共用。
- 面板警告优先级调整：持久化拒绝（可操作的"导出/备份"提示）优先于恢复计数摘要。
- 新增**面板入口**测试：打开画笔面板（挂载 effect 触发重试）也不覆盖唯一损坏副本，且错误可见、会话可导出。

### J2 / H2 — 读取状态机（unknown / loaded / corrupt）
- `BrushPresetLibrary` 区分"读取失败"（新增 `hadReadError()`）与"读到但损坏"；统一库据此维护 `loadState`：**unknown 状态禁止一切覆盖**（"storage source not readable yet; refusing to overwrite it"）。
- `retryPersist()` 在 unknown 时先**读→合并→再镜像**；合并按 id 幂等（重复重试无膨胀）、同名时以权威视图（会话）为准、**保留存储 id 与 updatedAt**（往返字节一致，消除跨毫秒抖动——压测 50 轮无失配）。
- 合并越过上限仍走 `addRecovered`（已有数据可达性不受容量限制）。
- 新增矩阵测试：getItem 暂时失败但 setItem 可用、读恢复期间会话已有新增、两次重开无重复膨胀、双方数据都保留。

### J3 / H2 — 同页后端重连
- `storage` 字段不再 readonly：getter 曾抛错时 `retryPersist()` 重新 `resolveDefaultStorage()`，随后按 J2 规则读合并再持久化——**同页恢复，不要求刷新**（刷新会丢未持久化会话数据）。0017 独立断言（blocked → add Offline pen → 恢复 → 同一对象 retryPersist 返回 true 且落盘）通过。

### J4 — 严格 lint
- 删除面板未使用的 `getSessionPresetLibrary` 导入；`eslint --fix` 整理 0015 测试与 presets-ui 格式。对**全部 26 个修改/未跟踪 TS/TSX 文件**重跑 `--max-warnings=0` → 0（连续两轮全量测试亦全绿，0016/0017 的"全绿"结论在本轮复现并修正范围）。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| packages/excalidraw/handwriting/brushPresets.ts | writeCorruptBackup 共享、preservedRaw/readError 及访问器、addRecovered 保留 id/updatedAt、UnifiedPresetLibrary 读取状态机 + 受保护 mirror + 后端重连 |
| packages/excalidraw/components/HandwritingBrushPanel.tsx | 警告优先级（持久化拒绝 > 恢复计数）、删除未用导入 |
| packages/excalidraw/tests/handwriting-0017-review.test.tsx | 0017 独立诊断正式纳入（4 项） |
| packages/excalidraw/tests/handwriting-presets-ui.test.tsx | +2（面板入口 J1、读恢复矩阵 J2），1 处期望随语义更新 |

## 设计与数据兼容

- 无新依赖；无快照更新；存储格式不变。
- 测试生命周期：统一库单例 + `__resetUnifiedPresetLibraryForTests()` 的约定延续（0017 诊断文件采用时自带 beforeEach 重置）；同页恢复测试不重置（沿用同一对象）。
- 抖动修复说明：0017 断言的字符串等价曾因 updatedAt 毫秒差偶发失败，根因是合并路径没传 updatedAt；现已随 id 一并保留，压测 50 轮稳定。

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-28, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run --watch=false`（连续两轮） | 0；**114 文件 / 1538 passed / 47 skipped / 1 todo** ×2 |
| 同上 | `tsc --noEmit` | 0 |
| 同上 | `eslint --max-warnings=0 <全部 26 个修改/未跟踪 TS/TSX>` | 0 |
| 同上 | `vite build`（excalidraw-app） | 0；18.1s |
| 同上 | 0017 回归重放（已纳入正式测试集） | 4/4 通过 |
| 同上 | 往返字节一致性压测（50 轮） | 无失配 |

真机状态：**未验证**（iPad 手感/掌托/横竖屏/iCloud/浏览器性能仍待用户实测）。

## 风险与未完成项

- 同页恢复依赖面板再次被打开（挂载重试）；若用户全程不再打开面板且未刷新，故障期数据只在内存（界面已提示导出备份）。
- R6 剩余证据（截图/录屏/浏览器内存）仍待真机。

## 下一批与交付状态

建议 Codex 复核 J1–J4 关闭情况；重点复跑 `handwriting-0017-review.test.tsx` 与 presets-ui 的面板入口/读恢复矩阵用例。PROGRESS.md 已更新。
