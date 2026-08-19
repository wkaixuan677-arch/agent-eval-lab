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

export type FailureViolationCode = Exclude<FailureType, "none">;

export interface FailureViolation {
  code: FailureViolationCode;
  message: string;
  evidenceIds?: string[];
}

export interface EvaluationResult {
  runId: string;
  taskId: string;
  condition: AgentRun["condition"];
  repeatId: string;
  seed?: number;
  pairKey: string;
  passed: boolean;
  /** @deprecated 使用 primaryFailure。保留该字段以兼容 v0.1/v0.2 消费方。 */
  failureType: FailureType;
  primaryFailure: FailureType;
  violations: FailureViolation[];
  reasons: string[];
  steps: number;
  inputTokens: number;
  outputTokens: number;
}

export type DataClassification = "synthetic" | "controlled" | "public";

export interface ExperimentManifest {
  schema: "agent-eval-lab-manifest-v1";
  experimentId: string;
  createdAt: string;
  model: {
    provider: string;
    name: string;
    revision?: string;
  };
  promptHash: string;
  codeCommit: string;
  dataset: {
    name: string;
    hash: string;
  };
  /** 本次实验应完整覆盖的任务 ID；私有任务可使用不泄露语义的稳定匿名 ID。 */
  taskIds: string[];
  /** 每个任务必须实际覆盖的 seed 集合。Manifest 模式下每条运行都必须带 seed。 */
  seeds: number[];
  /** 每个任务的配对重复总数；必须不少于 seeds 数量。 */
  repeatCount: number;
  evaluatorVersion: string;
  data: {
    classification: DataClassification;
    containsPrivateData: boolean;
    redacted: boolean;
  };
  notes?: string[];
}

export interface TaskBootstrapInterval {
  method: "task-cluster-percentile-bootstrap";
  unit: "task";
  estimate: number;
  lower: number;
  upper: number;
  confidenceLevel: number;
  iterations: number;
  seed: number;
  tasks: number;
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
  schema: "agent-eval-lab-report-v3";
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
    taskBootstrapCI: TaskBootstrapInterval;
  };
  notes: string[];
}

export interface TrajectoryInputDocument {
  schema: "agent-eval-lab-trajectories-v1";
  manifest: ExperimentManifest;
  tasks: TaskSpec[];
  runs: AgentRun[];
}

export interface ResultsInputDocument {
  schema: "agent-eval-lab-results-v1";
  manifest: ExperimentManifest;
  results: EvaluationResult[];
}

export type EvaluationInputDocument = TrajectoryInputDocument | ResultsInputDocument;

export interface EvaluationArtifact {
  schema: "agent-eval-lab-artifact-v1";
  generatedAt: string;
  sourceSchema: EvaluationInputDocument["schema"];
  evaluator: {
    name: "agent-eval-lab";
    version: "0.3.0";
  };
  manifest: ExperimentManifest;
  inputCounts: {
    tasks: number | null;
    runs: number;
  };
  report: ComparisonReport;
  results: EvaluationResult[];
}
