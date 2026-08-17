# 第1类：需求 + 踩坑 + Bug

> 本目录归档所有需求文档、踩坑记录和Bug修复记录

---

## 需求文档

| 文档 | 内容 |
|------|------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | 全局需求清单 |
| [improvement-plan.md](improvement-plan.md) | 5大改进问题方案 |
| [evaluation-reliability-research.md](evaluation-reliability-research.md) | 评估可靠性调研 |
| [evaluation-improvement-plan.md](evaluation-improvement-plan.md) | 自动评估改造方案 |
| [knowledge-graph-improvement-plan.md](knowledge-graph-improvement-plan.md) | 知识图谱改进方案 |
| [semantic-cache-plan.md](semantic-cache-plan.md) | 语义缓存方案 |
| [hardware-profile.md](hardware-profile.md) | 本地/服务器硬件约束 |

## 踩坑记录

| 文档 | 日期 | 关键踩坑 |
|------|------|---------|
| [2026-08-07-r020-r021-pitfalls.md](2026-08-07-r020-r021-pitfalls.md) | 08-07 | drizzle HNSW索引运行时崩溃、agnes空响应、Redis懒连接、isAmount不匹配整数+单位 |
| [2026-08-04-history-conversation-bug.md](2026-08-04-history-conversation-bug.md) | 08-04 | AUTH_SECRET不一致→JWT验证失败→401→历史对话不显示 |
| [2026-08-04-docker-containerization.md](2026-08-04-docker-containerization.md) | 08-04 | Docker构建需host.docker.internal、端口3000被占用、compose override自动加载 |
| [2026-08-03-market-cache-endpoint-gap.md](2026-08-03-market-cache-endpoint-gap.md) | 08-03 | 4个数据端点未写缓存 |
| [2026-08-02-webpack-chunk-truncation.md](2026-08-02-webpack-chunk-truncation.md) | 08-02 | Node.js v24正则行为变化（\d→[0-9]） |
| [2026-08-01-eval-ground-truth-error.md](2026-08-01-eval-ground-truth-error.md) | 08-01 | 评估ground_truth数据错误 |
| [2026-07-30-pdf-table-slice-value-loss.md](2026-07-30-pdf-table-slice-value-loss.md) | 07-30 | PDF表格切片丢失数值 |
| [2026-07-14-llm-quota-exhausted.md](2026-07-14-llm-quota-exhausted.md) | 07-14 | LLM配额耗尽处理 |