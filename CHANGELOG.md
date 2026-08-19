# Changelog

## [0.3.0] - 2026-08-19

- 将 CI 使用的 GitHub Actions 固定到已核验的提交，降低上游标签漂移风险；
- 增加 JSON / JSONL CLI，可导入原始轨迹或已有 A/B 结果并输出结构化报告；
- 新增带字段路径的运行时 Schema 校验，以及模型、提示词、代码、数据集、seed、重复次数和评测器版本 Manifest；
- 将单一失败升级为多标签 `violations + primaryFailure`，同时保留 `failureType` 兼容字段；
- 增加按 `taskId` 聚类的确定性 Bootstrap 成功率差置信区间；
- 发布明确标注为 synthetic 的脱敏公开证据示例包与一键复算命令；
- 增加私有受控原型的 aggregate-only 作品集证据及算术校验，明确声明公开仓库不能复现原始运行；
- 公开三轮 Token 总量与 Memory 步数/Token 汇总，使主页效率数字可以直接复算；
- 严格校验完整任务集、每任务配对重复数量、seed/repeat 调度、必需证据和事件 ID，拒绝不完整 Manifest；
- 使用数值稳定的 exact McNemar 下尾计算，避免大样本组合数溢出；
- Aggregate-only 校验增加全层字段白名单、来源声明检查和常见敏感模式扫描；
- 补齐 CLI 包的 ESM、类型和 Schema 导出，并在打包前自动编译；
- 测试扩充到 Schema、JSONL、旧结果兼容、伪造 pairKey 和确定性 Bootstrap。

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
[0.3.0]: https://github.com/wkaixuan677-arch/agent-eval-lab/compare/v0.2.0...v0.3.0
