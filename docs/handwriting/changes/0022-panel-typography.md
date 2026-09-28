# 0022 — 笔刷面板排版统一（真机反馈）

- 日期/执行者：2026-09-28 / Kimi
- 阶段：真机验收修复（iPad 首轮试用反馈）
- 父提交 / 起始 SHA：`4c2ac87c`
- 本次提交标题：`fix: normalize handwriting panel typography and layout`
- 对应需求：UI-06/UI-07（面板触控与可读性）
- 状态：完成（真机截图确认前为"已按反馈调整"，待用户复验）

## 本批解决的问题

iPad 真机首验截图显示笔刷面板字体大小不一（按钮、下拉、标签、数值各自继承不同上下文字号），视觉杂乱。原因：面板未声明统一字号，按钮/原生控件继承了属性面板、radix 弹层与浏览器默认样式的混合字号。

调整（仅 SCSS，无逻辑/结构变更）：
- 面板根统一 `font-size: 13px / line-height 1.35`，按钮、下拉、文本框、output 全部 `font: inherit` 归一。
- 笔触按钮改 2×2 等宽网格（`flex: 1 1 calc(50% - gap)`），圆角 8px。
- 预设下拉撑满行宽；滑块行标签/数值/滑条固定比例（数值 2.4em 右对齐 tabular-nums）。
- "Advanced" 折叠钮与恢复默认改整宽、文字两端对齐。
- 高级区/规整区卡片化（8px 圆角内边距）；提示/警告 11–12px；复选框统一 18px。
- 44px 触控目标全部保留（UI-06 要求不变）。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| packages/excalidraw/components/HandwritingBrushPanel.scss | 排版重写（上述） |

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/handwriting-panel.test.tsx` | 10/10 通过（结构与可访问名未变） |
| 真机复验 | 待用户确认（本地 dev server 提供局域网链接） |

无快照更新；无行为变更。真机状态：**排版问题本轮修复，待 iPad 复验**。
