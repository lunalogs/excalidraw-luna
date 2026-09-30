# 0033 — W03：文件资源库——preview/hit 派生资源、未知字段写路径保留、资源分级

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W03（连续执行第 3 批）
- 对应需求：N08/N09/N10、W03 通过条件
- 状态：完成（软件层面）

## 本批内容

1. **派生资源生成（原生导出）**：每个 unit 随容器携带
   - `previews/<id>.png`：PKDrawing 公开 API 渲染（scale 2），web 不可解码 PencilKit 时的显示与命中依据；
   - `hit/<id>.json`：粗命中几何（bounds + renderBounds 笔宽 + ~4pt 弧长采样中心线 + hasMask/maskBounds）。**近似策略记录**：权威可见遮罩（含局部擦除洞）= 预览 PNG 的 alpha 通道，web 侧套索/命中以 preview alpha 精判、hit JSON 仅作粗筛；容差与策略写入本记录（mask 洞的多边形提取留 P2 细化）。
2. **资源分级语义**：drawing 原始字节唯一不可丢（N08，originalData 机制 0031）；preview/hit 为可重建缓存类资源，iPad 可再生成。资源表全部登记哈希/大小，TS/Swift 校验一致（W02）。
3. **未知字段写路径保留（N09）**：`ImportedDocument.manifestExtras`（读时收集非已知顶层键）→ 再导出时 `manifestExtras` 合并回 manifest（已知键不被覆盖）。测试：futureExtension 完整往返。
4. **导入事务语义**：open() 全量校验通过后才返回候选文档（值语义），调用方替换当前文档——失败路径天然不动旧文档（0031 篡改测试 + 本批资源测试固化）。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | **TEST SUCCEEDED：18 tests, 0 failures**（/tmp/native-w03e.log） |
| TS `vitest run lunacanvas-*.test.ts` | 20/20（fixture 走全量容器校验，无 preview 的兼容路径也覆盖） |
| tsc / eslint | 0 / 0 |

## 风险与未完成项

- mask 洞的几何化（CGPath 提取）未做——web 靠 preview alpha 规避；P2 若需要独立 hit 多边形再实现。
- 预览为同步生成（单笔毫秒级）；批量导出的大文档异步化在 W12 性能批次按基准证据决定。
- 资源 GC/生命周期（撤销中引用保护）随 W06 历史集成一并实现，本批仅保证字节与引用完整。

## 下一批

W04/W05（网页墨迹模型与显示）。PROGRESS.md 已更新。
