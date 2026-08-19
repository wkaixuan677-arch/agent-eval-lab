import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRun } from "../src/evaluator.js";
import { runs, tasks } from "../src/fixtures.js";
import { comparePaired, mcnemarExactP } from "../src/statistics.js";

const taskById = new Map(tasks.map((task) => [task.taskId, task]));

test("证据齐全且有最终回答时通过", () => {
  const run = runs.find((item) => item.runId === "optimized-easy-title")!;
  assert.equal(evaluateRun(taskById.get(run.taskId)!, run).passed, true);
});

test("缺少证据时不能把 completed 当作成功", () => {
  const run = runs.find((item) => item.runId === "baseline-medium-search")!;
  const result = evaluateRun(taskById.get(run.taskId)!, run);
  assert.equal(result.passed, false);
  assert.equal(result.failureType, "missing_evidence");
});

test("零步终止会被识别", () => {
  const run = runs.find((item) => item.runId === "baseline-hard-block")!;
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
