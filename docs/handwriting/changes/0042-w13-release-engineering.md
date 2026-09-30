# 0042 — W13：发布工程与候选包

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W13（连续执行第 12 批）
- 对应需求：W13 通过条件（发布准备全部做完，不等 Codex）
- 状态：完成；签名与真机分发留用户（手册明确）

## 本批内容

1. **版本与工程固定**：MARKETING_VERSION 0.1.0 / CURRENT_PROJECT_VERSION 1、显示名 LunaCanvas、iPad-only、Bundle ID 固定；部署目标维持 iPadOS 17.0（编译验证，最低系统运行待真机——手册如实分列）。
2. **可复现候选构建** `scripts/native/build-candidate.sh`：干净 derivedData → vite 构建 → 离线资源打包（去 map）→ fixture 重生成 → 原生全测 → `docs/handwriting/native/RELEASE_CANDIDATE.json`（时间、Xcode/SDK 版本、web 构建聚合哈希、fixture 哈希、xcodegen 哈希、签名状态）。
3. **RELEASE_RUNBOOK.md**：候选版本、构建命令、网页部署与烟测、原生个人设备安装步骤（用户选 Team）、TestFlight/App Store 明确"未准备、不虚构"、回滚（不回滚覆盖新格式文件）、RC 清单（真机项阻塞最终判定）、用户最小事项清单。
4. **第三方依赖与许可证**（随包交付）：ZIPFoundation 0.9.20（MIT，Package.resolved 锁定）、XcodeGen 2.46.0（MIT，仓库 tools/ 自带，SHA256 已记录）、jszip 3.10.1（MIT，devDependency，仅测试）。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `scripts/native/build-candidate.sh`（构建中） | 见 0043 最终复核包（最终一轮统一执行并记录） |

## 风险与未完成项

- 图标为占位；隐私说明审计文案随壳层 UI（W12 遗留）；RC 清单中真机项阻塞"最终可发布"判定。

## 下一批

W14 边界（授权范围声明）+ CODEX_REVIEW_PACKAGE。PROGRESS.md 已更新。
