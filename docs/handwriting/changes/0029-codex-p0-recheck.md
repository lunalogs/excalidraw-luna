# 0029 — Codex复核0028：已有测试通过，P0往返仍未闭环

- 日期/执行者：2026-09-29 / Codex
- 阶段：P0 review；需求N07/N08/N11/N14，V05/V08/V09/V16。
- 起始/结束HEAD：luna-design，4b5d250b；复核现有未提交内容。
- 状态：部分完成；不关闭0027全部问题，不作为提交推送授权。
- 改动：本记录、PROGRESS.md、evidence/0029-*诊断与日志；无产品实现修改。临时测试运行后归档并恢复正式测试文件。未checkout/reset/clean/stash。

## 承认已完成的修复

顺序消费匹配修复了重复快照的ID数量塌缩；真实ZIP写出、CryptoKit SHA-256、单笔原生缩放与重复回放测试确已运行通过。TS拒绝非等比/双负缩放/非法capabilities的原始三例修复成立。原生10项和网页manifest/快捷缩放13项独立复跑通过。荧光笔RMSE复现为0.023385358667337135；它是当前合成实验的数值，不是网页集成或真机视觉通过证据。

## 下一批明确任务（R1–R5）

### R1 / 高：变换路径重新合并了重叠笔画

`CanvasView.swift:applyWebTransformsToCanvas`把units写入以fingerprint为key的单值字典。两条完全相同笔画中仅第一条有1.5x变换时，第二条identity覆盖第一条，第一条没有缩放，矩阵也未归一。

要求：整个更新/回放链使用稳定objectId或明确的一对一关联，禁止用非唯一几何指纹字典取单个对象。烘入与归一同事务完成，不靠“几何变了自然匹配不上”生成新ID来归一。补重叠两笔只变一笔、重复回放和顺序/ID保持测试。

另：fingerprint仍仅bounds/count/RGBA，未覆盖路径内部、压力、ink类型、mask；当前“删除前笔”测试用不同y位置，未证明同点重画后删除前笔的身份正确。按ADR身份策略补内容差异/真实mask场景，无法可靠区分时明确策略，不宣称持久身份已完成。

### R2 / 高：文件往返丢变换，导出又不符合自己的TS契约

`DocumentExporter.export`写入worldTransform，但`ImportedInkUnit`与`open()`既不保留矩阵，也不应用到返回drawing。保存1.5x状态后重开只拿回原始大小。现有测试把内存回放与文件哈希往返分开，未覆盖这个链路。原型UI的Simulate按钮也仅改矩阵，未调用回放。

同时sceneRef固定为scene/excalidraw.json，ZIP和resources都没有该资源；新TS validator必然拒绝该输出。

要求：统一原生读写与TS最小协议，至少生成真实空scene并登记哈希/大小；读取保留文档元数据、order、变换并接入重建，或明确且原子地烘入归一。加入真实导出→TS校验/变换或删除→原生重开→再保存/重开的fixture。测试最终可见几何与未改笔迹字节，不要求读取阶段必须烘入（返回矩阵并由重建阶段正确应用也可）。不要用只含内存矩阵乘法的断言代替跨端链路。

### R3 / 高：坏manifest不能可靠失败

原生`open()`对缺失/类型错误inkObjects用`?? []`，`{}`作为manifest被成功读取为空文档，未验证type/schema/capabilities/resources等。TS新增引用遍历对null entry直接读objectId，虽然前面已记录not an object，仍抛TypeError而不是返回错误结果。

要求：先完整验证结构再取值/构造对象；Swift与TS保持拒绝语义。资源哈希/大小与对象引用一致；禁止无效输入默认空文档；补坏JSON结构、null entry、未知版本、资源表与实际字节不一致用例。完整ZIP预算仍按P1实施，不把全部P1提前伪装为本轮P0门槛。

### R4 / 中：工程检查未绿、文档状态未同步

