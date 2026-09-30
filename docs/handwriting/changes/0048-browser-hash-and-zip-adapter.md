# 0048 — R6：浏览器可用哈希 + 真实 ZIP 适配层

- 执行者：Kimi；2026-09-29 本地；未提交。承接 0047。
- 范围：0044-R6。`container.ts` 硬依赖 `import("crypto")`（Node 专属）替换为可注入哈希 + Web Crypto 默认实现；新增真实 ZIP 适配层，预算不再只信测试 stub。

## 修复

**`container.ts`**
- 删除顶层 `await import("crypto")`。`validateContainer(source, options?)` 新增 `hashBytes` 注入；默认实现：优先 `crypto.subtle.digest("SHA-256")`（浏览器原生），仅当 subtle 缺失时回退 `node:crypto`（测试/CLI，bundler 打不到的路径）。
- 新增 `ContainerBudgetError`：readEntry 在**解压后的真实字节**上违反单条/总量预算时抛出，validateContainer 转为可见错误 `resource exceeds read budget`——元数据预算之外的第二道真实防线。

**新增 `zipContainer.ts`（真实 ZIP 适配层）**
- `openLunacanvasContainer(data)`：jszip 浏览器兼容（已加入 `packages/excalidraw/package.json` 依赖，3.10.1，与 node_modules/yarn.lock 现存版本一致）；entries 元数据取自 ZIP 中央目录（`_data.uncompressedSize`，不可得时记 0 并由字节级预算兜底）；readEntry 累计真实解压总量并逐条限预算；非 ZIP 输入返回结构化错误（`not a readable ZIP archive`），永不抛异常；校验通过后返回 `readEntry` 供宿主取 scene/previews。
- 实测发现：jszip 在**写入时**会把 `../evil` 路径消毒为目录条目——路径遍历检查保留给外来构造的存档（validator 仍是最后防线），测试改为 stub source 直接验证拒绝路径。

## 验证

- 新增 `lunacanvas-0048.test.ts`（6 项）：默认哈希与 node:crypto 一致；注入哈希通道；**真实 Swift fixture 经 openLunacanvasContainer 全量验证通过并可读 scene**；等长篡改资源被 hash mismatch 捕获（证明走的是哈希而非 size）；非 ZIP 结构化错误；遍历路径拒绝。
- **浏览器可导入性实测**：vite 以 browser target 打包 `zipContainer` 入口成功（`VITE-BROWSER-BUILD-OK`）；`excalidraw-app` 全量构建回归通过（14s）。
- 待 0050 前统一跑网页全量。

## 记录声明

- 真实浏览器（Playwright）加载真实 ZIP 的端到端用例依赖 R1 宿主接线后的入口（0049）；本批已完成 bundler 级浏览器构建证明与 Node 全链路验证，浏览器运行时实测列入 0049/0050 证据清单。
- jszip 入 package.json 依赖；yarn.lock 已有同版本传递条目，锁文件正式 re-resolve 在有 yarn 的环境提交时执行（本环境无 yarn，已在记录声明）。
