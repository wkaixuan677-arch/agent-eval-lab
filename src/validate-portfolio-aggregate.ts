import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validatePortfolioAggregate } from "./portfolio-evidence.js";

const inputPath = resolve(process.argv[2] ?? "examples/portfolio-aggregate/aggregate.json");
const outputPath = resolve(process.argv[3] ?? "reports/portfolio-aggregate-validation.json");
const value: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const validation = validatePortfolioAggregate(value);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
if (!validation.valid) {
  const failures = validation.checks.filter((check) => !check.passed).map((check) => check.id).join("、");
  throw new Error(`作品集汇总校验失败：${failures}`);
}
console.log(`作品集汇总算术校验通过：${validation.checks.length} 项；边界=${validation.evidenceBoundary}`);