本轮tsc实际退出2：manifest.ts:148，string不能传给literal union数组的includes。严格ESLint退出1：manifest.ts:225一条prettier警告。修正类型收窄和格式后重跑，勿通过宽泛断言绕过输入验证。

CanvasView.swift、LunaCanvasApp.swift仍写“无Xcode/未编译”；PROGRESS顶部还停留0027。应更新当前状态但保留历史记录。本轮未复跑网页全量/生产build（产品源码未修改；已有定向失败需先修），0028的全量报告不算本轮复验。

### R5 / P1前必须处理：失败保存可能先删除旧文件

`DocumentExporter.export:32`先removeItem目标，后建ZIP。后续写入失败会丢失原文件；UI固定同一路径且try?吞错，无法向用户报告。此项来自源码审阅，未做磁盘满故障注入。

按N20/P1实现同目录临时文件写全并校验后原子替换；失败保留旧文件并显式报错。原型阶段可先拒绝覆盖已有目标。补写入中途失败的旧文件字节不变测试。P0实验不要拿真实用户文档做覆盖测试。

## 复现与验证

在仓库根目录执行：

- `node node_modules/vitest/vitest.mjs run packages/excalidraw/tests/lunacanvas-manifest.test.ts packages/excalidraw/tests/handwriting-zoom.test.tsx --watch=false`：退出0，13通过。
- `node node_modules/typescript/bin/tsc --noEmit`：退出2，上述TS2345。
- `node node_modules/eslint/bin/eslint.js --max-warnings=0 packages/excalidraw/lunacanvas/manifest.ts packages/excalidraw/tests/lunacanvas-manifest.test.ts`：退出1，1warning。
- 临时TS探针：evidence/0029-manifest-probe.ts.txt复制回packages/excalidraw/tests/lunacanvas-0029-probe.test.ts，再用vitest run该文件；null entry诊断退出1，1失败。

原生命令在apps/ipad：

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas -destination 'platform=iOS Simulator,id=C5D8FD6E-2292-4B3B-8475-E0A36BE6409A' -derivedDataPath build -disableAutomaticPackageResolution test
```

基线退出0，10通过。独立诊断完整源码在evidence/0029-native-probe.swift.txt；仅临时替换RoundTripTests.swift后运行该文件中testReview0029前缀四项（用四个-only-testing:LunaCanvasTests/RoundTripTests/方法名选择），结束恢复原文件。日志在evidence/0029-native*.log。结果见下方补记。

## 保留范围与交付

左下100%/200%/300%及缩放锁必须保留，本轮既有3项通过；原生/网页统一视口尚待P3集成验证。无协议生产迁移、无新依赖、无正式测试期望修改、无快照更新。真机手感/掌托/iCloud/性能未验证；新SDK设置17.0部署目标不等于iPadOS17运行已测。

下一批0030按R1–R4修复并补实际闭环，R5至少先禁止危险覆盖，完整原子保存放P1。无需用户提供新API或设备即可完成这些软件修复；设备仅用于独立的真机验收。当前未提交/未推送。

## 独立诊断最终结果

- 原生4个诊断场景全部失败，共5条断言失败，xcodebuild退出65：重叠第一笔宽104，期望156±4且未归一；导出scene entry为nil；`{}`读取未throw；保存变换后重开宽104，期望原生实际变换后的154。
- 原生导出manifest通过日志base64取回，保存为evidence/0029-native-manifest.json；实际JSON输入TS validator的额外探针退出1，1失败：sceneRef缺resources。源码0029-export-probe.ts.txt，日志0029-export-probe.log。未捏造fixture内容。
- 两个TS独立探针合计2场景失败；正式源码与测试无改动，临时文件已移除；RoundTripTests.swift与运行前备份逐字比较相同。
- 原生诊断日志末尾另有simctl诊断收集路径告警，与前面的明确XCTest失败分开记录。日志文件被仓库既有ignore规则忽略，本地可查；上述失败、数字及重放源码已写入可提交文档，提交者若需要原始日志应明确选择纳入。
