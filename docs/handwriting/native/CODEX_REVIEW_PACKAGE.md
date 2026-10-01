# CODEX 集中复核包（W00–W14 + 0044 R1–R7 修复）

主入口（本文）。日期：2026-09-30。执行者：Kimi。任务书：native/RELEASE_EXECUTION_PLAN.md。

## 1. 基线与版本状态

- 分支 `luna-design`，HEAD `20b89df4`（0049 全部已提交并推送，Vercel 自动部署）。
- 提交链：`8641ab04`（W00–W14 模块批次）→ `4e5d2c45`（SPM .build 清理）→ `f0453866`（0045–0048，0044 R2–R6）→ `e08c70a3`（0049 part1）→ `20b89df4`（0049 part2 宿主接线+浏览器闭环）。
- 0044 复核记录：`changes/0044-codex-phase3-integration-review.md`（已入库）；R1–R7 修复记录 0045–0050。
- yarn.lock 大范围变动说明：经逐 hunk 核对为**纯 registry 重写**（`registry.yarnpkg.com#hash` → `registry.npmjs.org`，本地 yarn registry 配置所致），**零依赖版本变化**；jszip 3.10.1 为既有锁定版本（由传递依赖提升为 `packages/excalidraw` 直接声明，无需锁变更）。不回退（回退将丢失 jszip 直接依赖所需的锁条目）。

## 2. 复核顺序与入口（推荐）

1. **0044 R1–R7 关闭**（本文件 §4）→ 记录 0045/0046/0047/0048/0049/0050。
2. **文件兼容/源字节**：`changes/0031/0045` → `RoundTripTests` + `MixedDocumentTests` → TS `lunacanvas-{manifest,container,fixture,0045}.test.ts`。
3. **身份/事务/历史**：`changes/0036/0038/0047` → `BridgeSessionTests` + `NativeInkHistoryTests` + `IdentityMappingTests`。
4. **渲染/命中**：`changes/0046` → `HitGeometryTests`（原生）+ TS `lunacanvas-{inkmodel,0046}.test.*`。
5. **宿主闭环**：`changes/0049` → TS `lunacanvas-0049-{webdocument,overlay}.test.*` + §5 浏览器证据。
6. **发布证据**：`native/IMPLEMENTATION_STATUS.md`、`RELEASE_RUNBOOK.md`、`RELEASE_CANDIDATE.json`。

## 3. W/N/V 矩阵

见 `native/IMPLEMENTATION_STATUS.md`（唯一权威矩阵，含 0044 R1–R7 关闭映射）。

## 4. 0044 R1–R7 关闭证据

| 项 | 记录 | 关键证据 |
| --- | --- | --- |
| R1 宿主入口 | 0049 | 原生 App 文档浏览器打开/全页保存/另存为/新建；编辑器 `loadFromBlob`/`saveAsJSON` 正式接缝；`LunacanvasInkOverlay`（z-index 3，graphics 之上 UI 之下）；浏览器闭环 `evidence/0049-closed-loop.cjs` + 截图 2 张 |
| R2 混合保存 | 0045 | scene 逐字节全周期；外来资源/inkObject 未知字段保全；非 objectId refs 逐字（TS probe→正式测试） |
| R3 身份 | 0045 | 全内容属性 sha256 digest（压力-only 修改入正式集：`testPressureOnlyEditIsDetected…`）；splitFrom 图入 manifest |
| R4 命中几何 | 0046 | 等弧长+端点（4 点短线探针）；width=笔触厚度；洞逐段裁剪（洞内套索探针）；`createAlphaSampler` 真实现 |
| R5 统一历史 | 0047/0049 | 单一 `DocumentHistory` 协调器（TS+Swift）；交错序探针入正式集；编辑器拖拽/删除入栈 |
| R6 浏览器容器 | 0048/0049 | `node:crypto` 硬依赖移除（Web Crypto+注入）；`openLunacanvasContainer` 真实 ZIP 双预算；**浏览器实测**（§5） |
| R7 证据 | 0050 | 本包重写；STATUS 矩阵纠正（N06=往返后原生可编辑）；build-candidate 硬化；yarn.lock 说明（§1） |

## 5. 完整跨端闭环（可重复步骤）

