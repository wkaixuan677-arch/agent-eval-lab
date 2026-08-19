import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateRun } from "../src/evaluator.js";
import { runs, tasks } from "../src/fixtures.js";
import { buildEvaluationArtifact } from "../src/pipeline.js";
import { parseEvaluationInput, parseInputText, SchemaValidationError } from "../src/schema.js";
import { bootstrapTaskClusterSuccessDelta } from "../src/statistics.js";
import type { ExperimentManifest } from "../src/types.js";

const manifest: ExperimentManifest = {
  schema: "agent-eval-lab-manifest-v1",
  experimentId: "schema-test",
  createdAt: "2026-08-19T00:00:00.000Z",
  model: { provider: "fixture", name: "deterministic" },
  promptHash: `sha256:${"a".repeat(64)}`,
  codeCommit: "74f4a3a",
  dataset: { name: "fixture", hash: `sha256:${"b".repeat(64)}` },
  taskIds: ["easy-title"],
  seeds: [1],
  repeatCount: 1,
  evaluatorVersion: "0.3.0",
  data: { classification: "synthetic", containsPrivateData: false, redacted: true },
};

test("一次失败保留多标签 violations，同时兼容 failureType", () => {
  const run = runs.find((item) => item.runId === "baseline-medium-search-r1")!;
  const task = tasks.find((item) => item.taskId === run.taskId)!;
  const result = evaluateRun(task, run);
  assert.equal(result.primaryFailure, "missing_evidence");
  assert.equal(result.failureType, result.primaryFailure);
  assert.deepEqual(result.violations.map((item) => item.code), ["missing_evidence", "goal_not_completed"]);
});

test("Manifest 对错误哈希给出可定位的 Schema 错误", () => {
  assert.throws(
    () => parseEvaluationInput({
      schema: "agent-eval-lab-results-v1",
      manifest: { ...manifest, promptHash: "not-a-hash" },
      results: [],
    }),
    (error: unknown) => error instanceof SchemaValidationError && error.message.includes("$.manifest.promptHash"),
  );
});

test("JSONL manifest/task/run 可被导入并生成报告", () => {
  const task = tasks.find((item) => item.taskId === "easy-title")!;
  const baseline = runs.find((item) => item.runId === "baseline-easy-title-r1")!;
  const optimized = runs.find((item) => item.runId === "optimized-easy-title-r1")!;
  const jsonl = [
    { recordType: "manifest", data: manifest },
    { recordType: "task", data: task },
    { recordType: "run", data: baseline },
    { recordType: "run", data: optimized },
  ].map((record) => JSON.stringify(record)).join("\n");
  const artifact = buildEvaluationArtifact(parseInputText(jsonl, "inline.jsonl"));
  assert.equal(artifact.sourceSchema, "agent-eval-lab-trajectories-v1");
  assert.equal(artifact.report.paired.pairs, 1);
  assert.equal(artifact.report.paired.taskBootstrapCI.tasks, 1);
});

test("旧版 A/B result 可补全 primaryFailure 和 violations", () => {
  const sourceRun = runs.find((item) => item.runId === "baseline-medium-search-r1")!;
  const task = tasks.find((item) => item.taskId === sourceRun.taskId)!;
  const result = evaluateRun(task, sourceRun);
  const legacy = structuredClone(result) as unknown as Record<string, unknown>;
  delete legacy.primaryFailure;
  delete legacy.violations;
  const input = parseEvaluationInput({ schema: "agent-eval-lab-results-v1", manifest, results: [legacy] });
  assert.equal(input.schema, "agent-eval-lab-results-v1");
  assert.equal(input.results[0]!.primaryFailure, "missing_evidence");
  assert.equal(input.results[0]!.violations.length, 1);
});

test("任务聚类 Bootstrap 在相同 seed 下完全确定", () => {
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const results = runs.map((run) => evaluateRun(taskById.get(run.taskId)!, run));
  const first = bootstrapTaskClusterSuccessDelta(results, { iterations: 500, seed: 42 });
  const second = bootstrapTaskClusterSuccessDelta(results, { iterations: 500, seed: 42 });
  assert.deepEqual(first, second);
  assert.equal(first.tasks, 3);
  assert.ok(first.lower <= first.estimate && first.estimate <= first.upper);
});

test("公开证据包明确标记 synthetic 且能生成配对报告", async () => {
  const text = await readFile("examples/public-evidence/input-results.json", "utf8");
  const input = parseInputText(text);
  const artifact = buildEvaluationArtifact(input);
  assert.equal(artifact.manifest.data.classification, "synthetic");
  assert.equal(artifact.manifest.data.containsPrivateData, false);
  assert.equal(artifact.report.paired.pairs, 3);
});

