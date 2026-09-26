# 进度与修改记录索引

最后更新：2026-09-25。M0–M5 全部完成（[0003](changes/0003-m0-baseline.md)–[0008](changes/0008-m5-integration-verification.md)），待 Codex review 与真机验收。

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
| M2 四参数笔刷模型 | 已完成 | [0005](changes/0005-m2-brush-model.md)：四参数独立生效、共享轮廓、逐笔快照、legacy 逐位回归，23 项轮廓测试 |
| M3 个人预设 | 已完成 | [0006](changes/0006-m3-personal-presets.md)：CRUD/未保存三选/JSON 备份 UI，7 项 UI 测试 + 43 项逻辑测试 |
| M4 停笔规整 | 已完成 | [0007](changes/0007-m4-hold-to-shape.md)：状态机/预览/原子提交/恢复手绘，11 项端到端测试；真机手感未验证 |
| M5 集成验收 | 已完成 | [0008](changes/0008-m5-integration-verification.md)：全量复验/构建/A01–A20 矩阵；A18 性能基准与真机项未验证 |
| M6 原生 iPad App | 后续阶段 | 需设备/签名/分发方式，不阻塞网页 |

Kimi 每一批都更新相关行并链接新记录。实现不完整写“部分完成”，设备未测写“未验证”，不得默认勾选所有需求。

## 最终交付信息（Kimi 提交，待 Codex review）

- Kimi 工作分支：`luna-design`（本地工作分支，未推送；仓库 `lunalogs/excalidraw-luna`）
- 实际 base SHA：`36638fff20494cc9a6b91186b2dca37c23be0802`（M0 检出）
- 实际 head SHA：`ab4931c3`（M4 提交后）
- 完整提交列表（按序）：`2f602d35` docs: record M0 baseline → `6e4432a0` feat: phase-two M1/M2 handwriting brush panel, brush engine, and per-stroke snapshots → `fddd89d1` feat: personal brush preset management UI with JSON backup → `ab4931c3` feat: hold-to-shape recognition with preview, atomic commit, and restore
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
- A01–A20 矩阵（另见交付回复正文）与 Codex review 结论：待 review

## 记录规则

新增记录从`0003`开始。每一批记录与代码同一提交；提交后可在下一份记录补前一提交 SHA。不要重写历史记录掩盖失败或跳过真机验证。模板见[CHANGELOG_TEMPLATE.md](CHANGELOG_TEMPLATE.md)。
