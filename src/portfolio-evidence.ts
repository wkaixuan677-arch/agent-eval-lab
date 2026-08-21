import { mcnemarExactP } from "./statistics.js";

type JsonObject = Record<string, unknown>;

export interface AggregateCheck {
  id: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface PortfolioAggregateValidation {
  schema: "agent-eval-lab-portfolio-validation-v1";
  valid: boolean;
  evidenceBoundary: "aggregate-only-not-publicly-reproducible";
  checks: AggregateCheck[];
}

export function validatePortfolioAggregate(value: unknown): PortfolioAggregateValidation {
  const root = object(value, "$");
  assertExactKeys(root, ["schema", "provenance", "experiments"], "$");
  if (root.schema !== "agent-eval-lab-portfolio-aggregate-v1") throw new Error("$.schema 必须是 agent-eval-lab-portfolio-aggregate-v1");
  const provenance = object(root.provenance, "$.provenance");
  const experiments = object(root.experiments, "$.experiments");
  assertExactKeys(
    provenance,
    ["source", "verification", "publicReproducibility", "containsRawTrajectories", "containsPrivateTasks", "statement"],
    "$.provenance",
  );
  assertExactKeys(
    experiments,
    ["systemAB", "firstRoundPaired", "memoryAB", "hardFirstRound", "hardTargetedRegression", "hardFullRerun", "compositeTasks"],
    "$.experiments",
  );
  const checks: AggregateCheck[] = [];

  check(checks, "boundary.source", provenance.source === "private-controlled-prototype", "private-controlled-prototype", String(provenance.source));
  check(checks, "boundary.verification", provenance.verification === "owner-verified-aggregate", "owner-verified-aggregate", String(provenance.verification));
  check(checks, "boundary.reproducibility", provenance.publicReproducibility === "aggregate-only", "aggregate-only", String(provenance.publicReproducibility));
  check(checks, "boundary.no-raw-trajectories", provenance.containsRawTrajectories === false, "false", String(provenance.containsRawTrajectories));
  check(checks, "boundary.no-private-tasks", provenance.containsPrivateTasks === false, "false", String(provenance.containsPrivateTasks));
  check(checks, "boundary.statement", typeof provenance.statement === "string" && provenance.statement.trim().length > 0, "非空边界说明", String(provenance.statement));
  const sensitiveFindings = scanSensitiveStrings(root);
  check(
    checks,
    "boundary.sensitive-pattern-scan",
    sensitiveFindings.length === 0,
    "未发现常见密钥、凭据或绝对路径模式",
    sensitiveFindings.length === 0 ? "未发现" : `命中字段：${sensitiveFindings.join("、")}`,
  );

  const system = object(experiments.systemAB, "$.experiments.systemAB");
  assertExactKeys(system, ["scope", "total", "baselinePassed", "optimizedPassed", "baselinePercent", "optimizedPercent", "tokenRounds", "meanTokenReductionPercent"], "$.experiments.systemAB");
  check(checks, "system.scope", system.scope === "36-task-benchmark-3-rounds", "36-task-benchmark-3-rounds", String(system.scope));
  checkCountAndPercent(checks, "system.baseline", system.total, system.baselinePassed, system.baselinePercent);
  checkCountAndPercent(checks, "system.optimized", system.total, system.optimizedPassed, system.optimizedPercent);
  const tokenRounds = array(system.tokenRounds, "$.experiments.systemAB.tokenRounds");
  check(checks, "system.token-round-count", tokenRounds.length === 3, "3", String(tokenRounds.length));
  const tokenRates = tokenRounds.map((round, index) => {
    const value = object(round, `$.experiments.systemAB.tokenRounds[${index}]`);
    assertExactKeys(value, ["baselineTotal", "optimizedTotal"], `$.experiments.systemAB.tokenRounds[${index}]`);
    const baseline = positiveInteger(value.baselineTotal, `system.tokenRounds[${index}].baselineTotal`);
    const optimized = positiveInteger(value.optimizedTotal, `system.tokenRounds[${index}].optimizedTotal`);
    return 1 - optimized / baseline;
  });
  const meanTokenReduction = tokenRates.reduce((sum, value) => sum + value, 0) / tokenRates.length * 100;
  check(
    checks,
    "system.mean-token-reduction",
    nearlyEqual(number(system.meanTokenReductionPercent, "system.meanTokenReductionPercent"), Number(meanTokenReduction.toFixed(2))),
    `${Number(meanTokenReduction.toFixed(2))}%`,
    `${String(system.meanTokenReductionPercent)}%`,
  );

  const firstRound = object(experiments.firstRoundPaired, "$.experiments.firstRoundPaired");
  assertExactKeys(firstRound, ["scope", "failToPass", "passToFail", "mcnemarExactP"], "$.experiments.firstRoundPaired");
  check(checks, "first-round.scope", firstRound.scope === "first-round-only", "first-round-only", String(firstRound.scope));
  const failToPass = integer(firstRound.failToPass, "$.experiments.firstRoundPaired.failToPass");
  const passToFail = integer(firstRound.passToFail, "$.experiments.firstRoundPaired.passToFail");
  const reportedP = number(firstRound.mcnemarExactP, "$.experiments.firstRoundPaired.mcnemarExactP");
  const calculatedP = mcnemarExactP(failToPass, passToFail);
  check(checks, "first-round.mcnemar", nearlyEqual(reportedP, calculatedP, 1e-12), String(calculatedP), String(reportedP));

  const memory = object(experiments.memoryAB, "$.experiments.memoryAB");
  assertExactKeys(memory, ["scope", "total", "offPassed", "onPassed", "offPercent", "onPercent", "offSteps", "onSteps", "stepReductionPercent", "offTokens", "onTokens", "tokenReductionPercent", "negativeTransfers"], "$.experiments.memoryAB");
  check(checks, "memory.scope", memory.scope === "memory-off-vs-on-90-paired-executions", "memory-off-vs-on-90-paired-executions", String(memory.scope));
  checkCountAndPercent(checks, "memory.off", memory.total, memory.offPassed, memory.offPercent);
  checkCountAndPercent(checks, "memory.on", memory.total, memory.onPassed, memory.onPercent);
  checkReduction(checks, "memory.steps", memory.offSteps, memory.onSteps, memory.stepReductionPercent);
  checkReduction(checks, "memory.tokens", memory.offTokens, memory.onTokens, memory.tokenReductionPercent);
  check(checks, "memory.negative-transfers", integer(memory.negativeTransfers, "memory.negativeTransfers") === 2, "2", String(memory.negativeTransfers));

  const hard = object(experiments.hardFirstRound, "$.experiments.hardFirstRound");
  assertExactKeys(hard, ["scope", "total", "singlePassed", "multiPassed", "singlePercent", "multiPercent", "passToFail"], "$.experiments.hardFirstRound");
  check(checks, "hard.scope", hard.scope === "12-hard-single-vs-multi-first-round", "12-hard-single-vs-multi-first-round", String(hard.scope));
  checkCountAndPercent(checks, "hard.single", hard.total, hard.singlePassed, hard.singlePercent);
  checkCountAndPercent(checks, "hard.multi", hard.total, hard.multiPassed, hard.multiPercent);
  const hardPassToFail = integer(hard.passToFail, "$.experiments.hardFirstRound.passToFail");
  check(
    checks,
    "hard.p2f-count",
    integer(hard.singlePassed, "$.experiments.hardFirstRound.singlePassed")
      - integer(hard.multiPassed, "$.experiments.hardFirstRound.multiPassed") === hardPassToFail,
    "singlePassed - multiPassed",
    String(hardPassToFail),
  );

  const targeted = object(experiments.hardTargetedRegression, "$.experiments.hardTargetedRegression");
  assertExactKeys(targeted, ["scope", "total", "passed", "percent"], "$.experiments.hardTargetedRegression");
  checkCountAndPercent(checks, "hard.targeted", targeted.total, targeted.passed, targeted.percent);
  check(checks, "hard.targeted-scope", targeted.scope === "previously-failed-cases-only", "previously-failed-cases-only", String(targeted.scope));

  const rerun = object(experiments.hardFullRerun, "$.experiments.hardFullRerun");
  assertExactKeys(rerun, ["scope", "total", "conditionExecutions", "singlePassed", "multiPassed", "singlePercent", "multiPercent", "singleSteps", "multiSteps", "singleTokens", "multiTokens", "providerInfrastructureFailures", "integrityPassed"], "$.experiments.hardFullRerun");
  check(checks, "hard.rerun-scope", rerun.scope === "12-hard-single-vs-multi-full-rerun-sensenova-6.8-flash-lite", "12-hard-single-vs-multi-full-rerun-sensenova-6.8-flash-lite", String(rerun.scope));
  checkCountAndPercent(checks, "hard.rerun-single", rerun.total, rerun.singlePassed, rerun.singlePercent);
  checkCountAndPercent(checks, "hard.rerun-multi", rerun.total, rerun.multiPassed, rerun.multiPercent);
  check(checks, "hard.rerun-executions", integer(rerun.conditionExecutions, "hard.rerun.conditionExecutions") === integer(rerun.total, "hard.rerun.total") * 2, "total × 2", String(rerun.conditionExecutions));
  check(checks, "hard.rerun-single-steps", positiveInteger(rerun.singleSteps, "hard.rerun.singleSteps") === 37, "37", String(rerun.singleSteps));
  check(checks, "hard.rerun-multi-steps", positiveInteger(rerun.multiSteps, "hard.rerun.multiSteps") === 69, "69", String(rerun.multiSteps));
  check(checks, "hard.rerun-single-tokens", positiveInteger(rerun.singleTokens, "hard.rerun.singleTokens") === 336659, "336659", String(rerun.singleTokens));
  check(checks, "hard.rerun-multi-tokens", positiveInteger(rerun.multiTokens, "hard.rerun.multiTokens") === 858477, "858477", String(rerun.multiTokens));
  check(checks, "hard.rerun-no-provider-failures", integer(rerun.providerInfrastructureFailures, "hard.rerun.providerInfrastructureFailures") === 0, "0", String(rerun.providerInfrastructureFailures));
  check(checks, "hard.rerun-integrity", rerun.integrityPassed === true, "true", String(rerun.integrityPassed));

  const composite = object(experiments.compositeTasks, "$.experiments.compositeTasks");
  assertExactKeys(composite, ["scope", "total", "singlePassed", "multiPassed", "singlePercent", "multiPercent"], "$.experiments.compositeTasks");
  check(checks, "composite.scope", composite.scope === "separate-6-task-composite-suite", "separate-6-task-composite-suite", String(composite.scope));
  checkCountAndPercent(checks, "composite.single", composite.total, composite.singlePassed, composite.singlePercent);
  checkCountAndPercent(checks, "composite.multi", composite.total, composite.multiPassed, composite.multiPercent);

  return {
    schema: "agent-eval-lab-portfolio-validation-v1",
    valid: checks.every((item) => item.passed),
    evidenceBoundary: "aggregate-only-not-publicly-reproducible",
    checks,
  };
}

function checkCountAndPercent(
  checks: AggregateCheck[],
  id: string,
  totalValue: unknown,
  passedValue: unknown,
  percentValue: unknown,
): void {
  const total = positiveInteger(totalValue, `${id}.total`);
  const passed = integer(passedValue, `${id}.passed`);
  if (passed < 0 || passed > total) throw new Error(`${id}: passed 必须位于 0..total`);
  const percent = number(percentValue, `${id}.percent`);
  const calculated = Number(((passed / total) * 100).toFixed(2));
  check(checks, `${id}.arithmetic`, nearlyEqual(percent, calculated), `${passed}/${total} = ${calculated}%`, `${percent}%`);
}

function checkReduction(
  checks: AggregateCheck[],
  id: string,
  beforeValue: unknown,
  afterValue: unknown,
  percentValue: unknown,
): void {
  const before = positiveInteger(beforeValue, `${id}.before`);
  const after = positiveInteger(afterValue, `${id}.after`);
  const reported = number(percentValue, `${id}.reductionPercent`);
  const calculated = Number(((1 - after / before) * 100).toFixed(2));
  check(checks, `${id}.arithmetic`, nearlyEqual(reported, calculated), `${before}→${after} = ${calculated}%`, `${reported}%`);
}

function check(checks: AggregateCheck[], id: string, passed: boolean, expected: string, actual: string): void {
  checks.push({ id, passed, expected, actual });
}

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} 必须是对象`);
  return value as JsonObject;
}

function assertExactKeys(value: JsonObject, allowedKeys: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) throw new Error(`${path} 包含未允许字段：${unknown.join("、")}`);
}

function scanSensitiveStrings(value: unknown, path = "$"): string[] {
  const findings: string[] = [];
  const visit = (item: unknown, itemPath: string): void => {
    if (typeof item === "string") {
      const patterns = [
        /\bsk-[A-Za-z0-9_-]{12,}\b/u,
        /\b(?:api[_-]?key|client[_-]?secret|password|passwd|authorization|cookie)\s*[:=]\s*\S+/iu,
        /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/iu,
        /(?:^|[\s"'(])(?:[A-Za-z]:\\|\\\\)[^\s"'<>]*/u,
        /(?:^|[\s"'(])\/(?:Users|home|var|etc|opt|tmp|mnt|root)\/[^\s"'<>]*/u,
        /\bfile:\/\//iu,
      ];
      if (patterns.some((pattern) => pattern.test(item))) findings.push(itemPath);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${itemPath}[${index}]`));
      return;
    }
    if (typeof item === "object" && item !== null) {
      for (const [key, child] of Object.entries(item)) visit(child, `${itemPath}.${key}`);
    }
  };
  visit(value, path);
  return findings;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} 必须是数组`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} 必须是有限数值`);
  return value;
}

function integer(value: unknown, path: string): number {
  const parsed = number(value, path);
  if (!Number.isInteger(parsed)) throw new Error(`${path} 必须是整数`);
  return parsed;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = integer(value, path);
  if (parsed <= 0) throw new Error(`${path} 必须是正整数`);
  return parsed;
}

function nearlyEqual(left: number, right: number, tolerance = 1e-9): boolean {
  return Math.abs(left - right) <= tolerance;
}
