# 0044 — Codex集中复核：模块原型有进展，Phase 3未完整接通

- 执行者：Codex；2026-09-29本地（交付记录部分使用09-30 UTC）。
- 基线：luna-design，4e5d2c4593e2d53bc9bb934e2a004a622beb3415；开始时工作区干净。已见8641ab04、4e5d2c45本地提交；本轮未核实远端/部署状态。
- 范围：按文件数据→身份/历史→渲染/命中→实际入口→证据审核。独立测试与源码可达性审查；无产品代码修复、无提交/推送/部署。
- 结论：**不能接受W00–W14全部完成或仅剩真机。核心模块存在，但主入口、跨端编辑、文件流程与统一历史未集成。** 按下述R1–R7推进0045+，继续原任务书，不另起一个规划循环。

## R1 / 阻塞：用户入口没有使用交付的新模块

- `apps/ipad/LunaCanvas/LunaCanvasApp.swift:ContentView`仍只创建CanvasView、显示LunaCanvas(P0)，只有Export 3 strokes和Simulate web transform。导出调用`units.prefix(3)`，并用try?吞错误；没有真实打开、保存全页、另存为或文档浏览器入口。
- `ShellView`未从App调用。即使单独挂载，makeUIView没有注册WebBridge handler/userScript，input/mapping未用于事件路由，updateUIView是空操作；anyInput原生层覆盖网页，不构成实际Pencil写/手指导航/统一视口。
- 全仓产品TS/TSX引用检查：InkLayer、InkEditingController、lunacanvas容器代码未接入既有App/components/actions/file入口，只被自身/测试引用。4b5d250b..HEAD在packages/excalidraw/excalidraw-app范围只新增lunacanvas模块和测试，未改宿主入口。
- DocumentFileStore、NativeInkHistory也未挂到运行中的App。InputCoordinator模型测试不能证明真实手势/双击已经工作；没有对应硬件事件接线。

要求：完成W05–W11实际宿主集成，先交一条用户可操作的三笔+矩形/文字→保存→网页打开混合移动/删除→保存→原生继续写擦闭环，再扩展。必须增加真实浏览器UI/原生入口集成证据，不仅直接调用模型。无设备也可以完成这些接线和模拟器/浏览器验证。保留固定比例与缩放锁。

## R2 / 阻塞：保存混合文档会遗漏图形/资源

`LunaArchive.buildArchive:125`每次调用makeEmptySceneData；export只接受units，没有传入实际scene或图片资源库的接口。open虽然返回sceneData，DocumentExporter再保存没有将它传回。含矩形/文字/图片文档经过当前原生保存路径会丢掉图形；空scene fixture无法发现。

同时`parseInkObject`不保留nativeAssetRef/previewRef/hitGeometryRef；`serializeInkObject:276`用objectId重造路径。合法文件使用asset-v2资源路径时，未修改对象也会变成另一个不存在的引用。独立TS测试已失败。对象扩展/版本/替换关系的完整往返也不能只靠保存顶层extras宣称完成。

要求：文件写入从完整文档/资源库出发，原scene、图片、drawing原始字节、可保留扩展及引用全部保全；删除/撤销资源生命周期有明确事务。增加非空混合scene、非objectId命名资源、图片、未知可保留字段的原生→网页→原生字节/语义往返测试，且经真实保存入口。

## R3 / 高：身份粗指纹会将实际编辑判为未变

CanvasController.updateUnits的fast path仅比较bounds/count/RGBA相同就return；这不等于路径、压力、ink类型、mask相同。同外框同点数的内容修改会继续保存旧drawing/原字节/旧预览，用户改动可能丢失。此前0029已要求覆盖这些情况，当前仍保留粗指纹策略。

要求：落实ADR中可区分内容与事务身份的策略，不用几何摘要当完整内容相等证明；未变对象保ID与原字节，修改/分裂有明确版本/替换关系。独立同bounds压力变更诊断及真实mask/内部路径变化纳入正式集。

## R4 / 高：命中几何不代表可见墨迹，alpha降级未实现

- `DocumentExporter.makeHitData:72`按path索引每4点取样，不是注释称的4pt等弧长；4点短笔迹仅导出1个点，TS worldSegments为空而无法命中。
- 同函数:88使用stroke.renderBounds.width当笔宽；横向长线会被当成很粗的胶囊，导致远离笔迹仍被选择/擦掉。
- TS套索完全不看hasMask/maskBounds；圈在测试定义的擦除洞内仍返回true（独立探针失败）。橡皮把整个maskBounds当洞也不是一般mask的正确可见性语义。
- 文档/inkModel注释称通过InkLayer.alphaHit精判，但InkLayer仅是img矩形pointer handler，无alpha采样/精判函数。当前路径没有所称的补救措施。

要求：从真实PencilKit可见几何/遮罩生成误差有界的数据，保证端点和短笔迹；若以alpha精判就真正实现套索与橡皮的精判、缓存、错误/未加载策略及像素到世界映射。用真实带mask fixture验证洞内不选、可见残笔可选、长短/粗细/变换均正确。不要只调宽度阈值或更改测试模型规避。

## R5 / 高：所谓统一历史仍是两套独立栈

InkEditingController.undo:208优先弹墨迹栈，栈空才调graphicsUndo；没有图形命令注册/交错顺序标记入口。墨迹移动→新增矩形→撤销会先撤销墨迹。独立TS模拟该顺序失败。NativeInkHistory是另一独立栈且未接运行入口；emittedPayloads只是本地数组，不能当桥消息已提交的证据。

