# 0040 — W11：旧 .excalidraw 兼容与降级导出

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W11（连续执行第 10 批）
- 对应需求：N21、V14
- 状态：完成（软件层面）

## 本批内容
- **`CompatImporter.sniff`**：按**内容**识别（PK 头 = .lunacanvas；JSON type=excalidraw = 旧格式），扩展名不作数；旧场景字节原样透传为零 ink 文档（**不假装已转 PencilKit**——N21）；垃圾文件拒绝导入。
- **`CompatExporter.exportSceneOnly`**：降级导出场景字节（atomic），返回 `DowngradeReport.sceneOnly(inkObjectCount)` 让 UI 明确提示原生编辑性损失；调用约定：禁止覆盖混合唯一原文件（壳层 W12 强制另选路径）。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | **TEST SUCCEEDED：44 tests, 0 failures**（/tmp/native-w11c.log） |

## 风险与未完成项

- UIDocumentBrowserViewController / Files 真机流程（未下载 iCloud 文件进度、权限丢失、外部修改冲突提示）需设备演示（W12 真机清单）。
- 草稿存 Application Support；存储满/权限错误在壳层提示（W12）。

## 下一批

W12（性能基准 + IMPLEMENTATION_STATUS）。PROGRESS.md 已更新。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | TEST SUCCEEDED：44 tests, 0 failures（与 0039 同轮运行，/tmp/native-w11c.log；含 W11 新增 4 项） |

## 风险与未完成项

- 降级导出的 UI 警告文案与"禁止覆盖唯一混合源"的壳层强制在 W12/W13 接线；导出菜单入口在桌面集成时复用同一 CompatExporter。

## 下一批

W12（性能基准 + 实施状态矩阵）。PROGRESS.md 已更新。
