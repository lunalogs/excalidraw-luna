# LunaCanvas（第三阶段原生原型，P0）

> 状态：**已编译验证（2026-09-29）**——Xcode 27.0 / iOS SDK 27.0，
> iPadOS 17.0 部署目标模拟器构建通过，10 项单元测试通过（见 changes/0026、0028）。
> 真机手感/压感/iCloud 仍待用户设备（USER_SETUP 清单）。

## 工程结构

- `LunaCanvas/LunaCanvasApp.swift` — SwiftUI 入口 + 两个原型动作（导出三笔 / 模拟网页变换）
- `LunaCanvas/Canvas/CanvasView.swift` — `PKCanvasView` 包装、工具选择器、**逐笔 PKDrawing 提取 + 稳定 objectId 映射（适配层，不依赖 PKStroke.id）**
- `LunaCanvas/Document/DocumentExporter.swift` — `.lunacanvas` 容器写出接口（ZIP 由 ZIPFoundation 承担，P1 接入）
- `project.yml` — XcodeGen 工程描述（iPadOS 17.0 草案目标）

## 构建（Xcode 就绪后执行并回填日志）

```sh
# XcodeGen 二进制已随仓库放在 tools/（2.46.0，来源 yonaskolb/XcodeGen，MIT）
# 若首次使用新装 Xcode，先接受许可：sudo xcodebuild -license accept
cd apps/ipad
tools/xcodegen/bin/xcodegen
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas \
  -destination 'platform=iOS Simulator,id=<iPad simulator id; xcrun simctl list devices available | grep iPad>' \
  -derivedDataPath build build
```

模拟器无签名即可构建；真机签名由用户本机配置（证书/描述文件不入库）。

## 跨端 fixture 流水线（W01）

```sh
scripts/native/gen-fixture.sh   # macOS 直接跑 PencilKit，生成
                                # docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas
node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/lunacanvas-fixture.test.ts
```

生成器与 App 编译**同一份** `LunaCanvas/Document/LunaArchive.swift`（脚本先 cmp 后拷贝，
漂移即失败）；TS 侧校验 manifest 契约 + 逐资源 SHA-256。

## P0 原型验收点（对应 SPEC §2 首批难点）

1. 真实 PKCanvasView 与系统工具选择器；写、擦、平移、缩放。
2. 三笔输出为独立单笔 PKDrawing 资源（非整页截图）。
3. 荧光笔交叠：原生截图基准 vs 网页对照（ADR-0004，待执行）。
4. SDK/API 支持矩阵：ADR-0001，待 xcodebuild 核实。

## 依赖

| 依赖 | 版本 | 许可证 | 体积 | 理由 |
| --- | --- | --- | --- | --- |
| ZIPFoundation | 0.9.20（Package.resolved 锁定） | MIT | ~1.9 MB 源码 | Foundation 无 ZIP；N11 容器校验需要自控读写 |
| XcodeGen | 2.46.0（yonaskolb/XcodeGen，仓库已迁移） | MIT | 单二进制 ~14MB，SHA256 见 changes/0028；tools/ 自带，不跑其 install.sh |
