import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRun } from "../src/evaluator.js";
import { runs, tasks } from "../src/fixtures.js";
import { comparePaired, mcnemarExactP } from "../src/statistics.js";

test("条件汇总的 failures 统计全部违规标签而非仅主失败", () => {
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const results = runs.map((run) => evaluateRun(taskById.get(run.taskId)!, run));
  const report = comparePaired(results);
  assert.deepEqual(report.baseline.failures, {
    missing_evidence: 2,
    goal_not_completed: 1,
    zero_step_termination: 1,
  });
  assert.ok(report.notes.some((note) => note.includes("全部违规标签")));
});

test("McNemar 小样本保持既有精确输出", () => {
  assert.equal(mcnemarExactP(8, 0), 0.0078125);
});

test("McNemar 在 2000 个不一致配对时仍返回有限合理概率", () => {
  const p = mcnemarExactP(1_100, 900);
  assert.ok(Number.isFinite(p));
  assert.ok(p > 0 && p < 0.00001, `unexpected p=${p}`);
});

test("McNemar 对 1100/2000 两组不一致计数不会溢出", () => {
  const p = mcnemarExactP(1_100, 2_000);
  assert.ok(Number.isFinite(p));
  assert.ok(p > 0 && p < 1e-40, `unexpected p=${p}`);
});
