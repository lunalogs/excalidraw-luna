# 0047 — R5：统一文档命令历史（单一有序协调器）

- 执行者：Kimi；2026-09-29 本地；未提交。承接 0046。
- 范围：0044-R5。"两套独立栈"改为**一个有序文档命令协调器**。

## 修复

**TS（新增 `documentHistory.ts`，重构 `inkEditing.ts`）**
- `DocumentHistory`：单一 undo/redo 栈，`DocumentHistoryEntry{kind,label,undo,redo}`；push 清空 redo 分支；undo/redo 返回被遍历的条目（kind 供 UI 区分 ink/graphics）。
- `InkEditingController` 构造改为 `(objects, history?, onChanged?)`：墨迹命令经 `commit(label, next)` 进共享栈（before/after 不可变快照闭包，undo/redo 不触碰 objectId/顺序/hash）；`recordGraphics(label,undo,redo)` 是图形命令的正式注册入口——**不再存在"墨迹栈空才委托图形"的 fallback**；undo/redo 纯委托协调器。删除 `InkCommand`/双栈。
- `onChanged(objects, cause)` 供宿主同步 UI。

**Swift（新增 `Bridge/DocumentHistory.swift`，重构 `NativeInkHistory`）**
- `DocumentHistory` 同上（kind: ink/graphics/web）；`NativeInkHistory` 的事务 commit 作为 `.ink` 条目进共享栈（闭包经 `UnitState` box 改共享 units，weak 捕获防循环）；`undo(units:)`/`redo(units:)` 走协调器——栈顶是图形就先撤销图形。`cancel` 不进历史/不发射。`emittedPayloads` 保持为载荷载体，桥实际发送属 R1 接线（注释标明）。

## 验证

- TS 新增 `lunacanvas-0047.test.ts`（4 项）：**0044 探针场景**——墨迹移动→图形 add→undo 先撤销图形（移动仍生效）再撤销墨迹；ink→graphics→ink→graphics 全量 undo/redo 严格逆序往返；新命令失效 redo 分支；onChanged 上报 commit/undo/redo。inkediting 旧测试适配新 API（graphics 测试改为 recordGraphics 入共享栈）。11/11 通过。
- 原生：`NativeInkHistoryTests` 全部改查 `coordinator.undoStack`；新增交错测试（ink write→graphics→undo 先 graphics 后 ink，redo 镜像）。57/0 失败。
- tsc/eslint --max-warnings=0 通过。

待续：0048 R6 浏览器哈希、0049 R1 宿主接线、0050 R7 证据。
