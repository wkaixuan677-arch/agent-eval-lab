import type {
  ComparisonReport,
  ConditionSummary,
  EvaluationResult,
  TaskBootstrapInterval,
} from "./types.js";

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(results: EvaluationResult[]): ConditionSummary {
  const passed = results.filter((result) => result.passed);
  const failures: Record<string, number> = {};
  for (const result of results) {
    for (const violation of result.violations) {
      failures[violation.code] = (failures[violation.code] ?? 0) + 1;
    }
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
  if (!Number.isInteger(failToPass) || !Number.isInteger(passToFail) || failToPass < 0 || passToFail < 0) {
    throw new Error("McNemar counts must be non-negative integers");
  }
  const discordant = failToPass + passToFail;
  if (discordant === 0) return 1;
  const lower = Math.min(failToPass, passToFail);

  // Preserve the original arithmetic (and therefore existing small-sample
  // output) while its intermediate binomial coefficients remain finite.
  if (discordant <= 1_024) {
    let cumulative = 0;
    for (let k = 0; k <= lower; k += 1) {
      cumulative += binomialCoefficient(discordant, k) * 0.5 ** discordant;
    }
    return Math.min(1, 2 * cumulative);
  }

  // For large samples, C(n, k) can overflow even though the final binomial
  // probability is small and representable. Compute the largest included
  // term in log space, then sum all preceding terms relative to it. Because
  // lower <= n / 2, those relative terms are monotonically decreasing.
  let logLargestTerm = -discordant * Math.LN2;
  for (let k = 1; k <= lower; k += 1) {
    logLargestTerm += Math.log(discordant - k + 1) - Math.log(k);
  }

  let scaledCumulative = 1;
  let relativeTerm = 1;
  for (let k = lower; k >= 1; k -= 1) {
    relativeTerm *= k / (discordant - k + 1);
    scaledCumulative += relativeTerm;
    if (relativeTerm === 0) break;
  }

  return Math.min(1, 2 * Math.exp(logLargestTerm + Math.log(scaledCumulative)));
}

export function comparePaired(results: EvaluationResult[]): ComparisonReport {
  const baselineByPair = uniqueByPair(results.filter((result) => result.condition === "baseline"), "baseline");
  const optimizedByPair = uniqueByPair(results.filter((result) => result.condition === "optimized"), "optimized");
  const baselineKeys = [...baselineByPair.keys()].sort();
  const optimizedKeys = [...optimizedByPair.keys()].sort();
  if (baselineKeys.join("\n") !== optimizedKeys.join("\n")) {
    const missingOptimized = baselineKeys.filter((key) => !optimizedByPair.has(key));
    const missingBaseline = optimizedKeys.filter((key) => !baselineByPair.has(key));
    throw new Error(`Unpaired results: missing optimized [${missingOptimized.join(", ")}]; missing baseline [${missingBaseline.join(", ")}]`);
  }
  const baseline = baselineKeys.map((key) => baselineByPair.get(key)!);
  const optimized = baselineKeys.map((key) => optimizedByPair.get(key)!);

  let failToPass = 0;
  let passToFail = 0;
  let unchangedPass = 0;
  let unchangedFail = 0;
  for (const key of baselineKeys) {
    const before = baselineByPair.get(key)!;
    const after = optimizedByPair.get(key)!;
    if (!before.passed && after.passed) failToPass += 1;
    else if (before.passed && !after.passed) passToFail += 1;
    else if (before.passed) unchangedPass += 1;
    else unchangedFail += 1;
  }

  const baselineSummary = summarize(baseline);
  const optimizedSummary = summarize(optimized);
  return {
    schema: "agent-eval-lab-report-v3",
    generatedAt: new Date().toISOString(),
    baseline: baselineSummary,
    optimized: optimizedSummary,
    paired: {
      pairs: baselineKeys.length,
      failToPass,
      passToFail,
      unchangedPass,
      unchangedFail,
      successDelta: optimizedSummary.successRate - baselineSummary.successRate,
      mcnemarExactP: mcnemarExactP(failToPass, passToFail),
      taskBootstrapCI: bootstrapTaskClusterSuccessDelta(results),
    },
    notes: [
      "报告只反映输入 Manifest 与轨迹/结果；数据来源和可复现边界以 Manifest 为准。",
      "平均步数同时保留全量口径与成功任务口径，避免提前失败造成虚假效率提升。",
      "failures 按全部违规标签计数；同一次失败运行可能同时计入多个失败类别。",
      "Bootstrap 以 taskId 为聚类单位重采样，避免把同一任务的多轮重复错误当成独立样本。",
      "ExperimentManifest 记录模型、提示词、代码、数据集、完整任务集、seed/repeat 调度和评测器版本；正式结论仍建议人工复核。",
    ],
  };
}

export interface BootstrapOptions {
  iterations?: number;
  confidenceLevel?: number;
  seed?: number;
}

export function bootstrapTaskClusterSuccessDelta(
  results: EvaluationResult[],
  options: BootstrapOptions = {},
): TaskBootstrapInterval {
  const iterations = options.iterations ?? 2_000;
  const confidenceLevel = options.confidenceLevel ?? 0.95;
  const seed = options.seed ?? 20_260_819;
  if (!Number.isInteger(iterations) || iterations < 100) throw new Error("Bootstrap iterations must be an integer >= 100");
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) throw new Error("Bootstrap confidenceLevel must be between 0 and 1");
  if (!Number.isInteger(seed)) throw new Error("Bootstrap seed must be an integer");

  const baselineByPair = uniqueByPair(results.filter((result) => result.condition === "baseline"), "baseline");
  const optimizedByPair = uniqueByPair(results.filter((result) => result.condition === "optimized"), "optimized");
  const baselineKeys = [...baselineByPair.keys()].sort();
  const optimizedKeys = [...optimizedByPair.keys()].sort();
  if (baselineKeys.join("\n") !== optimizedKeys.join("\n")) throw new Error("Task bootstrap requires fully paired results");
  if (baselineKeys.length === 0) throw new Error("Task bootstrap requires at least one pair");

  const clusters = new Map<string, { baselinePassed: number; optimizedPassed: number; runs: number }>();
  for (const key of baselineKeys) {
    const before = baselineByPair.get(key)!;
    const after = optimizedByPair.get(key)!;
    const cluster = clusters.get(before.taskId) ?? { baselinePassed: 0, optimizedPassed: 0, runs: 0 };
    cluster.baselinePassed += Number(before.passed);
    cluster.optimizedPassed += Number(after.passed);
    cluster.runs += 1;
    clusters.set(before.taskId, cluster);
  }
  const taskIds = [...clusters.keys()].sort();
  const random = seededRandom(seed);
  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let baselinePassed = 0;
    let optimizedPassed = 0;
    let runs = 0;
    for (let draw = 0; draw < taskIds.length; draw += 1) {
      const taskId = taskIds[Math.floor(random() * taskIds.length)]!;
      const cluster = clusters.get(taskId)!;
      baselinePassed += cluster.baselinePassed;
      optimizedPassed += cluster.optimizedPassed;
      runs += cluster.runs;
    }
    samples.push(optimizedPassed / runs - baselinePassed / runs);
  }
  samples.sort((left, right) => left - right);
  const alpha = (1 - confidenceLevel) / 2;
  return {
    method: "task-cluster-percentile-bootstrap",
    unit: "task",
    estimate:
      optimizedKeys.filter((key) => optimizedByPair.get(key)!.passed).length / optimizedKeys.length
      - baselineKeys.filter((key) => baselineByPair.get(key)!.passed).length / baselineKeys.length,
    lower: percentile(samples, alpha),
    upper: percentile(samples, 1 - alpha),
    confidenceLevel,
    iterations,
    seed,
    tasks: taskIds.length,
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(sorted: number[], probability: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(probability * sorted.length)));
  return sorted[index]!;
}

function uniqueByPair(results: EvaluationResult[], condition: string): Map<string, EvaluationResult> {
  const byPair = new Map<string, EvaluationResult>();
  for (const result of results) {
    if (byPair.has(result.pairKey)) throw new Error(`Duplicate ${condition} pair key: ${result.pairKey}`);
    byPair.set(result.pairKey, result);
  }
  return byPair;
}
