# 0035 — W06：网页混合整理与统一历史（模型与控制器层）

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W06（连续执行第 5 批）
- 对应需求：N13/N14/N15/N17、W06 通过条件（模型层部分）
- 状态：模型/控制器层完成；宿主画布接线（套索手势 UI、图形互操作）随 W08 壳层

## 本批内容

1. **`lunacanvas/inkEditing.ts` — InkEditingController**：
   - 套索选整笔（复用 N13 几何，返回 id 集）；移动（场景增量，一条历史）；**固定锚点等比缩放**（世界空间绕锚点，拒绝负/非有限因子；contentHash 不动——N08）；拒绝错切/非等比路径复用模型层规则。
   - **橡皮扫掠一次事务（N15）**：扫掠点集去重命中多笔 → 单条历史（hitIds 标记），undo 一次恢复全部、redo 再删；mask 洞点永不命中（测试固化）。
   - **统一历史门面（N17）**：ink 命令栈与"图形标记"交错——ink 空时 undo/redo 委托宿主的 excalidraw 历史回调，单一入口；cancel 用 reset 丢弃在途事务不进历史。
   - undo/redo 恢复的是**变换值与 deleted 标志**——objectId、order、资源引用全程不动（测试断言）。
2. **审计边界（计划 §5）**：模型层只暴露 set-transform/delete/set-order 三种编辑（applyInkEdit 白名单），复制/分组/锁定等入口在 W08/W11 宿主接线时逐一支持或显式禁用，记录将随批次补充。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `vitest run lunacanvas-inkediting.test.ts` | 7/7（套索+移动单历史、锚点缩放+哈希不变、非法因子拒绝、扫掠单事务+撤销重做、洞负例、graphics 委托门面、cancel 回滚） |
| lunacanvas 全部（model/layer/editing/container/manifest/fixture） | 39/39 |
| tsc / eslint（含 no-mixed-operators 冲突重构为 aboveI/aboveJ） | 0 / 0 |

## 风险与未完成项

- 图形侧（excalidraw 元素）与 ink 的**混合选择集**、绑定箭头随动、锁定对象排除等在宿主接线批次（W08 网页壳/W11 桌面入口）实现并补测试；控制器已具备所需的纯 ink 语义。
- 非等比/旋转/镜像控件对含 ink 选择的禁用说明在 UI 批次实现。

## 下一批

W07（原生离线壳与资源桥）。PROGRESS.md 已更新。
