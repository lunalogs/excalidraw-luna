# 进度与修改记录索引

## 当前执行（0050 完成，2026-09-30）

0044 R1–R7 **全部关闭**（记录 0045–0050，均已提交推送）。0050 完成证据修正：IMPLEMENTATION_STATUS 重写（N06 映射纠正、宿主接线状态、R1–R7 关闭表）、CODEX_REVIEW_PACKAGE 重写（提交链 SHA、浏览器闭环证据、yarn.lock 纯 registry 重写说明）、build-candidate.sh 硬化（无吞错/XCTest 写入器/排序相对路径树哈希/源码+原生 .app+xcodegen 实测哈希）——端到端跑通。剩余：真机验收（独立待验）、ShellView 挂载（下一里程碑）、W14 发布执行（待授权）。

## 当前Codex集中复核（0044，2026-09-29）

## 当前Codex集中复核（0044，2026-09-29）

## 当前Codex集中复核（0044，2026-09-29）

## 当前Codex集中复核（0044，2026-09-29）

## 当前Codex集中复核（0044，2026-09-29）

针对HEAD `4e5d2c45`（工作区起始干净），复核见[0044](changes/0044-codex-phase3-integration-review.md)。**不接受Phase 3 / W00–W14全部完成**：原生入口仍是P0三笔导出，ShellView/文件/历史未接App；网页墨迹模块未接宿主；原生保存重建空scene；资源引用、身份内容判断、命中几何和历史交错存在独立诊断失败。原生45项基线、tsc、严格lint通过不等于用户流程完整。

下一实现批次0045+按0044 R1–R7连续修复/集成，沿用完整执行任务书，无需逐条等Codex。本轮只新增文档与诊断证据，未修改正式源码、未提交/推送/部署。真机验收和实际发布仍单独待验；当前还存在无需设备即可完成的软件工作。最终测试统计以0044补记为准。

## 最新执行安排（2026-09-29，0030）

用户要求在Codex额度恢复前由Kimi连续完成全部工作，不再逐批等待复核。已新增[完整执行任务书](native/RELEASE_EXECUTION_PLAN.md)，涵盖W00–W14：0029修复→完整P1–P4→发布工程/候选包→授权后的上线核验。交接入口为[native/KIMI_HANDOFF.md](native/KIMI_HANDOFF.md)，规划记录[0030](changes/0030-complete-release-handoff.md)。下一实现批次从0031或下一空号开始；每批仍写记录、更新状态和证据。该安排不改变下方0029失败事实，不代表功能已实现，不自动发布。Kimi完成后交CODEX_REVIEW_PACKAGE集中复核。

## 当前原生P0复核（2026-09-29）

Codex复核0028，见[0029](changes/0029-codex-p0-recheck.md)。原生既有10项、网页manifest与固定比例缩放13项通过，ZIP/SHA256与单笔回放有实际进展。但独立原生4场景全部失败（重叠笔画变换、导出scene缺失、重开变换丢失、坏manifest接受为空）；TS两项独立探针失败（null entry抛异常、Swift真实输出不满足TS契约）。tsc退出2、严格lint退出1。**P0软件门槛仍未关闭**，下一批0030按0029 R1–R4修复并补真实跨端往返；R5保存先删原文件须在P1前保护。

当前HEAD `4b5d250b`，0025–0029仍未提交/未推送；本轮仅新增复核文档/证据，原实现和正式测试保留。左下100%/200%/300%及缩放锁继续保留，原生统一视口待集成。iPad手感、掌托、iCloud和性能仍未验证，设备不是上述软件问题的阻碍。

最后更新：2026-09-28。Codex已复核0020，见 [0021](changes/0021-codex-k1-acceptance.md)。**K1代码验收通过，本轮未发现新的阻塞问题**：不同ID同名双方保留、限长后缀、同ID幂等及恢复下拉框更新已验证。指定25项通过；额外3项独立边界探针通过（Kimi 已将其纳入正式测试集 `handwriting-0021-review.test.tsx`）；全量115文件/1542通过、47跳过、1todo；tsc、全部28个修改/未跟踪源码严格lint、构建通过。此前代码修复链结合各轮复核记录可关闭，但iPad人工验收与A18真实性能仍未验证，不能宣称完整产品验收通过。HEAD仍为5e49d5a4，全部修改保留未提交/未推送。下一步按USER_SETUP.md真机验收，后续批次从0022开始。

## 代码基线

