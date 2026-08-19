import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRun } from "../src/evaluator.js";
import { runs, tasks } from "../src/fixtures.js";
import { comparePaired, mcnemarExactP } from "../src/statistics.js";

const taskById = new Map(tasks.map((task) => [task.taskId, task]));

test("证据齐全且有最终回答时通过", () => {
  const run = runs.find((item) => item.runId === "optimized-easy-title-r1")!;
  assert.equal(evaluateRun(taskById.get(run.taskId)!, run).passed, true);
});

test("缺少证据时不能把 completed 当作成功", () => {
  const run = runs.find((item) => item.runId === "baseline-medium-search-r1")!;
  const result = evaluateRun(taskById.get(run.taskId)!, run);
  assert.equal(result.passed, false);
  assert.equal(result.failureType, "missing_evidence");
});

test("零步终止会被识别", () => {
  const run = runs.find((item) => item.runId === "baseline-hard-block-r1")!;
  assert.equal(evaluateRun(taskById.get(run.taskId)!, run).failureType, "zero_step_termination");
});

test("配对比较统计正向和反向变化", () => {
  const results = runs.map((run) => evaluateRun(taskById.get(run.taskId)!, run));
  const report = comparePaired(results);
  assert.equal(report.paired.pairs, 3);
  assert.equal(report.paired.failToPass, 2);
  assert.equal(report.paired.passToFail, 0);
});

test("McNemar 无差异时 p=1", () => {
  assert.equal(mcnemarExactP(0, 0), 1);
});

test("自声明证据未绑定成功工具结果时拒绝通过", () => {
  const source = runs.find((item) => item.runId === "optimized-easy-title-r1")!;
  const forged = structuredClone(source);
  const verification = forged.events.find((event) => event.type === "verification")!;
  verification.evidence![0]!.sourceEventId = "missing-tool-result";
  assert.equal(evaluateRun(taskById.get(forged.taskId)!, forged).failureType, "invalid_evidence_source");
});

test("验证事件篡改工具证据值时拒绝通过", () => {
  const source = runs.find((item) => item.runId === "optimized-easy-title-r1")!;
  const forged = structuredClone(source);
  const verification = forged.events.find((event) => event.type === "verification")!;
  verification.evidence![0]!.value = "Forged title";
  assert.equal(evaluateRun(taskById.get(forged.taskId)!, forged).failureType, "invalid_evidence_source");
});

test("重复配对主键会立即报错而不是覆盖", () => {
  const results = runs.map((run) => evaluateRun(taskById.get(run.taskId)!, run));
  assert.throws(() => comparePaired([...results, structuredClone(results[0]!)]), /Duplicate baseline pair key/);
});

test("缺失任一条件的配对会立即报错", () => {
  const results = runs.map((run) => evaluateRun(taskById.get(run.taskId)!, run));
  assert.throws(() => comparePaired(results.slice(1)), /Unpaired results/);
});

test("McNemar 拒绝非法计数", () => {
  assert.throws(() => mcnemarExactP(-1, 2), /non-negative integers/);
});
