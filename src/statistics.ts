import type { ComparisonReport, ConditionSummary, EvaluationResult } from "./types.js";

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(results: EvaluationResult[]): ConditionSummary {
  const passed = results.filter((result) => result.passed);
  const failures: Record<string, number> = {};
  for (const result of results) {
    if (!result.passed) failures[result.failureType] = (failures[result.failureType] ?? 0) + 1;
  }
  return {
    runs: results.length,
    passed: passed.length,
    successRate: results.length === 0 ? 0 : passed.length / results.length,
    avgStepsAll: mean(results.map((result) => result.steps)),
    avgStepsSuccessful: passed.length === 0 ? null : mean(passed.map((result) => result.steps)),
    inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    outputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
    failures,
  };
}

function binomialCoefficient(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - i + 1)) / i;
  return result;
}

export function mcnemarExactP(failToPass: number, passToFail: number): number {
  const discordant = failToPass + passToFail;
  if (discordant === 0) return 1;
  const lower = Math.min(failToPass, passToFail);
  let cumulative = 0;
  for (let k = 0; k <= lower; k += 1) {
    cumulative += binomialCoefficient(discordant, k) * 0.5 ** discordant;
  }
  return Math.min(1, 2 * cumulative);
}

export function comparePaired(results: EvaluationResult[]): ComparisonReport {
  const baseline = results.filter((result) => result.condition === "baseline");
  const optimized = results.filter((result) => result.condition === "optimized");
  const baselineByTask = new Map(baseline.map((result) => [result.taskId, result]));
  const optimizedByTask = new Map(optimized.map((result) => [result.taskId, result]));
  const taskIds = [...baselineByTask.keys()].filter((taskId) => optimizedByTask.has(taskId));

  let failToPass = 0;
  let passToFail = 0;
  let unchangedPass = 0;
  let unchangedFail = 0;
  for (const taskId of taskIds) {
    const before = baselineByTask.get(taskId)!;
    const after = optimizedByTask.get(taskId)!;
    if (!before.passed && after.passed) failToPass += 1;
    else if (before.passed && !after.passed) passToFail += 1;
    else if (before.passed) unchangedPass += 1;
    else unchangedFail += 1;
  }

  const baselineSummary = summarize(baseline);
  const optimizedSummary = summarize(optimized);
  return {
    schema: "agent-eval-lab-report-v1",
    generatedAt: new Date().toISOString(),
    baseline: baselineSummary,
    optimized: optimizedSummary,
    paired: {
      pairs: taskIds.length,
      failToPass,
      passToFail,
      unchangedPass,
      unchangedFail,
      successDelta: optimizedSummary.successRate - baselineSummary.successRate,
      mcnemarExactP: mcnemarExactP(failToPass, passToFail),
    },
    notes: [
      "示例报告使用仓库内的合成轨迹，仅用于演示评测方法。",
      "平均步数同时保留全量口径与成功任务口径，避免提前失败造成虚假效率提升。",
      "正式实验还应报告置信区间、模型配置、环境指纹和人工复核信息。",
    ],
  };
}
