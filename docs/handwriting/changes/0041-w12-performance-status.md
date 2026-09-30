# 0041 — W12：性能基准与实施状态矩阵

- 日期/执行者：2026-09-29 / Kimi
- 阶段：W12（连续执行第 11 批）
- 对应需求：V17、W12 通过条件
- 状态：基准完成并驱动三处真实修复；真机手感未验证

## 基准结果（iPad Pro 11" M5 模拟器，iOS 27.0，debug 构建）

| 规模 | updateUnits | export | open |
| --- | --- | --- | --- |
| 100 | 3.5ms | 93ms | 49ms |
| 1000 | 2.0s* | 561ms | 221ms |
| 5000 | 9.7s* | 7.7s | 1.4s |

\* updateUnits 首入量是**单笔派生资源（preview+hit，~2ms/笔）**的一次性成本；交互路径单笔事务 ~2–3ms。1000 笔交互目标（ACCEPTANCE V17）在导出/打开路径已满足；5000 笔为压力场景如实列出，主线程长任务优化（派生资源后台队列化）列入后续。

## 基准驱动的真实修复（修前 → 修后）

1. **open() O(n²)**：`archive[path]` 逐次查找 → 预建 `entryByPath` 字典。**open[1000] 32.7s → 221ms**（148x）。
2. **updateUnits 稳态 O(n²)**：同数笔画走索引对齐快路径（指纹校验不变性，内容变即回落池匹配）。
3. **导出即渲染**：preview/hit 改为**编辑时生成**（InkUnit 携带），导出不再付渲染成本；导出错峰。
4. **预算标定修正（带理由）**：条目上限 1 万 → **10 万**（每 ink 对象 3 条目：drawing/preview/hit；条目元数据极小，真正的炸弹防线是解压总量）；manifest 上限 2MB → **20MB**（pretty manifest ~400B/对象，20MB 支撑 ~5 万对象）。TS/Swift 双侧同步。5000 笔文档（15002 条目）曾触发这两项拒绝——基准的价值。

## 实施状态矩阵

`docs/handwriting/native/IMPLEMENTATION_STATUS.md` 建立：W00–W14、N01–N21、V01–V18、固定比例补充，四档状态（待做/进行中/自动化通过/真机通过），源码通过与设备通过分列，每项挂记录索引与未验证理由。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `xcodebuild ... -only-testing:...PerformanceBenchmarkTests test` | TEST SUCCEEDED（/tmp/native-perf6.log，上表数字出处） |
| 原生全量 `xcodebuild ... test` | TEST SUCCEEDED：45 tests, 0 failures（/tmp/native-w12.log） |
| TS lunacanvas 套件 | 39/39（预算变更后） |

## 风险与未完成项

- debug 构建数据；release 构建复测列入 W13 候选构建步骤。
- 真机 60fps/跟笔/5000 笔内存（峰值 RSS）需设备；模拟器无 Pencil 采样路径。

## 下一批

W13（发布工程与候选包）。PROGRESS.md 已更新。
