# 0045 — R2+R3：混合文档保存与精确内容身份

- 执行者：Kimi；2026-09-29 本地。基线：luna-design 4e5d2c45 + 0044 记录（工作区含 0044 未提交记录/证据文件，本轮不触碰）。
- 范围：0044-R2（保存混合文档丢图形/资源）+ 0044-R3（粗指纹漏判笔迹修改）。按 0044 指令"优先 R1/R2/R3 文件与接线"中的文件层先行，R1 宿主接线留 0049。
- 授权状态：本轮**无提交/推送**（过程规则：显式授权前只改工作区）。

## R2 修复：保存从完整文档出发

**Swift（`LunaArchive.swift` / `DocumentExporter.swift` / `DocumentFileStore.swift`）**
- `LunaArchive.export` 新增 `sceneData: Data?`（nil 才写空场景——仅限 fixture/legacy 调用方）与 `preservedEntries: [(path, Data)]`。`DocumentFileStore.saveDocument` 全量透传，调用方必须传真实 scene，否则图形丢失（代码注释明示）。
- `LunaArchive.open` 返回 `preservedEntries`：凡不被已知 schema 消费的条目（scene 图片文件、外来资源）逐字节保全；per-inkObject 未知字段进 `inkObjectExtras`，重导出时合并回 manifest（writer 已知键优先）。
- 写路径冲突即失败：preserved 条目与生成路径（manifest/scene/ink/previews/hit）重名 → `invalidManifest`，绝不静默覆盖。
- `splitFrom` 进入 inkObject 条目（身份图写路径）。

**TS（`inkModel.ts`）**
- `InkObject` 新增 `assetRef/previewRef/hitRef`：parse 时**逐字保留**容器 refs，serialize 写回原文；null（明确无该资源）→ 省略，undefined（未绑定，测试）→ 回退 objectId 派生路径。0044 独立诊断"合法 asset-v2 资源路径被 serialize 重造为不存在的引用"修复。

## R3 修复：精确内容身份

**`CanvasView.swift`**
- 删除几何指纹（bounds/count/RGBA）。`contentDigest` = sha256 覆盖**全部可见内容属性**的规范化二进制编码：ink 类型+颜色、transform、mask 存在性+bounds、路径每点（location/timeOffset/size/opacity/force/azimuth/altitude）。
- 关键实证：`PKDrawing.dataRepresentation()` 含不稳定元数据，同一笔重复序列化字节不同（首轮实现用它做 digest 导致重复快照全部换 id，测试当场抓住）；几何摘要又瞎于压力修改（0044 探针实证）。故两者皆不可用。
- 匹配算法：O(n) 索引对齐 digest 快路径（全等即不动）→ 不等时 digest 一对一消费匹配 → 未匹配新区间在匹配锚点之间按**文档顺序**配对父单元（LCS 式 diff；1→m 区间共享父 = split 关系；纯插入父为 nil）。PencilKit 不提供逐笔修改事件，这是可取得的最强归因，注释与记录均明示。
- `InkUnit.replacedObjectId` → manifest `splitFrom` 边；加载时从文件恢复。
- N08 语义修正：新建单元的 `originalData` = 创建时序列化（编辑后的新基线），保持"未编辑即逐字节重导出"；文件加载路径仍用原始 rawData。

## 验证

- 原生：52 tests / 0 failures（45 旧 + 7 新 `MixedDocumentTests`）。新增场景：混合 scene（矩形+文字）经真实 saveDocument→openDocument→再保存逐字节保全；外来条目（scene 图片/foreign bin）全周期逐字节保全；inkObject 未知字段 save/reopen/resave 保全；非 objectId 资源名重导出不变；**仅压力修改（0.2→0.9，同 bounds/同点数/同色）→ 新 id**（0044 原生探针场景入正式集）；1→2 split 两子均带 splitFrom 且入 manifest；中部纯插入不冒领父身份。
- 网页：`lunacanvas-0045.test.ts` 4 项（asset-v2 refs 逐字保留/移动编辑不改 refs/显式缺省 refs 不伪造/非 objectId 命名 manifest 通过校验）。全量 124 文件 / 1591 通过 / 47 跳过 / 1 todo（低并发复验模式）。
- tsc 0 错误；eslint --max-warnings=0 通过；Swift 侧 deprecated Archive init 改 throwing 重载、unused-result 清零（构建无新增警告）。

## 已知边界

- digest 编码覆盖 PencilKit 公开的全部内容属性；若未来 Apple 增加新属性需同步编码器（注释已标注）。
- 身份归因的"删一笔+改一笔"歧义按文档顺序取首个候选（LCS 语义），记录为设计决策。
- R4（命中几何）/R5（统一历史）/R6（浏览器哈希）/R1（宿主接线）/R7（证据）按 0046–0050 继续。
