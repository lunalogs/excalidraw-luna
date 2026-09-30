# 0027 — Codex复核P0：编译通过，功能门槛未全部完成

- 日期/执行者：2026-09-29 / Codex
- 审核基线：luna-design，HEAD 4b5d250b + 0025/0026未提交内容。
- 状态：承认原生编译与已有3测试通过；不接受“P0剩余全部真机项”。未提交/推送；未checkout/reset/clean/stash。
- 本批仅文档与可重放诊断证据；临时测试结束后归档，不改正式实现。

## 发现与下一批任务

### P0-R1 / P1：指纹匹配会把重复笔画映射为同一objectId

CanvasView.swift updateUnits用previous.first匹配rounded bounds+path.count且不消费已匹配项。两个相同笔画第一次分配两个UUID，下一次更新两者都匹配previous[0]，得到同一个ID。不同路径/压力/颜色也可能有相同bounds/count，修改无法可靠识别。命中后移动/删除可能操作错对象。

新增模拟器诊断：同一个PKStroke放两次，连续updateUnits，第二轮仍应有2个不同ID。结果见下方最终证据。ADR-0002本来要求重复形状/同点重画/删除前一笔，当前三例没有覆盖这些。不能将此验证完全延期至P1后再称P0身份完成。要求一对一匹配、可区分笔迹内容的策略、稳定持久映射，补同点重画/相同bounds不同内容/真实mask变化/前笔删除用例；不采用未支持的beta ID或私有API。

### P0-R2 / P1：导出/变换往返仍是占位，不是缺设备

DocumentExporter.export只构造元组然后丢弃，无文件写出、无重开，SHA256Digest返回UNIMPLEMENTED-P1。simulateWebTransform只修改units里的矩阵，updateUIView为空，没有把变换应用回PKCanvasView，也没有网页参与。

现有testTransformIsScaleTranslateOnlyAndAppliesOnce第二次调用期望before×1.5，即2.25；这证明连续相对缩放，不证明“同一文档变换重开不重复应用”。P0可以不做完整ZIP生产实现，但最小三笔资源导出→网页变换/删除→原生重建/局部擦除的验证仍需完成。可在模拟器先做程序化笔迹、原生重渲染与PNG叠色差异；真实压感/手感另由iPad验证。荧光笔交叉fixture和网页预览对照目前也未实现，不只是缺截图设备。

要求：下一批补可保存/重开的小原型及真实哈希；原生重建后的bounds独立断言（不是仅测矩阵乘法）；同一操作/同一文件重复回放不叠加，主动再执行一次缩放允许1.5→2.25，这两个场景分开测。局部擦除式“缩短点数”测试不等于真实PencilKit局部橡皮集成测试。

### P0-R3 / P1：manifest没有兑现等比正缩放契约

manifest.ts validateTransform检查b/c与det>0，但没有a≈d及a>0,d>0。独立诊断确认[2,0,0,1,0,0]、[-1,0,0,-1,0,0]均被接受；前者非等比，后者双轴负缩放。另capabilities=42仍通过，返回却被断言为LunaCanvasManifest。

要求：严格验证正的有限等比变换与capabilities数组/必要能力；补这3项失败回归。P1前完成资源表唯一性、引用存在性、哈希格式/真实内容校验、整数版本/大小、字符/路径规范、manifest大小限制与未知字段保留。当前只是部分结构校验，不能称完整容器已安全可写；resources fixture缺scene/preview/hit资源且哈希abc也通过，P1需真实fixture补齐。

### P0-R4 / P2：文档证据范围与工具分发需整理

README和Swift头仍写“无Xcode/未编译”，DocumentExporter头仍含虚构ZIPFoundation 2.2.10；应更新当前说明并保留历史记录。Package.resolved现场锁定0.9.20可确认，不需要再声称“最新版”。以新SDK设置17.0 deployment target编译不等于已在iPadOS17运行。

仓库新增tools目录约14MB，另有约4MB压缩包；提交前明确保留哪一种、来源和校验哈希，避免重复vendoring。不要自行运行附带install.sh改系统。原生build产物/用户配置不提交。身份映射在drawingDidChange遍历全部笔迹并嵌套匹配，仍在主线程；后续性能/事务节流须实际测，不以“注释说结束后”当实现。

## 用户确认的左下固定比例与缩放锁

现有100%/200%/300%及锁已在actionCanvas/Actions中实现，并有当前比例高亮、锁按下态提交。用户明确要求，**必须保留**；不能在原生整合时误当旧画笔面板删除。

新增原生合同约束：这些按钮改变共同视口，不修改笔迹worldTransform，不进入内容缩放命令；原生层与网页层一起缩放。锁定阻止视口缩放（快捷按钮、双指等），仍允许平移、书写与选中内容等比缩放。比例切换以同一视口中心锚定；横竖屏/分屏两层对齐，按钮状态和锁语义一致。

本轮网页快捷缩放3测试通过，未进行新视觉截图或原生联动验证；原生当前尚未接入此UI。

## 实际验证

- `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/lunacanvas-manifest.test.ts packages/excalidraw/tests/handwriting-zoom.test.tsx`：退出0，2文件11通过；evidence/0027-web.log。
- `tsc --noEmit`（node_modules/typescript/bin/tsc）：退出0；evidence/0027-tsc.log。
- 新增manifest.ts/manifest测试的ESLint --max-warnings=0：退出0；evidence/0027-eslint.log。
- 原生命令：在apps/ipad，`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas -destination 'platform=iOS Simulator,id=C5D8FD6E-2292-4B3B-8475-E0A36BE6409A' -derivedDataPath build -disableAutomaticPackageResolution test`。首次沙箱因Swift缓存写权限失败，经授权扩大执行权限后退出0、3项通过。未修改系统developer目录。证据0027-native.log、0027-native-retry.log。
- manifest新增3项诊断：退出1、3项失败；0027-manifest-probe.log。源码0027-manifest-probe.ts.txt，复制回packages/excalidraw/tests下用Vitest重放。
- 本轮未重跑全量网页/生产构建：实现无修改，针对新增契约与用户指定缩放复验；0026的1556全量统计仍是Kimi报告。
- git diff --check通过。真机手感/掌托/iCloud/性能未验证。

下一批0028修复R1/R3，补R2最小往返及叠色实验，整理R4文档，之后可推进P1；不以此时报告批准提交或完整P0验收。用户不必等到真机才能让Kimi继续软件修复。

原生独立身份诊断最终结果：同点两笔第二次snapshot的唯一ID数实际1、期望2，1项失败，xcodebuild退出65。命令同上追加 `-only-testing:LunaCanvasTests/IdentityMappingTests/testCoincidentStrokesKeepDistinctIdsOnRepeatedSnapshot`。日志0027-identity-probe.log；完整可重放测试源码0027-identity-probe.swift.txt。原测试文件已逐字恢复，未删改正式3项测试。日志另有模拟器诊断收集simctl路径告警，与明确的XCTest断言失败分开记录。
