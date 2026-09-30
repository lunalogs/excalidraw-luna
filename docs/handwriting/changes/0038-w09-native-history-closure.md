# 0038 — W09：原生编辑事务与统一历史闭环

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W09（连续执行第 8 批）
- 对应需求：N16/N17、W09 通过条件
- 状态：完成（软件层面）

## 本批内容

1. **`NativeInkHistory`（原生侧历史闭环）**：
   - `beginTransaction(label, units:)` **在编辑前**捕获当前 units 为回滚快照；`commit(units:)` 把前后快照合成**一条命令**并发射类型化 payload（objectId/nativeAssetRef/order/contentHash——与 BridgeCore 消息可直连）。
   - `cancel(units:)`：在途事务回滚——快照恢复、**不进历史、不发射**（N17）。
   - undo/redo 整命令粒度：写 3 笔一条命令、擦除一条命令，一次 undo 全量恢复；栈空返回 false（与网页门面语义对齐：空栈委托图形栈）。
   - 修改（局部擦除式）笔以**新 objectId + 新 hash** 进入 payload（身份版本替换，ADR-0002），测试固化。
2. **与既有组件的边界**：units 身份由 CanvasController 维护（0031 索引/指纹策略），NativeInkHistory 不重复判等，只记录快照——单一职责；迟到/重复消息由 BridgeSession 拒（W07），双重防线。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | **TEST SUCCEEDED：35 tests, 0 failures**（/tmp/native-w09g.log） |

## 风险与未完成项

- 与 excalidraw 图形历史的**交错顺序**（同一文档内 ink 命令与图形命令的全局序）在 W11 桌面入口接线时由宿主门面组装（网页侧 facade 已具备 graphics 委托语义）；原生壳内的最终接线随 W12 集成演示验证。
- 真机验证项不变（掌托/双击/事务时序）。

## 下一批

W10（本地/iCloud 文件与恢复）。PROGRESS.md 已更新。
