
---

### Day 8：评估体系 + 可观测性 + DeepWiki MCP 集成

**目标**：建立量化评测 pipeline，集成外部知识源（DeepWiki），准备面试演示。

**任务清单**：

1. 安装依赖：`ragas`（Python 评估库）或 TypeScript 版的 `@reaatech/rag-eval-metrics`

> ragas 依赖已安装完成，无需关注。

```bash
npm install @reaatech/rag-eval-metrics
```

2. 准备黄金测试集：`/scripts/qa-golden.json`（至少 50 条 QA，覆盖多跳、表格、专有名词）

3. 实现 `/app/server/evaluation/rag-evaluator.ts`：计算 Hits@K, Faithfulness, Answer Relevance, Context Recall

4. 实现 `/scripts/run-evaluation.ts`：一键运行评估，输出报告

5. 实现 DeepWiki MCP 工具（参考前面提示）：`/app/server/agents/tools/deepwiki-tool.ts`

6. 在 Supervisor Agent 中注册该工具，允许 Agent 查询 GitHub 仓库文档

7. 实现前端简单监控面板：`/app/dashboard/evaluation/page.tsx` 展示最近评估指标

**验收标准**：

- [ ] 运行 `npm run evaluate` 能输出 Hits@5（目标 >85%），Faithfulness（目标 >90%）
- [ ] Agent 能回答"deepwiki 上 next.js 的 app router 怎么用"并能返回准确的结构化信息（依赖 DeepWiki MCP 在线服务）
- [ ] 前端能看到评估趋势图

---
