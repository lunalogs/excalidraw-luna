# 0020 — Kimi 第七批：0019 复核发现 K1 修复（合并冲突保留双方）

- 日期/执行者：2026-09-28 / Kimi
- 阶段：review 修复（承接 0019 的 K1）
- 父提交 / 起始 SHA：`5e49d5a4` + 0009–0019 全部未提交工作区（同批）
- 本次提交标题：见交付时填写（沿用"工作区待复核"约定）
- 对应需求：K1（J2/R5/A11）
- 状态：K1 完成；0019 独立诊断 2/2 通过并纳入正式测试集

## 本批解决的问题

### K1 / J2 — 不同 id 同名的存储预设被静默丢弃
- **冲突策略明确分层**：相同 id → 幂等跳过（会话优先，同身份不重复）；**不同 id 同名 → 双方保留**——权威视图（会话）保留原名，恢复项（磁盘）自动加后缀（" (2)"、" (3)"…），大小写不敏感比较、基名截断保证不超过 40 字符上限（`uniqueRecoveredName`）。
- 此前"名字相同就跳过"会让下一次 mirror 把磁盘预设永久覆盖且无提示——修复后落盘列表包含两个不同 id 及各自参数。
- `loadFromStorage` 注释与文档措辞修正：区分**身份去重**与**名字冲突**（0018/0019 记录中"name-deduped / always win"的说法不再准确）。
- **附带发现并修复一个 UI 新鲜度缺陷**：挂载时恢复合并发生在 effect 中、只改底层数据不触发 React 重渲染，下拉框会显示合并前的旧列表。面板在 `retryPersist()` 成功后 bump 一个 tick 强制重绘（K1 的 UI 恢复用例暴露了此问题）。
- 新增测试：同名 UI 故障恢复（磁盘 width 2 + 会话 width 8 双方保留、id 与参数各自落盘、重复 reopen 无膨胀）；12 条满额时的同名恢复（13 项可达，"Dup (2)" 落盘且保留原 diskId）。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| packages/excalidraw/handwriting/brushPresets.ts | uniqueRecoveredName、合并循环改为 id 去重 + 名字冲突加后缀、注释修正 |
| packages/excalidraw/components/HandwritingBrushPanel.tsx | retryPersist 成功后 bump 重绘 |
| packages/excalidraw/tests/handwriting-0019-review.test.tsx | 0019 独立诊断正式纳入（2 项） |
| packages/excalidraw/tests/handwriting-presets-ui.test.tsx | +2（同名 UI 恢复、满额同名恢复） |

## 设计与数据兼容

- 无新依赖；无快照更新；存储格式不变；恢复项名称后缀与既有 `suggestUniqueName` 风格一致并额外满足长度上限。
- jsdom 不跨 remount 持久化 appState（`currentItemBrushPreset` 回默认），同名 UI 用例中断言落在选项存在性与 localStorage 内容上，已注释说明。

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-28, Node v22.19.0 | `node node_modules/vitest/vitest.mjs run --watch=false`（多轮） | 0；**114+ 文件 / 1542 passed / 47 skipped / 1 todo** |
| 同上 | `tsc --noEmit` | 0 |
| 同上 | `eslint --max-warnings=0 <全部修改+未跟踪 TS/TSX>` | 0 |
| 同上 | `vite build`（excalidraw-app） | 0；12.0s |
| 同上 | 0019 回归重放（已纳入正式测试集） | 2/2 通过 |

真机状态：**未验证**（iPad 手感/掌托/横竖屏/iCloud/浏览器性能仍待用户实测）。

## 风险与未完成项

- 冲突恢复项的命名是自动后缀（未做显式用户选择弹窗），如需产品化选择入口可在后续迭代增加。
- R6 剩余证据（截图/录屏/浏览器内存）仍待真机。

## 下一批与交付状态

建议 Codex 复核 K1 关闭情况；重点复跑 `handwriting-0019-review.test.tsx` 与 presets-ui 同名恢复用例。至此 0009–0019 全部 review 发现（R1–R6、F1–F6、G1–G3、H1–H4、J1–J4、K1）均有代码修复与回归覆盖。PROGRESS.md 已更新。
