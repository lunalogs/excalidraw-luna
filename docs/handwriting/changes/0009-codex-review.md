# 0009 — Codex 审核与第一批回归修复

- 日期/执行者：2026-09-26–27 / Codex
- 阶段：review 修复；**最终产品验收未通过**
- 规划 base：`36638fff20494cc9a6b91186b2dca37c23be0802`
- 审核 head / 本批起点：`5e49d5a4`，分支 `luna-design`
- 本批提交：工作区修改，尚未提交、未推送
- 对应需求：DATA-04、BR-06/07、PRE-03、UI-01/07、SH-10/11；A01/A08/A10/A11/A16/A17

## 审核结论

Kimi 的基线测试数量属实：独立运行得到 109 文件、1467 passed、47 skipped、1 todo。但全绿不等于满足 ACCEPTANCE：新增测试在原实现复现了压力误判、取消后迟到识别、反向直线数据不规范等问题。M2/M3/M4/M5 不能宣称全部完成。以下区分已修复、剩余代码问题、尚无证据的验收项，旧记录保留不改写。

## 本批已修复

1. **真实 pen 的 0.5 压力被当作无压感。** App 现在按 pointerType 排除 pen，非 pen 的 0/0.5 使用模拟；保留位置不变而压力变化的样本，点/压力一一对应。旧文件的 simulatePressure 不迁移。
2. **pointercancel、lostpointercapture、页面 hidden 后计时器仍能产生规整候选。** 补事件接线、按 pointerId 取消，监听 hidden；定时器捕获原 hold 对象和 timer 身份，回调再检查当前工具、识别开关、可见性。用只虚拟 setTimeout/clearTimeout/Date 的测试保留真实 rAF，不必放弃 fake timers。
3. **反方向直线第一个局部点不为 [0,0]。** 改为起点锚定、终点允许负坐标，保留绘制方向；继承 groupIds。旧版 newLinearElement 并不会自动修复此不变量。
4. **未来 schemaVersion 被强行解释为 v1。** 显式未知版本返回 null，走 legacy 降级，原 customData 不被重写；缺省版本仍容忍为不完整 v1。
5. **上方画笔/钢笔/荧光笔按钮绕过未保存确认。** 与下拉框共用切换流程；尚无预设时以面板打开时的参数为修改基线。预设选择也统一设置荧光笔的默认停笔识别行为。已有笔画不改变。
6. **约 500px 分屏进入 phone 布局后完全没有新笔刷设置入口。** 在 MobileMenu 左上方复用同一个浮层入口；补 500px 和 768px 组件用例，500px 明确断言入口位于 `.excalidraw-ui-top-left`。

## 改动文件

| 文件 | 改动/影响 |
| --- | --- |
| `packages/excalidraw/components/App.tsx`、`components/canvases/InteractiveCanvas.tsx` | 压力采样与取消/计时器接线 |
| `packages/excalidraw/actions/actionHandwriting.tsx` | 原生直线坐标、分组继承 |
| `packages/element/src/handwriting/brushParams.ts` | 版本安全降级 |
| `packages/excalidraw/components/HandwritingBrushPanel.tsx` | 预设切换保护 |
| `packages/excalidraw/components/Actions.tsx`、`MobileMenu.tsx` | 窄分屏左上入口 |
| `packages/excalidraw/tests/handwriting*.test.tsx`、`packages/element/src/handwriting/__tests__/outline.test.ts` | 回归测试 |
| `scripts/handwriting-review-probe.ts`、`docs/handwriting/evidence/0009-geometry-probe.json` | 可重复几何/纯函数性能诊断，不冒充设备性能 |
| 本记录、`PROGRESS.md` | 审核状态、未通过条目及后续要求 |

无新依赖。未改写 Kimi 的轮廓算法和历史文件。新鼠标笔画在无压力时改用模拟，因此相关新建笔画快照中的 pressures/simulatePressure 会改变；不能据此改写旧图。

## 仍需修改：给 Kimi 的下一批任务

按下面顺序继续，不要重做已经修复的部分。每一批新增 0010 起的修改记录，记录 base/head、需求 ID、失败测试与修复后结果。不得把以下代码缺陷降级为“仅待 iPad 测试”。

