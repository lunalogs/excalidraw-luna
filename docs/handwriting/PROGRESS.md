# 进度与修改记录索引

最后更新：2026-09-25。M0–M3 已完成（[0003](changes/0003-m0-baseline.md)、[0004](changes/0004-m1-panel-reorganization.md)、[0005](changes/0005-m2-brush-model.md)、[0006](changes/0006-m3-personal-presets.md)），M4–M5 进行中。

## 代码基线

- 仓库：`https://github.com/lunalogs/excalidraw-luna`
- 交接分支：`luna-design`
- 合并的远端起点：`da5db57cb36262d21b3ab80f80e45de27bd66150`（包含 Google Drive 功能）
- 第一阶段代码提交：`187dc674`，`feat: add tablet handwriting controls and editable file workflow`
- 本轮规划提交在第一阶段提交之后；Kimi 以实际最新检出 SHA 填写 M0，不以本文件中的短 SHA 猜测最新 HEAD。

## 阶段状态

| 阶段 | 状态 | 说明 / 记录 |
| --- | --- | --- |
| 第一阶段网页手写 | 已交付代码，真机待验收 | [0001](changes/0001-baseline-web-handwriting.md) |
| 第二阶段需求与验收规范 | 已交付文档 | [0002](changes/0002-kimi-handoff-plan.md) |
| M0 基线确认 | 已完成 | [0003](changes/0003-m0-baseline.md)：base SHA `36638fff`，tsc 通过，103 文件/1350 测试通过，与 ACCEPTANCE §D 一致 |
| M1 左上面板与独立文件入口 | 已完成 | [0004](changes/0004-m1-panel-reorganization.md)：双布局接通，左下入口删除，文件项入主菜单，6 项新 UI 测试 |
| M2 四参数笔刷模型 | 已完成 | [0005](changes/0005-m2-brush-model.md)：四参数独立生效、共享轮廓、逐笔快照、legacy 逐位回归，23 项轮廓测试 |
| M3 个人预设 | 已完成 | [0006](changes/0006-m3-personal-presets.md)：CRUD/未保存三选/JSON 备份 UI，7 项 UI 测试 + 43 项逻辑测试 |
| M4 停笔规整 | 未开始 | 定时器/识别/预览/历史均待实现 |
| M5 集成验收 | 未开始 | A01–A20 不得继承第一阶段测试为通过 |
| M6 原生 iPad App | 后续阶段 | 需设备/签名/分发方式，不阻塞网页 |

Kimi 每一批都更新相关行并链接新记录。实现不完整写“部分完成”，设备未测写“未验证”，不得默认勾选所有需求。

## 最终交付时填写

- Kimi 工作分支/PR：待填
- 实际 base SHA / head SHA：待填
- 完整提交列表：待填
- A01–A20 完成与证据矩阵：待填（可另建报告并链接）
- 类型检查、全量测试、无快照更新的复验、lint、构建结果：待填
- 真机信息及证据：待填
- 已知问题、未实现/偏离要求：待填
- Codex review 结论与修复记录：待 review

## 记录规则

新增记录从`0003`开始。每一批记录与代码同一提交；提交后可在下一份记录补前一提交 SHA。不要重写历史记录掩盖失败或跳过真机验证。模板见[CHANGELOG_TEMPLATE.md](CHANGELOG_TEMPLATE.md)。
