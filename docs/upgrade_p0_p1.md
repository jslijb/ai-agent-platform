# P0/P1 优先级改造说明

本文档记录了基于行业最佳实践分析后，对项目进行的 P0/P1 优先级改造。每项改造都有明确的业务需求支撑，而非无脑集成。

---

## P0 改造（必须立即解决）

### 1. 知识过期机制

**业务驱动**：金融数据有时效性——去年的财报、过期的研报如果和新数据混在一起返回，会直接导致错误的投资决策。这是合规红线。

**改造内容**：
- Prisma Document 模型新增 `validUntil`、`documentType`、`contentHash`、`version`、`updatedAt` 字段
- dense-retriever.ts 的 SQL 查询增加 JOIN Document 过滤过期文档
- 新建 `knowledge-cleanup.ts` 提供 `cleanExpiredDocuments()` 和 `setDefaultExpiry()` 函数
- 文档类型默认有效期：research_report(90天)、financial_report(365天)、regulation(永不过期)、general(180天)

**涉及文件**：
- `prisma/schema.prisma` — Document 模型扩展
- `src/server/rag/retrieval/dense-retriever.ts` — 检索过滤
- `src/server/rag/knowledge-cleanup.ts` — 新建

### 2. Agent 确定性输出

**业务驱动**：金融分析场景对结果一致性要求极高。temperature=0.7 导致同一问题每次答案不同，用户无法信任系统。

**改造内容**：
- bailian.ts: `DEFAULT_TEMPERATURE` 从 0.7 降为 0，新增 `seed: 42` 参数
- bailian.ts: 重试间隔从固定 1s 改为指数退避（1s → 2s → 4s）
- bailian.ts: `callBailian` 新增可选 `temperature` 参数
- simpleAgent.ts: 新增 `AGENT_TIMEOUT_MS = 120000` 整体超时控制
- reflection-node.ts: 反思评估使用 `temperature=0`

**涉及文件**：
- `src/server/llm/providers/bailian.ts`
- `src/server/agents/simpleAgent.ts`
- `src/server/agents/reflection-node.ts`

### 3. 限流 + 健康检查

**业务驱动**：百炼 API 有 QPS 限制，无保护会被打爆；Docker 容器编排需要 /health 端点。

**改造内容**：
- 新建 `rate-limiter.ts`：基于 IP 的滑动窗口限流，每分钟 20 次
- agent/run 路由集成限流，被限流返回 HTTP 429
- 新建 `/api/health` 端点：检查数据库、Embedding 服务、LLM 服务连通性

**涉及文件**：
- `src/server/lib/rate-limiter.ts` — 新建
- `src/app/api/agent/run/route.ts` — 集成限流
- `src/app/api/health/route.ts` — 新建

---

## P1 改造（应尽快解决）

### 4. 短期记忆（会话管理）

**业务驱动**：金融分析场景中，用户经常追问"刚才那只股票的PE呢？"——没有记忆就无法提供连贯服务。

**改造内容**：
- Prisma 新增 `Conversation` 和 `Message` 模型
- 新建 `memory.ts`：提供 `createConversation`、`addMessage`、`getRecentMessages`、`listConversations`、`deleteConversation`
- simpleAgent.ts: `runAgent` 新增 `conversationId` 参数，自动加载历史消息，保存对话记录
- agent/run 路由：请求/响应新增 `conversationId` 字段

**涉及文件**：
- `prisma/schema.prisma` — 新增模型
- `src/server/agents/memory.ts` — 新建
- `src/server/agents/simpleAgent.ts` — 集成记忆
- `src/app/api/agent/run/route.ts` — API 更新

### 5. LangGraph 多 Agent 编排

**业务驱动**：当前 simpleAgent 是单体架构，所有工具混在一起。金融场景需要"研究员→量化→合规"的专业化分工。

**改造内容**：
- base.ts: 实现 `BaseAgent` 抽象基类
- orchestrator.ts: 实现基于关键词路由的 ReAct 编排器，支持 quant/compliance/research/general 四种路由
- 编排器集成反思检索、工具调用、超时控制

**涉及文件**：
- `src/server/agents/base.ts` — 重写
- `src/server/agents/orchestrator.ts` — 重写

### 6. MCP Server

**业务驱动**：项目的金融工具能力通过 MCP Server 标准化暴露后，可以被 Claude Desktop、Cursor 等外部 MCP 客户端直接调用——这是产品化路径。

**改造内容**：
- server.ts: 实现工具注册框架（`registerTool`/`listTools`/`callTool`/`registerAllTools`）
- 注册 6 个 MCP 工具：hybrid_search、calculate_ma、calculate_rsi、check_trade_compliance、calculate_var、get_market_data
- /api/mcp/sse: GET 返回工具列表 SSE 流，POST 处理 tools/list 和 tools/call

**涉及文件**：
- `src/server/mcp/server.ts` — 重写
- `src/app/api/mcp/sse/route.ts` — 重写

### 7. 熔断器 + 模型降级链

**业务驱动**：LLM 服务持续不可用时，3 次重试只会加剧压力；qwen-max 挂了整个系统就瘫痪。

**改造内容**：
- circuit-breaker.ts: 三状态熔断器（closed → open → half-open），3 次失败触发熔断，30 秒后半开
- router.ts: 模型降级链 qwen-max → qwen-plus → qwen-turbo，每个模型独立熔断
- cache.ts: LLM 语义缓存，temperature=0 时启用，TTL 30 分钟，最大 500 条
- redis.ts: Redis 客户端封装，动态导入，不可用时自动降级

**涉及文件**：
- `src/server/lib/circuit-breaker.ts` — 新建
- `src/server/llm/router.ts` — 重写
- `src/server/llm/cache.ts` — 重写
- `src/server/lib/redis.ts` — 重写

### 8. 知识版本 + CDC 补全

**业务驱动**：文档更新后图谱和 BM25 索引不同步，导致检索返回过时结果。

**改造内容**：
- incremental-embedder.ts: 拆分 insert/update 为独立分支
- update 时增加图谱同步（先删后建）和 BM25 索引重建
- embedDocument 中增加 contentHash 检查，内容未变则跳过重建
- sparse-retriever.ts: 新增 `rebuildBM25Index()` 导出函数

**涉及文件**：
- `src/server/rag/streaming/incremental-embedder.ts` — 修改
- `src/server/rag/retrieval/sparse-retriever.ts` — 追加导出

---

## 部署注意事项

1. 执行 `npx prisma migrate dev` 同步新的数据库模型（Document 扩展字段 + Conversation/Message 表）
2. 执行 `npx prisma generate` 生成新的 Prisma Client 类型
3. 可选安装 `npm install redis`（未安装时自动降级为内存缓存）
