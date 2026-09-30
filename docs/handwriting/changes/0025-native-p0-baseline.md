# 0025 — 原生阶段 P0：工程基线、ADR 与 .lunacanvas manifest 契约（TS 侧已验证）

- 日期/执行者：2026-09-28 / Kimi
- 阶段：P0 可行性与原生试写
- 起始 SHA：`4b5d250b`（开工时读取；工作区干净，无未提交修改）
- 本次提交：未提交（按 KIMI_HANDOFF：不自动提交/推送，待用户授权）
- 对应需求：N01–N03 方向性合同、N07–N11 manifest 子集、V09 输入校验
- 状态：**部分完成**——TS 侧完成并有测试；Swift 原型已写但**未编译验证**（本机无 Xcode，见风险）

## 开工基线记录（KIMI_HANDOFF 要求）

- 实际 base/head：开工时 HEAD = `4b5d250b`，`git status` 干净（此前 0022–0024 缩放批次均已提交推送）。
- 未提交修改清单：本批新增（下方文件表），无他人遗留改动。

## 本批内容

### 1. 环境核查（阻塞项）
`xcodebuild` 不可用：active developer directory 为 Command Line Tools，`/Applications` 无 Xcode，无 iphonesimulator SDK，全盘无 Xcode.xip。**Swift 一切"可构建/可运行"声明在本机无法验证**，本批 Swift 代码按 Apple 公开文档（查阅 2026-09-28）手写并逐文件标注"未编译验证"。安装 Xcode（约 10GB，需 Apple ID）需用户操作，磁盘余量 36GB 充足。

### 2. 工程基线（apps/ipad/，未编译验证）
- `project.yml`：XcodeGen 工程描述，iPadOS 17.0 **草案**部署目标（ADR-0001 核实后固定），iPad-only（TARGETED_DEVICE_FAMILY=2）。
- `LunaCanvas/LunaCanvasApp.swift`：SwiftUI 入口 + 原型动作（导出三笔 / 模拟网页 150% 变换）。
- `LunaCanvas/Canvas/CanvasView.swift`：PKCanvasView 包装 + PKToolPicker；**逐笔 PKDrawing 提取**与适配层 objectId 映射（P0 用 renderBounds+采样数指纹演示映射问题，P1 换持久映射，ADR-0002）。
- `LunaCanvas/Document/DocumentExporter.swift`：.lunacanvas 写出接口（ZIPFoundation 2.2.10 / MIT 列入依赖表，P1 接入；哈希封装为占位待 CryptoKit 编译验证）。
- `README.md`：构建命令（xcodegen → xcodebuild 模拟器 destination）、原型验收点、依赖表。

### 3. ADR（docs/handwriting/native/adr/）
- 0001 SDK 与部署目标：支持矩阵含"文档值 vs 部署目标实测"两列，**实测列全部待 Xcode 核实**；明确不采用 PKStroke.id。
- 0002 身份映射：适配层 UUID objectId；资源字节+hash 为身份载体；局部分裂分配新 id 并记录 replacedBy/splitFrom。
- 0003 统一坐标：文档坐标=scene point（CSS px、y 向下）；DPR 不进文档；worldTransform 只应用一次、原生提交时事务性归一。
- 0004 荧光笔叠色：不预设结论，原生截图为基准、输出差异图，偏差可见则分块缓存+对象映射。

### 4. .lunacanvas manifest 契约（TS，已验证）
`packages/excalidraw/lunacanvas/manifest.ts`：type/schemaVersion/documentId/revision/capabilities/sceneRef/inkObjects（objectId、容器相对 ref、6 项仿射 worldTransform——**v1 写路径仅允许等比+平移**、order、contentVersion/hash、splitFrom/replacedBy）/resources/layerStrategy；`VALIDATION_LIMITS`（manifest 2MB、5000 inkObjects、路径长 512）。未知 schemaVersion/重复 ID/路径穿越/网络 URL/错切/负缩放/NaN 一律拒绝不矫正（N11）。

## 改动文件

| 文件 | 改动 | 影响面 |
| --- | --- | --- |
| apps/ipad/**（5 文件） | 原生原型基线 | 新工程，未编译验证 |
| docs/handwriting/native/adr/0001–0004 | 架构决定记录 | 文档 |
| packages/excalidraw/lunacanvas/manifest.ts | manifest 类型+校验 | 文件协议 |
| packages/excalidraw/tests/lunacanvas-manifest.test.ts | 8 项校验测试 | 测试 |

新依赖：ZIPFoundation（MIT，P1 实际接入并锁定）。**更正（0026）**：2.2.10 系本批未核实虚构值，真实最新为 0.9.20，已在 0026 修正。XcodeGen（工程生成，MIT；仓库已迁移 yonaskolb/XcodeGen，2.46.0 二进制随仓库 tools/ 提供）。本批未改任何既有网页代码。

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-28, Node v22.19.0, macOS（无 Xcode） | `node node_modules/vitest/vitest.mjs run --watch=false` | 0；118 文件 / 1556 passed / 47 skipped / 1 todo（含新增 8 项 manifest 测试） |
| 同上 | `tsc --noEmit` | 0 |
| 同上 | `eslint --max-warnings=0 <新增 TS 文件>` | 0 |
| 同上 | `xcodebuild -version` | **失败**：未安装 Xcode（阻塞项，见上） |
| 原生构建/模拟器/真机 | — | **未运行，未验证**（依赖 Xcode + 用户设备/签名） |

## 风险与未完成项

1. **P0 门槛"公开 API 构建可复现"未满足**——需安装 Xcode（用户操作）。Swift 代码可能存在编译错误，Codex 复核时请按"未编译草稿"对待。
2. 手感对比（备忘录对照）、荧光笔叠色原型、三笔真实往返——全部待设备。
3. 部署目标 17.0 为草案；ZIPFoundation 版本在 P1 接入时锁定并记录包体实测。

## 下一批与交付状态

P0 剩余：Xcode 安装后固定 ADR-0001 → 编译原型 → 三笔往返原型 → 叠色/坐标验证 → 记录。需用户：安装 Xcode（App Store 或 developer.apple.com 下载 Xcode.xip，双击解压到 /Applications）。PROGRESS.md 已更新。
