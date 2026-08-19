import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePortfolioAggregate } from "../src/portfolio-evidence.js";

test("作品集脱敏汇总的算术和证据边界均通过", async () => {
  const value: unknown = JSON.parse(await readFile("examples/portfolio-aggregate/aggregate.json", "utf8"));
  const report = validatePortfolioAggregate(value);
  assert.equal(report.valid, true);
  assert.equal(report.evidenceBoundary, "aggregate-only-not-publicly-reproducible");
  assert.equal(report.checks.every((check) => check.passed), true);
});

test("作品集汇总不能把错误百分比校验为真", async () => {
  const value = JSON.parse(await readFile("examples/portfolio-aggregate/aggregate.json", "utf8")) as {
    experiments: { systemAB: { optimizedPercent: number } };
  };
  value.experiments.systemAB.optimizedPercent = 100;
  const report = validatePortfolioAggregate(value);
  assert.equal(report.valid, false);
  assert.equal(report.checks.find((check) => check.id === "system.optimized.arithmetic")?.passed, false);
});

test("作品集汇总拒绝未知嵌套字段，不能藏入原始运行", async () => {
  const value = JSON.parse(await readFile("examples/portfolio-aggregate/aggregate.json", "utf8")) as {
    experiments: { systemAB: Record<string, unknown> };
  };
  value.experiments.systemAB.runs = [{ task: "private" }];
  assert.throws(() => validatePortfolioAggregate(value), /未允许字段/);
});

test("作品集汇总必须保留 owner-verified provenance", async () => {
  const value = JSON.parse(await readFile("examples/portfolio-aggregate/aggregate.json", "utf8")) as {
    provenance: { verification: string };
  };
  value.provenance.verification = "unverified";
  const report = validatePortfolioAggregate(value);
  assert.equal(report.valid, false);
  assert.equal(report.checks.find((check) => check.id === "boundary.verification")?.passed, false);
});

test("作品集汇总会单独拒绝常见密钥与绝对路径模式", async () => {
  const value = JSON.parse(await readFile("examples/portfolio-aggregate/aggregate.json", "utf8")) as {
    provenance: { statement: string };
  };
  const absolutePath = ["C:", "Users", "private", "runs"].join("\\");
  const credential = ["api", "key"].join("_") + "=" + ["secret", "token", "value"].join("-");
  value.provenance.statement = `reviewed at ${absolutePath} with ${credential}`;
  const report = validatePortfolioAggregate(value);
  assert.equal(report.valid, false);
  assert.equal(report.checks.find((check) => check.id === "boundary.sensitive-pattern-scan")?.passed, false);
});
