# 0031 — W01：0029 全部 R1–R5 修复 + 三笔真实跨端往返闭环

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W00/W01（连续执行第 1 批；任务书 RELEASE_EXECUTION_PLAN）
- 起始 SHA：`4b5d250b` + 0025–0030 未提交内容（Codex 更新了 native 合同文档，均保留）
- 本次提交：未提交（任务书 W14 前不自动发布；提交沿用既有授权时执行）
- 对应需求：0029-R1..R5；N07/N08/N11/N14；V05/V08/V09
- 状态：完成（软件层面）；真机项仍未验证

## 修前失败 → 修后通过

### R1 身份：索引关联贯穿变换链 + 会话级身份持久
- `applyWebTransformsToCanvas` 改为**纯索引 1:1 关联**（updateUnits 按笔画顺序构建 units），删除指纹单值字典。烘入与归一同一事务完成，id 原样保留（新增 `testCoincidentStrokesTransformIndependently`：同点两笔只变换第一笔，第一笔 156±4、第二笔 104 不动、id 全保留、矩阵归一）。
- **会话边界身份**：新增 `CanvasController.load(from:canvas:)`——从文件重建时 id 来自 inkObjects 顺序关联（1:1），几何指纹不参与跨会话身份（新增 `testWebDeletionRoundTripKeepsSurvivorIdentity`：导出 2 笔 → 网页删第 1 笔 → 原生 load 剩余 → 再存再开，幸存笔 id 与字节哈希不变）。
- **未编辑字节保真（N08/V08）**：`InkUnit.originalData` 保存原始资源字节，未被编辑的笔画再导出时**逐字节复用**（实测：解码后重新包装的 PKDrawing 序列化字节不同——这是真实协议陷阱，记录）。编辑（烘入/用户墨迹/mask 变化）才丢弃。
- 自由手绘编辑路径仍用指纹+消费匹配（同名同内容笔画的固有歧义已写入 ADR-0002 策略节：不冒认、事务替换；P1 持久映射接管）。新增同点重画/删前笔/同 bounds 不同颜色 3 项身份测试（0028 已加，本轮保留）。

### R2 变换与文件往返
- 变换随文件往返：`ImportedInkUnit.transform` 保留，导出写入 worldTransform；`testTransformSurvivesExportAndReopen` 断言重开后矩阵 1.5 且按矩阵重建几何宽度一致。
- **真实 scene 资源**：导出写入 `scene/excalidraw.json`（合法空 Excalidraw 场景）并登记哈希/大小——Swift 实际产出现通过 TS 校验（见跨端流水线）。
- 原型 UI "Simulate web transform" 按钮接通真实回放（applyWebTransformsToCanvas）。

### R3 坏 manifest 可靠失败（双端）
- Swift `LunaArchive.open` 全结构校验：非 JSON/非对象/坏 type/schemaVersion/documentId/revision/capabilities/layerStrategy/inkObjects 一律 throw `invalidManifest`，无 `?? []` 默认空文档；重复 objectId、资源表缺引用、字节数不符、哈希不符分别 throw。新增 `{}` 与未来版本 999 两容器级测试。
- TS `validateManifest`：null ink entry 返回结构化错误不再抛 TypeError（Codex 探针场景）；capabilities 收窄类型修复（0029-R4 的 tsc 退出 2）；prettier 警告清零（R4）。
- **真实篡改测试**：重打包 ZIP 替换某 entry 字节 → open 抛 hashMismatch（替换掉 0028 的"两个无关哈希不相等"充数断言）。

### R5 原子保存
- `LunaArchive.export` 先写同目录临时文件、再 `replaceItemAt` 原子替换；失败清理临时文件，目标文件不动。`preFail` 注入测试：写入中途失败 → 旧文件字节逐位不变。模拟器路径与将来真机路径同一实现。

### W00 工程
- 归档核心抽为平台无关 `LunaArchive.swift`（无 PencilKit/UIKit），iOS App 与 **macOS fixture 生成器编译同一份源码**（`scripts/native/gen-fixture.sh` 先 cmp 后拷贝，漂移即失败）——解决模拟器测试进程沙箱无法写仓库路径的问题（实测：xcodebuild test 环境变量被剥、容器写 macOS 路径被重定向；改为 macOS 直跑 PencilKit，exit 133 的 SPM 拆解期怪癖以 mtime 校验兜住，注释在脚本内）。

### 跨端往返闭环（任务书 W01 通过条件）
`scripts/native/gen-fixture.sh`（macOS/Swift 写出真实 .lunacanvas）→ `packages/excalidraw/tests/lunacanvas-fixture.test.ts`（TS/jszip 校验：manifest 契约 + 每个资源 byteSize 与 SHA-256 对实际字节 + scene 合法性 + 1.5x 变换存在）——**1 项通过**。fixture 落库 `docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas`。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| apps/ipad/LunaCanvas/Document/LunaArchive.swift | 新增：平台无关归档核心（写出/严格读/原子保存/SHA-256） |
| apps/ipad/LunaCanvas/Document/DocumentExporter.swift | 薄适配层（PKDrawing↔bytes + 错误映射） |
| apps/ipad/LunaCanvas/Canvas/CanvasView.swift | 索引关联回放、load(from:)、originalData 贯穿、setTransform、稳定 documentId/revision |
| apps/ipad/LunaCanvasTests/RoundTripTests.swift | 重写：篡改/删除往返/变换跨文件/同点独立变换/原子失败/malformed；移除沙箱不可靠的 fixture 写入测试 |
| packages/excalidraw/lunacanvas/manifest.ts | capabilities 类型收窄、null-entry 守卫（R3/R4） |
| packages/excalidraw/tests/lunacanvas-manifest.test.ts | 11 项 |
| packages/excalidraw/tests/lunacanvas-fixture.test.ts | 新增：Swift 产物 TS 校验（jszip） |
| scripts/native/FixtureGen/ + gen-fixture.sh | macOS 生成器（共享 LunaArchive.swift） |
| docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas | 真实跨端 fixture |
| apps/ipad/README.md | 流水线与构建命令更新 |

新依赖：jszip 3.10.1（MIT，devDependency，fixture 校验用）。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test`（同 0026 destination） | **TEST SUCCEEDED：15 tests, 0 failures**（/tmp/native-w01k.log） |
| `scripts/native/gen-fixture.sh` → vitest fixture 测试 | 1/1 通过 |
| `vitest run packages/excalidraw/tests/lunacanvas-manifest.test.ts` | 11/11 |
| `tsc --noEmit` / `eslint --max-warnings=0 <manifest 两文件>` | 0 / 0（0029-R4 关闭） |

## 风险与未完成项

- 自由手绘期同内容笔画的身份歧义为已知限制（ADR-0002 策略节，P1 持久映射）。
- `PKDrawing(data:)` 解码未编辑笔 + 重包装的字节差异由 originalData 规避；若未来直接编辑解码笔画需同步清 originalData（已在 InkUnit 注释标明）。
- 叠色 RMSE 0.0234 为合成 fixture 数值；真机视觉评审待用户。
- 左下 100/200/300% 与缩放锁未触碰（既有测试 3 项通过）。

## 下一批

W02（schema 双端一致/预算/路径规范）。PROGRESS.md 已更新。
