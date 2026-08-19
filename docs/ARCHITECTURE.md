# 架构说明

```mermaid
flowchart LR
    T[TaskSpec] --> I[Integrity Gate]
    R[AgentRun / Events] --> I
    I --> E[Evidence Evaluator]
    E --> F[Failure Taxonomy]
    E --> P[Pair by taskId + repeatId + seed]
    F --> S[Condition Summary]
    P --> M[McNemar Exact Test]
    S --> J[Auditable JSON Report]
    M --> J
```

## 判定逻辑

```mermaid
flowchart TD
    A{Trajectory exists?} -->|no| X1[missing_trajectory]
    A -->|yes| B{Valid steps > 0?}
    B -->|no| X2[zero_step]
    B -->|yes| C{Final answer exists?}
    C -->|no| X3[empty_final]
    C -->|yes| D{Required evidence verified?}
    D -->|no| X4[missing_evidence]
    D -->|yes| OK[PASS]
```

## 为什么是配对实验

Baseline 和 Optimized 必须在同一个 `taskId + repeatId + seed` 上成对比较。重复或孤立主键会直接报错，禁止静默覆盖。这样既能统计 `fail→pass` 与 `pass→fail`，也能保证总体成功率和 McNemar exact test 使用同一批有效配对。

## 证据信任边界

`verification` 不能凭字符串自报成功。所声明的 claim、值与内容哈希必须来自一个执行成功的 `tool_result`，最终回答还必须引用该 claim。来源事件缺失、工具失败或值被篡改都会被归类为 `invalid_evidence_source`。
