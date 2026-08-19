# 面试讲解材料

## 30 秒版本

Agent Eval Lab 是一个轨迹级评测工具，重点解决“进程成功退出不等于用户目标完成”。它可以导入 JSON/JSONL 轨迹，先检查完整性和证据，再输出多标签失败归因，并对同一批任务做配对 A/B、McNemar 与任务级 Bootstrap；Manifest 固定模型、提示词、代码、数据集、完整任务集和 seed/repeat 调度。

## 2 分钟版本

1. **问题**：只看退出码会把零步终止、空答案、工具失败和缺失证据误算成成功。
2. **任务模型**：TaskSpec 明确难度、目标和必需证据；AgentRun 保存工具与验证事件，并用 `taskId + repeatId + seed` 配对。
3. **质量门**：Evaluator 将运行完整性与目标完成分开；verification 中的 claim、值和哈希必须与成功 tool_result 的产出一致，并被最终答案引用。
4. **失败分析**：`violations` 保留一次运行的多个失败标签，`primaryFailure` 给出稳定主归因，而不是全部归为 unknown。
5. **统计**：按 `taskId + repeatId + seed` 严格配对，重复或孤立样本直接报错；报告 fail→pass、pass→fail、exact McNemar p-value 和 task-cluster Bootstrap CI；步数同时报告 all-run 和 success-only。
6. **可复现性**：ExperimentManifest 固定模型、提示词哈希、commit、数据集哈希、完整任务 ID、seed/repeat 调度与评测器版本；任务缺跑会直接失败。
7. **证据边界**：3 条 synthetic demo 可以公开完整复算；私有受控原型只公开脱敏聚合值与算术校验，明确不能从开源仓库复现原始运行。

## 高频追问

### 为什么字符串匹配不够？

最终答案可能包含关键词，但对应网页操作并未完成。评测器应要求结构化成功条件和证据引用，必要时再由人工或校准后的 Judge 复核语义质量。

### 为什么使用 McNemar？

同一任务在两个版本上重复执行属于配对二分类数据。McNemar 关注方向相反的不一致样本，比直接比较两个比例更符合实验设计。

### 为什么同时报告两种平均步数？

失败任务可能零步结束，导致全量平均步数下降。补充成功任务平均步数可以避免把“更早失败”误认为效率提升。

### 为什么 Bootstrap 要按 taskId 聚类？

同一任务的多轮 repeat/seed 共享目标和页面结构，并不是独立样本。按任务簇重采样能避免虚增有效样本量；固定随机 seed 则让区间可以稳定复算。

### 为什么公开两类 evidence？

Synthetic evidence 用来证明工具链可执行、Schema 和统计实现可复算；portfolio aggregate 用来披露私有原型的已核验汇总，但只能验证算术和口径。把两者分开能避免把私有实验包装成公开复现。

### 当前不能证明什么？

合成演示不能证明真实网页泛化或模型提升；它证明的是评测规则、统计计算和报告链路可复现。

## 演示顺序

1. 运行 `npm run evidence:recompute`，指出 synthetic 数据声明；
2. 展示 JSON/JSONL Schema、Manifest 与带路径错误；
3. 展示 integrity gate 拒绝零步/空答案，以及多标签 violations；
4. 展示 fail→pass、McNemar 与 task-cluster Bootstrap；
5. 运行 `npm run portfolio:validate`，解释 aggregate-only 边界；
6. 打开 JSON 报告说明可追溯性。
