# 0017 — Codex复核0016：统一库仍绕过源数据保护

- 日期/执行者：2026-09-28 / Codex
- 阶段：review；状态：复核完成，未批准全部关闭。
- 起始状态：luna-design，HEAD `5e49d5a4` 加全部未提交修改；规划base `36638fff`。
- 对应：H1/H2/H3/R5/A11、H4/A20。
- 本次未提交/推送，未执行checkout/reset/clean/stash。只新增审查文档、诊断证据并更新PROGRESS，不改生产实现、正式测试或快照。

## 关闭情况与测试调整

H1原来的“恢复未落盘就删会话项”关闭：统一权威库取消迁移删除，正式三次重开测试通过。H2中只读可读、满额可达性的原诊断通过，认可恢复已有数据可越过新建上限。但存储读取失败和对象恢复路径仍不完整，不能关闭整个R5。

H3不能关闭：旧BrushPresetLibrary的保护有效，但面板实际使用的UnifiedPresetLibrary.mirror没有保护。新增备份失败测试仍直接调用旧createPresetLibrary，未覆盖面板入口。

H4旧的7个未使用声明已删除，但新代码严格lint仍失败，不能称工程全绿。

认可“未保存到本地存储”与统一权威视图的文案语义；版本化备份存在时可允许主键变更，因此相应旧期望变更合理。仅在测试beforeEach或模拟新页面加载时重置单例合理；真实同页故障恢复不能靠重置单例来证明，必须沿用同一对象。诊断1–3不在恢复中重置，诊断4显式检查对象身份。

## 必须修复

### J1 / P1 / H3：统一镜像绕过拒绝覆盖保护

位置：`packages/excalidraw/handwriting/brushPresets.ts`，UnifiedPresetLibrary构造器的`stored.isPreservingCorruptSource()`与`mirror()`。

构造器只复制persistError，未保留拒绝覆盖的状态。面板mount effect立即调用retryPersist，mirror无条件setItem主键并清除错误。两项独立重放：①备份写失败但主键可写；②五个备份槽都占满。主键原为唯一的损坏payload，调用createPanelPresetLibrary→retryPersist后都被空presets JSON覆盖。用户甚至不用点击保存，只需打开画笔。

要求：统一状态机必须掌握源数据保护状态，所有写入路径（挂载重试、add/update/remove/import）都经过同一道保护；只有原始payload已安全备份后才能覆盖。恢复可写后重新尝试备份；满额时保持源数据并允许导出当前会话，不得仅复制一条错误字符串。把旧库测试扩展到实际面板入口和mount effect。

### J2 / P1 / H2：初次读取失败被当作空库并覆盖旧数据

位置：同文件BrushPresetLibrary.load的getItem catch及UnifiedPresetLibrary构造器/mirror。

读取异常只标记corruptData，空列表被当作已读完的库。独立重放：先存Existing saved pen；首次主键getItem抛异常；创建统一库；恢复读取后retryPersist → 原笔被空列表覆盖。没有原文备份，因为根本没有读到源数据。

要求：区分“已读且不存在”“已读但损坏”“尚未成功读取”。未知源状态禁止覆盖；读恢复后先载入并与会话权威视图合并，再镜像。测试要覆盖getItem暂时失败但setItem可用、读恢复期间会话已有新增、重复重试无重复膨胀，保留双方数据。

### J3 / P2 / H2：首次存储对象不可访问后永远不再连接

位置：同文件UnifiedPresetLibrary的readonly storage字段、构造器与mirror开头。

构造时localStorage getter抛错会永久记录storage=null，retryPersist仅返回false，不再resolveDefaultStorage。独立重放：阻止getter→同一库新增Offline pen→恢复getter→重新获取同一库并retryPersist，仍false，无法落盘。0016声称“恢复靠挂载重试”只覆盖已有Storage对象的setItem恢复。

要求：重试可重新获取后端，并先按J2规则读取/合并已有数据，然后持久化。不得以测试reset或要求用户刷新代替同页恢复，因为刷新会丢失未持久化会话数据。

### J4 / P2 / H4：包含未跟踪文件的严格lint仍失败

本轮检查集合为26个修改/新增JS/TS/TSX文件，退出1、18 warnings：

- HandwritingBrushPanel.tsx仍有未使用的getSessionPresetLibrary导入。
- handwriting-0015-review.test.tsx的格式警告。
- handwriting-presets-ui.test.tsx多余空行警告。

完整证据见0017-eslint.log。0016的全绿结论未在本轮复现；请清理并记录准确命令/文件集合。此次lint在0017临时诊断创建前运行，警告不是新诊断造成。

## 实际验证

Node v22.19.0，本机终端/jsdom；无真机证据，无快照更新。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0015-review.test.tsx packages/excalidraw/tests/handwriting-0013-review.test.tsx packages/excalidraw/tests/handwriting-presets-ui.test.tsx` | 退出0，3文件28通过 | `../evidence/0017-focused.log` |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 退出0，113文件1532通过、47跳过、1todo | `../evidence/0017-full.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出0 | `../evidence/0017-tsc.log`（空输出） |
| `node node_modules/eslint/bin/eslint.js --max-warnings=0 <全部26个修改与未跟踪JS/TS/TSX>` | 退出1，18警告 | `../evidence/0017-eslint.log` |
| excalidraw-app下`node ../node_modules/vite/bin/vite.js build` | 退出0，有既有依赖/分包警告 | `../evidence/0017-build.log` |
| 0017独立诊断 | 退出1，4项全部失败（J1两项、J2/J3各一项） | `../evidence/0017-regressions.log` |
| `git diff --check` | 退出0 | 终端验证 |

重放：将 `docs/handwriting/evidence/0017-review-regressions.tsx.txt` 复制为 `packages/excalidraw/tests/handwriting-0017-review.test.tsx`，运行 `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0017-review.test.tsx`。整理格式后纳入正式集，不以旧库通过代替统一入口通过。当前诊断以文本归档，不删除/跳过任何正式测试。

## 本批文件与交付

新增0017记录、evidence/0017-*源码/日志，更新PROGRESS。无生产实现、依赖、数据格式修改。下一批0018修复J1–J4，重点是安全读取状态、原始数据保护和后端重新连接必须贯穿统一入口。

真机A04/A06/A07/A08/A09/A16、A18性能仍未验证；没有新增苹果API或云服务配置需求。
