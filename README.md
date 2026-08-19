# Agent Eval Lab

**一个面向 LLM Agent 的可复现评测工具：从执行轨迹中判断目标是否真正完成，并输出失败类型和配对 A/B 报告。**

很多 Agent 评测会把“进程正常退出”误当作“用户目标完成”。本项目把两者分开：只有轨迹存在、执行过有效步骤、最终回答非空且成功条件拥有已验证证据，任务才算通过。

> 独立 clean-room 项目。仓库只包含合成任务和合成轨迹，不包含公司代码、内部任务、私有网页、真实用户数据或未公开实验结果。

## 核心流程

```text
任务定义 + Agent 轨迹
          ↓
     完整性检查
          ↓
   证据式目标判定
          ↓
      失败类型归因
          ↓
 配对 A/B + McNemar 检验
          ↓
      可审计 JSON 报告
```

## 能力

- 检查轨迹为空、0 步终止、最终回答为空等运行完整性问题；
- 按任务要求核对经过验证的证据，而不是只检查退出码或状态字符串；
- 区分 `missing_evidence`、`tool_error`、`blocked` 等失败类型；
- 同时报告全量平均步数和成功任务平均步数，避免“提前失败看起来更省”；
- 对相同任务的 baseline/optimized 结果进行配对比较；
- 输出 fail→pass、pass→fail 和 McNemar exact p-value；
- 生成结构化 JSON 报告，便于人工复核和后续可视化。

## 快速开始

环境要求：Node.js 22 或更高版本。

```bash
npm install
npm run check
```

演示输出：

```text
Agent Eval Lab 合成数据演示
Baseline: 33.33%
Optimized: 100.00%
Fail→Pass: 2; Pass→Fail: 0
McNemar exact p: 0.5000
报告已生成：reports/demo-report.json
```

这些数字来自仓库内 3 条**合成任务**，只用于演示评测流程，不能作为真实 Agent 能力结论。

## 数据结构

`TaskSpec` 定义目标、难度和必需证据；`AgentRun` 保存运行状态和事件；`EvaluationResult` 记录是否通过、失败原因、步数和 Token；`ComparisonReport` 汇总两个条件并计算配对变化。

```ts
interface TaskSpec {
  taskId: string;
  difficulty: "easy" | "medium" | "hard";
  objective: string;
  requiredEvidence: string[];
}
```

轨迹事件支持 `plan`、`tool_call`、`tool_result`、`verification` 和 `final`。评测器只信任 `verification.success=true` 中列出的证据。

## 为什么不能只看退出码

以下情况进程都可能正常结束，但任务并未完成：

- 模型没有执行浏览器动作就直接回答；
- 页面加载成功，但没有找到用户要求的信息；
- Agent 在浏览器交互后忘记输出最终回答；
- 遇到登录墙或验证码，却错误声称任务完成；
- 工具连续失败，运行器仍返回 `completed`。

因此，本项目把“进程完成、动作完成、目标完成”拆成独立判断，并保留证据与失败类型。

## 目录

```text
src/evaluator.ts   单次轨迹判定与失败归因
src/statistics.ts  配对汇总与 McNemar 检验
src/fixtures.ts    明确标注的合成任务和轨迹
src/demo.ts        一键生成示例报告
test/              评测规则与统计测试
reports/           本地生成的报告目录
```

## 当前限制

- 当前示例规模很小，仅用于验证工具行为；
- 尚未实现 Bootstrap 置信区间和多人盲标一致性分析；
- 没有接入 LLM-as-a-Judge，避免把未经校准的 Judge 当作真值；
- 当前按 `taskId` 做一对一配对，重复实验需要增加 repeat/seed 维度；
- 仓库不宣称复现作者私有项目中的 216 次或 180 次实验。

## Roadmap

- 增加 JSONL 导入、Schema 校验和数据脱敏检查；
- 支持多轮重复实验、难度分层和 Bootstrap CI；
- 增加人工盲评标注格式与 Judge 校准报告；
- 输出 Markdown 报告和失败分布图；
- 与 `browser-agent-runtime-lite` 的轨迹格式对接。

## 相关项目

- [browser-agent-runtime-lite](https://github.com/wkaixuan677-arch/browser-agent-runtime-lite)：证据门控、有限恢复的 Browser Agent 最小运行时。

## 开源协议

项目采用 [MIT License](LICENSE)。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题见 [SECURITY.md](SECURITY.md)。
