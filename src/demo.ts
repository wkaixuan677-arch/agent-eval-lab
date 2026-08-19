import { mkdir, writeFile } from "node:fs/promises";
import { evaluateRun } from "./evaluator.js";
import { runs, tasks } from "./fixtures.js";
import { comparePaired } from "./statistics.js";

const taskById = new Map(tasks.map((task) => [task.taskId, task]));
const results = runs.map((run) => evaluateRun(taskById.get(run.taskId)!, run));
const report = comparePaired(results);

await mkdir("reports", { recursive: true });
await writeFile("reports/demo-report.json", `${JSON.stringify({ report, results }, null, 2)}\n`, "utf8");

console.log("Agent Eval Lab 合成数据演示");
console.log(`Baseline: ${(report.baseline.successRate * 100).toFixed(2)}%`);
console.log(`Optimized: ${(report.optimized.successRate * 100).toFixed(2)}%`);
console.log(`Fail→Pass: ${report.paired.failToPass}; Pass→Fail: ${report.paired.passToFail}`);
console.log(`McNemar exact p: ${report.paired.mcnemarExactP.toFixed(4)}`);
console.log("报告已生成：reports/demo-report.json");