test("导入结果拒绝伪造 pairKey", async () => {
  const text = await readFile("examples/public-evidence/input-results.json", "utf8");
  const value = JSON.parse(text) as { results: Array<Record<string, unknown>> };
  value.results[0]!.pairKey = "forged";
  assert.throws(() => parseEvaluationInput(value), /pairKey/);
});

test("公开 JSON Schema 文件可被标准 JSON 解析", async () => {
  const schema = JSON.parse(await readFile("schemas/evaluation-input.schema.json", "utf8")) as { $schema?: string; oneOf?: unknown[] };
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.oneOf?.length, 2);
});

test("Manifest 声明的每任务重复次数必须完整", async () => {
  const text = await readFile("examples/public-evidence/input-results.json", "utf8");
  const value = JSON.parse(text) as { manifest: ExperimentManifest; results: Array<Record<string, unknown>> };
  value.manifest.repeatCount = 2;
  assert.throws(
    () => buildEvaluationArtifact(parseEvaluationInput(value)),
    (error: unknown) => error instanceof SchemaValidationError && error.message.includes("repeatCount"),
  );
});

test("轨迹任务必须声明非空且唯一的必需证据", () => {
  const sourceTask = tasks[0]!;
  const sourceRuns = runs.filter((run) => run.taskId === sourceTask.taskId);
  assert.throws(
    () => parseEvaluationInput({
      schema: "agent-eval-lab-trajectories-v1",
      manifest,
      tasks: [{ ...sourceTask, requiredEvidence: [] }],
      runs: sourceRuns,
    }),
    /requiredEvidence/,
  );
});

test("Manifest taskIds 中未执行的任务不能从报告分母消失", () => {
  const task = tasks.find((item) => item.taskId === "easy-title")!;
  const selectedRuns = runs.filter((run) => run.taskId === task.taskId);
  const phantom = { taskId: "never-run", difficulty: "easy" as const, objective: "必须执行", requiredEvidence: ["proof"] };
  assert.throws(
    () => buildEvaluationArtifact(parseEvaluationInput({
      schema: "agent-eval-lab-trajectories-v1",
      manifest: { ...manifest, taskIds: [task.taskId, phantom.taskId] },
      tasks: [task, phantom],
      runs: selectedRuns,
    })),
    (error: unknown) => error instanceof SchemaValidationError && error.message.includes("实际运行任务"),
  );
});

test("results 输入同样拒绝整项任务缺失", async () => {
  const value = JSON.parse(await readFile("examples/public-evidence/input-results.json", "utf8")) as {
    results: Array<{ taskId: string }>;
  };
  value.results = value.results.filter((result) => result.taskId !== "hard-block");
  assert.throws(
    () => buildEvaluationArtifact(parseEvaluationInput(value)),
    (error: unknown) => error instanceof SchemaValidationError && error.message.includes("实际运行任务"),
  );
});

test("Manifest 模式要求每条运行显式提供声明过的 seed", () => {
  const task = tasks.find((item) => item.taskId === "easy-title")!;
  const selectedRuns = runs.filter((run) => run.taskId === task.taskId).map((run) => {
    const copy = structuredClone(run) as unknown as Record<string, unknown>;
    delete copy.seed;
    return copy;
  });
  assert.throws(
    () => parseEvaluationInput({
      schema: "agent-eval-lab-trajectories-v1",
      manifest,
      tasks: [task],
      runs: selectedRuns,
    }),
    /seed/,
  );
});

test("显式空 final.text 进入评测器并归因为 empty_final_answer", () => {
  const source = runs.find((item) => item.runId === "optimized-easy-title-r1")!;
  const value = structuredClone(source);
  value.events.find((event) => event.type === "final")!.text = "";
  const input = parseEvaluationInput({
    schema: "agent-eval-lab-trajectories-v1",
    manifest,
    tasks: [tasks.find((item) => item.taskId === source.taskId)!],
    runs: [value],
  });
  assert.equal(input.schema, "agent-eval-lab-trajectories-v1");
  assert.equal(evaluateRun(input.tasks[0]!, input.runs[0]!).primaryFailure, "empty_final_answer");
});

test("显式 results 必须让 primaryFailure、violations 与 reasons 一致", async () => {
  const value = JSON.parse(await readFile("examples/public-evidence/input-results.json", "utf8")) as {
    results: Array<Record<string, unknown>>;
  };
  const failed = value.results.find((result) => result.passed === false)!;
  failed.violations = [];
  failed.reasons = [];
  assert.throws(() => parseEvaluationInput(value), /violations/);
});
