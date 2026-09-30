# CODEX 集中复核包（W00–W14 连续执行）

主入口（本文）。日期：2026-09-29/30。执行者：Kimi。任务书：native/RELEASE_EXECUTION_PLAN.md。

## 1. 基线与版本状态

- 分支 `luna-design`；规划 base `4b5d250b`（0029 后网页稳定点）。
- 本段实施全部在**工作区未提交**状态完成（0025–0043 共 19 个记录批次）；网页既有部分（含 0023/0024 缩放功能）已推送至 `4b5d250b`。
- 已推/未推：见 §10 提交计划。已部署：推送后 Vercel 自动部署（现有项目 excalidraw-luna，配置已修复 0031 前）。
- 未跟踪清单：`git status`（apps/、docs/handwriting/native/**、packages/excalidraw/lunacanvas/、scripts/native/、fixture、jszip devDependency）。

## 2. 复核顺序与入口（推荐）

1. **文件兼容/源字节**：`changes/0031`（originalData/索引身份/原子保存）→ `apps/ipad/LunaCanvasTests/RoundTripTests.swift`（17 项）→ TS `packages/excalidraw/tests/lunacanvas-{manifest,container,fixture}.test.ts`（20 项）。
2. **身份/事务/桥生命周期**：`changes/0036/0038` → `BridgeSessionTests`（7）+ `NativeInkHistoryTests`（4）+ `IdentityMappingTests`（6）。
3. **渲染/命中**：`changes/0033/0034` → `DocumentExporter.makePreviewData/makeHitData` + TS `lunacanvas-inkmodel.test.ts`（9）。
4. **输入/性能**：`changes/0037/0041` → `InputCoordinatorTests`（6）+ `PerformanceBenchmarkTests`（数字见 0041）。
5. **发布证据**：`native/IMPLEMENTATION_STATUS.md`、`RELEASE_RUNBOOK.md`、`RELEASE_CANDIDATE.json`、本包 §5–§8。

## 3. W/N/V 矩阵

见 `native/IMPLEMENTATION_STATUS.md`（唯一权威矩阵，每项挂记录与未验证理由；本文不复制以免漂移）。

## 4. 0029 R1–R5 关闭证据

| 项 | 关闭记录 | 关键测试 |
| --- | --- | --- |
| R1 身份一对一 | 0031 | testCoincidentStrokesTransformIndependently / testDeletingFirstStrokeKeepsRemainingStrokesOwnId / testSameBoundsDifferentContentGetsNewId |
| R2 导出/变换闭环 | 0031 | testTransformSurvivesExportAndReopen / testWebDeletionRoundTripKeepsSurvivorIdentity / TS fixture 校验 |
| R3 坏 manifest | 0031/0032 | testMalformedContainersThrow / testTampered（真篡改重打包）/ TS null-entry |
| R4 工程检查 | 0031 | tsc 0、eslint 0（本轮复验 §9） |
| R5 危险覆盖 | 0031 | testFailedSaveKeepsPreviousFileBytes + LunaArchive 临时文件原子替换 |

## 5. 一次完整跨端往返（可重复步骤）

```sh
# 1) Swift 侧生成真实容器（macOS 直跑，与 App 同一份 LunaArchive.swift）
scripts/native/gen-fixture.sh
# 2) TS 侧全量校验（manifest 契约 + 逐资源 SHA-256 + scene 合法性 + 1.5x 变换）
node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/lunacanvas-fixture.test.ts
# 3) 原生侧完整回归（含三笔/删除/变换/篡改/原子失败/桥/历史/输入/文件/兼容）
cd apps/ipad && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas \
  -destination 'platform=iOS Simulator,id=C5D8FD6E-2292-4B3B-8475-E0A36BE6409A' \
  -derivedDataPath build test
```

fixture：`docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas`（哈希见 RELEASE_CANDIDATE.json）；生成器 `scripts/native/FixtureGen`（种子 `ink-seed.drawing`，真实 PKDrawing 负载，生成器与 App 共享 LunaArchive.swift 且脚本 cmp 防漂移）。逐步断言：manifest 契约、每资源字节哈希、scene type、worldTransform=1.5、原生重开单位数与哈希一致。

## 6. 测试命令、退出码与统计（最终轮，2026-09-30）

| 命令 | 退出码 | 统计 | 日志 |
| --- | --- | --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | 无诊断 | 终端 |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 0 | **123 文件 / 1587 passed / 47 skipped / 1 todo** | /tmp/final-web.log |
| `eslint --max-warnings=0 <全部改动+未跟踪 TS/TSX>` | 0 | 无警告 | /tmp/eslint-final.log |
| `scripts/native/build-candidate.sh` | 0 | vite 16.7s；原生 TEST SUCCEEDED（45 tests，含基准） | /tmp/candidate2.log |
| `git diff --check` | 0 | — | 终端 |
| 原生 destination/SDK | iPad Pro 11" (M5) 模拟器，iOS 27.0 SDK，Xcode 27.0 (27A266a)，DEVELOPER_DIR 方式（未改系统 xcode-select） | — | 各记录 |

日志持久性：/tmp 日志本轮有效；长期证据以记录文件 + RELEASE_CANDIDATE.json 为准（如 Codex 需要原始日志，选择脱敏后可纳入 evidence/）。

## 7. 构建/安装/发布

- 候选构建：`scripts/native/build-candidate.sh` → `native/RELEASE_CANDIDATE.json`（web 构建聚合哈希 `38e1c1be…`、fixture 哈希 `db13c0f1…`、xcodegen 哈希、签名状态）。
- 手册：`native/RELEASE_RUNBOOK.md`（安装/烟测/回滚/RC 清单/用户最小事项）。
- 签名缺口：模拟器构建无签名；真机安装需用户在 Xcode 选 Team——**未提供可安装 IPA，不虚构**。

## 8. 剩余问题（按严重性）

| 严重性 | 问题 | 阻塞 | 绕过 |
| --- | --- | --- | --- |
| 高 | 真机验收全项（ACCEPTANCE §A 录屏、手感对照、掌托、双击、横竖/分屏、局部擦除、Files iCloud/本地、离线恢复、V02/V03/V07/V15/V16/V17 设备数据） | 阻塞"最终可发布"判定 | 无（需用户 iPad）；设备侧一键清单见 RUNBOOK |
| 中 | mask 洞多边形独立提取（web 现以 preview alpha 精判规避） | 不阻塞（有可用路径） | preview alpha |
| 中 | 5000 笔导出 7.7s/首入量 9.7s（派生资源后台队列化） | 不阻塞 1000 笔目标 | 分批保存 |
| 低 | 图标占位、隐私文案、降级导出 UI 警告接线 | 不阻塞候选包 | 壳层文案 |

## 9. 网页阶段回归声明

网页手写功能（M1–M5 + review 链 0021 验收）位于已推送 `4b5d250b`；本轮未改动其源码（缩放功能 0023/0024 亦已推送）。本轮全量 1587 项通过包含其全部回归。

## 10. 提交计划（授权范围内）

按会话既有授权（用户此前明确要求更新 GitHub），本包完成后将 0025–0043 全部批次一次性提交并推送 `luna-design`（自动触发 Vercel 部署）；提交 SHA 与部署核验结果补记于本文件末尾。原生真机分发不在授权内，保持未执行。
