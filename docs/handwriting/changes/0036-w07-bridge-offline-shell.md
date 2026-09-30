# 0036 — W07：原生离线壳与类型化资源桥核心

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W07（连续执行第 6 批）
- 对应需求：N18/V11/V18、W07 通过条件
- 状态：桥核心与打包管线完成（软件层面）；WKWebView 接线与输入路由为 W08

## 本批内容

1. **`Bridge/BridgeCore.swift`（纯 Swift，无 UIKit/WebKit 依赖）**：
   - `BridgeMessage` 类型化消息（protocolVersion/documentId/sessionId/requestId/baseRevision/type/payload），Codable 往返测试。
   - `BridgeSession` 状态机：协议版本协商、**会话/文档绑定**、**请求精确一次**（handledRequestIds 去重，重复 ack 不推进 revision）、**未来 revision 硬拒绝**（落后/相等容忍并幂等推进）、**来源白名单**（untrustedOrigin 拒绝——远程网页不能调文件桥）。
   - 7 项测试覆盖每个拒绝路径（重复/未来版本/错会话/错协议/非法来源/握手编解码）。
2. **离线网页打包管线** `scripts/native/prepare-web-assets.sh`：vite 构建产物 → `LunaCanvas/Resources/Web/`（去 sourcemap），App bundle 内置、断网可用、不依赖 dev server/CDN（N18/W07 门槛）；目录 gitignore，构建前强制检查。
3. **资源传输约定**：桥消息只传资源**容器相对引用**与 documentId/revision，不内联 drawing 字节；传输通道（W08 WebBridge）在共享沙箱目录按引用取字节（计划 §6"受控本地引用"）。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | **TEST SUCCEEDED：25 tests, 0 failures**（/tmp/native-w07c.log） |
| 管线脚本（web 构建存在时） | 需先跑 vite build（W12 打包批次统一执行并记录体积） |

## 风险与未完成项

- WKWebView 壳、握手时序（页面 ready 前不收写命令）、消息注入与回执在 W08；本批状态机为其提供全部可测语义。
- 来源白名单当前为字符串集合，W08 用 bundle file URL 填充。

## 下一批

W08（原生输入、视口与工具壳）。PROGRESS.md 已更新。
