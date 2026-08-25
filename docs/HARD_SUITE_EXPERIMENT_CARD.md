# 12 条 Hard 完整配对复跑：实验卡

## 研究问题

修复 Multi-Agent 的空最终回答问题后，在同一组 12 条单目标 Hard 任务上，Multi-Agent 是否比 Single Agent 更可靠或更高效？

## 实验设计

| 项目 | 设置 |
| --- | --- |
| 模型 | `sensenova-6.8-flash-lite` |
| 任务 | 12 条受控单目标 Hard |
| 条件 | Single Agent / Multi-Agent |
| 执行量 | 12 对任务，共 24 个条件级结果 |
| 成功标准 | 目标页被观察、浏览步骤非零、最终回答非空、任务证据与成功条件匹配 |
| 完整性 | 每个任务两个条件各一条；12 份 Multi 聚合轨迹；Provider 基础设施失败计入独立分类 |

## 结果

| 指标 | Single | Multi |
| --- | ---: | ---: |
| 通过数 | 12/12 | 12/12 |
| 成功率 | 100% | 100% |
| 总步骤 | 37 | 69 |
| 平均步骤 | 3.08 | 5.75 |
| 总 Token | 336,659 | 858,477 |

- 完整性校验：通过；
- Provider 基础设施失败：0；
- fail→pass：0；pass→fail：0；
- Multi Token / Single Token：约 `2.55×`。

## 结论

在这组任务上，Single 已达到成功率天花板，Multi 没有带来额外成功率收益，但步骤和 Token 明显增加。工程上不应默认对所有任务启用 Multi-Agent，而应按任务复杂度、风险和失败信号动态升级。

建议后续比较三个策略：

1. Always Single；
2. Always Multi；
3. Dynamic Routing。

## 能证明什么

- 修复后的 Single/Multi 流程在 12 条受控单目标 Hard 上都能完成任务；
- Multi-Agent 在简单或结构明确的任务上可能产生不必要开销；
- 成功率和效率必须同时报告，不能只展示成功样例。

## 不能证明什么

- 不能证明开放网页或生产环境总体成功率；
- 不能证明跨模型泛化；
- 不能证明 Multi-Agent 总是无效——另一套 6 条复合任务中曾观察到 `2/6 → 6/6`；
- 不能从 aggregate-only 公开数据复现私有原始轨迹。

## 公开证据边界

本仓库公开的是经过核验的脱敏汇总值与算术校验逻辑，不包含公司代码、私有任务、原始轨迹、页面截图、账号信息或 API Key。聚合数据见 [`examples/portfolio-aggregate`](../examples/portfolio-aggregate/README.md)。
