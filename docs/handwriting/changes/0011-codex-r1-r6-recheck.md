# 0011 — Codex 复核 0010：R1–R6 尚不能关闭

- 日期/执行者：2026-09-27 / Codex
- 审核对象：`luna-design`，HEAD `5e49d5a4` + 全部未提交工作区（0009 + 0010）。规划 base `36638fff`。
- 状态：复核完成，**不批准 R1–R6 全部关闭**。
- 本次仅新增复核证据、更新进度；未修改 Kimi 的实现及既有测试，未提交/推送。未执行 checkout/reset/clean/stash。
- 对应需求：R1/A07、R2/A09、R3/A16、R4/A04/A08、R5/A11、R6/A13/A17/A20。

## 独立验证结果

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 退出 0；110 文件、1500 passed、47 skipped、1 todo；46.37s | [基线日志](../evidence/0011-tests-baseline.log) |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出 0，无输出 | 本次终端执行 |
| 对全部变更 TS/TSX 以及**新增未跟踪**的 bounds 测试、probe 执行 ESLint `--max-warnings=0` | **退出 1**；新增 bounds 测试 9 个警告（import/order 及未使用变量） | [lint 日志](../evidence/0011-eslint.log) |
| 在 excalidraw-app 执行 `node ../node_modules/vite/bin/vite.js build` | 退出 0；20.84s；有既有依赖/分包警告 | [构建日志](../evidence/0011-build.log) |
| `node node_modules/vite-node/vite-node.mjs scripts/handwriting-review-probe.ts` | 退出 0；密度偏差 0.35447965px；1000 笔轮廓批次 p50≈69.03ms/p95≈99.22ms | [探针](../evidence/0011-geometry-probe.json) |
| 新增独立验收断言 | **5 项全部失败**，如下 | [失败日志](../evidence/0011-review-regressions.log)、[可重放测试源码](../evidence/0011-review-regressions.tsx.txt) |
| `git diff --check` | 退出 0 | 本次终端执行 |

1500 通过是原工作区测试结果，不能合并表述为新增验收也通过。没有更新快照。新增失败断言以证据源码保存，不混入默认测试集；没有删除/跳过任何既有测试。重放：把证据源码复制为 `packages/excalidraw/tests/handwriting-0011-review.test.tsx`，再运行 `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0011-review.test.tsx`。修复时应把这些断言纳入正式回归测试。

## 必须修复的发现（按影响排序）

### F1 / P1 / R1：旋转边界漏掉可见轮廓

`packages/element/src/bounds.ts:182` 只取局部 AABB 的两个对角点，然后旋转两点。旋转后的左右/上下极值不一定落在这两个点上，即使取 AABB 也至少需四角；最准确的是旋转全部轮廓顶点再求边界，并保留原几何旋转中心。

独立测试对实际轮廓每个顶点按原旋转中心计算世界坐标：45° 笔画有 **28 个轮廓顶点在报告边界外**。仍存在导出裁切、选择粗筛漏笔迹风险。原“旋转宽扁笔”测试只检查宽高大于 20/60，不能证明覆盖。

附带测试问题：`handwriting-bounds.test.tsx` 用 `API.createElement` 传 pressures/simulatePressure/customData，但 helper 的 freedraw 分支并未转发这些字段，且默认 simulatePressure=true。标为“宽扁笔”的样例没有实际安装扁笔配置。下一批需直接构造真实笔画或创建后显式赋值，并断言 fixture 确实有目标参数。

### F2 / P1 / R1：命中仍是名义圆笔估算，重压墨迹会漏选/漏擦

`packages/element/src/distance.ts:60` 用中心线距离减 `strokeWidth*4.25/2`，没有使用真实压感/扁笔/稳定后的轮廓。8 粗细、压力 1、幅度 100 的圆笔真实半径约 31.45，而此处只减 17。

独立测试：水平笔画从(100,100)到(200,100)，位于墨迹内部的(150,125)，threshold=0，命中结果 **false**。要求共享实际轮廓的点内/边距离判断，正负命中均覆盖压感、扁角、弯线和旋转。

### F3 / P1 / R5：配额失败后的会话预设仍会丢失

`HandwritingBrushPanel.tsx:390` 仅在访问 localStorage 对象失败时用共享库；对象存在但 setItem 抛 QuotaExceededError 时仍每次 mount 创建新库。即时提示修复有效，但无法保住本次会话的参数。

独立 UI 测试：模拟 setItem 配额异常 → 保存个人预设 → 切矩形 → 返回画笔；刚保存的预设 **消失**。要求所有不能持久化的写入保留于会话库（包括 getItem/setItem 异常），恢复持久化时明确定义合并规则。另：损坏 JSON 只保证打开时不写回，下一次保存仍覆盖原 key；没有保留可恢复的原始备份，需明确备份/恢复方案。

