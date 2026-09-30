# 0028 — Kimi 修复 P0-R1/R2/R3：身份映射一对一、真实导出往返、manifest 契约收紧

- 日期/执行者：2026-09-29 / Kimi
- 阶段：P0（0027 复核修复批次）
- 起始 SHA：`4b5d250b` + 0025/0026/0027 未提交内容（本批与其同批待提交）
- 本次提交：未提交（待用户授权）
- 对应需求：0027 的 P0-R1/R2/R3/R4；SPEC N07/N08/N11、ADR-0002/0003/0004
- 状态：R1/R2/R3 完成并有模拟器测试；R4 文档与工具整理完成；手感/真机仍未验证

## 修前失败 → 修后通过

| 问题（0027） | 修复 | 证据 |
| --- | --- | --- |
| R1 重叠两笔二次 updateUnits 共用同一 objectId（`previous.first` 不消费） | 指纹 richer（bounds+点数+RGBA）+ **顺序一对一消费匹配**（每个旧单元至多匹配一笔） | 新增 3 项测试全过：同点两笔重复快照仍 2 个 id（即 Codex 独立诊断场景）；删前笔保留后笔自己的 id；同 bounds 不同颜色→新 id |
| R2 导出是占位、变换不回放 | DocumentExporter 落地：ZIPFoundation 真 ZIP（manifest.json + ink/*.drawing）、CryptoKit 真 SHA-256、open() 重开逐资源校验哈希；`applyWebTransformsToCanvas` 把矩阵烘入画布并**归一**（transform 复位 identity），同文档重复回放不二次缩放；显式两次用户缩放 1.5→2.25 单独断言 | RoundTripTests 4 项通过：真实容器写出→重开字节/哈希一致；缩放后 bounds 独立断言 154≈104×1.5（墨迹 padding，容差 4）且二次回放宽度不变；2.25x 复合；荧光笔叠色实验 RMSE=**0.0234**（原生 vs 朴素拼接，数值入记录，阈值待真机视觉评审） |
| R3 manifest 接受非等比/双轴负缩放/非法 capabilities | `validateTransform` 要求 **a>0、d>0、|a−d|≤ε**（等比正缩放）；capabilities 必须是已知能力字符串数组（ink/graphics/hit-geometry/preview）；resources 表唯一路径、sha256 须 64 位十六进制、byteSize 正整数、**sceneRef 与 inkObjects 全部引用必须存在于 resources 表**（N10） | TS 测试 10/10（新增 capabilities 拒绝、资源表完整性 4 断言；Codex 三例 [2,0,0,1]/[-1,0,0,-1]/capabilities=42 均拒绝） |
| R4 文档与工具 | README/Swift 头更新（不再称"无 Xcode"；ZIPFoundation 0.9.20 锁定来源 Package.resolved）；tools/ 决策：**保留解压后的 xcodegen 二进制（2.46.0，SHA256 下记），删除 ~4MB 压缩包**；`apps/ipad/.gitignore` 排除 build/ 与生成的 xcodeproj（工程由 project.yml 再生成）；明确不运行 tools 附带 install.sh | 见文件表 |

## 改动文件

| 文件 | 改动 |
| --- | --- |
| apps/ipad/LunaCanvas/Canvas/CanvasView.swift | 一对一消费匹配 + richer 指纹；applyWebTransformsToCanvas（烘入+归一）；导出真正写文件 |
| apps/ipad/LunaCanvas/Document/DocumentExporter.swift | 真 ZIP 写出/重开 + SHA-256 校验（重写） |
| apps/ipad/LunaCanvasTests/IdentityMappingTests.swift | +3（R1 场景） |
| apps/ipad/LunaCanvasTests/RoundTripTests.swift | 新增 4 项（导出往返/回放归一/复合缩放/叠色实验） |
| packages/excalidraw/lunacanvas/manifest.ts | 等比正缩放、capabilities 白名单、资源表完整性（R3） |
| packages/excalidraw/tests/lunacanvas-manifest.test.ts | 8→10 项 |
| apps/ipad/README.md、.gitignore、LunaCanvasApp/DocumentExporter 注释 | R4 整理 |

## 实际验证

| 时间/环境 | 命令 | 结果 |
| --- | --- | --- |
| 2026-09-29, Xcode 27.0, iOS SDK 27.0, iPad Pro 11" (M5) 模拟器 | `xcodebuild ... test`（同 0026 destination） | 0，**TEST SUCCEEDED：10 tests, 0 failures**（日志 /tmp/native-test13.log；RMSE 0.023385358667337135） |
| 网页侧 | `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/lunacanvas-manifest.test.ts` | 10/10 |
| 全量回归 | `vitest run --watch=false` | 118 文件 / 1556 passed |
| tsc / eslint（改动 TS 集合） | — | 0 / 0 |

工具校验：tools/xcodegen/bin/xcodegen SHA256 = `8774da746668bc18fe74e54cbaf10f2631a1fb05947cd374179aa912f14f99db`（来源 https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0 xcodegen.zip 解压）。

## 风险与未完成项

- 指纹映射仍是 P0 演示级（消费匹配已消除 ID 塌缩；P1 换持久映射）。
- drawingDidChange 全量扫描在主线程——P4 性能批次实测节流（0027-R4 已记录，未谎称"异步"）。
- 叠色 RMSE 0.0234 仅为该程序化 fixture 的数值；真机视觉评审待用户。
- tools 二进制 SHA256 需写入本记录后提交（见实际验证节）。

## 下一批与交付状态

R1/R2/R3 关闭待 Codex 复核；之后推进 P1（容器校验预算、TS/Swift 互读 fixture、scene/preview/hit 资源）。PROGRESS.md 已更新。
