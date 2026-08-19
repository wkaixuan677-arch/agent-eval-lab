#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEvaluationArtifact } from "./pipeline.js";
import { parseInputText, SchemaValidationError } from "./schema.js";

interface CliOptions {
  input: string;
  output: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);
  const text = await readFile(inputPath, "utf8");
  const input = parseInputText(text, inputPath);
  const artifact = buildEvaluationArtifact(input);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`评测完成：${artifact.report.paired.pairs} 组配对，报告 ${outputPath}`);
}

function parseArguments(args: string[]): CliOptions {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("用法：agent-eval-lab evaluate --input <JSON或JSONL> --output <报告JSON>");
    process.exit(0);
  }
  if (args[0] !== "evaluate") throw new Error("缺少命令 evaluate。使用 --help 查看用法。");
  const input = optionValue(args, "--input");
  const output = optionValue(args, "--output");
  if (!input) throw new Error("缺少 --input <文件路径>");
  if (!output) throw new Error("缺少 --output <文件路径>");
  return { input, output };
}

function optionValue(args: string[], name: string): string | undefined {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

main().catch((error: unknown) => {
  if (error instanceof SchemaValidationError) {
    console.error(`输入 Schema 校验失败：\n${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
