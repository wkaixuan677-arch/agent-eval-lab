import type {
  AgentRun,
  DataClassification,
  EvaluationInputDocument,
  EvaluationResult,
  EvidenceRecord,
  ExperimentManifest,
  FailureType,
  FailureViolation,
  TaskSpec,
  TrajectoryEvent,
} from "./types.js";

type JsonObject = Record<string, unknown>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export class SchemaValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

const failureTypes = [
  "none",
  "missing_trajectory",
  "zero_step_termination",
  "empty_final_answer",
  "missing_evidence",
  "invalid_evidence_source",
  "tool_error",
  "blocked",
  "goal_not_completed",
] as const;

export function parseInputText(text: string, sourceName = "input"): EvaluationInputDocument {
  const trimmed = text.trim();
  if (trimmed.length === 0) fail("$", `${sourceName} 为空`);
  try {
    return parseEvaluationInput(JSON.parse(trimmed));
  } catch (error) {
    if (error instanceof SchemaValidationError) throw error;
    if (!(error instanceof SyntaxError)) throw error;
  }

  const records: JsonObject[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const value = line.trim();
    if (value.length === 0 || value.startsWith("#")) continue;
    try {
      records.push(asObject(JSON.parse(value), `$line[${index + 1}]`));
    } catch (error) {
      if (error instanceof SchemaValidationError) throw error;
      fail(`$line[${index + 1}]`, `不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (records.length === 0) fail("$", `${sourceName} 不包含 JSONL 记录`);
  return parseJsonlRecords(records);
}

export function parseEvaluationInput(value: unknown): EvaluationInputDocument {
  const object = asObject(value, "$");
  const schema = requiredString(object, "schema", "$");
  const manifest = parseExperimentManifest(object.manifest, "$.manifest");
  if (schema === "agent-eval-lab-trajectories-v1") {
    const tasks = requiredArray(object, "tasks", "$").map((item, index) => parseTask(item, `$.tasks[${index}]`));
    const runs = requiredArray(object, "runs", "$").map((item, index) => parseRun(item, `$.runs[${index}]`));
    if (tasks.length === 0) fail("$.tasks", "至少包含一个 TaskSpec");
    if (runs.length === 0) fail("$.runs", "至少包含一条 baseline/optimized 运行");
    requireUnique(tasks.map((task) => task.taskId), "$.tasks", "taskId");
    requireUnique(runs.map((run) => run.runId), "$.runs", "runId");
    return { schema, manifest, tasks, runs };
  }
  if (schema === "agent-eval-lab-results-v1") {
    const results = requiredArray(object, "results", "$").map((item, index) => parseResult(item, `$.results[${index}]`));
    if (results.length === 0) fail("$.results", "至少包含一组 baseline/optimized 结果");
    requireUnique(results.map((result) => result.runId), "$.results", "runId");
    return { schema, manifest, results };
  }
  fail("$.schema", "必须是 agent-eval-lab-trajectories-v1 或 agent-eval-lab-results-v1");
}

export function parseExperimentManifest(value: unknown, path = "$"): ExperimentManifest {
  const object = asObject(value, path);
  const schema = requiredLiteral(object, "schema", "agent-eval-lab-manifest-v1", path);
  const experimentId = requiredString(object, "experimentId", path);
  const createdAt = requiredString(object, "createdAt", path);
  if (Number.isNaN(Date.parse(createdAt))) fail(`${path}.createdAt`, "必须是有效的 ISO 日期时间");

  const modelObject = asObject(object.model, `${path}.model`);
  const provider = requiredString(modelObject, "provider", `${path}.model`);
  const name = requiredString(modelObject, "name", `${path}.model`);
  const revision = optionalString(modelObject, "revision", `${path}.model`);
  const promptHash = parseSha256(requiredString(object, "promptHash", path), `${path}.promptHash`);
  const codeCommit = requiredString(object, "codeCommit", path);
  if (!/^[0-9a-f]{7,40}$/iu.test(codeCommit)) fail(`${path}.codeCommit`, "必须是 7–40 位十六进制 Git commit");
  const datasetObject = asObject(object.dataset, `${path}.dataset`);
  const datasetName = requiredString(datasetObject, "name", `${path}.dataset`);
  const datasetHash = parseSha256(requiredString(datasetObject, "hash", `${path}.dataset`), `${path}.dataset.hash`);
  const taskIds = requiredStringArray(object, "taskIds", path);
  if (taskIds.length === 0) fail(`${path}.taskIds`, "至少包含一个预期任务 ID");
  requireUnique(taskIds, `${path}.taskIds`, "taskId");
  const seeds = requiredArray(object, "seeds", path).map((seed, index) => integer(seed, `${path}.seeds[${index}]`));
  if (seeds.length === 0) fail(`${path}.seeds`, "至少包含一个确定性 seed");
  requireUnique(seeds, `${path}.seeds`, "seed");
  const repeatCount = positiveInteger(object.repeatCount, `${path}.repeatCount`);
  if (repeatCount < seeds.length) fail(`${path}.repeatCount`, "每任务配对重复总数不能少于 seeds 数量");
  const evaluatorVersion = requiredString(object, "evaluatorVersion", path);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(evaluatorVersion)) fail(`${path}.evaluatorVersion`, "必须是语义化版本号");
  const dataObject = asObject(object.data, `${path}.data`);
  const classification = requiredEnum(dataObject, "classification", ["synthetic", "controlled", "public"] as const, `${path}.data`) as DataClassification;
  const containsPrivateData = requiredBoolean(dataObject, "containsPrivateData", `${path}.data`);
  const redacted = requiredBoolean(dataObject, "redacted", `${path}.data`);
  if (classification === "public" && containsPrivateData) fail(`${path}.data`, "public 数据不能标记为包含私有数据");
  const notes = optionalStringArray(object, "notes", path);

  return {
    schema,
    experimentId,
    createdAt,
    model: { provider, name, ...(revision === undefined ? {} : { revision }) },
    promptHash,
    codeCommit,
    dataset: { name: datasetName, hash: datasetHash },
    taskIds,
    seeds,
    repeatCount,
    evaluatorVersion,
    data: { classification, containsPrivateData, redacted },
    ...(notes === undefined ? {} : { notes }),
  };
}

function parseJsonlRecords(records: JsonObject[]): EvaluationInputDocument {
  const manifests: unknown[] = [];
  const tasks: unknown[] = [];
  const runs: unknown[] = [];
  const results: unknown[] = [];
  for (const [index, record] of records.entries()) {
    const recordType = requiredEnum(record, "recordType", ["manifest", "task", "run", "result"] as const, `$line[${index + 1}]`);
    if (!("data" in record)) fail(`$line[${index + 1}].data`, "缺少 data");
    if (recordType === "manifest") manifests.push(record.data);
    else if (recordType === "task") tasks.push(record.data);
    else if (recordType === "run") runs.push(record.data);
    else results.push(record.data);
  }
  if (manifests.length !== 1) fail("$", `JSONL 必须恰好包含 1 条 manifest，实际为 ${manifests.length}`);
  if (runs.length > 0 && results.length > 0) fail("$", "JSONL 不能同时混用 run 和 result 记录");
  if (runs.length > 0) {
    return parseEvaluationInput({ schema: "agent-eval-lab-trajectories-v1", manifest: manifests[0], tasks, runs });
  }
  if (results.length > 0) {
    if (tasks.length > 0) fail("$", "result 输入不应包含 task 记录");
    return parseEvaluationInput({ schema: "agent-eval-lab-results-v1", manifest: manifests[0], results });
  }
  fail("$", "JSONL 至少需要一条 run 或 result 记录");
}

function parseTask(value: unknown, path: string): TaskSpec {
  const object = asObject(value, path);
  const requiredEvidence = requiredStringArray(object, "requiredEvidence", path);
  if (requiredEvidence.length === 0) fail(`${path}.requiredEvidence`, "至少包含一项必需证据");
  requireUnique(requiredEvidence, `${path}.requiredEvidence`, "claimId");
  return {
    taskId: requiredString(object, "taskId", path),
    difficulty: requiredEnum(object, "difficulty", ["easy", "medium", "hard"] as const, path),
    objective: requiredString(object, "objective", path),
    requiredEvidence,
  };
}

function parseRun(value: unknown, path: string): AgentRun {
  const object = asObject(value, path);
  const seed = integer(object.seed, `${path}.seed`);
  const events = requiredArray(object, "events", path).map((item, index) => parseEvent(item, `${path}.events[${index}]`));
  requireUnique(events.map((event) => event.eventId), `${path}.events`, "eventId");
  return {
    runId: requiredString(object, "runId", path),
    taskId: requiredString(object, "taskId", path),
    condition: requiredEnum(object, "condition", ["baseline", "optimized"] as const, path),
    repeatId: requiredString(object, "repeatId", path),
    seed,
    status: requiredEnum(object, "status", ["completed", "failed", "blocked"] as const, path),
    events,
  };
}

function parseEvent(value: unknown, path: string): TrajectoryEvent {
  const object = asObject(value, path);
  const tool = optionalString(object, "tool", path);
  const success = optionalBoolean(object, "success", path);
  const evidence = optionalArray(object, "evidence", path)?.map((item, index) => parseEvidence(item, `${path}.evidence[${index}]`));
  const citations = optionalStringArray(object, "citations", path);
  const text = optionalText(object, "text", path);
  const inputTokens = optionalNonNegativeNumber(object, "inputTokens", path);
  const outputTokens = optionalNonNegativeNumber(object, "outputTokens", path);
  const timestamp = requiredString(object, "timestamp", path);
  if (Number.isNaN(Date.parse(timestamp))) fail(`${path}.timestamp`, "必须是有效的 ISO 日期时间");
  const type = requiredEnum(object, "type", ["plan", "tool_call", "tool_result", "verification", "final"] as const, path);
  if ((type === "tool_result" || type === "verification") && success === undefined) {
    fail(`${path}.success`, `${type} 事件必须声明 success`);
  }
  return {
    eventId: requiredString(object, "eventId", path),
    type,
    step: nonNegativeInteger(object.step, `${path}.step`),
    timestamp,
    ...(tool === undefined ? {} : { tool }),
    ...(success === undefined ? {} : { success }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(citations === undefined ? {} : { citations }),
    ...(text === undefined ? {} : { text }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function parseEvidence(value: unknown, path: string): EvidenceRecord {
  const object = asObject(value, path);
  const sourceUrl = optionalString(object, "sourceUrl", path);
  const contentHash = optionalString(object, "contentHash", path);
  return {
    claimId: requiredString(object, "claimId", path),
    value: requiredString(object, "value", path),
    sourceEventId: requiredString(object, "sourceEventId", path),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(contentHash === undefined ? {} : { contentHash }),
  };
}

function parseResult(value: unknown, path: string): EvaluationResult {
  const object = asObject(value, path);
  const passed = requiredBoolean(object, "passed", path);
  const failureType = requiredEnum(object, "failureType", failureTypes, path) as FailureType;
  const primaryFailure = object.primaryFailure === undefined
    ? failureType
    : requiredEnum(object, "primaryFailure", failureTypes, path) as FailureType;
  const reasons = requiredStringArray(object, "reasons", path);
  const hasExplicitViolations = object.violations !== undefined;
  const violations = !hasExplicitViolations
    ? (primaryFailure === "none" ? [] : [{ code: primaryFailure, message: reasons.join("；") || primaryFailure }])
    : requiredArray(object, "violations", path).map((item, index) => parseViolation(item, `${path}.violations[${index}]`));
  if (passed && (primaryFailure !== "none" || violations.length > 0)) fail(path, "passed=true 时 primaryFailure 必须为 none 且 violations 必须为空");
  if (passed && reasons.length > 0) fail(`${path}.reasons`, "passed=true 时 reasons 必须为空");
  if (!passed && primaryFailure === "none") fail(`${path}.primaryFailure`, "passed=false 时不能为 none");
  if (!passed && violations.length === 0) fail(`${path}.violations`, "passed=false 时至少包含一个 violation");
  if (!passed && violations[0]?.code !== primaryFailure) fail(`${path}.violations[0].code`, "首个 violation 必须与 primaryFailure 一致");
  requireUnique(violations.map((violation) => violation.code), `${path}.violations`, "violation code");
  if (hasExplicitViolations) {
    const violationReasons = violations.map((violation) => violation.message);
    if (JSON.stringify(reasons) !== JSON.stringify(violationReasons)) {
      fail(`${path}.reasons`, "必须与 violations 的 message 按顺序完全一致");
    }
  }
  if (failureType !== primaryFailure) fail(`${path}.failureType`, "兼容字段 failureType 必须与 primaryFailure 一致");
  const seed = integer(object.seed, `${path}.seed`);
  const taskId = requiredString(object, "taskId", path);
  const repeatId = requiredString(object, "repeatId", path);
  const pairKey = requiredString(object, "pairKey", path);
  const expectedPairKey = `${taskId}::${repeatId}::${seed}`;
  if (pairKey !== expectedPairKey) fail(`${path}.pairKey`, `必须由 taskId + repeatId + seed 生成，期望 ${expectedPairKey}`);
  return {
    runId: requiredString(object, "runId", path),
    taskId,
    condition: requiredEnum(object, "condition", ["baseline", "optimized"] as const, path),
    repeatId,
    seed,
    pairKey,
    passed,
    failureType,
    primaryFailure,
    violations,
    reasons: hasExplicitViolations ? reasons : violations.map((violation) => violation.message),
    steps: nonNegativeInteger(object.steps, `${path}.steps`),
    inputTokens: nonNegativeNumber(object.inputTokens, `${path}.inputTokens`),
    outputTokens: nonNegativeNumber(object.outputTokens, `${path}.outputTokens`),
  };
}

function parseViolation(value: unknown, path: string): FailureViolation {
  const object = asObject(value, path);
  const code = requiredEnum(object, "code", failureTypes.filter((item) => item !== "none"), path);
  const evidenceIds = optionalStringArray(object, "evidenceIds", path);
  if (evidenceIds !== undefined) requireUnique(evidenceIds, `${path}.evidenceIds`, "evidenceId");
  return {
    code: code as FailureViolation["code"],
    message: requiredString(object, "message", path),
    ...(evidenceIds === undefined ? {} : { evidenceIds }),
  };
}

function asObject(value: unknown, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "必须是对象");
  return value as JsonObject;
}

function requiredString(object: JsonObject, key: string, path: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim().length === 0) fail(`${path}.${key}`, "必须是非空字符串");
  return value;
}

function optionalString(object: JsonObject, key: string, path: string): string | undefined {
  if (object[key] === undefined) return undefined;
  return requiredString(object, key, path);
}

function optionalText(object: JsonObject, key: string, path: string): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`${path}.${key}`, "必须是字符串");
  return value;
}

function requiredBoolean(object: JsonObject, key: string, path: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") fail(`${path}.${key}`, "必须是布尔值");
  return value;
}

function optionalBoolean(object: JsonObject, key: string, path: string): boolean | undefined {
  if (object[key] === undefined) return undefined;
  return requiredBoolean(object, key, path);
}

function requiredArray(object: JsonObject, key: string, path: string): unknown[] {
  const value = object[key];
  if (!Array.isArray(value)) fail(`${path}.${key}`, "必须是数组");
  return value;
}

function optionalArray(object: JsonObject, key: string, path: string): unknown[] | undefined {
  if (object[key] === undefined) return undefined;
  return requiredArray(object, key, path);
}

function requiredStringArray(object: JsonObject, key: string, path: string): string[] {
  return requiredArray(object, key, path).map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) fail(`${path}.${key}[${index}]`, "必须是非空字符串");
    return item;
  });
}

function optionalStringArray(object: JsonObject, key: string, path: string): string[] | undefined {
  if (object[key] === undefined) return undefined;
  return requiredStringArray(object, key, path);
}

function requiredEnum<const T extends readonly string[]>(object: JsonObject, key: string, values: T, path: string): T[number] {
  const value = object[key];
  if (typeof value !== "string" || !values.includes(value)) fail(`${path}.${key}`, `必须是 ${values.join(" | ")}`);
  return value as T[number];
}

function requiredLiteral<const T extends string>(object: JsonObject, key: string, expected: T, path: string): T {
  if (object[key] !== expected) fail(`${path}.${key}`, `必须是 ${expected}`);
  return expected;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) fail(path, "必须是整数");
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const parsed = integer(value, path);
  if (parsed < 0) fail(path, "必须是非负整数");
  return parsed;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = integer(value, path);
  if (parsed <= 0) fail(path, "必须是正整数");
  return parsed;
}

function optionalInteger(object: JsonObject, key: string, path: string): number | undefined {
  if (object[key] === undefined) return undefined;
  return integer(object[key], `${path}.${key}`);
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(path, "必须是非负有限数值");
  return value;
}

function optionalNonNegativeNumber(object: JsonObject, key: string, path: string): number | undefined {
  if (object[key] === undefined) return undefined;
  return nonNegativeNumber(object[key], `${path}.${key}`);
}

function parseSha256(value: string, path: string): string {
  if (!/^sha256:[0-9a-f]{64}$/iu.test(value)) fail(path, "必须使用 sha256:<64位十六进制> 格式");
  return value;
}

function requireUnique(values: readonly (string | number)[], path: string, label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) fail(path, `${label} 重复：${String(duplicate)}`);
}

function fail(path: string, message: string): never {
  throw new SchemaValidationError([{ path, message }]);
}
