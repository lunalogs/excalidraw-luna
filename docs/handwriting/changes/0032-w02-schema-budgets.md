# 0032 — W02：文件 schema 双端一致、容器预算与路径规范

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W02（连续执行第 2 批）
- 起始 SHA：`4b5d250b` + 前述未提交内容
- 对应需求：N09/N11、RELEASE_EXECUTION_PLAN §4"文件契约与恢复能力"
- 状态：完成（软件层面）

## 本批内容

1. **TS 容器校验器** `lunacanvas/container.ts`：`CONTAINER_LIMITS`（条目 10k、解压总量 512MB、单条目 128MB、manifest 2MB、图像边长 16k）；`isSafeContainerPath` 与 Swift 镜像一致（拒正反斜杠/NUL/绝对/盘符/URL/.. 段/空段）；`validateContainerMetadata` 从**条目元数据**执行预算（先预算后解压，防 ZIP 炸弹）；`validateContainer` 全链路（元数据→manifest 契约→逐资源 byteSize+SHA-256）。8 项测试（路径正负、预算、端到端哈希、失败注入）。
2. **Swift 镜像**：`LunaArchive.ArchiveLimits` + `isSafeContainerPath` + open() 预扫描（重复路径/不安全路径/条目数/解压总量/manifest 大小全部在**任何解压前**拒绝）。新增 `testEnvelopeValidationRejectsDuplicatesAndUnsafePaths`。
3. **未知数据保留（N09）**：TS validator 对未知顶层/inkObject 字段放行并随 manifest 返回（测试固化）；Swift 读路径保留原 manifest 未解析字段的语义记录在案（写路径当前重建 manifest——P3 资源库接管时改为 dict 合并，已列入 W03 风险）。
4. **documentId/revision 语义**：Swift `CanvasController.documentId` 单文档稳定、revision 按成功事务递增（0031）；TS 校验 revision 非负整数。
5. **fixture 生成器修正**：macOS 编译型 PencilKit 二进制在本环境对 `PKDrawing(strokes:)` 确定性 Trace/BPT 崩溃（解释器模式正常——Apple 平台怪癖，0032 记录证据），改为**种子字节方案**：`fixtures/ink-seed.drawing`（真实 PKDrawing 负载，来自模拟器）+ 纯 ZIP/JSON 重建；生成器与 App 仍共享同一份 LunaArchive.swift（脚本 cmp 守卫）。fixture 重生成 + TS 全量容器校验 1/1 通过。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | **TEST SUCCEEDED：17 tests, 0 failures**（/tmp/native-w02d.log） |
| `vitest run lunacanvas-{fixture,container,manifest}.test.ts` | 1+8+11 = 20/20 |
| `tsc --noEmit` / eslint 改动集 | 0 / 0 |
| `scripts/native/gen-fixture.sh` | fixture 重生成（mtime 校验），TS 校验通过 |

## 风险与未完成项

- 未知 manifest 字段的**写路径**保留（Swift 重写不丢扩展）待 W03 资源库以 dict 合并实现；当前读路径不影响。
- ZIP 解压预算在元数据层强制（解压前），但单条目解压仍由 ZIPFoundation 流式处理——超大单条目在读取中被 byteSize 校验拦截（0031 已有 sizeMismatch）。
- macOS PencilKit 编译崩溃未深究（不影响 iOS 模拟器/真机路径）；如未来需要 macOS 侧真实笔画生成，优先改用解释器模式或 Instruments 取证。

## 下一批

W03（资源库：preview/hit 资源生成、资源生命周期、导入事务）。PROGRESS.md 已更新。
