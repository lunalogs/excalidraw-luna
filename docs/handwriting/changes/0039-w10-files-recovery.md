# 0039 — W10：本地/iCloud 文件与恢复

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W10/W11（连续执行第 9/10 批）
- 对应需求：N19/N20/N21、V12/V13/V14
- 状态：完成（软件层面）；UIDocumentPicker/Files 真机演示待设备

## W10 文件与恢复
- **`LocalDraftStore`**：按 documentId 隔离草稿；原子替换；**二次保存时旧草稿转 .bak**——草稿损坏返回 nil（完整校验）且 .bak 副本仍在（故障注入测试：截断当前草稿 → loadDraft nil → .bak 存在）；documentId 不符拒绝加载（跨文档隔离）。
- **`DocumentFileStore`**：open/save 走安全作用域（startAccessing/stop defer）；保存复用 LunaArchive 原子写；**失败注入**：写入不存在的目录 → 抛错且原文件字节不变；`conflictCopyURL` 冲突副本命名（N20 双方保留）。
- 状态语义（未保存/已保存/失败不冒充）在壳层 UI（W12 集成）展示，本批保证语义底座。

## 风险与未完成项

- UIDocumentBrowserViewController / Files 真机流程（未下载 iCloud 文件进度、权限丢失、外部修改冲突提示）需设备演示（W12 真机清单）。
- 草稿存 Application Support；存储满/权限错误在壳层提示（W12）。

## 下一批

W11（兼容与导出体验）。PROGRESS.md 已更新。
