# 0002 — Kimi 第二阶段开发合同与验收规范

- 日期/执行者：2026-09-25 / Codex
- 阶段：用户要求的规划与开发交接，不是第二阶段实现
- 父提交 / 起始 SHA：`187dc674`
- 本次提交标题：`docs: define advanced handwriting requirements and Kimi review workflow`
- 对应用户要求：左上画笔属性面板、压力/灵敏度/扁平度/稳定性、自定义预设、按住停笔规整、外部准备清单、逐批文档记录
- 状态：规划完成；等待 Kimi 实现后由 Codex 验收

## 文件及内容

| 文件 | 内容 |
| --- | --- |
| docs/handwriting/README.md | 阅读顺序、可直接交给 Kimi 的完整任务、分工 |
| docs/handwriting/SPEC.md | 需求 ID、参数独立语义与建议公式、数据兼容、预设 CRUD、图形识别状态机与阈值、M0–M6 计划 |
| docs/handwriting/ACCEPTANCE.md | A01–A20 验收、真实测试命令、最终 review 所需证据 |
| docs/handwriting/USER_SETUP.md | 网页无需 API；GitHub 权限/真机/HTTPS 预览准备；原生 App 才需要的苹果签名环境 |
| docs/handwriting/CHANGELOG_TEMPLATE.md | 每批修改和每个提交留记录的约定、模板与交付格式 |
| docs/handwriting/PROGRESS.md | 已交付与未实现分离，供 Kimi 持续更新 |
| AGENTS.md | 增加仅针对手写相关工作的交接阅读和记录要求，保留原有工程规范 |

## 关键决定

- 本轮不直接实现新功能，尊重用户指定 Kimi 编码、Codex 验收的分工。
- 压力幅度控制轻重压宽差，灵敏度控制压力响应曲线，扁平度是真实笔尖几何，稳定性处理输入抖动，不能用同一个参数伪装四项。
- 停笔定义为笔尖仍接触屏幕；默认 1.2 秒、可调。先预览，抬笔确认，继续移动可取消，原笔迹和撤销必须可恢复。
- 笔迹保存完整参数快照，个人预设可另行 JSON 备份；本地计算不需要新云服务或识别 API。
- 原生 Pencil 硬件双击与网页能力分开，M6 不阻塞 M1–M5。
- 远端现有 Google Drive、登录等保留，不把它们当作新手写功能的依赖。

## 验证

- 规划依据当前仓库实际组件、采样和轮廓入口；核对已安装 perfect-freehand 锁定版本为 1.2.0。
- 查询 Apple 官方 UIPencilInteraction、开发者账户说明、W3C Pointer Events 和 perfect-freehand 上游文档，参考链接已写入 SPEC/USER_SETUP。
- 代码基线已运行全量更新快照测试与类型检查，结果见 0001；本提交只增加文档和 AGENTS 工作流要求。
- 文档使用 Prettier 格式检查、Markdown 本地链接检查和 git diff --check；具体提交前退出结果由交付回复报告。
- 第二阶段功能测试、真实 iPad 验证均尚未执行，不能引用基线通过数声称新功能已完成。

## 下一步

用户把 README 中的任务交给 Kimi。Kimi 从 0003 开始记录每批实现/修复，最终提供 base/head SHA、需求验收矩阵与证据；Codex 收到后继续 review 并修改。
