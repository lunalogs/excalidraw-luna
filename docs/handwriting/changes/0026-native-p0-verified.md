# 0026 — 原生 P0 编译验证：模拟器构建 + 身份映射单元测试通过

- 日期/执行者：2026-09-29 / Kimi
- 阶段：P0 可行性与原生试写
- 起始 SHA：`4b5d250b`（0025 批次未提交，本批与其同批待提交）
- 本次提交：未提交（待用户授权）
- 对应需求：V01 基础（真实 PKCanvasView 编译落墨路径）、SPEC §2 首批难点 1/2、ADR-0001/0002/0003
- 状态：编译与单元测试层面完成；**手感/叠色对照仍待真机（未验证）**

## 本批解决的问题

1. **环境打通**：用户安装 Xcode 27.0 并接受许可；本机 xcode-select 仍指向 CLT，构建统一用 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 前缀（不改系统设置）。下载安装 iOS 27.0 模拟器 runtime（`xcodebuild -downloadPlatform iOS`）。
2. **工程可复现构建**：修正两处未核实假设——XcodeGen 仓库已迁移至 `yonaskolb/XcodeGen`（2.46.0，二进制随仓库放 `apps/ipad/tools/`，避免系统级安装）；ZIPFoundation 真实最新版为 **0.9.20**（0025 记录中的 2.2.10 系未核实虚构，本批已更正项目与记录）。`tools/xcodegen/bin/xcodegen` 生成工程，模拟器构建 **BUILD SUCCEEDED**。
3. **原型编译修复 3 处**：PKToolPicker 需非空 UIWindow（改到 main.async 且判空）；删除无用 helper。
4. **身份映射验证（SPEC 首批难点 2）**：新增 `LunaCanvasTests` 单元测试目标（GENERATE_INFOPLIST_FILE=YES），3 项测试在 iPad Pro 11" (M5) 模拟器通过：
   - 三笔 → 三个独立单元、objectId 互异且稳定、重复 updateUnits 幂等、逐笔 dataRepresentation 非空且**字节级互异**（首版断言误用字节长度，同构笔画长度相同——失败 → 改为比较内容后通过，教训已记录）；
   - 局部擦除式修改（笔画变短）→ 修改笔获新 id，未变笔保留原 id（ADR-0002）；
   - 网页 150% 变换只含等比+平移、不重复缩放（ADR-0003，归一化随 P1 manifest 写入）。
5. **ADR-0001 回填**：Xcode 27.0 (27A266a)、iOS SDK 27.0 (24A434)、iPadOS 17.0 部署目标编译通过 → 所用 PencilKit API 矩阵"实测"列落实；UIPencilInteraction/UIDocumentBrowser 标 P3/P4 接入时验证。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| apps/ipad/project.yml | ZIPFoundation 0.9.20；LunaCanvasTests 目标 |
| apps/ipad/tools/ | XcodeGen 2.46.0 二进制（yonaskolb/XcodeGen，MIT） |
| apps/ipad/LunaCanvas/Canvas/CanvasView.swift | 编译修复（window 判空/异步） |
| apps/ipad/LunaCanvasTests/IdentityMappingTests.swift | 3 项身份/变换单元测试（程序化 fixture） |
| apps/ipad/README.md | 真实构建命令与依赖表更正 |
| docs/handwriting/native/adr/0001 | 实测列回填 |
| docs/handwriting/changes/0025 | ZIPFoundation 版本虚构更正注记 |

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-29, Xcode 27.0 (27A266a), iOS SDK 27.0 (24A434), Apple M4 | `tools/xcodegen/bin/xcodegen` | 0，工程生成 |
| 同上 | `xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas -destination 'platform=iOS Simulator,id=C5D8FD6E-2292-4B3B-8475-E0A36BE6409A' -derivedDataPath build build` | 0，BUILD SUCCEEDED |
| 同上 | 同地址 `test` | 0，**TEST SUCCEEDED：3 tests, 0 failures**（日志 `/tmp/native-test2.log`，xcresult 在 build/Logs/Test/） |
| 网页侧回归 | `node node_modules/vitest/vitest.mjs run --watch=false`（0025 批次后） | 0；118 文件 / 1556 passed |

## 风险与未完成项

- **手感对照（与备忘录对比）、荧光笔叠色原型、真机三笔往返**：需用户 iPad，未验证。
- P0 指纹映射（renderBounds+采样数）仅为演示，P1 换持久映射（见 0025）。
- `simulateWebTransform` 的第二次施加语义以断言固化为"变换由协调器归一"，P1 落地 manifest 写入时实现归一。

## 下一批与交付状态

P0 剩余全部为真机项（用户执行）：模拟器/真机试写手感、叠色对照截图。P1（ZIP 容器 + 资源库 + TS/Swift 往返测试）可在无设备下继续。PROGRESS.md 已更新。
