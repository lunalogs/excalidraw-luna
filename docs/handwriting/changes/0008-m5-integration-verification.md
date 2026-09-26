# 0008 — M5 集成验收：全量复验、构建与交付信息

- 日期/执行者：2026-09-25 / Kimi
- 阶段：M5
- 父提交 / 起始 SHA：`ab4931c3`（M4 提交）
- 本次提交标题：`docs: record M5 integration verification and final handoff info`
- 对应需求 ID 与验收 ID：A01–A20、B 节工程检查、C 节交付包
- 状态：完成（真机项全部标未验证；A18 性能实测未做，见风险）

## 本批解决的问题

第二阶段 M1–M5 网页实现的最终验收与交付信息固化：在不更新快照的前提下全量复验、运行应用构建、填写 PROGRESS.md 最终交付段（base/head SHA、提交列表、验证命令与结果、已知问题清单）。

## 改动文件

| 文件 | 改动及原因 | 影响面 |
| --- | --- | --- |
| docs/handwriting/PROGRESS.md | M5 状态 + 最终交付信息段 | 文档 |
| docs/handwriting/changes/0008-m5-integration-verification.md | 本记录 | 文档 |

## 设计与数据兼容

无代码改动。A01–A20 逐项结论（证据索引）：

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| A01 UI-01/02 | 通过（自动化）/ 未验证（人工截图） | handwriting-panel.test.tsx 6 项；两种布局组件测试 |
| A02 UI-03/04 | 通过（自动化）/ 未验证（人工） | 参数只作用下一笔+下笔锁定、橡皮返回保留参数 |
| A03 UI-05 | 通过（自动化）/ 未验证（iCloud 人工） | 主菜单文件项 + 取消不丢图 + 图片往返 |
| A04 UI-06/07/08 | 部分通过 / 未验证（人工横竖屏等） | 触控 44px、标签/焦点、试写不入文档；浅深色/中英文人工 |
| A05 BR-01/02 | 通过 | outline.test.ts 幅度/灵敏度独立性与单调性 |
| A06 BR-03/04 | 通过（自动化）/ 并列截图未验证 | 扁平度几何断言、角度禁用逻辑 |
| A07 BR-05/09 | 通过（自动化：legacy 逐位回归、往返）/ 叠图未验证 | outline.test.ts、handwriting.test.tsx |
| A08 BR-06/07 | 部分通过 / 真机压感未验证 | 模拟压感路径有测试；真 Pencil 轻重压待真机 |
| A09 BR-08 | 通过（自动化轮廓级）/ 录屏未验证 | 稳定性平滑度断言；事件频率解耦由 streamline 弧长插值保证 |
| A10 DATA-01–06 | 通过（自动化）/ 另一浏览器未验证 | 快照字段、NaN/越界/坏 JSON 安全、往返 |
| A11 PRE-01–04 | 通过（自动化）/ 刷新保留真机未验证 | 43 项逻辑 + 7 项 UI 测试 |
| A12 PRE-05/06 | 通过（自动化）/ 系统备份人工 | 导入导出往返、冲突重映射、无网络（模块无请求） |
| A13 SH-01–03 | 通过（真实定时器边界测试）/ 真机录屏未验证 | 未到/正好/重置/过期；缩放换算实现 |
| A14 SH-04/05 | 通过 | 低置信不转（负例 36 条）、Esc/移动取消 |
| A15 SH-06 | 通过 | 单条历史撤销/重做、恢复手绘再撤销 |
| A16 SH-07–10 | 通过（自动化）/ 五类对照截图未验证 | 60 正例 + 36 负例 + 25 组变换 + 方向保留 |
| A17 SH-11 | 通过 | 切工具/失焦/卸载/过期定时器测试 |
| A18 性能 | **未运行**（1000 笔画/5000 点基准未测） | 见风险；构建通过、单帧热路径未改动 |
| A19 离线与安全 | 通过（自动化部分） | 无新增网络请求；核心为纯函数；无登录依赖 |
| A20 文档 | 通过 | changes/0003–0008 + 本提交 |

## 实际验证

| 时间/环境 | 完整命令或操作 | 退出码/结果 | 证据路径 |
| --- | --- | --- | --- |
| 2026-09-25, Node v22.19.0 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 终端输出 |
| 同上 | `node node_modules/vitest/vitest.mjs run --watch=false` | 0；109 文件；1467 passed / 47 skipped / 1 todo；36.66s | 终端输出 |
| 同上 | `node node_modules/eslint/bin/eslint.js --max-warnings=0 <32 个改动文件>` | 0 | 终端输出 |
| 同上 | `node node_modules/prettier/bin-prettier.js --check <改动文件>` + `git diff --check 36638fff..HEAD` | 0 | 终端输出 |
| 同上 | `cd excalidraw-app && node ../node_modules/vite/bin/vite.js build` | 0；12.1s；PWA 产物生成；仅 caniuse-lite 过期警告 | /tmp/build.log |

快照差异说明：M5 无快照更新。真机状态：**全部未验证**。

## 风险与未完成项

- A18 性能基准（1000 笔画、单笔 5000 采样）未执行——jsdom 无渲染性能意义，需真机；建议 Codex review 后由用户在 iPad 上按 ACCEPTANCE §B 记录 p50/p95。
- 全部真机验收项转交用户（USER_SETUP 已列清单）。
- M6 原生 App 未做（SPEC 约定后续阶段）。

## 下一批与交付状态

交付点：分支 `luna-design`，base `36638fff` → head 见提交列表。待 Codex 从该点 review。PROGRESS.md 已更新。
