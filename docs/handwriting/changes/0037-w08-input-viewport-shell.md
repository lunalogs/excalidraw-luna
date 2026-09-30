# 0037 — W08：原生输入归属、视口映射与壳层

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W08（连续执行第 7 批）
- 对应需求：N02/N18、V02/V03、固定比例与锁的原生语义（0027 约束）
- 状态：模型/壳层完成（软件层面）；手势真机联调待设备

## 本批内容

1. **`InputCoordinator`（纯模型 + 6 项测试）**：
   - 写画/整理模式状态机；**一触点一消费者**：Pencil 落墨、手指导航、**Pencil 活动期间手指（掌托）忽略**；整理模式画布永不落墨。
   - **缩放锁语义与网页一致**：锁阻止视口缩放（按钮/双指/手势），平移、书写、选中内容缩放不受限（0027 用户约束固化）。
   - **双击矩阵**：不支持双击的设备降级为"屏幕橡皮入口始终可用、双击无动作"；系统偏好（切橡皮/上个工具/取色/忽略）被尊重，不硬编码。
2. **`ViewportMapping`（单一视口真源，ADR-0003）**：scene↔UIKit point 双向换算（origin 含安全区），0.25x/1x/4x 往返 1e-6 精度；`webScrollPx` 把同一状态转成网页 scroll 约定，两层消费同一组数字防反馈环。
3. **`WebBridge` + `ShellView`（编译通过）**：WKWebView 加载 bundle 内 Web 资源（离线，`loadFileURL` 限定读范围）；`window.lunacanvas.postMessage` 注入；消息经 BridgeSession 白名单（file:// 归一为受信 bundle 源）；拒绝消息不应用（V11）。壳视图 = web 层在下 + PKCanvasView 透明在上（v1 墨迹层置顶），手势真机联调列入 W12 真机证据。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| 原生 `xcodebuild ... test` | **TEST SUCCEEDED：31 tests, 0 failures**（/tmp/native-w08d.log） |
| 左下比例/缩放锁回归（网页） | 既有 3 项通过，未触碰 |

## 风险与未完成项

- PKCanvasView 的 drawingPolicy 无 pencilOnly 案例——手指归属由 InputCoordinator 逐触点裁决（壳内注释标明）；真机掌托先/后落场景需设备验证。
- 壳视图 UI 测试受模拟器限制（无 Pencil），手势矩阵以模型测试 + 真机录屏双重证据（W12）。

## 下一批

W09（原生编辑与统一历史闭环）。PROGRESS.md 已更新。