- 仓库：`https://github.com/lunalogs/excalidraw-luna`
- 交接分支：`luna-design`
- 合并的远端起点：`da5db57cb36262d21b3ab80f80e45de27bd66150`（包含 Google Drive 功能）
- 第一阶段代码提交：`187dc674`，`feat: add tablet handwriting controls and editable file workflow`
- 本轮规划提交在第一阶段提交之后；Kimi 以实际最新检出 SHA 填写 M0，不以本文件中的短 SHA 猜测最新 HEAD。

## 阶段状态

| 阶段 | 状态 | 说明 / 记录 |
| --- | --- | --- |
| 第一阶段网页手写 | 已交付代码，真机待验收 | [0001](changes/0001-baseline-web-handwriting.md) |
| 第二阶段需求与验收规范 | 已交付文档 | [0002](changes/0002-kimi-handoff-plan.md) |
| M0 基线确认 | 已完成 | [0003](changes/0003-m0-baseline.md)：base SHA `36638fff`，tsc 通过，103 文件/1350 测试通过，与 ACCEPTANCE §D 一致 |
| M1 左上面板与独立文件入口 | 已完成 | [0004](changes/0004-m1-panel-reorganization.md)：双布局接通，左下入口删除，文件项入主菜单，6 项新 UI 测试 |
| M2 四参数笔刷模型 | 代码修复已复核，真机待验 | [0005](changes/0005-m2-brush-model.md)：四参数独立生效、共享轮廓、逐笔快照、legacy 逐位回归，23 项轮廓测试 |
| M3 个人预设 | 代码验收通过，真机待验 | [0006](changes/0006-m3-personal-presets.md)：CRUD/未保存三选/JSON 备份 UI，7 项 UI 测试 + 43 项逻辑测试 |
| M4 停笔规整 | G1代码修复已复核，真机待验 | [0007](changes/0007-m4-hold-to-shape.md)：状态机/预览/原子提交/恢复手绘，11 项端到端测试；真机手感未验证 |
| M5 集成验收 | 工程检查通过，真机/性能待验 | [0008](changes/0008-m5-integration-verification.md)：全量复验/构建/A01–A20 矩阵；A18 性能基准与真机项未验证 |
| M6 原生 iPad App | 已规划，待实施P0–P4 | 需设备/签名/分发方式，不阻塞网页 |

Kimi 每一批都更新相关行并链接新记录。实现不完整写“部分完成”，设备未测写“未验证”，不得默认勾选所有需求。

## Kimi 原始交付信息（审核结果以 0009 为准）

- Kimi 工作分支：`luna-design`（本地工作分支，未推送；仓库 `lunalogs/excalidraw-luna`）
- 实际 base SHA：`36638fff20494cc9a6b91186b2dca37c23be0802`（M0 检出）
- 交接实际 head SHA：`5e49d5a4`（包括 M5 交接文档）；此前文档只记录到 `ab4931c3`，此处补正。
- 完整提交列表（按序）：`2f602d35` docs: record M0 baseline → `6e4432a0` feat: phase-two M1/M2 handwriting brush panel, brush engine, and per-stroke snapshots → `fddd89d1` feat: personal brush preset management UI with JSON backup → `ab4931c3` feat: hold-to-shape recognition with preview, atomic commit, and restore → `5e49d5a4` docs: record M5 integration verification and final handoff info
- 类型检查、全量测试、无快照更新的复验、lint、构建结果（2026-09-25，Node v22.19.0，均无 yarn，用 node_modules 等价入口）：
  - `node node_modules/typescript/bin/tsc --noEmit` → 0
  - `node node_modules/vitest/vitest.mjs run --update --watch=false` → 0（M1/M2 时 151 个快照更新，差异仅新增 appState 字段与两个主菜单项，已逐文件核查）
  - `node node_modules/vitest/vitest.mjs run --watch=false`（不带 -u 复验）→ 0；**109 文件 / 1467 passed / 47 skipped / 1 todo**
  - `node node_modules/eslint/bin/eslint.js --max-warnings=0 <全部改动文件>` → 0；`prettier --check` → 干净；`git diff --check` → 0
  - 构建：`cd excalidraw-app && node ../node_modules/vite/bin/vite.js build` → 0（12.1s，PWA 产物生成；仅有 caniuse-lite 数据过期警告）
