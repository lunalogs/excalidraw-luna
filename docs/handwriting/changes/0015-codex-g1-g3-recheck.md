# 0015 — Codex 复核 0014：G1关闭，G2/G3仍有存储缺口

- 日期/执行者：2026-09-28 / Codex
- 阶段：review；状态：复核完成，未批准全部关闭。
- 审核基线：luna-design，HEAD `5e49d5a4` 加全部未提交工作区；规划 base `36638fff`。
- 本次提交标题/SHA：未提交。未执行 checkout/reset/clean/stash，未推送。
- 对应需求：R3/A16、R5/A11、A20；本批仅新增审查文档和证据，未修改生产实现、既有测试或快照。

## 关闭情况

**G1关闭（代码层面）**：近侧弦测量及交点参数修复消除了跨圆内空白的直径错误。独立重放原探针，r=30/60/100 分别返回8.50753008/8.50223846/8.49825316px。圆、椭圆、闭合矩形和扁笔范围测试通过。0014 说原负分母与镜像方程“物理命中集相同”没有依据：原实现没有同时变换边起点/方向，不能据此声称公式等价。当前正分母实现符合方程，可保留；修正文档说明即可。名为 variable pressure 的测试仍用全0.5数组，实际覆盖非零 pressureAmount，不是沿笔画变化的压力，可补真正变化数组但不作为本轮G1阻塞项。

**G2未关闭**：单次面板迁移有效，恢复合并仍会提前删除未落盘的会话副本；只读和合并容量冲突也没有可访问的完整库。

**G3部分修复，未全部关闭**：首次部分坏记录备份通过；已有备份时跳过本次备份，随后覆盖原始数据，仍可丢失本次可恢复内容。

对既有测试“quota提示→会话提示”的变更：迁移后显示会话提示合理，接受该文案语义调整；但不能据单次重开证明整个会话数据安全。

## 必须修复的发现

### H1 / P1 / G2：合并未持久化成功就删除会话副本

位置：`packages/excalidraw/handwriting/brushPresets.ts:735–751`，重点747–748。

`library.add()` 在内存添加后调用persist；persist内部捕获写入错误，但add仍返回ok:true。因此这里的result.ok不代表落盘成功。代码马上session.remove，返回的临时library只存于本次面板；下次重开重新读磁盘，数据消失。

独立测试：session预存Survivor；probe写入放行，正式key写入始终抛配额；第一次createPanelPresetLibrary返回Survivor，第二次不再存在。0013正式测试只重开一次，恰好停在尚未丢失的时点。

要求：只有明确确认持久化成功才能清除会话副本；失败返回/展示仍拥有完整数据的会话状态。将持久化结果与逻辑修改成功分开，避免调用方混淆。覆盖连续至少三次重开、部分合并后失败、再次成功恢复，验证无丢失也无重复膨胀。

### H2 / P1 / G2：只读或合并满额时，部分预设不能使用/导出

位置：同文件730–731、735–751；面板使用返回库的list导出。

1. 写探测失败就直接返回session，完全不读取仍可读的本地旧库。独立测试先存Saved before outage，再使setItem失败但getItem可用，返回库为空。磁盘数据没被删除，但用户在故障期间无法选择或导出它。
2. 磁盘已有12条，session还有Session overflow。恢复时add因上限失败，虽然session项保留，函数仅返回磁盘库；用户依旧无法访问/导出该项。不能把隐藏在模块内存中的条目等同于产品可恢复。

要求：保留统一的可访问会话视图或提供明确的待恢复项导出/冲突入口；容量限制不能使已有用户数据不可访问。getItem失败、只读可读取、双方满额、名称冲突、恢复重试应作为同一状态矩阵实现和验证，不再靠更多探测键推测后续读写结果。

### H3 / P1 / G3：已有备份时丢失当前损坏源数据

位置：同文件`backupCorruptRaw`约651–664。

现有备份键非null时跳过写入，load继续恢复有效条目，下一次add覆盖原key。独立测试先写旧备份，再写包含Current recoverable data的本次坏payload，load→add后扫描所有localStorage值，已找不到本次原始内容。

要求：既保留旧备份，也保留当前原始数据（例如独立版本备份、去重的多份备份、或备份失败时保留原key并提供导出/恢复路径）。备份写失败时不能无条件覆盖唯一源数据。补已有备份、备份写失败但主key可写、重复打开不产生无限备份三类边界。无需用户提供API。

### H4 / P2 / 验证证据：严格ESLint仍失败

新增正式文件 `packages/excalidraw/tests/handwriting-0013-review.test.tsx` 有7个未使用声明：pointFrom、getElementBounds、getElementAbsoluteCoords、getFreedrawOutlinePointsForElement、ExcalidrawFreeDrawElement、LocalPoint、h。`--max-warnings=0`退出1。

要求删除无用声明，复跑包含所有未跟踪源码/测试的lint，并在下一记录纠正0014的全绿结论。临时诊断是在lint完成后创建，不是这些警告的来源。

## 独立验证

环境：Node v22.19.0；本机终端/jsdom，非iPad。未更新快照。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0013-review.test.tsx packages/excalidraw/tests/handwriting-presets-ui.test.tsx packages/element/src/handwriting/__tests__/outline.test.ts packages/excalidraw/tests/lasso.test.tsx packages/element/tests/resize.test.tsx` | 退出0；5文件115通过、2跳过 | `../evidence/0015-focused.log` |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 退出0；112文件1525通过、47跳过、1todo | `../evidence/0015-full.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出0 | `../evidence/0015-tsc.log`（空输出） |
| `node node_modules/eslint/bin/eslint.js --max-warnings=0 <全部25个修改/新增JS/TS/TSX文件>` | 退出1；7警告 | `../evidence/0015-eslint.log` |
| excalidraw-app下 `node ../node_modules/vite/bin/vite.js build` | 退出0；45.18s；有依赖/分包警告 | `../evidence/0015-build.log` |
| 宽度探针，vite-node执行0013原输入 | 退出0，三种圆均约8.5px | `../evidence/0015-width.log`、`0015-width-probe.ts.txt` |
| 0015独立存储诊断 | 退出1；4项全失败（H1一项、H2两项、H3一项） | `../evidence/0015-regressions.log` |
| `git diff --check` | 退出0 | 终端验证 |

重放：复制 `docs/handwriting/evidence/0015-review-regressions.tsx.txt` 为 `packages/excalidraw/tests/handwriting-0015-review.test.tsx`，运行 `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0015-review.test.tsx`。这是直接测试面板实际使用的库入口，不依赖模拟渲染来猜测存储结果。每例清空session库，避免跨例污染。整理类型/格式并将这些场景纳入正式集。当前以文本证据归档，没有删除或跳过已有测试。

## 文件、风险与交付

新增0015记录与evidence/0015-*日志/复现源码，更新PROGRESS最新状态；无生产实现/数据格式/依赖修改。下一批0016修复H1–H4，优先把存储状态机作为整体处理，再交复核。

iPad手感、掌托、横竖屏、iCloud与真实浏览器性能仍未验证。G1代码关闭不代表A16真机通过。无需为上述存储修复配置苹果接口或新服务。
