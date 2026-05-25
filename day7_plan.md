
---

### Day 7：流式 RAG（增量索引） + Agentic RAG 自适应检索

**目标**：实现文档实时更新索引，Agent 能自主决定是否需要多次检索。

**任务清单**：
1. 安装依赖：`pg-ears`（PostgreSQL CDC 监听）或使用 Prisma 的 `@prisma/client` 监听 `updatedAt`
pg-ears 依赖已安装完成,无需关注。
```bash
npm install pg-ears
npm install --save-dev @types/pg-ears
```
2. 实现 `/app/server/rag/streaming/cdc-listener.ts`：监听 `documents` 表的变更
3. 实现 `/app/server/rag/streaming/incremental-embedder.ts`：仅对变更文档重新切片、嵌入、更新向量库
4. 修改 Agent 的 LangGraph 状态机：增加“反思”节点，在生成答案前评估是否信息不足，若不足则触发新一轮检索（自适应检索）
5. 实现 `/app/server/agents/reflection-node.ts`：判断是否需要再检索
6. 修改 `/app/api/agent/run/route.ts`：支持 Agent 多轮调用 RAG 工具

**验收标准**：
- [ ] 更新某个文档内容后，无需手动重建索引，几秒内新内容可被检索到
- [ ] 提问“英伟达最新营收是多少？”如果第一次检索没找到，Agent 会自动改写查询并再次检索，最终给出答案
- [ ] 能在日志中看到 Agent 的迭代检索过程

---

### Day 8：评估体系 + 可观测性 + DeepWiki MCP 集成

**目标**：建立量化评测 pipeline，集成外部知识源（DeepWiki），准备面试演示。

**任务清单**：
1. 安装依赖：`ragas`（Python 评估库）或 TypeScript 版的 `@reaatech/rag-eval-metrics`
ragas 依赖已安装完成,无需关注。
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
- [ ] Agent 能回答“deepwiki 上 next.js 的 app router 怎么用”并能返回准确的结构化信息（依赖 DeepWiki MCP 在线服务）
- [ ] 前端能看到评估趋势图

---

### Day 9（可选，增加竞争力）：ColPali 调研 + 架构图 + 面试问答准备

**目标**：不写代码，但准备口头论述，展示对前沿技术的理解。

**任务清单**：
1. 阅读 ColPali 论文和 LlamaIndex 的 ColPali 实现文档
2. 修改项目架构图（`/docs/architecture.png`），标注 ColPali 作为可插拔的检索组件位置
3. 准备面试话术：“如果未来需要支持海报、扫描件等高密度视觉文档，我会引入 ColPali 风格的多向量检索器，它的核心优势是绕过 OCR 直接在视觉空间做匹配，但计算成本较高，适合离线索引 + 在线重排混合模式。”

**验收标准**：
- [ ] 能够在面试中清晰解释 ColPali 与传统 RAG 的差异
- [ ] 能够说出本项目集成 ColPali 的假设步骤（如：将 PDF 转为图像 → 用 Vision Transformer 生成 patch embeddings → 存入专用向量库）

---