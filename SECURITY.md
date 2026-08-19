# 安全策略

请不要在公开 Issue 中提交 API Key、Cookie、登录状态、私有轨迹或个人数据。

若发现安全问题，请通过 GitHub Private Vulnerability Reporting 或主页公开邮箱联系维护者。当前版本只读取用户显式提供的本地 JSON/JSONL 与公开仓库内的 synthetic / aggregate-only 示例，不执行远程 Agent，也不读取浏览器凭据。Aggregate 校验包含严格字段白名单和常见敏感模式扫描，但不能替代人工隐私审查。
