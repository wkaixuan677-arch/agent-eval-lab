import type { AgentRun, EvidenceRecord, TaskSpec, TrajectoryEvent } from "./types.js";

const now = "2026-01-01T00:00:00.000Z";
const event = (eventId: string, value: Omit<TrajectoryEvent, "timestamp" | "eventId">): TrajectoryEvent => ({ eventId, ...value, timestamp: now });
const evidence = (claimId: string, sourceEventId: string, value: string): EvidenceRecord => ({ claimId, sourceEventId, value, sourceUrl: "fixture://agent-eval-lab" });

export const tasks: TaskSpec[] = [
  { taskId: "easy-title", difficulty: "easy", objective: "读取页面标题", requiredEvidence: ["title"] },
  { taskId: "medium-search", difficulty: "medium", objective: "搜索商品并报告数量", requiredEvidence: ["query", "count"] },
  { taskId: "hard-block", difficulty: "hard", objective: "识别访问阻断并安全结束", requiredEvidence: ["blocker"] },
];

function run(taskId: string, condition: AgentRun["condition"], status: AgentRun["status"], events: TrajectoryEvent[]): AgentRun {
  return { runId: `${condition}-${taskId}-r1`, taskId, condition, repeatId: "r1", seed: 1, status, events };
}

export const runs: AgentRun[] = [
  run("easy-title", "baseline", "completed", [
    event("b-easy-call", { type: "tool_call", step: 1, tool: "open", inputTokens: 80 }),
    event("b-easy-result", { type: "tool_result", step: 1, success: true, evidence: [evidence("title", "b-easy-result", "Agent Eval Lab")] }),
    event("b-easy-verify", { type: "verification", step: 1, success: true, evidence: [evidence("title", "b-easy-result", "Agent Eval Lab")] }),
    event("b-easy-final", { type: "final", step: 1, text: "标题为 Agent Eval Lab", citations: ["title"], outputTokens: 18 }),
  ]),
  run("medium-search", "baseline", "failed", [
    event("b-medium-call", { type: "tool_call", step: 1, tool: "search", inputTokens: 110 }),
    event("b-medium-result", { type: "tool_result", step: 1, success: true, evidence: [evidence("query", "b-medium-result", "商品")] }),
    event("b-medium-verify", { type: "verification", step: 1, success: false, evidence: [evidence("query", "b-medium-result", "商品")] }),
    event("b-medium-final", { type: "final", step: 1, text: "已完成", citations: ["query"], outputTokens: 8 }),
  ]),
  run("hard-block", "baseline", "completed", [
    event("b-hard-final", { type: "final", step: 0, text: "任务完成", outputTokens: 6 }),
  ]),
  run("easy-title", "optimized", "completed", [
    event("o-easy-call", { type: "tool_call", step: 1, tool: "open", inputTokens: 70 }),
    event("o-easy-result", { type: "tool_result", step: 1, success: true, evidence: [evidence("title", "o-easy-result", "Agent Eval Lab")] }),
    event("o-easy-verify", { type: "verification", step: 1, success: true, evidence: [evidence("title", "o-easy-result", "Agent Eval Lab")] }),
    event("o-easy-final", { type: "final", step: 1, text: "标题为 Agent Eval Lab", citations: ["title"], outputTokens: 16 }),
  ]),
  run("medium-search", "optimized", "completed", [
    event("o-medium-call", { type: "tool_call", step: 1, tool: "search", inputTokens: 95 }),
    event("o-medium-result", { type: "tool_result", step: 1, success: true, evidence: [evidence("query", "o-medium-result", "商品"), evidence("count", "o-medium-result", "3")] }),
    event("o-medium-verify", { type: "verification", step: 1, success: true, evidence: [evidence("query", "o-medium-result", "商品"), evidence("count", "o-medium-result", "3")] }),
    event("o-medium-final", { type: "final", step: 1, text: "搜索结果共 3 条", citations: ["query", "count"], outputTokens: 15 }),
  ]),
  run("hard-block", "optimized", "completed", [
    event("o-hard-call", { type: "tool_call", step: 1, tool: "observe", inputTokens: 90 }),
    event("o-hard-result", { type: "tool_result", step: 1, success: true, evidence: [evidence("blocker", "o-hard-result", "页面要求登录")] }),
    event("o-hard-verify", { type: "verification", step: 1, success: true, evidence: [evidence("blocker", "o-hard-result", "页面要求登录")] }),
    event("o-hard-final", { type: "final", step: 1, text: "BLOCKED：页面要求登录，未尝试绕过", citations: ["blocker"], outputTokens: 20 }),
  ]),
];
