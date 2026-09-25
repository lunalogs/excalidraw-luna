# 用户需要准备什么

## 现在让 Kimi 做网页版

**不需要申请苹果接口、不需要新的 GitHub 仓库、不需要付费 API 或 API Key。**

| 项目 | 是否需要用户操作 | 用途 |
| --- | --- | --- |
| 现有 GitHub 仓库 | 给 Kimi 访问 `lunalogs/excalidraw-luna` 的权限或本地副本，使用最新 luna-design | 读取需求、提交代码；不要直接分享个人 token 到文档 |
| `perfect-freehand` | 无需另行申请；项目已有锁定 1.2.0 依赖 | 压感轮廓基础，扁平笔尖和识别仍要按 SPEC 实现 |
| Apple Pencil / iPad | 最终手感验收需要；开发时可先模拟 | 提供型号、iPadOS 版本，真机轻重压、掌托、停笔和文件存取 |
| 可从 iPad 访问的网页 | 真机验收需要现有 HTTPS 测试站点或可访问的开发环境 | 本机 127.0.0.1 在另一台 iPad 上指向 iPad 自己，不能直接使用该地址 |
| iCloud Drive | 在 iPad 系统里登录自己的 Apple 账户并启用 iCloud Drive 即可 | 通过系统“文件”保存/导入；编辑器不收取 Apple 密码 |
| 后端 / 图形识别服务 | 不需要 | 几何识别、笔刷、预设都在客户端执行 |
| Google Drive API / Supabase | 不是本功能的依赖，不要为手写新增配置 | 仓库已有可选功能保留，不作为匿名写画的前置条件 |

如要把预览暴露到局域网/HTTPS，Kimi 需提供具体启动或部署方式；不要把静态源代码页面当作已部署测试站点，不擅自公开私人草稿。用户可以直接发本文档和 README 中的任务文本给 Kimi。

## 后续真要做原生 iPad App（M6）

这是独立工程阶段，不阻塞网页版。需要准备：

1. 可运行 Xcode 的 Mac、兼容的 Xcode/iPadOS SDK、真实 iPad 和支持所需手势的 Pencil 型号。并非所有 Pencil 都有双击/挤压。
2. 用于签名的 Apple 账户。个人设备的开发测试与 App Store/TestFlight 发行要求不同；发行通常需要 Apple Developer Program。具体账号资格、签名与当前限制以[Apple 官方说明](https://developer.apple.com/help/account/basics/about-your-developer-account)为准，现阶段不用先购买或提供密码。
3. 原生应用的 Bundle ID、Team 与签名配置由用户在自己的 Xcode/开发者账户里设置。证书、私钥、Apple 密码不提交到 GitHub。
4. 明确分发方式：仅自己设备测试 / TestFlight / App Store；选择后再补对应的签名、隐私说明、图标和发布流程。
5. 若只使用系统 document picker 访问用户明确选择的 iCloud Drive 文件，不要求现在申请 CloudKit 数据库。若以后用应用专属 iCloud 容器，再按选定架构配置 capability 和 entitlements，不能把两种方案混为一谈。

## 原生技术方案要求（给 Kimi 参考，不是本期代码任务）

- `WKWebView`复用现有画布，原生通过[UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction)接收硬件双击，并尊重用户的系统偏好：切橡皮、切上一个工具或不执行；不要把所有双击硬编码成橡皮。挤压/悬停属额外能力，按设备与系统版本判断。
- 定义有版本的桥接事件和能力握手；来源受控，页面就绪才允许切工具，卸载清理。硬件切换与屏幕按钮应调用同一工具命令。
- 用[文档浏览器](https://developer.apple.com/documentation/uikit/uidocumentbrowserviewcontroller)或 document picker 取得用户授权文件，以安全作用域和系统文档机制读写；处理文件移动、权限过期、外部修改、离线、冲突和保存失败。
- “原生壳+系统保存”不是自己建立云储存服务；不需要向我们的服务器上传用户图纸。

## 需要用户最终交回 Codex 的东西

优先给 Kimi 完成后的 GitHub 分支或 PR 链接；同时附 PROGRESS.md 的最终摘要。硬件部分附设备信息和录屏。不需要另行手工整理每个代码文件，因为 changes 记录已经要求 Kimi 逐批填写。