```sh
# 1) 重新生成 Swift 侧 fixture（XCTest 写入器，模拟器内运行）
echo "$PWD/docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas" > /tmp/lunacanvas-fixture-out
cd apps/ipad && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas \
  -destination 'platform=iOS Simulator,id=C5D8FD6E-2292-4B3B-8475-E0A36BE6409A' \
  -derivedDataPath build test -only-testing:LunaCanvasTests/FixtureWriterTests
rm /tmp/lunacanvas-fixture-out
# 2) TS 全量校验 + 3) 原生全量回归
node node_modules/vitest/vitest.mjs run --watch=false
# 4) 真实浏览器闭环（需 dev server 于 :3199；Playwright）
node docs/handwriting/evidence/0049-closed-loop.cjs
```

浏览器闭环实测结果（2026-09-29，headless Chromium）：拖放 `.lunacanvas` → 墨迹渲染 → 矩形工具画矩形 → 拖拽墨迹（选中高亮）→ 菜单导出下载 → 容器校验 `revision=1`、`worldTransform=[1.5,0,0,1.5,150,60]`（拖拽量精确）、scene 含矩形、4 资源、sha256 合规、零页面错误。证据：`evidence/0049-browser-{open,moved}.png`、`evidence/0049-browser-saved.lunacanvas`。

## 6. 测试统计（0050 轮，2026-09-30）

| 命令 | 退出码 | 统计 |
| --- | --- | --- |
| `tsc --noEmit` | 0 | 无诊断 |
| `vitest run --watch=false --maxWorkers=2 --minWorkers=1` | 0 | **129 文件 / 1618 passed / 47 skipped / 1 todo** |
| `eslint --max-warnings=0 <改动面>` | 0 | 无警告 |
| 原生 `xcodebuild test` | 0 | **58 tests, 0 failures** |
| `vite build`（excalidraw-app） | 0 | jszip 独立 async chunk，workbox 预缓存不超限 |
| `git diff --check` | 0 | — |

已知非阻塞项：MermaidToExcalidraw 快照在并行满负荷下有动画时序抖动（单独运行通过，与本项目无关）。

## 7. 构建/安装/发布

- 候选构建：`scripts/native/build-candidate.sh`（0050 硬化：任何步骤失败即失败；fixture 经 XCTest 写入器重生成并校验 mtime；hash 为**排序相对路径**树哈希，跨机可复现；manifest 含源码 SHA/dirty 数/分支、Xcode/SDK/xcodegen 实测哈希、web 构建与原生 .app 树哈希、fixture 哈希）→ `native/RELEASE_CANDIDATE.json`。
- 手册：`native/RELEASE_RUNBOOK.md`。
- 签名缺口：模拟器构建无签名；真机需用户配置 Team——**未提供 IPA，不虚构**。

## 8. 剩余问题（按严重性）

| 严重性 | 问题 | 阻塞 | 绕过 |
| --- | --- | --- | --- |
| 高 | 真机验收全项（录屏/手感/掌托/双击/横竖屏/局部擦除/Files/离线/性能） | 阻塞"最终可发布"判定 | 需用户 iPad；清单见 RUNBOOK |
| 中 | ShellView 未挂载运行 App（WKWebView 桥接编辑器内图形↔墨迹全局撤销交错） | 不阻塞浏览器/文件闭环 | 文件往返（已通） |
| 中 | mask 洞多边形独立提取（web 以 preview alpha 精判） | 不阻塞 | preview alpha |
| 中 | 5000 笔导出 ~7.7s（派生资源后台队列化） | 不阻塞 1000 笔目标 | 分批保存 |
| 低 | 图标占位、隐私文案、降级导出 UI 警告接线 | 不阻塞候选包 | 壳层文案 |

## 9. W14 状态

未执行（发布需显式授权）。web 部署由推送自动完成（Vercel），但**部署 200 ≠ 功能烟测通过**；功能级烟测以 §5 浏览器闭环为准。

## 10. 授权记录

0025–0043 批次提交/推送：`8641ab04`（含当时授权）；0045–0049 批次：`f0453866`/`e08c70a3`/`20b89df4`（用户 2026-09-29 明确授权"提交这批修复"及 0049 继续）。原生真机分发未授权、未执行。
