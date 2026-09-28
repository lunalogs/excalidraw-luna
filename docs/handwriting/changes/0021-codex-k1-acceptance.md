# 0021 — Codex复核0020：K1代码验收通过

- 日期/执行者：2026-09-28 / Codex
- 阶段：review；状态：K1关闭，本轮未发现新的阻塞问题；真机与完整产品验收仍待办。
- 基线：luna-design，HEAD `5e49d5a4` + 全部未提交修改；规划base `36638fff`。
- 对应：K1/J2/R5/A11、A20。
- 本批未提交/推送，未执行checkout/reset/clean/stash；仅新增记录和独立探针证据、更新PROGRESS，未修改生产实现、正式测试或快照。

## 结论与依据

接受不同ID同名双方保留的实现。loadFromStorage以ID判断是否已合并，名称冲突只改恢复项显示名，保留其ID、updatedAt与参数；不会再因同名跳过合法数据。uniqueRecoveredName采用大小写不敏感查重、从(2)递增并截断基名以满足40字符上限。

接受面板挂载恢复后触发重绘：成功的retryPersist使数据tick更新，effect依赖library而非tick，因此不会循环；只读恢复产生的持久化警告也会触发渲染。同名UI恢复和12条满额恢复测试均通过。此次确认针对单页恢复路径，不声称新增跨标签同步能力。

独立追加三项探针均通过：

1. 存储“My pen”与会话“my pen”大小写冲突、且已有“My pen (2)”：恢复项获得(3)，三个ID对应数据保留。
2. 40字符大写名称与会话小写名称冲突，且已占用限长(2)名称：生成不超过40字符的(3)，原ID/updatedAt/粗细保留。
3. 相同ID在会话中修改粗细：保留会话版本，三次retry后仍只有一项。

前两项验证了list与落盘JSON一致；正式用例补充同名参数2/8各自保留、UI可见及13条恢复可达性。0019两项诊断已在正式集通过。

## 独立验证

环境：Node v22.19.0，本机终端/jsdom；未更新快照；没有真实iPad证据。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0019-review.test.tsx packages/excalidraw/tests/handwriting-presets-ui.test.tsx` | 退出0，2文件25通过 | `../evidence/0021-focused.log` |
| `node node_modules/vitest/vitest.mjs run --watch=false` | 退出0，115文件1542通过、47跳过、1todo；39.63s | `../evidence/0021-full.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出0 | `../evidence/0021-tsc.log`（空输出） |
| `node node_modules/eslint/bin/eslint.js --max-warnings=0 <全部28个修改/未跟踪JS/TS/TSX>` | 退出0 | `../evidence/0021-eslint.log`（空输出） |
| excalidraw-app下 `node ../node_modules/vite/bin/vite.js build` | 退出0；既有依赖/分包警告 | `../evidence/0021-build.log` |
| 0021独立边界探针 | 退出0，3项通过 | `../evidence/0021-probe.log` |
| `git diff --check` | 退出0 | 终端验证 |

探针重放：复制 `docs/handwriting/evidence/0021-review-probe.tsx.txt` 为 `packages/excalidraw/tests/handwriting-0021-review.test.tsx`，运行 `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-0021-review.test.tsx`。本批归档为文本证据，没有改动正式测试集；全量1542统计不包含额外3项探针。

## 交付与剩余验收

K1及本轮存储修复链的代码阻塞项已关闭；结合前轮关闭记录，目前没有已知未关闭的同批代码阻塞项。此结论不是对所有设备行为、性能和存储环境的全面保证。

新增0021记录、evidence/0021-*源码/日志，更新PROGRESS。无生产实现、依赖、数据格式修改。工作区仍全部未提交，HEAD未变化。

下一步按USER_SETUP.md/ACCEPTANCE.md完成iPad真机验收：Apple Pencil轻重压/掌托/停笔手感、横竖屏与分屏、iCloud打开/导出后继续编辑、恢复手绘、A18浏览器性能与内存。A04/A06/A07/A08/A09/A16人工证据仍未验证，不能以jsdom通过代替；原生iPad App仍是后续独立阶段。本轮无需新API或苹果服务配置。后续批次编号从0022开始。
