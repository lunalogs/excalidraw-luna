# LunaCanvas 发布与回滚手册（W13）

## 候选版本

- 版本 0.1.0 (build 1)，Bundle ID `com.lunalogs.lunacanvas`，iPad-only，部署目标 iPadOS 17.0（编译验证；最低系统运行待真机）。
- 候选构建：`scripts/native/build-candidate.sh`（干净 derivedData → web 构建 → 离线资源打包 → fixture → 原生 test → 产物哈希写入 `RELEASE_CANDIDATE.json`）。
- 签名：模拟器无签名；真机安装由用户在本机 Xcode 选 Team 完成（证书/描述文件不入库）。**未签名前不得声称提供可安装 IPA。**

## 网页（既有授权范围内）

- `luna-design` 推送 → Vercel 项目 `excalidraw-luna` 自动构建部署到 https://excalidraw.lunalogs.com 。
- 上线烟测（发布后）：非私人 fixture 走 打开→整理→导出→再开 + 离线基本操作；以线上 URL 实际响应为准，不以 push 绿代替部署完成。

## 原生分发（需用户选择后执行）

1. 个人设备：Xcode 打开 `apps/ipad/LunaCanvas.xcodeproj` → Signing & Capabilities 选个人 Team → 连接 iPad → Run。信任证书在 iPad 设置里确认。
2. TestFlight/App Store：用户决定后再按当时 Apple 官方要求准备元数据/截图/隐私——当前**未准备、不虚构**。

## 回滚

- 网页：Vercel 回滚到上一部署；**不回滚覆盖用户已用新格式保存的 .lunacanvas 文件**（旧网页不认识新 schema，只读不覆盖）。
- 原生：删除 App 不影响 iCloud/本地文件；文档始终可由新版本打开。

## RC 清单

- [x] 无已知源数据丢失/身份串位/重复变换/保存假成功路径（0031–0040 测试覆盖）
- [x] 自动化全绿（原生 45/45、TS lunacanvas 39/39、网页全量另见复核包）
- [ ] 真机验收（手感/掌托/双击/横竖分屏/局部擦除/Files 本地+iCloud/离线恢复/完整往返录屏）——**阻塞"最终可发布"判定**
- [ ] 图标（当前占位）、隐私说明审计文案（壳层展示时）

## 需要用户做的最小事项

1. iPad 真机按 ACCEPTANCE §A 跑完整场景并录屏；
2. Xcode 选签名 Team 后真机构建；
3. 决定分发渠道（个人设备 / TestFlight / App Store）。
