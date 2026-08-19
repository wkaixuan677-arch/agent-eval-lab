# 公开证据示例包

这里的数据是**完全合成（synthetic）**的受控示例，只用来证明评测器、配对统计和报告生成过程可以复算。它不包含公司代码、内部任务、真实用户数据或作者私有实验结果，也不能用来宣称真实 Agent 的能力。

一条命令重新计算：

```bash
npm run evidence:recompute
```

输出为 `reports/public-evidence-report.json`。输入 Manifest 固定记录模型标识、提示词哈希、代码版本、数据集标识哈希、seed、重复次数、评测器版本和数据分类。

哈希推导规则公开且可复核：

- `promptHash`：字符串 `Evaluate each synthetic trajectory using evidence-bound completion rules.` 的 SHA-256；
- `dataset.hash`：稳定数据集标识 `agent-eval-lab-public-synthetic-v1` 的 SHA-256。

本示例输入采用“已评测 A/B 结果”Schema。CLI 同时支持原始轨迹输入及 JSONL 兼容记录格式；当前实现会一次读入本地文件，并不宣称流式处理超大文件。格式见仓库 README。
