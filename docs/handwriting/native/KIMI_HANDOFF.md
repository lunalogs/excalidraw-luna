# 发给Kimi的当前任务

请实现本仓库的第三阶段：**iPad原生PencilKit手写 + 电脑网页整理 + 单文件跨端继续编辑**。

先按顺序读：根AGENTS.md → docs/handwriting/PROGRESS.md → docs/handwriting/native/SPEC.md → native/ACCEPTANCE.md → USER_SETUP.md的第三阶段准备清单 → CHANGELOG_TEMPLATE.md。旧SPEC/ACCEPTANCE是网页回归基线；本阶段冲突处以native/SPEC为准。

用户已确认：电脑不用原生写字/改笔触/局部擦除；电脑需圈选完整笔画或混合图形、移动、等比缩放、整笔橡皮与整段删除。iPad需原生写画、局部橡皮，电脑整理后回到iPad仍可继续编辑。一个文件包含Excalidraw图形、PencilKit原文、可分选的显示/命中资源及变换；保存本地/iCloud，无新云服务。

按P0→P4实施，先用真正PKCanvasView跑通小原型和三笔跨端往返，再扩大。不要用网页套壳替代原生手写；不要把整页截图当可圈选笔迹；不要私用Apple API或默认使用beta笔画ID。必须先验证身份映射、荧光笔叠色、统一坐标与撤销。

现有工作必须保留：Codex撰写本计划时实际HEAD为fa336ca0，且有未提交的缩放等改动；不是此前5e49d5a4的干净工作区。编写期间另一个提交已将HEAD推进到9748aebc，SPEC.md也已被纳入该提交；本助手未提交。开工时重新读取git状态，记录实际base/head与既有修改清单，禁止checkout/reset/clean/stash覆盖当前内容。不自动提交、推送或发布；如后续用户明确授权，按AGENTS执行提交前检查。

首批实现记录建议从0024开始（若已占号则递增），每一批都写changes/NNNN-主题.md并更新PROGRESS，要求见native/ACCEPTANCE §D。不要只回复“全绿”；记录实际范围、退出码、失败日志、硬件未验证项。缺设备/签名只影响对应真机步骤，继续完成可验证部分；不要让用户提供密码/token。

最后给Codex完整交付包，按验收顺序复核。此阶段只有文档规划，所有功能当前均不得标为已实现。
