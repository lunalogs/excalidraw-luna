# ADR-0002：笔迹身份映射（稳定 objectId，不依赖 PKStroke.id）

## 背景

SPEC N07/3.2：不得按下标或坐标哈希当永久 ID；不依赖标注 beta 的 `PKStroke.id`。

## 决定

1. 每个"可选择笔迹单元"由**适配层**分配 UUID `objectId`，与苹果任何内部 ID 解耦。
2. 持久化时 v1 每单元一个**单笔 PKDrawing 资源**（`<objectId>.drawing`）；该资源字节即身份载体，hash 入 manifest。
3. 局部橡皮修改/分裂笔迹时：未变单元保留 objectId；修改/分裂产物分配**新 objectId**（版本号 v+1），manifest 记录 `replacedBy`/`splitFrom` 替换关系。
4. 身份映射表（objectId → 资源路径/版本/替换关系）只存 manifest，不存绝对路径。

## 验证计划（P0 原型）

重复形状、同点重画、删除前一笔再编辑后一笔三案例，断言 objectId 稳定、无串位（原型验收记录见对应 changes 批次）。
