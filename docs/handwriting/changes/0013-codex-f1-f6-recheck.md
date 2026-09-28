# 0013 — Codex 复核 0012：F3/F4 仍未关闭

- 日期/执行者：2026-09-28 / Codex
- 审核对象：`luna-design`，HEAD `5e49d5a4` + 全部未提交修改；规划 base `36638fff`。
- 阶段：review；状态：复核完成，产品验收仍未通过。
- 对应需求：R1/A07、R2/A09、R3/A16、R4/A04/A08、R5/A11、R6/A13/A17/A20。
- 本次提交标题/SHA：未提交；保留全部已有工作，未执行 checkout/reset/clean/stash，未推送。

## 关闭矩阵

| 0011 项目 | 本轮结论 |
| --- | --- |
| F1 旋转边界 | 代码层面关闭：逐轮廓顶点旋转后求极值，独立旋转顶点包含断言通过。 |
| F2 真实墨迹命中 | 代码层面关闭：真实轮廓世界坐标多边形的内部/边距离取代名义半径；正式正负命中及 lasso 原期望通过。 |
| F3 预设存储 | 不关闭：小探测成功不代表实际写入成功；部分坏记录也没有备份，详见下文。 |
| F4 代表线宽 | 不关闭：34px 恒宽特例通过，但有压感参数的圆会把圆直径算作墨迹宽度。 |
| F5 试写压力 | 代码层面关闭：同坐标不同压力保留，按钮状态完整的事件测试通过；单指针与 Pencil 优先级测试通过。硬件行为未验证。 |
| F6 超长段分配 | 原 1e8 长段导致按长度无限增长的问题关闭；自适应步长测试通过。1024 是弧长采样目标，并非所有输入的严格总上限：零长度样本仍逐个保留，复杂度含 O(输入数)，应修正文档的“hard budget”措辞。 |

R6：认可按 appId 保存恢复记录及卸载/超时只删所属项、两个编辑器同时恢复窗口测试；CSS 坐标缩放容差与先推进时间再验证 reset 的修订合理。真机 A04/A06/A07/A08/A09/A16 及 A18 性能不因此通过。

## 仍需修复（供 Kimi 下一批执行）

### G1 / P1 / F4 / R3：闭合轮廓被测成整个图形的直径

位置：`packages/element/src/handwriting/outline.ts:394–425`。

`getRepresentativeStrokeWidth` 把无限法线与整个轮廓的所有交点取 min/max。圆的法线会同时穿过近侧和远侧墨迹，`maxS-minS` 跨过圆内空白区，结果接近直径。另线段参数 `t` 的分母写成 `-denom`，应核对交叉积推导：在当前分子定义下应为 `denom`。恒宽零压感特例绕过了这段，单测 34px 无法发现问题。

独立输入：121 点闭合圆，strokeWidth=2，pressure=0.5，pressureAmount=60，nibFlatness=0，其余标准默认配置。名义笔宽 8.5px：

| 半径 | 实际返回原生描边宽度 |
| --- | --- |
| 30 | 68.94085055 |
| 60 | 128.77099377 |
| 100 | 208.67633126 |

这会在停笔规整后产生严重粗化。修复要求：只测局部墨迹区间，不跨内部空洞/远侧笔画；修正线段交点公式。增加圆、椭圆、闭合矩形与直线的独立视觉线宽界限测试，覆盖非零 pressureAmount、恒定实际压力和扁笔。不得通过限制到 12 或单独硬编码圆的结果掩盖算法。同步更新函数头过期的“平均半径再除4.25”说明。证据：`../evidence/0013-width.log`、`0013-width-probe.ts.txt`、正式可重放诊断源码。

### G2 / P1 / F3 / R5：实际保存失败仍丢失会话预设

位置：`packages/excalidraw/handwriting/brushPresets.ts:708–738`。

`isPresetStorageWritable()` 只试写字符串“1”；探测成功后面板仍每次创建新的持久化库。真实 JSON 可能因体积更大而超额，或面板打开后配额变化。`persist()` 捕获失败后只把数据留在当前实例，切换工具卸载面板即丢失。

独立 UI 重放：允许 `.probe` 写入，实际预设写入抛 QuotaExceededError → 保存新预设 → 当前面板能看到 → 切矩形 → 返回画笔 → 预设消失。0012 正式回归从挂载前就使所有 setItem 失败，只验证了预先降级，未验证真实写入失败。