### F4 / P2 / R3：代表线宽的单位换算仍错，测试把错误固化

`handwriting/outline.ts:315` 求得真实墨迹半径后又除以 4.25，把像素宽度换回了 freedraw 字段单位；然而原生 line/ellipse/rectangle 的 strokeWidth 直接是描边宽度，不再乘 4.25。另有 12 上限，会继续截断粗笔。

独立断言：粗细 8、幅度 0、扁平 0 → 真实恒宽 34px；函数仍返回 **8**。0010 新加的“保视觉线宽”测试也断言 8，正好重复 0009 的问题，不认可该测试。要求使用原生图形的实际线宽单位并避免不必要的 12 上限；常宽案例应得到 34，有损说明仅适用于变量压力和各向异性，不能解释恒宽缩小。

### F5 / P2 / R4：试写仍丢弃原地压力变化

`HandwritingBrushPanel.tsx:278` 在读取压力前直接过滤位移<1.5 的事件。独立测试：同一 pen 在同坐标由 0.2 变 0.9，渲染函数未收到 0.9，失败。要求与主画布策略一致，只有位置和压力都未改变才丢弃。

单 pointerId 隔离、cancel/lostcapture 和 Clear 清理的改进认可，但当前是“先到指针占用”，掌托先落下会阻挡随后 Pencil；应结合 Pencil-only 模式明确允许的指针/优先级，并测 touch 先到、pen 后到。

### F6 / P1 / R2：重采样不是“有界”，长坐标段可大量分配并阻塞页面

`handwriting/outline.ts:69` while 循环次数取决于 segmentLength/spacing，没有样本数/总长度预算。仅 3 个输入点、相邻距离 1e8、size8.5，就可能生成约 1e8 个样本；导入图/缩放后的长路径即可进入该分支。未实际运行此极端样例以免耗尽内存。

密度误差从 4.566 降到 0.354 的改善已独立确认，但不足以关闭 R2。应预计算总弧长，自适应步长并设置明确的全笔最大输出预算，保留端点和压力对应。补有限大坐标/超长段/重复点测试。stabilization=0 仍会传 streamline=0.05，不能宣称完全没有滤波；“同一 raw 输入重复计算一致”是确定性，不是对规范化输入幂等，文档需准确。

## 两处既有测试调整是否接受

- **lasso 4→3：不接受现有理由。** `lasso/utils.ts` 并非文档所称“完全包围/contain 模式”：enclosureTest 只需某个 segment 顶点在套索内，最终还并入 intersectionTest 命中的元素。请先修正边界，再用实际套索与实际墨迹的独立相交/包含证据解释期望；不能靠新结果反推产品规则。
- **resize：形式上有合理性，但暂不作为边界正确的证据。** 改为相对真实 selection 左上角缩放符合可见边界变化；然而期望值与被测代码共用 getCommonBounds，会一起接受错误的旋转边界。R1 修正后应复跑，并补独立的旋转墨迹/固定锚点位置断言。

## R6 与关闭状态

| 项目 | 复核结论                                           |
| ---- | -------------------------------------------------- |
| R1   | 不关闭：F1/F2，且测试 fixture 未真正设置新笔刷参数 |
| R2   | 部分认可密度改善；不关闭：F6 与零稳定性说明        |
| R3   | 不关闭：F4                                         |
| R4   | 部分认可指针/清理；不关闭：F5                      |
| R5   | 部分认可 getter 不可用/即时提示；不关闭：F3        |
| R6   | appId 过滤、卸载清理改进认可；测试证据仍不完整     |

R6 具体测试问题：Pointer.moveTo 传入的是 client CSS 坐标，但缩放测试先除 zoom，25%下实际移动 16px、400%下实际移动 1px，未测试相同 4 CSSpx。超容差重置测试在移动前没有推进时间，随后只等 400ms（少于 500ms）；即使不重置也会通过。应先等 400ms，移动真正的 8 CSSpx，再等例如 200ms，证明旧截止时间失效、新截止时间未到；1190/1210 的用例也不能称“精确 1200ms 边界”。

共享 restore atom 仍只存一份提交，第二编辑器规整会覆盖第一编辑器的恢复窗口；现有测试只挂载第二编辑器、不提交，因此未覆盖。需要每 appId 独立存储或明确产品单窗口语义。

## 下一步交接

从 0012 开始逐批修复上述发现并附失败 → 通过证据；尤其不要把 F4 的错误预期更新成通过，或把 F1 只修成“宽高大于某数”。用户 iPad 手感/iCloud/真机性能仍单独待验收；本轮这些可在桌面证明的代码问题不应转给用户真机排查。
