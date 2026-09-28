# 0019 — Codex复核0018：J1/J3/J4关闭，J2同名冲突仍丢数据

- 日期/执行者：2026-09-28 / Codex
- 阶段：review；状态：复核完成，仍有一项阻塞。
- 基线：luna-design，HEAD `5e49d5a4` + 全部未提交修改；规划base `36638fff`。
- 对应：J1/J2/J3/R5/A11、J4/A20。
- 本批未提交/推送，未执行checkout/reset/clean/stash；只新增文档与诊断证据、更新PROGRESS，未修改产品实现、已有测试或快照。

## 关闭矩阵

| 项目 | 结论 |
| --- | --- |
| J1源数据保护 | 代码层面关闭。mirror检查preserveSource并重试备份；原两项失败诊断及面板入口测试通过；新增“备份写入恢复后先保留raw再镜像”正向探针通过。 |
| J2读取失败保护与合并 | unknown禁止覆盖已修复，原诊断通过。但不同ID同名项直接丢弃，K1阻塞。 |
| J3同页后端重连 | 代码层面关闭。retry重新获取后端、先读合并再写，同一对象恢复诊断通过。 |
| J4严格lint | 关闭。本轮包含全部27个修改/未跟踪源码文件，退出0。0018写26个，实际集合现为27个（包括0017新增正式诊断）。 |

保留id/updatedAt合理，避免读取恢复制造身份或时间变化。接受只在beforeEach重置单例；同页恢复测试沿用原对象。0018所述“同名会话优先”不能解释丢弃不同ID的合法旧预设：冲突解决应保留可恢复的双方数据，而不是只保留一方。

## K1 / P1 / J2：不同ID同名的存储预设被静默丢弃

位置：`packages/excalidraw/handwriting/brushPresets.ts:902–910`。

loadFromStorage先按id跳过已知记录，这部分正确；但接着只有在authority没有同名项时才addRecovered。若用户因读取故障看不到原预设而新建同名笔，两条记录ID不同、参数不同，存储项被跳过。loadState转loaded后mirror立即将缺少该项的列表写回主键，永久覆盖旧预设，没有提示或备份。

独立复现：

1. 持久化“My pen”，粗细2，记录其diskId。
2. 使主键getItem暂时抛错，创建统一库；本地原数据仍存在。
3. 在会话新建“My pen”，粗细8，sessionId与diskId不同。
4. 恢复读取，调用同一库retryPersist两次。
5. 两次返回true，但落盘只有sessionId；diskId及其参数已消失。

诊断2项：该冲突断言失败；备份恢复正向断言通过。现有0018恢复矩阵使用不同名字“Existing saved pen / Offline pen”，不会触发此分支。

### 下一批修复要求

- 相同id可以按已约定的会话优先策略幂等去重；不同id必须保留双方。
- 名称冲突可给恢复项加后缀，或提供显式冲突选择；不能直接跳过合法记录。
- 保留原始id/updatedAt/笔刷参数，名称比较与既有验证/后缀策略一致（含大小写、最大长度等约束）。
- 同名、已有后缀冲突、达到12条时的恢复、重复retry/重新挂载都不能丢数据或重复膨胀。
- 在实际统一入口验证list、导出、落盘均包含两个不同id及各自参数；建议加同名UI故障恢复用例。
- 更新注释及记录中“name-deduped / always win”的表述，区分身份去重与名字冲突。

不需要新增苹果接口、API或云服务。

## 独立验证

Node v22.19.0，本机终端/jsdom；没有iPad证据。未更新快照。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0017-review.test.tsx packages/excalidraw/tests/handwriting-presets-ui.test.tsx` | 退出0，2文件25通过 | `../evidence/0019-focused.log` |
| `node node_modules/vitest/vitest.mjs run --watch=false` 首轮 | 退出1；113文件通过、1失败；1537通过/1失败。duplicate.test.tsx 的 action-duplicating within group 在render等待报still loading | `../evidence/0019-full.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出0 | `../evidence/0019-tsc.log`（空输出） |
| excalidraw-app下 `node ../node_modules/vite/bin/vite.js build` | 退出0，58.65s；既有依赖/分包警告 | `../evidence/0019-build.log` |
| `node node_modules/eslint/bin/eslint.js --max-warnings=0 <全部27个修改与未跟踪JS/TS/TSX>` | 退出0 | `../evidence/0019-eslint.log`（空输出） |
| 0019独立诊断 | 退出1，1失败/1通过 | `../evidence/0019-regressions.log` |
| `git diff --check` | 退出0 | 终端验证 |

重放：复制 `docs/handwriting/evidence/0019-review-regressions.tsx.txt` 为 `packages/excalidraw/tests/handwriting-0019-review.test.tsx`，运行 `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0019-review.test.tsx`。整理格式后纳入正式集。此次临时诊断归档为文本证据，不删除/跳过已有测试；lint运行在临时文件创建前。

## 文件与交付

新增0019记录及evidence/0019-*源码/日志；更新PROGRESS。无产品实现、数据格式、依赖更改。下一批0020修复K1并复验。J1/J3/J4代码关闭不代表整个A11或真机验收完成。

iPad手感、掌托、横竖屏、iCloud及A18真实性能仍未验证。

最终全量复跑：其他检查结束后单独执行 `node node_modules/vitest/vitest.mjs run --watch=false`，退出0，114文件/1538通过、47跳过、1todo。证据：`../evidence/0019-full-retry.log`。首轮still loading未复现，保留原始失败日志；可能与并行负载有关，不能证明其根因。该通过结果不包含归档的K1失败诊断。
