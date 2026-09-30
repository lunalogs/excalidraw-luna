# 0049 — R1（第一部分）：原生真实文档入口 + 网页文档打开/保存模块

- 执行者：Kimi；2026-09-29 本地。承接 0048（R2–R6 已提交 f0453866）。
- 范围：0044-R1 的文件层与模块层，为 App.tsx 宿主挂载（0049 第二部分）铺路。

## 原生 App 入口（`LunaCanvasApp.swift` 重写）

- 删除"Export 3 strokes / Simulate web transform" P0 按钮与 `try?` 吞错。
- 真实文档流程：**打开**（`.fileImporter` 文档浏览器，.lunacanvas 类型）→ `DocumentFileStore.openDocument` → `load(from:canvas:documentId:revision:)`（身份/版本随文件恢复）；**保存**走真实原子保存入口，**全页**写入：units + 原 sceneData + preservedEntries（0045-R2 全链路），保存后重开校验并把 imported 状态更新到新 revision；**另存为**（生成到临时文件 → share sheet）；**新建**（`resetForNewDocument`：新 documentId/空画布/revision 0）。
- 错误全部经 alert 可见（打开/保存失败保留旧文件）。
- `CanvasController`：`documentId` 改 `private(set) var`（新建/加载可换身份）。
- 验证：xcodebuild test 57/0；含新入口编译。

## 网页文档模块（新增 `webDocument.ts`）

- `openLunacanvasDocument(data)`：真实 ZIP（0048 适配层）→ manifest+scene+InkObject 列表（hit JSON 解析、blob preview URL、外来资源保全）。
- `saveLunacanvasDocument(input)`：重新生成容器——scene 替换为编辑器当前 scene；未修改资源**逐字节复制**（N08）；**被删对象连同其专属条目整体退出**（资源生命周期跟随删除事务）；manifestExtras/未知字段保全；resources 表带真实 sha256。
- 实测修正：jszip node 构建不接受 Uint8Array/跨 realm ArrayBuffer——按环境选 Buffer/ArrayBuffer。

## 验证

- 新增 `lunacanvas-0049-webdocument.test.ts`（3 项）：Swift fixture 打开（scene/对象/hit/1.5x 变换）；web 移动+scene 修改→保存→严格校验再打开——编辑保留、未动 drawing 字节逐字节一致、revision+1；删除对象保存后彻底消失且通过严格校验。
- 全量：128 文件 / 1614 通过 / 47 跳过 / 1 todo；tsc、eslint --max-warnings=0 通过；原生 57/0。

## 待续（0049 第二部分 / 0050）

- App.tsx 宿主挂载（.lunacanvas 文件打开/保存接 excalidraw 编辑器入口、InkLayer/InkEditingController 叠层、统一历史接图形命令）+ 模拟器/真实浏览器闭环截图证据。
- ShellView 桥接线（WKWebView handler 注册已在 W07 具备，需挂载到运行 App）。
- 0050 R7：状态矩阵/复核包重写、build-candidate 硬化（gen-fixture `|| true` 移除、排序相对路径 hash、源码 SHA）、yarn.lock 说明。
