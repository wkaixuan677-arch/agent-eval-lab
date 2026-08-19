import type { AgentRun, EvaluationResult, FailureType, TaskSpec } from "./types.js";

export function evaluateRun(task: TaskSpec, run: AgentRun): EvaluationResult {
  const reasons: string[] = [];
  let failureType: FailureType = "none";

  if (run.taskId !== task.taskId) {
    throw new Error(`任务不匹配：${run.taskId} != ${task.taskId}`);
  }
  if (run.events.length === 0) {
    failureType = "missing_trajectory";
    reasons.push("轨迹为空");
  }

  const toolEvents = run.events.filter((event) => event.type === "tool_call");
  const finalEvent = [...run.events].reverse().find((event) => event.type === "final");
  const sourceEvidence = new Map<string, { value: string; contentHash?: string }>();
  for (const event of run.events.filter((item) => item.type === "tool_result" && item.success === true)) {
    for (const record of event.evidence ?? []) {
      if (record.sourceEventId !== event.eventId) continue;
      sourceEvidence.set(`${event.eventId}::${record.claimId}`, {
        value: record.value,
        ...(record.contentHash === undefined ? {} : { contentHash: record.contentHash }),
      });
    }
  }
  const declaredEvidence = run.events
    .filter((event) => event.type === "verification" && event.success === true)
    .flatMap((event) => event.evidence ?? []);
  const invalidEvidence = declaredEvidence.filter((record) => {
    const source = sourceEvidence.get(`${record.sourceEventId}::${record.claimId}`);
    return !source || source.value !== record.value || source.contentHash !== record.contentHash;
  });
  const verifiedEvidence = new Set(
    declaredEvidence.filter((record) => !invalidEvidence.includes(record)).map((record) => record.claimId),
  );

  if (failureType === "none" && toolEvents.length === 0) {
    failureType = "zero_step_termination";
    reasons.push("没有执行任何工具步骤");
  }
  if (failureType === "none" && (!finalEvent?.text || finalEvent.text.trim().length === 0)) {
    failureType = "empty_final_answer";
    reasons.push("最终回答为空");
  }
  if (failureType === "none" && invalidEvidence.length > 0) {
    failureType = "invalid_evidence_source";
    reasons.push(`证据未绑定成功工具结果：${invalidEvidence.map((item) => item.claimId).join("、")}`);
  }
  const missing = task.requiredEvidence.filter((item) => !verifiedEvidence.has(item));
  if (failureType === "none" && missing.length > 0) {
    failureType = "missing_evidence";
    reasons.push(`缺少已验证证据：${missing.join("、")}`);
  }
  const missingCitations = task.requiredEvidence.filter((item) => !(finalEvent?.citations ?? []).includes(item));
  if (failureType === "none" && missingCitations.length > 0) {
    failureType = "missing_evidence";
    reasons.push(`最终回答未引用证据：${missingCitations.join("、")}`);
  }
  const hasToolError = run.events.some(
    (event) => event.type === "tool_result" && event.success === false,
  );
  if (failureType === "none" && hasToolError && run.status === "failed") {
    failureType = "tool_error";
    reasons.push("工具错误后未恢复");
  }
  if (failureType === "none" && run.status === "blocked") {
    failureType = "blocked";
    reasons.push("任务被明确阻断");
  }
  if (failureType === "none" && run.status !== "completed") {
    failureType = "goal_not_completed";
    reasons.push("运行状态未完成");
  }

  const passed = failureType === "none";
  const steps = new Set(toolEvents.map((event) => event.step)).size;
  const inputTokens = run.events.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0);
  const outputTokens = run.events.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0);

  return {
    runId: run.runId,
    taskId: run.taskId,
    condition: run.condition,
    repeatId: run.repeatId,
    ...(run.seed === undefined ? {} : { seed: run.seed }),
    pairKey: pairKey(run),
    passed,
    failureType,
    reasons,
    steps,
    inputTokens,
    outputTokens,
  };
}

function pairKey(run: AgentRun): string {
  return `${run.taskId}::${run.repeatId}::${run.seed ?? "none"}`;
}
