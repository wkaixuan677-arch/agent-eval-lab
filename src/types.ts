export type Difficulty = "easy" | "medium" | "hard";
export type RunStatus = "completed" | "failed" | "blocked";

export interface TaskSpec {
  taskId: string;
  difficulty: Difficulty;
  objective: string;
  requiredEvidence: string[];
}

export interface EvidenceRecord {
  claimId: string;
  value: string;
  sourceEventId: string;
  sourceUrl?: string;
  contentHash?: string;
}

export interface TrajectoryEvent {
  eventId: string;
  type: "plan" | "tool_call" | "tool_result" | "verification" | "final";
  step: number;
  timestamp: string;
  tool?: string;
  success?: boolean;
  evidence?: EvidenceRecord[];
  citations?: string[];
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AgentRun {
  runId: string;
  taskId: string;
  condition: "baseline" | "optimized";
  repeatId: string;
  seed?: number;
  status: RunStatus;
  events: TrajectoryEvent[];
}

export type FailureType =
  | "none"
  | "missing_trajectory"
  | "zero_step_termination"
  | "empty_final_answer"
  | "missing_evidence"
  | "invalid_evidence_source"
  | "tool_error"
  | "blocked"
  | "goal_not_completed";

export interface EvaluationResult {
  runId: string;
  taskId: string;
  condition: AgentRun["condition"];
  repeatId: string;
  seed?: number;
  pairKey: string;
  passed: boolean;
  failureType: FailureType;
  reasons: string[];
  steps: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ConditionSummary {
  runs: number;
  passed: number;
  successRate: number;
  avgStepsAll: number;
  avgStepsSuccessful: number | null;
  inputTokens: number;
  outputTokens: number;
  failures: Record<string, number>;
}

export interface ComparisonReport {
  schema: "agent-eval-lab-report-v2";
  generatedAt: string;
  baseline: ConditionSummary;
  optimized: ConditionSummary;
  paired: {
    pairs: number;
    failToPass: number;
    passToFail: number;
    unchangedPass: number;
    unchangedFail: number;
    successDelta: number;
    mcnemarExactP: number;
  };
  notes: string[];
}