修复要求：保持统一的会话权威库，或实际持久化失败时将完整当前库转入共享会话状态；不能依赖预探测判断最终结果。保留可读取的旧预设；存储恢复时显式合并/处理冲突，不得静默用磁盘旧数据替换会话新增。覆盖实际写失败、getItem 异常、只读可读取旧数据、恢复可写后的重开及导出。无需用户申请 API。

### G3 / P1 / F3 / R5：部分坏记录被下一次保存覆盖，原始内容未备份

位置：`packages/excalidraw/handwriting/brushPresets.ts:625–639`。

load 对 JSON/顶层结构错误会备份，但逐项验证失败只增加 droppedPresetCount。下一次 add/save 写回有效列表，原始坏条目被覆盖，`.corrupt-backup` 仍不存在。

独立断言：合法顶层格式 + 一个不完整预设 → hadCorruptData=true → 新建合法预设成功 → 原 key 已改变，但原始备份为 null。修复要求：任何丢弃/修改原记录的恢复路径都先保留原始 payload；处理已有备份和备份失败时不能声称本次原始数据安全。补顶层损坏、部分损坏、已有备份三类测试。

## 对测试修订与兼容性的判断

- 接受 0012 对稀疏压力测试的修订：本轮直接调用本地 perfect-freehand `getStrokePoints([[0,0,1],[100,0,1]], {size:34,streamline:0,last:true})`，压力输出 `[1,0.5,0.5,0.5]`。0011 将两点重压笔画视为全程均匀半径31.45的假设不成立，历史记录不改写，本记录纠正。密集样本与实际墨迹正负命中断言合理。
- 接受 R4 事件增加 `button:0, buttons:1` 作为按住笔移动的输入；测试通过且实现确实先读压力再过滤。不把这一测试环境修订解释为浏览器通用的压力传输规则。
- lasso 已恢复 HEAD 原期望（4），本轮通过。
- resize 基于可见 bounds 的相对锚点/比例断言可接受为缩放规则回归；它共用 getCommonBounds，不能单独证明 bounds 正确。配合独立逐顶点旋转包含测试判断 F1。
- 本批不改生产代码、数据格式、依赖、快照或已有测试。新增失败诊断归档为文本证据，不删改/跳过正式测试。

## 实际验证

环境：Node v22.19.0，macOS/Darwin 25.6.0，Apple M4；非 iPad。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0011-review.test.tsx packages/excalidraw/tests/lasso.test.tsx packages/element/tests/resize.test.tsx` | 退出0，3文件，64 passed / 2 skipped | `../evidence/0013-focused.log` |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 退出0，111文件，1514 passed / 47 skipped / 1 todo | `../evidence/0013-full.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出0 | `../evidence/0013-tsc.log`（空输出） |
| `node node_modules/eslint/bin/eslint.js --max-warnings=0 <全部24个修改/新增TS/TSX文件>` | 退出0，包括未跟踪 bounds/0011 测试及既有 probe | `../evidence/0013-eslint.log`（空输出） |
| 在 excalidraw-app 运行 `node ../node_modules/vite/bin/vite.js build` | 退出0，17.73s，PWA产物完成；既有依赖/分包警告 | `../evidence/0013-build.log` |
| `node node_modules/vite-node/vite-node.mjs scripts/handwriting-review-probe.ts` | 退出0，密度最大偏差0.36088493px | `../evidence/0013-geometry-probe.json` |
| 0013独立诊断（配额1项、圆3项、部分损坏1项） | 退出1，5项均失败 | `../evidence/0013-regressions.log` |
| `git diff --check` | 退出0 | 终端复验 |

重放失败诊断：复制 `docs/handwriting/evidence/0013-review-regressions.tsx.txt` 为 `packages/excalidraw/tests/handwriting-0013-review.test.tsx`，运行 `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0013-review.test.tsx`。修复时整理 import/lint 并纳入正式集；不要仅靠现有1514项宣称本轮缺陷已修复。宽度探针复制 `0013-width-probe.ts.txt` 到 scripts 下用 vite-node运行。

## 本批文件与下一步

新增本记录、`evidence/0013-*` 复现源码/日志/数值结果；更新 PROGRESS 最新摘要与阶段状态。无产品实现更改。

下一批从0014开始，修复G1–G3，补存储恢复矩阵和闭合路径代表线宽测试，更新真实执行证据，再交 Codex 复核。F6 的预算描述需明确；iPad 手感/掌托/横竖屏/iCloud/性能仍依 USER_SETUP.md 由用户实测。无需为本轮修复开通苹果接口、GitHub 项目或付费API。