### R1 / P1：宽笔画的边界与命中仍未使用真实轮廓（A07）

`packages/element/src/bounds.ts` 的 freedraw 路径仍对 `element.points` 求边界；水平笔画得到零高度。`collision.ts` 的 `hitElementItself` 首先按该边界加 tolerance 排除点。新版画笔名义尺寸为 strokeWidth × 4.25，宽笔外侧可见墨迹可能在命中范围以外，导出无 padding 时也有裁切风险。

要求：以共享轮廓计算可见边界/粗筛，处理旋转中心、缓存失效、selection/eraser/export 的一致性；不要直接改变旧文件几何中心导致旋转位移。加入粗笔外缘点命中、橡皮擦过外缘、零 padding PNG/SVG 边界、旋转宽扁笔回归。旧文件外观需保持。

### R2 / P1：稳定性仍依赖输入采样密度（A09）

perfect-freehand 1.2.0 的 getStrokePoints 按每个输入点用固定系数插值；runningLength 只是累计长度，不使插值与事件频率无关。0005 中“按弧长”“streamline 幂等”的依据不成立。当前保存 raw points 后每次重算没有重复累积处理，但不能称为算法幂等。

可重复证据：运行 `node node_modules/vite-node/vite-node.mjs scripts/handwriting-review-probe.ts`。400px、振幅 50px 的同一双周期正弦轨迹，在 61/241 点、稳定性 100、恒定宽度下，轮廓顶点到另一轮廓线段的双向最大距离约 **4.566px**；不是简单比较两个点数组。

要求：采用按距离/时间定义的稳定算法或有界等弧长重采样；明确原始点与规范中心线持久化规则，避免二次稳定；稳定性 0 不额外滤波、抬笔到真实末端。增加同轨迹 60/120/240Hz、突变、压力单独变化与重载一致性测试；不要只测两档输出不同。

### R3 / P2：规整后的线宽明显变细（A16）

`shape.ts` 自由笔画使用 `strokeWidth * 4.25`，`actionHandwriting.tsx` 原生图形直接复制 `stroke.strokeWidth`。设置压力幅度 0、扁平度 0、粗细 8，原笔名义宽 34，规整后原生线宽 8。

要求：定义变量宽/扁笔转常宽原生图形时的代表性视觉线宽（并说明有损部分），预览与最终结果一致。测试上述恒宽案例及压力笔，不要仅断言 strokeWidth 字段相等。

### R4 / P2：试写区不隔离指针，也不处理取消（A04/A08）

`TestWriteArea` 的 drawingRef 只存点/压力，没有 pointerId；任何 pointerdown 可覆盖原笔，任何 pointermove/up 可续写或结束，缺 pointercancel/lostcapture。试写又把压力 0 替换为 0.5、以全 0.5 推断模拟，会与修复后的实际画布不一致。

要求：单一活动 pen、忽略掌托/其他指针；cancel/lostcapture 清理；与主画布共用压力能力策略；位置不变压力变化不得丢弃。清空时也终止活动试写。增加 pen+touch 交错和取消测试。

### R5 / P1：预设存储不可用时可能显示保存成功但随面板关闭丢失（A11）

`resolveDefaultStorage` 访问 localStorage 失败时静默返回新的内存 Storage，面板每次 mount 创建新 library；此时 setItem 不报错且 UI 未获知降级。加载坏数据只置 corruptData；UI 的 effect 只读 getPersistError。需区分损坏、配额满、完全不可用，不能假成功。

要求：面板重开仍共享会话内预设，明确显示“仅本次会话，建议导出”；损坏数据给出可恢复提示且不静默覆盖原始备份。覆盖 localStorage getter 抛错、getItem/setItem 抛错、损坏 JSON、关闭/重开弹层、导出恢复。参数修改基线也须在面板关闭重开后仍有明确定义。

### R6 / P2：验收证据和生命周期覆盖仍不完整（A04/A13/A17/A18/A20）

