import type {
  AgentRun,
  EvaluationResult,
  FailureViolation,
  FailureViolationCode,
  TaskSpec,
} from "./types.js";

export function evaluateRun(task: TaskSpec, run: AgentRun): EvaluationResult {
  const violations: FailureViolation[] = [];
  const addViolation = (code: FailureViolationCode, message: string, evidenceIds?: string[]): void => {
    const existingIndex = violations.findIndex((violation) => violation.code === code);
    if (existingIndex !== -1) {
      const existing = violations[existingIndex]!;
      const mergedEvidenceIds = [...new Set([...(existing.evidenceIds ?? []), ...(evidenceIds ?? [])])];
      violations[existingIndex] = {
        code,
        message: existing.message.includes(message) ? existing.message : `${existing.message}；${message}`,
        ...(mergedEvidenceIds.length === 0 ? {} : { evidenceIds: mergedEvidenceIds }),
      };
      return;
    }
    violations.push({ code, message, ...(evidenceIds === undefined ? {} : { evidenceIds }) });
  };

  if (run.taskId !== task.taskId) {
    throw new Error(`任务不匹配：${run.taskId} != ${task.taskId}`);
  }
  if (run.events.length === 0) {
    addViolation("missing_trajectory", "轨迹为空");
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

  if (toolEvents.length === 0) {
    addViolation("zero_step_termination", "没有执行任何工具步骤");
  }
  if (!finalEvent?.text || finalEvent.text.trim().length === 0) {
    addViolation("empty_final_answer", "最终回答为空");
  }
  if (invalidEvidence.length > 0) {
    const evidenceIds = [...new Set(invalidEvidence.map((item) => item.claimId))];
    addViolation("invalid_evidence_source", `证据未绑定成功工具结果：${evidenceIds.join("、")}`, evidenceIds);
  }
  const missing = task.requiredEvidence.filter((item) => !verifiedEvidence.has(item));
  if (missing.length > 0) {
    addViolation("missing_evidence", `缺少已验证证据：${missing.join("、")}`, missing);
  }
  const missingCitations = task.requiredEvidence.filter((item) => !(finalEvent?.citations ?? []).includes(item));
  if (missingCitations.length > 0) {
    addViolation("missing_evidence", `最终回答未引用证据：${missingCitations.join("、")}`, missingCitations);
  }
  const hasToolError = run.events.some(
    (event) => event.type === "tool_result" && event.success === false,
  );
  if (hasToolError && run.status === "failed") {
    addViolation("tool_error", "工具错误后未恢复");
  }
  if (run.status === "blocked") {
    addViolation("blocked", "任务被明确阻断");
  }
  if (run.status === "failed") {
    addViolation("goal_not_completed", "运行状态未完成");
  }

  const primaryFailure = violations[0]?.code ?? "none";
  const passed = violations.length === 0;
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
    failureType: primaryFailure,
    primaryFailure,
    violations,
    reasons: violations.map((violation) => violation.message),
    steps,
    inputTokens,
    outputTokens,
  };
}

function pairKey(run: AgentRun): string {
  return `${run.taskId}::${run.repeatId}::${run.seed ?? "none"}`;
}
