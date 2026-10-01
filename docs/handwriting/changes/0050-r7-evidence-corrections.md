# 0050 — R7：状态、候选构建与证据修正

- 执行者：Kimi；2026-09-30 本地。承接 0049（HEAD `20b89df4`）。本批只动文档/脚本/证据。
- 范围：0044-R7 全部子项。

## 修正内容

**IMPLEMENTATION_STATUS.md（重写）**
- W05/W06/W09/W11 更新为"含宿主接线"（0047/0049）；W13 更新为"0050 硬化后自动化通过"；W14 保持"待授权（未执行如实标注）"。
- **N06 映射纠正**：旧矩阵误写"视口与内容缩放独立"；SPEC N06 实为"往返后原生可编辑"——状态改为自动化通过，证据 0031/0045/0049（web 编辑→保存→原生重开继续写擦）。
- 新增 0044 R1–R7 关闭映射表。

**CODEX_REVIEW_PACKAGE.md（重写）**
- §1 基线改为已提交链（5 个 SHA），0044 记录入库说明。
- §4 新增 R1–R7 关闭证据表（记录+关键测试/证据）。
- §5 闭环步骤更新为 XCTest 写入器 + 浏览器闭环（实测结果与产物清单）。
- §6 统计更新（129/1618、原生 58/0、jszip 独立 chunk）；W14 明确"部署 200 ≠ 功能烟测"。
- **yarn.lock 说明**：逐 hunk 核对 = 纯 registry 重写（yarnpkg.com#hash → npmjs.org），零版本漂移；jszip 3.10.1 由传递依赖提升为直接声明（锁中已有同版本条目，无需变更）。不回退（回退会丢直接依赖所需条目）。

**build-candidate.sh（硬化，R7 逐项）**
- `gen-fixture || true` 移除：改为 XCTest 写入器（哨兵文件 `/tmp/lunacanvas-fixture-out`）重生成 + mtime 校验，失败即构建失败；废弃 SPM fixturegen 路径（该二进制 macOS 26 下退出即 trap）。
- prepare-web-assets.sh 路径修正为实际位置 `scripts/native/`。
- hash 改为**排序相对路径树哈希**（`find | LC_ALL=C sort | xargs shasum | shasum`），去掉绝对路径，跨机可复现。
- manifest 新增：源码 SHA/dirty 数/分支、xcodegen **实测** sha256（8774da7… 与记录一致）、原生 .app 树哈希。任何关键步骤失败即非零退出。

## 验证

- 硬化后 `build-candidate.sh` 全 5 步端到端通过（web 构建 13.8s、fixture 重生成、原生 58 tests TEST SUCCEEDED、manifest 写出）。
- 全量网页/原生/tsc/eslint 在 0049 记录已证，本轮无源码改动。
- 候选 manifest 的 dirtyFiles=3 即本批 0050 自身文件（提交后为 0；.app 树哈希含构建时间戳，每轮候选自然不同，manifest 只描述当次构建）。

## 结论

0044 R1–R7 全部关闭。剩余：真机验收（独立待验）、ShellView 挂载（下一里程碑，不阻塞文件/浏览器闭环）、W14 发布执行（待用户授权）。
