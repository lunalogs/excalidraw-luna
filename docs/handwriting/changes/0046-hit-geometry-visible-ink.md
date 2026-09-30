# 0046 — R4：命中几何代表可见墨迹

- 执行者：Kimi；2026-09-29 本地；未提交（授权前仅工作区）。承接 0045。
- 范围：0044-R4 全部四项：采样/笔宽、mask 洞选择语义、擦除洞语义、alpha 精判落地。

## 修复

**Swift（`DocumentExporter.makeHitData`）**
- 真等弧长采样：0.25 索引步进插值 + ≥3pt 间距过滤，**两端点必留**（4 点短线从 1 样本 → ≥3 样本）；零长度笔生成退化线段保证 web 可命中。
- `width` = 控制点最大 size（真实笔触厚度）。旧代码用 `renderBounds.width`：横向长线 width=104（长度）被当粗胶囊，远端点误命中（0044 原生探针实测 34）。
- mask 仍以 bounds 导出（PencilKit 不公开 mask 多边形）。

**TS（`inkModel.ts`）**
- 洞语义改为**逐段减除**：`subtractRectFromSegment` 将 hole 世界矩形从每段中心线裁掉（Liang-Barsky 参数裁剪，0–2 段）。擦除：洞内点只有盘与洞界外残墨重叠才命中（不再整块 maskBounds 当洞）；套索：完全落在洞内的圈选不中（0044 web 探针场景），洞外残墨可选可擦。洞随世界变换缩放。
- 误差边界：洞边缘沿中心线的裁剪误差 ≤ halfWidth，由 alpha 精判兜底（注释明示）。

**TS（`InkLayer.tsx`）——alpha 精判真正落地**
- `createAlphaSampler`：preview PNG → canvas 2D → 每像素 alpha 缓存（per objectId+url，并发共享一次解码）；`sceneToPreviewPixel` 完成 scene→local→pixel 映射；`combineAlpha` 策略：**仅确定透明的采样**（false）能否定几何命中，true/unknown 保留几何结果——采样失败永不丢文档。
- 组件接线：pointerdown 经 `alphaSampler`+`toScene` 精判，透明像素（洞内/胶囊间隙）不选中且不拦截事件（穿透到画布）；sampler 抛错回退几何。

## 验证

- 原生：新增 `HitGeometryTests`（4 项，xcodegen 已重新生成工程）。0044 两探针入正式集：4 点短线 ≥3 样本+端点精确；100pt 横线 width ∈ [2.5, 6]。零长度笔 2 采样。全量 56/0 失败。
- 网页：新增 `lunacanvas-0046.test.tsx`（10 项）：洞内套索不选/残墨可选/擦除洞界语义/洞随变换/像素映射/缓存去重/unknown 策略/组件透明不选中+选中。全量 125 文件 / 1601 通过 / 47 跳过 / 1 todo；tsc、eslint --max-warnings=0 通过。

## 已知边界

- iOS 27 SDK 无法程序化构造带 mask 的 PKStroke（masks 源自画布橡皮），原生侧 hasMask=true 路径改由 TS fixture 覆盖（消费端语义已完整验证）；已在测试注释与记录声明。
- alpha 精判为中心点采样；擦除盘的半径由几何预筛处理（文档化）。

待续：0047 R5 统一历史、0048 R6 浏览器哈希、0049 R1 宿主接线、0050 R7 证据。