- 测试命令时间/统计：全量 36.66s，109 文件，0 失败；既有 Firebase 配置缺失诊断输出为基线既有现象（见 0003）
- 新旧 `.excalidraw` / 预设 JSON / 识别样本 fixture：识别样本在 `packages/element/src/handwriting/__tests__/shapeRecognition.test.ts`（mulberry32 seed=42 生成，60 正例 + 36 负例 + 25 组变换）；往返测试在 handwriting.test.tsx / handwriting-presets-ui.test.tsx
- 真机信息及证据：**未验证**。全部证据为桌面 jsdom / 终端。待用户 iPad 验收项见 ACCEPTANCE 人工列（轻重压、掌托、停笔手感、横竖屏/分屏、文件存 iCloud、恢复手绘录屏）
- 已知问题、未实现/偏离要求：
  1. M1：面板顺序与 UI-02 字面顺序有偏差（颜色用既有“Stroke”调色板，不在面板内重复取色器）；紧凑布局通用 stroke 控件与笔刷面板分属两个弹层（0004）
  2. M2：扁平度长轴方向 = nibAngle 的约定与 A06 文字描述存在矛盾，按算法描述实现（0005）；A07 画布/SVG/PNG 叠图为人工证据，未验证
  3. M3：三选未保存提示为面板内联 alertdialog 而非模态（0006）；PRE-04 真机刷新保留未验证
  4. M4：预览叠层在按住期间不随缩放实时重绘（提交几何不受影响）；SH-12 计时语义用真实定时器边界测试替代虚拟时钟（0007）；1.2s 默认手感未真机验证
  5. 极端细长矩形（长宽比 >~4:1）识别保守返回 null；轴比 0.82–0.9 的椭圆落入圆/椭圆模糊区返回 null（识别模块报告，属“模糊时宁可不转换”）
  6. M6 原生 App 未做（按 SPEC 为后续独立阶段）
- 原始 A01–A20 自评见 0008；Codex 审核修正见下表及 0009。

## Codex 审核状态（2026-09-27）

本批基于 `5e49d5a4` 的工作区修改，尚未提交/推送。记录：[0009](changes/0009-codex-review.md)。已修复压力 0.5 误判/压力单独变化、取消事件计时器、反向线坐标、未知版本降级、预设按钮切换保护、500px 左上入口。以下是产品验收状态，不等同于测试命令状态。

| 验收 | 当前结论 | 证据/缺口 |
| --- | --- | --- |
| A01 | 自动化通过，人工部分验证 | 768/500px 组件用例；IAB 确认 500px 修复后入口可展开，未测全设备 |
| A02 | 自动化通过 | 原逐笔快照、参数/工具切换用例；真实连续书写待测 |
| A03 | 自动化通过，真机未验证 | 文件往返/图片/取消；iCloud 系统界面未测 |
| A04 | 未通过 | 试写指针隔离 R4、触控/焦点证据 R6 |
| A05 | 现有数值测试通过 | 模拟压力分支灵敏度另需验证；真机未测 |
| A06 | 部分验证 | 现有几何用例通过；真实外观/导出对照未测 |
| A07 | 未通过 | R1 轮廓边界与命中未接通 |
| A08 | 部分修复 | 主画布 0.5/原地压变已测；R4/硬件降级与合并事件证据待补 |
| A09 | 未通过 | R2 采样频率依赖，附可复现诊断 |
| A10 | 自动化通过 | 新增未来版本降级；原往返与 legacy 用例通过 |
| A11 | 未通过 | 已补预设切换确认；R5 存储不可用与坏数据提示待修 |
| A12 | 现有自动化通过，人工未验证 | JSON 合并/冲突/备份；无自动上传代码改动 |
| A13 | 部分验证 | 新增虚拟时钟，默认 1.2s/缩放边界待补 |
| A14 | 部分验证 | 原候选取消/低置信样本通过，Pencil 真实文字待测 |
| A15 | 自动化通过 | 一次撤销、重做、恢复手绘；共享恢复提示生命周期仍需 R6 |
| A16 | 未通过 | 已修反向线；R3 转换后视觉线宽待修 |
| A17 | 部分修复 | cancel/lostcapture/hidden 虚拟时钟通过；剩余生命周期 R6 |
| A18 | 未验证完整交互性能 | 新增 Node 纯几何探针，不代表浏览器/iPad 性能 |
| A19 | 代码审查未见新增上传 | 未做完整离线/Network 人工记录 |
| A20 | 本批已补 | 记录原始失败与修复，补 head 索引/探针证据；截图录屏仍待补 |

本批最终工程复验：109 文件、1476 passed、47 skipped、1 todo（不更新快照），tsc / ESLint / Prettier / build / diff-check 通过，详见 0009 的最终复验表。

后续审核见0011–0013；当前待办以顶部0013摘要为准，下一批从0014开始。真实 iPad 项不得用桌面模拟代替。

## 记录规则

新增记录从`0003`开始。每一批记录与代码同一提交；提交后可在下一份记录补前一提交 SHA。不要重写历史记录掩盖失败或跳过真机验证。模板见[CHANGELOG_TEMPLATE.md](CHANGELOG_TEMPLATE.md)。
