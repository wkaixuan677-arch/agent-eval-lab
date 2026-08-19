import { evaluateRun } from "./evaluator.js";
import { comparePaired } from "./statistics.js";
import { SchemaValidationError } from "./schema.js";
import type { EvaluationArtifact, EvaluationInputDocument, EvaluationResult } from "./types.js";

export function buildEvaluationArtifact(input: EvaluationInputDocument): EvaluationArtifact {
  const results = input.schema === "agent-eval-lab-trajectories-v1"
    ? evaluateTrajectories(input)
    : input.results;
  validateAgainstManifest(input, results);
  const report = comparePaired(results);
  return {
    schema: "agent-eval-lab-artifact-v1",
    generatedAt: new Date().toISOString(),
    sourceSchema: input.schema,
    evaluator: { name: "agent-eval-lab", version: "0.3.0" },
    manifest: input.manifest,
    inputCounts: {
      tasks: input.schema === "agent-eval-lab-trajectories-v1" ? input.tasks.length : null,
      runs: results.length,
    },
    report,
    results,
  };
}

function evaluateTrajectories(input: Extract<EvaluationInputDocument, { schema: "agent-eval-lab-trajectories-v1" }>): EvaluationResult[] {
  const taskById = new Map(input.tasks.map((task) => [task.taskId, task]));
  return input.runs.map((run, index) => {
    const task = taskById.get(run.taskId);
    if (!task) throw new SchemaValidationError([{ path: `$.runs[${index}].taskId`, message: `找不到 TaskSpec：${run.taskId}` }]);
    return evaluateRun(task, run);
  });
}

function validateAgainstManifest(input: EvaluationInputDocument, results: EvaluationResult[]): void {
  const expectedTaskIds = [...input.manifest.taskIds].sort();
  if (input.schema === "agent-eval-lab-trajectories-v1") {
    assertExactSet(
      input.tasks.map((task) => task.taskId),
      expectedTaskIds,
      "$.tasks",
      "TaskSpec 与 manifest.taskIds 不一致",
    );
  }
  assertExactSet(
    results.map((result) => result.taskId),
    expectedTaskIds,
    input.schema === "agent-eval-lab-trajectories-v1" ? "$.runs" : "$.results",
    "实际运行任务与 manifest.taskIds 不一致",
  );

  const allowedSeeds = new Set(input.manifest.seeds);
  const missingSeed = results.find((result) => result.seed === undefined);
  if (missingSeed) {
    throw new SchemaValidationError([{
      path: "$.manifest.seeds",
      message: `运行 ${missingSeed.runId} 未声明 seed`,
    }]);
  }
  const unknownSeed = results.find((result) => !allowedSeeds.has(result.seed!));
  if (unknownSeed) {
    throw new SchemaValidationError([{
      path: "$.manifest.seeds",
      message: `运行 ${unknownSeed.runId} 使用了未声明 seed：${String(unknownSeed.seed)}`,
    }]);
  }
  const scheduleByTask = new Map<string, Set<string>>();
  for (const result of results) {
    const schedule = scheduleByTask.get(result.taskId) ?? new Set<string>();
    schedule.add(`${result.repeatId}::${result.seed!}`);
    scheduleByTask.set(result.taskId, schedule);
  }
  for (const taskId of expectedTaskIds) {
    const schedule = scheduleByTask.get(taskId) ?? new Set<string>();
    if (schedule.size !== input.manifest.repeatCount) {
      throw new SchemaValidationError([{
        path: "$.manifest.repeatCount",
        message: `任务 ${taskId} 声明 ${input.manifest.repeatCount} 次配对重复，实际为 ${schedule.size} 次`,
      }]);
    }
    const taskSeeds = new Set([...schedule].map((item) => Number(item.slice(item.lastIndexOf("::") + 2))));
    const missingSeeds = input.manifest.seeds.filter((seed) => !taskSeeds.has(seed));
    if (missingSeeds.length > 0) {
      throw new SchemaValidationError([{
        path: "$.manifest.seeds",
        message: `任务 ${taskId} 未覆盖声明 seed：${missingSeeds.join("、")}`,
      }]);
    }
  }

  const referenceTaskId = expectedTaskIds[0]!;
  const referenceSchedule = [...scheduleByTask.get(referenceTaskId)!].sort();
  const scheduleMismatch = expectedTaskIds.slice(1).find((taskId) => {
    const schedule = [...scheduleByTask.get(taskId)!].sort();
    return schedule.join("\n") !== referenceSchedule.join("\n");
  });
  if (scheduleMismatch) {
    throw new SchemaValidationError([{
      path: "$.manifest.seeds",
      message: `任务 ${scheduleMismatch} 的 repeatId/seed 调度与 ${referenceTaskId} 不一致`,
    }]);
  }
}

function assertExactSet(actualValues: string[], expectedValues: string[], path: string, message: string): void {
  const actual = [...new Set(actualValues)].sort();
  const missing = expectedValues.filter((value) => !actual.includes(value));
  const extra = actual.filter((value) => !expectedValues.includes(value));
  if (missing.length === 0 && extra.length === 0) return;
  throw new SchemaValidationError([{
    path,
    message: `${message}；缺少 [${missing.join("、")}]；多出 [${extra.join("、")}]`,
  }]);
}
