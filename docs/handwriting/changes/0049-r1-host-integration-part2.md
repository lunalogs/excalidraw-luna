# 0049 — R1（第二部分，完）：宿主接线 + 真实浏览器闭环证据

- 执行者：Kimi；2026-09-29 本地。承接 0049 part 1（e08c70a3）。
- 范围：0044-R1 剩余全部：网页编辑器宿主接线（打开/保存/叠层/交互）+ 模拟器与真实浏览器证据。至此 R1–R7 全部有落地（R7 证据修正归 0050）。

## 网页宿主接线

**`hostStore.ts`（新）**：宿主与墨迹模型之间的唯一桥（模块级单例+订阅）。`openLunacanvasInEditor` 打开容器→装控制器→通知；`saveLunacanvasFromEditor(scene)` 序列化编辑器 scene+墨迹编辑→重生成容器；打开非混合文件时自动关闭会话。

**接缝（均为既有正式入口，非平行路径）**
- 打开：`data/blob.ts loadSceneOrLibraryFromBlob` 开头按文件名识别 `.lunacanvas` → scene 走标准 `restoreElements/restoreAppState/calculateScrollCenter`；`components/App.tsx` 拖放处理器加同分支（`file?.name?.` 可选链——无名 Blob 不炸，修复了 drag&drop 回归）。
- 保存：`data/json.ts saveAsJSON` 在活动文档时输出重生成容器（`MIME_TYPES.lunacanvas` 已入 common 常量），扩展名/描述切换；其余保存行为不变。
- 叠层：`LunacanvasInkOverlay` 挂在 InteractiveCanvas 之后（graphics 之上、UI 之下，`z-index: 3`——修正了 canvases z-index 1/2 盖住墨迹的发现）；视口映射复用 `sceneCoordsToViewportCoords` 精确逆变换；交互：点选（alpha 精判）、拖拽移动（一次拖拽一条历史）、Delete 整体删除（控制器新增 `deleteSelection`，零编辑不产生历史噪音）。
- jszip 改动态导入：主包不膨胀（修复 workbox 2.3MiB 预缓存超限的构建失败）。

## 证据（真实浏览器，Playwright headless Chromium，脚本存 `evidence/0049-closed-loop.cjs`）

1. 拖放 Swift fixture → 墨迹层渲染（blob preview 有效 PNG：208×8、1224/1664 不透明像素）。
2. 矩形工具画矩形（graphics+ink 混合文档）。
3. 拖拽墨迹 → 选中（opacity 0.75 高亮截图 `0049-browser-open.png`/`0049-browser-moved.png`）。
4. 菜单→Export→Save to disk → 下载 `*.lunacanvas`。
5. 校验下载容器：`revision:1`、`worldTransform=[1.5,0,0,1.5,150,60]`（拖拽量精确 150/60）、scene 含矩形、4 资源、sha256 合规、零页面错误。**CLOSED-LOOP OK**。
6. 自动化环境修正（记录）：headless 无原生 save picker，须 `delete window.showSaveFilePicker`（browser-fs-access 用 `in` 判断，置 undefined 无效）。

## 其他

- fixture 重新生成（env 不进模拟器测试进程，改 `/tmp/lunacanvas-fixture-out` 哨兵文件触发）：现含 previews+hit；新增 `FixtureWriterTests`（env-gated，默认 no-op）。
- 新增测试：`lunacanvas-0049-overlay.test.tsx`（hostStore 往返、点选/拖拽/删除全指针交互、无文档不渲染）。
- 全量：网页 129 文件 / 1618 通过（Mermaid 快照在并行下有动画时序抖动，单独运行通过——既有 flaky，与本批无关）；原生 58/0；tsc/eslint 零警告；vite 构建绿。

## R1 遗留（诚实清单）

- 编辑器内图形↔墨迹的撤销交错：模型级与原生级已证（0047），编辑器宿主的全局 Ctrl+Z 仍走 excalidraw 历史——随原生桥（ShellView 挂载）落地时接通。
- ShellView 仍未挂载到运行 App（原生端现为 PKCanvasView 独立文档流；桥接属下一里程碑）。
