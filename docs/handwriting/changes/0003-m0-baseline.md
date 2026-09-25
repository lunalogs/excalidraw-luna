# 0003 — M0 基线确认

- 日期/执行者：2026-09-25 / Kimi
- 阶段：M0
- 父提交 / 起始 SHA：`36638fff20494cc9a6b91186b2dca37c23be0802`（`docs: define advanced handwriting requirements and Kimi review workflow`，实际检出的 luna-design HEAD，从 git rev-parse 读取）
- 本次提交标题：`docs: record M0 baseline for phase-two handwriting work`
- 对应需求 ID 与验收 ID：M0（SPEC §6）、A20、B 节工程基线
- 状态：完成

## 本批解决的问题

第二阶段开工前的基线固化：确认检出 SHA、工具版本、基线测试通过情况，与 ACCEPTANCE.md §D 记录对比，作为后续所有批次对比的基准。

## 改动文件

| 文件 | 改动及原因 | 影响面 |
| --- | --- | --- |
| docs/handwriting/changes/0003-m0-baseline.md | 新增基线记录（本文件） | 文档 |
| docs/handwriting/PROGRESS.md | M0 行更新为已完成并链接本记录 | 文档 |

## 设计与数据兼容

无代码改动，无新依赖，无数据格式变化。

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-25, macOS, Node v22.19.0，无 yarn 命令 | `git rev-parse HEAD` | 0，输出 `36638fff20494cc9a6b91186b2dca37c23be0802` | 本文件 |
| 同上 | `node node_modules/typescript/bin/tsc --noEmit` | 0，无输出（类型检查通过） | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --watch=false` | 0，**Test Files 103 passed (103)；Tests 1350 passed \| 47 skipped \| 1 todo (1398)；Duration 37.34s** | 终端输出 |

快照差异说明：无快照更新（未运行 `-u` 版本）。真机状态：未验证，仅桌面终端。基线与 ACCEPTANCE.md §D（103 文件 / 1350 通过 / 47 跳过 / 1 todo）完全一致；Firebase 配置缺失的 stderr 诊断输出为既有现象，测试仍通过，与 §D 描述一致，不视为手写功能依赖 Firebase。

## 风险与未完成项

- 本机无 `yarn` 命令，采用 ACCEPTANCE.md §B 给出的等价 `node node_modules/...` 入口，后续批次沿用并逐批记录。
- 第二阶段功能（M1–M5）均未开始，基线通过不代表第二阶段任何条目通过。

## 下一批与交付状态

下一批：M1 面板重组（UI-01–UI-08，文件入口独立迁移）。无需用户额外准备设备或凭据。PROGRESS.md 已更新。
