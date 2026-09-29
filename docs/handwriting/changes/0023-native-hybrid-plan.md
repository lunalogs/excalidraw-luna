# 0023 — 原生PencilKit与混合文档实施交接

- 日期/执行者：2026-09-28 / Codex
- 阶段：规划；状态：文档完成，产品功能未实现。
- 当前HEAD：fa336ca0（现场读取）；保留已有未提交缩放等修改，未checkout/reset/clean/stash、未提交/推送。
- 需求：native/SPEC N01–N21；用户确认电脑整笔/整段删除足够，无需电脑局部擦除。

## 本批内容与文件

- 新增native/SPEC.md：原生画布、混合文档、笔迹ID/变换/预览、电脑整理、统一历史、文件与桥接约束、P0–P4。
- 新增native/ACCEPTANCE.md：V01–V18、完整往返场景、原生/网页检查与真机证据、逐批记录合同。
- 新增native/KIMI_HANDOFF.md：可直接发给Kimi的任务与保留工作区要求。
- 更新README/PROGRESS/USER_SETUP：入口指向当前计划，保留旧阶段与历史记录；原生现纳入下一阶段。

## 设计与兼容

旧网页笔刷与excalidraw格式继续保留；新增混合容器拟用.lunacanvas，不假装原版Excalidraw可编辑原生墨迹。原生源数据与网页操作元数据分开，电脑操作不转换/损坏原笔迹。局部擦除仅iPad负责，圈选默认整笔。高级自定义笔刷参数不强行映射到无公开支持的PencilKit接口。

本批没有新增依赖、代码、快照或外部上传。Apple官方资料见native/SPEC §8；未审计/采用第三方GitHub实现。

## 验证与限制

仅文档修改：检查相对链接及git diff --check；未运行代码测试/构建，因为本批未修改产品代码。原生可行性、预览叠色、身份映射、跨端坐标/撤销与真机手感均待P0及后续验证，文档方案不是已实现证明。

下一实现批次从0024开始（冲突则递增），Kimi实现并逐批记录，Codex复核。用户需提供设备信息与本机签名环境；不需要新仓库、付费API、CloudKit数据库或传送私人密钥。

现场并行变化：文档编写期间HEAD由fa336ca0变为9748aebc（feat: quick zoom presets and zoom lock），native/SPEC.md已随该提交被跟踪。本助手未执行git add/commit/push，未回退该外部提交；其余交接文档保留工作区状态。开工应重新读取实际HEAD，不能把全部本批文件称为均未提交。
