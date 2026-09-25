# 0001 — 保存第一阶段网页手写基线

- 日期/执行者：2026-09-25 / Codex
- 阶段：第一阶段代码保存，供第二阶段 M0 起点使用
- 父提交 / 起始 SHA：`da5db57cb36262d21b3ab80f80e45de27bd66150`
- 本次提交标题：`feat: add tablet handwriting controls and editable file workflow`
- 对应需求：第一轮用户要求；第二阶段 SPEC 的 M1–M5 尚未实现
- 状态：网页第一阶段完成，真实 iPad 验收未完成

## 问题与行为

原有画笔缺少集中设置入口，笔模式下无法双指缩放，手掌触摸可能影响正在进行的笔画。新增左下手写/文件面板、标准/钢笔/荧光笔、连续粗细与颜色、快速整笔擦除、笔模式单指平移/双指缩放与指针隔离。文件导出先准备可编辑快照，支持系统分享或下载并保留图片，缺图时提示重试。

用户最新要求已改变面板位置：下一阶段必须移入左上属性悬浮板，并移除左下入口。本次只保存已经实现的第一阶段，不把规划中的参数、预设和停笔规整宣称为完成。

## 文件与影响

| 文件 | 改动与原因 | 影响 |
| --- | --- | --- |
| packages/excalidraw/components/HandwritingPanel.tsx/.scss | 集中笔触、粗细、文件操作；临时第一阶段入口 | UI、文件系统 |
| packages/excalidraw/components/LayerUI.tsx | 挂载面板，查看/禅模式隐藏 | 布局 |
| packages/excalidraw/components/App.tsx | 笔指针隔离、手指平移、笔模式缩放、笔触参数快照 | 输入、手势 |
| packages/element/src/shape.ts | 荧光笔恒宽、钢笔增强压力变化 | 共用轮廓与导出 |
| packages/excalidraw/appState.ts、types.ts | currentItemBrush 及本地保存白名单 | 状态兼容 |
| packages/excalidraw/actions/actionExport.tsx | 导出既有图片准备函数供新入口复用 | 文件完整性 |
| packages/excalidraw/locales/en.json、zh-CN.json | 新控件及状态提示 | 本地化 |
| packages/excalidraw/tests/handwriting.test.tsx | 8 项手势/笔触/文件/橡皮测试 | 自动验证 |
| packages/excalidraw/tests/**snapshots**/{contextmenu,history,regressionTests}.test.tsx.snap、packages/utils/tests/**snapshots**/export.test.ts.snap | 默认 currentItemBrush 新增字段 | 预期状态快照 |
| IPAD_HANDWRITING.md | 第一阶段能力、限制、真机验收说明 | 交接 |

## 兼容与取舍

使用现有 perfect-freehand 依赖，无新增依赖或服务。新元素保存 customData.handwritingBrush；standard 和旧文件仍走原算法。此版的荧光笔固定 30%不透明度；第二阶段需改为用户可配置。橡皮为整笔/对象擦除。Pencil 笔杆双击未实现，需要原生能力，网页按钮不是硬件替代接口。

推送前先 fast-forward 合并远端三次提交（AGENTS.md、Google Drive 接入及修复），未覆盖这些更改。

## 实际验证

- 本轮 `node node_modules/vitest/vitest.mjs --update --watch=false`：退出 0，103 文件通过；1350 通过、47 跳过、1todo。等价执行 AGENTS.md 规定的 yarn test:update（本环境无 yarn 命令）。
- 本轮 `node node_modules/typescript/bin/tsc --noEmit`：退出 0。
- `git diff --check`：退出 0。
- 第一阶段对改动 TS/TSX 执行 ESLint（max-warnings=0）、Prettier 检查：通过。
- 第一阶段内置浏览器 1024×768、768×1024：面板边界、荧光笔、导出入口检查通过；运行错误日志为空。
- 原先新增橡皮测试失败：jsdom 画布尺寸为 0，可见元素为空。显式设为 1024×768 后通过，没有因此修改橡皮算法或跳过测试。
- 快照变化仅新增默认 currentItemBrush 字段，未接受无关快照变化。
- 当前完整生产构建未运行；真实 iPad/Pencil、系统 iCloud 文件存取未验证。
- 全量测试有既有缺 Firebase 配置诊断输出，未导致失败，不需要为手写功能新增 Firebase 配置。

## 下一步

按第二阶段 SPEC 由 Kimi 实施 M0–M5，并为每批更改追加记录。Codex 在收到完成分支后做验收和修复。