- 试写/高级滑块的触控目标、中文/英文、深浅色、横竖屏滚动与焦点需补截图/录屏；不能仅以 jsdom 可查询到控件判通过。
- 当前新增 fake timer 只覆盖取消/反向线，仍需默认 1.2s 精确边界、25/100/400% 容差、旧 timer 对新笔、unmount/真正导航手势测试。
- Restore atom 是共享 store，unmount 仅清掉 timeout，未清掉 atom；检查多编辑器互相污染和卸载后遗留提示，加入隔离回归。
- 补完整浏览器场景 1000 笔/5000 点、输入到绘制延迟、p50/p95、内存、导出压力；本批 Node 纯函数测量仅是起点，不能据此通过 A18。

## 实际验证

原始基线独立复跑：109 文件 / 1467 passed / 47 skipped / 1 todo；50.62s。新增压力/取消/反向线回归，修复前 **5 failed / 19 passed**；修复后相应场景通过。原测试未覆盖这些行为。

一次中间全量运行与 build 并行，出现 14 个失败：包括预设初始状态比较引入的回归、尚未完成的 500px 接线、5 个无压力鼠标笔画快照，以及超时。初始预设比较已修复；保留失败事实，不将该次运行报告为通过。最终复验结果见下方补充。

- 纯函数探针环境/原始数据：[0009-geometry-probe.json](../evidence/0009-geometry-probe.json)。Apple M4、Node v22.19.0、darwin 25.6.0。
- 1000 笔（每笔 121 点）轮廓计算批次 p50≈13.53ms、p95≈15.76ms；5000 点轮廓 p50≈0.458ms、p95≈0.826ms；识别 p50≈0.301ms、p95≈0.582ms。未测浏览器输入/渲染，heap delta 受 GC 影响，不是保留内存指标。
- 浏览器：本地 IAB 实际打开，观察 1024×768、768×1024 的左上紧凑入口/高级参数；500px 原版没有入口，已补组件回归。浏览器自动点击在视口覆盖时存在坐标偏差，改用键盘检查；这些观察不作为完整触控验收。
- 真机：**未验证**。iCloud 文件面板、Pencil 轻重压/掌托/双指/横竖屏仍须 iPad。无新增 Apple API/云服务或付费账户要求。

## 下一批与交付状态

先完成 R1–R5 的代码修复，再补 R6 证据并全量复验，之后进入用户真机验收。当前结论为“已审核并修复一批，仍有明确代码缺陷，未批准最终验收”。本轮不发布、不推送半验收状态的更改。

## 最终工程复验（2026-09-27）

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run --update --maxWorkers=2 --minWorkers=1` | 退出 0；109 文件/1476 passed/47 skipped/1 todo；8 个快照更新；70.62s | [更新日志](../evidence/0009-tests-update.log) |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1` | 退出 0；同上；不更新快照；74.63s | [最终测试日志](../evidence/0009-tests-final.log) |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出 0，无诊断 | 终端复验 |
| `git diff --name-only -z -- '*.ts' '*.tsx' \| xargs -0 node node_modules/eslint/bin/eslint.js --max-warnings=0` | 退出 0，无诊断 | 本批所有已跟踪源码/测试 |
| `node node_modules/eslint/bin/eslint.js --fix --max-warnings=0 scripts/handwriting-review-probe.ts` | 退出 0；拆分 const 声明，CLI 输出改为 stdout | 新增诊断脚本 |
| `git diff --name-only -z \| xargs -0 node node_modules/prettier/bin-prettier.js --check` | 退出 0 | 本批已跟踪文件；新增文档/脚本另行检查 |
| 在 `excalidraw-app/` 执行 `node ../node_modules/vite/bin/vite.js build` | 退出 0；13.65s；有既有依赖/包体警告，无构建错误 | [构建日志](../evidence/0009-build-final.log) |
| `git diff --check` | 退出 0 | 终端复验 |

相较基线新增 9 项测试。两个快照文件共 8 处变更已核对，仅把**新建无压力鼠标笔画**的 `simulatePressure:false`/零压力数组改为 `true`/空数组；没有更新坐标、历史结构或掩盖图形失败。旧图的参数未迁移。

修复前失败证据：[5 个回归失败](../evidence/0009-regressions-before-fix.log)。工程检查通过不改变 R1–R6 尚未关闭、真机尚未验证的验收结论。