要求：落实一个有序文档命令协调器和真正双端事务路由。测原生写→图形操作→混合变换→局部擦除交错序及连续undo/redo、cancel、切文档迟到回调；一次用户动作一项历史。不能把两个栈各自通过单测称为统一历史。

## R6 / 高：网页容器验证使用Node专属crypto

`packages/excalidraw/lunacanvas/container.ts:150`动态import("crypto")并createHash。当前fixture测试在Node可用；普通浏览器没有该Node内置模块，Vite通常将其externalize。既有生产build能绿是因为该模块未接用户入口，不能证明网页可导入容器。

要求：使用浏览器可用哈希入口（例如Web Crypto，在目标浏览器/部署上下文实测）并补真实浏览器加载真实ZIP、验hash、错误返回与保存重开测试。实际ZIP适配层落实读取预算而非只信测试stub元数据；失败返回可显示错误并保旧文档。

## R7 / 中：状态、发布候选与证据需要纠正

- IMPLEMENTATION_STATUS自身还列宿主接线/W11/UI状态待做、W13进行中、W14待授权，与“全部完成”矛盾；N06行误写为视口与内容缩放独立，SPEC N06实际是往返后原生可编辑，须纠正映射。
- CODEX_REVIEW_PACKAGE仍称工作区未提交、未补实际SHA，§5仅Swift生成→Node读→分别原生测试，不是网页修改后返回Swift的完整往返。
- build-candidate.sh将gen-fixture失败用`|| true`吞掉；候选manifest不含源码SHA/工作区摘要或原生App产物哈希，web聚合hash使用find无排序并混入绝对路径，不能跨路径复现。固定XcodeGen哈希应实测。
- 生产URL返回200仅证明可访问，不证明新功能接通或对应提交已部署；本轮未重复验证生产，不认可其为功能烟测。
- yarn.lock变动1933增/2146删，需解释锁文件大范围变化、还原无关漂移或给出必要性证据；不能只用“新增jszip”代替依赖审查。

要求：完成上述产品闭环后，重写状态/最终包并给真实UI证据。候选构建任何关键步骤失败即失败，记录确定排序的相对路径产物hash、源码与原生包对应。W14未执行就写未执行。真机手感/Files/性能仍独立待验，不掩盖软件缺口。

## 本轮验证与改动

本轮仅新增0044记录、PROGRESS状态、独立探针源码/脱敏摘要。临时探针运行结束归档，正式测试恢复；无产品源码修改。未checkout/reset/clean/stash。

- 网页全量原命令 `node node_modules/vitest/vitest.mjs run --watch=false`：退出1，123文件中13失败/110通过，55失败/1532通过/47跳过/1todo；188.11s。多处still loading，和其他验证并行时出现；不能直接归因于本次源码，追加限制workers复验，最终见补记。
- tsc：`node node_modules/typescript/bin/tsc --noEmit`退出0。
- 原生基线：45测试通过，0失败，24.55s；xcodebuild退出0。
- TS独立3项诊断均失败：洞内套索、资源引用保留、交错历史。源码evidence/0044-web-probe.ts.txt；复制回tests/lunacanvas-0044-probe.test.ts用vitest重放。历史探针特意在控制器外表达图形编辑，因为被测控制器没有注册该操作的API，修复后应改为实际统一入口的交错测试。
- 原生独立2场景、严格lint、限制并发全量结果见补记。原生命令同0029，destination同既有模拟器；诊断追加-only-testing选择testReview0044HitWidthAndShortPath与testReview0044PressureOnlyEditNotDiscarded。完整源码evidence/0044-native-probe.swift.txt。
- 未跑生产部署或完整浏览器E2E：主入口未接通，当前没有可供完成该操作的产品路径。未重建候选包/覆盖已提交网页静态资源。

下一批从0045开始；优先R1/R2/R3文件与接线，再R4/R5/R6集成验证，最后R7证据。沿用RELEASE_EXECUTION_PLAN连续推进，无需等待Codex逐条批准，但不得再把模块骨架称为最终产品完成。

## 结果补记

原生独立两场景均失败（3条断言），退出65：4点短线只生成1个hit点；3pt线width实际34；同bounds压力从0.2改0.9后units仍0.2。说明R3/R4是实测问题，不是仅推测。原生诊断日志末尾另有simctl诊断收集路径告警，不影响明确XCTest断言结果。正式RoundTripTests已逐字恢复。

严格ESLint `node node_modules/eslint/bin/eslint.js --max-warnings=0 packages/excalidraw/lunacanvas packages/excalidraw/tests/lunacanvas*.ts packages/excalidraw/tests/lunacanvas*.tsx`退出0。诊断日志本地位于evidence/0044-*.log（受既有ignore规则影响），提交应保留本记录与可重放探针，不只引用/tmp。

限制并发全量复验：`node node_modules/vitest/vitest.mjs run --watch=false --maxWorkers=2 --minWorkers=1`退出0。

```text
 Test Files  123 passed (123)
      Tests  1587 passed | 47 skipped | 1 todo (1635)
   Duration  110.83s (transform 8.97s, setup 25.08s, collect 53.49s, tests 97.73s, environment 20.71s, prepare 4.53s)
```

因此首轮全量失败不能认定为功能回归（低并发完整通过）；独立5个诊断场景的确定性失败仍成立。git diff --check通过，正式源码/测试无残留改动。
