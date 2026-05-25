
---

### Day 7：流式 RAG（增量索引） + Agentic RAG 自适应检索

**目标**：实现文档实时更新索引，Agent 能自主决定是否需要多次检索。

**任务清单**：

1. 安装依赖：`pg-ears`（PostgreSQL CDC 监听）或使用 Prisma 的 `@prisma/client` 监听 `updatedAt`

> pg-ears 依赖已安装完成，无需关注。

```bash
npm install pg-ears
npm install --save-dev @types/pg-ears
```

2. 实现 `/app/server/rag/streaming/cdc-listener.ts`：监听 `documents` 表的变更

3. 实现 `/app/server/rag/streaming/incremental-embedder.ts`：仅对变更文档重新切片、嵌入、更新向量库

4. 修改 Agent 的 LangGraph 状态机：增加"反思"节点，在生成答案前评估是否信息不足，若不足则触发新一轮检索（自适应检索）

5. 实现 `/app/server/agents/reflection-node.ts`：判断是否需要再检索

6. 修改 `/app/api/agent/run/route.ts`：支持 Agent 多轮调用 RAG 工具

**验收标准**：

- [ ] 更新某个文档内容后，无需手动重建索引，几秒内新内容可被检索到
- [ ] 提问"英伟达最新营收是多少？"如果第一次检索没找到，Agent 会自动改写查询并再次检索，最终给出答案
- [ ] 能在日志中看到 Agent 的迭代检索过程

---
