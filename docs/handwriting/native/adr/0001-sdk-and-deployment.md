# ADR-0001：部署目标、SDK 与公开 API 支持矩阵

状态：**已核实（2026-09-28 编译验证）**。工具链：Xcode 27.0 (27A266a)，iOS SDK 27.0 (24A434)，iPad Pro 11" (M5) 模拟器（iOS 27.0 runtime）。原型以 **iPadOS 17.0 部署目标编译通过**——所用 PencilKit API（PKCanvasView/PKToolPicker/PKDrawing/PKStroke/PKStrokePath/dataRepresentation）在 17.0 可用；矩阵"部署目标实测"列以编译通过为准。

## 决定（草案）

- 部署目标：iPadOS **17.0**（草案；待 SDK 核实后固定，取能覆盖用户设备的最低版本）
- UI：SwiftUI 壳 + UIKit `PKCanvasView`
- 仅使用 PencilKit 公开 API；`PKStroke.id`（iPadOS 18 标注）不作为身份基础，由适配层分配稳定 objectId（见 ADR-0002）
- 原生构建：XcodeGen 生成工程（`project.yml` 入仓库），模拟器无签名构建命令入 README；真机签名由用户本机配置，证书不入库

## 支持矩阵（待核实列在 Xcode 就绪后逐项打勾）

| API | 用途 | 最低系统（文档值） | 部署目标实测 |
| --- | --- | --- | --- |
| PKCanvasView / PKToolPicker | 画布与工具 | iPadOS 13 | ✅ 17.0 编译通过 |
| PKDrawing.dataRepresentation() | 原生源序列化 | iPadOS 13 | ✅ 17.0 编译通过 |
| PKStroke/PKStrokePath 构造与属性 | 单笔提取与 fixture | iPadOS 13 | ✅ 17.0 编译通过 |
| UIPencilInteraction | 硬件双击（P3 接入） | iPadOS 13 | 待 P3 接入时验证 |
| UIDocumentBrowserViewController | 本地/iCloud 文件（P4） | iPadOS 13 | 待 P4 接入时验证 |
| PKStroke.id | （不使用） | iPadOS 18 标注 | 不采用 |

## 后果

- 无 Xcode 期间一切 Swift 代码标"未编译验证"；P0 门槛"公开 API 构建可复现"在 Xcode 就绪前**不宣称满足**
