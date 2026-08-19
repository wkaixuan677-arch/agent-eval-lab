# Changelog

## [0.2.0] - 2026-08-19

- 用 `taskId + repeatId + seed` 严格配对，重复或缺失样本不再被静默覆盖；
- 统一成功率与 McNemar 的有效样本口径，并拒绝非法计数；
- 将证据绑定到成功 `tool_result` 的实际产出，拒绝来源缺失或内容篡改；
- 增加伪证据、重复配对、孤立配对等回归测试并完善公开说明。

## [0.1.0] - 2026-08-19

- 发布轨迹完整性、证据式目标完成与失败归因评测链路；
- 增加配对 A/B、Fail→Pass / Pass→Fail 与 exact McNemar 检验；
- 提供明确标注的合成任务、自动测试、架构图、演示 GIF 与面试材料。

[0.1.0]: https://github.com/wkaixuan677-arch/agent-eval-lab/releases/tag/v0.1.0
[0.2.0]: https://github.com/wkaixuan677-arch/agent-eval-lab/compare/v0.1.0...v0.2.0
