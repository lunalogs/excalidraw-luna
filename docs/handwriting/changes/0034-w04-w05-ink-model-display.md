# 0034 — W04/W05：网页墨迹模型、显示层与选择几何

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W04/W05（连续执行第 4 批）
- 对应需求：N03/N08/N13/N15 的网页侧模型层；W05 通过条件（模型/渲染/命中/选择接同一模型）
- 状态：模型与显示层完成（软件层面）；网页 UI 接线随 W08 壳层进入宿主

## 本批内容

1. **`lunacanvas/inkModel.ts`**：
   - `InkObject` 运行时模型（objectId/transform/order/hash/previewUrl/deleted/splitFrom/replacedBy）；transform 复用 manifest 的**等比正缩放+平移**写规则（`isWritableTransform`），网页侧同样拒绝错切/非等比/负缩放。
   - **可编辑范围白名单（N08）**：`applyInkEdit` 只接受 set-transform/delete/set-order——网页无法触碰 drawing 字节、hash 随对象透传。
   - **选择几何**：橡皮胶囊命中（`isInkHitByEraser`：笔宽随 transform 缩放；**mask 洞内不命中**——N15）、套索整笔选择（`isInkSelectedByLasso`：多边形与胶囊相交或整体包含，跨圈边整笔选中不切割——N13），全部在世界坐标计算。
   - manifest inkObject ↔ 模型双向序列化（含 split/replaced 图）。
   - **命中策略记录**：权威可见遮罩（含局部擦除洞）= 预览 PNG alpha（浏览器内 InkLayer 精判路径）；hit JSON 中心线胶囊为确定性几何路径（jsdom 可测），两者并存，容差写入本记录。
2. **`lunacanvas/InkLayer.tsx`**：纯显示层——按 worldTransform 锚点+缩放渲染 preview PNG（img 绝对定位），整笔点选回调（shift 累加），选中反馈。宿主注入 `toViewport`（W08 定稿映射，ADR-0003）。jsdom 测试 3 项（世界锚点/世界缩放、删除隐藏+整笔选择、选中反馈）。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `vitest run lunacanvas-inkmodel.test.ts` | 9/9（含橡皮洞负例、套索三态、transform 拒绝、序列化往返） |
| `vitest run lunacanvas-inklayer.test.tsx` | 3/3 |
| tsc / eslint 改动集 | 0 / 0 |

## 风险与未完成项

- InkLayer 未挂载进 excalidraw 宿主画布——W08 壳层（网页打包/桥）完成接线；桌面编辑器入口在 W11 随菜单工作接入同一控制器。
- 浏览器内 preview-alpha 精判路径（相对几何容差的差异量化）在 W12 视觉对照批次补证据。

## 下一批

W06（网页混合整理与统一历史）。PROGRESS.md 已更新。
