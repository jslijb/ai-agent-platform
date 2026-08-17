# AI Agent Platform — 功能代码索引

> **用途**：码道每次会话的"代码地图"。不需要搜索代码库，直接查此文件定位代码。
> **原则**：每个功能记录 WHAT（做什么）、WHY（为什么需要）、WHERE（代码在哪）、HOW（怎么实现的）
> **最后更新**：2026-08-05

---

## 一、Agent 核心功能

### 1.1 ReAct 主循环
- **WHAT**：Agent 迭代推理循环，最多5轮
- **WHY**：金融分析需要多步推理（取数据→算指标→综合分析），单次LLM调用无法完成
- **WHERE**：`src/server/agents/simpleAgent.ts:1060-1733`（`runAgent` 函数）
- **HOW**：`for (let i = 0; i < maxIterations; i++)` 每轮调LLM获取thought/tool_call→执行工具→推入messages→继续

### 1.2 工具调用（6个合并工具）
- **WHAT**：21个工具合并为6个，减少token消耗
- **WHY**：工具太多LLM容易选错，合并后功能内聚，token减少60%
- **WHERE**：
  - 工具定义：`src/server/agents/simpleAgent.ts:301-374`
  - technicalAnalysis：`src/server/agents/tools/technical-analysis.ts`（MA/MACD/RSI/BB/KDJ）
  - riskAnalysis：`src/server/agents/tools/risk-analysis.ts`（VWAP/Sharpe/MaxDD/Vol/Corr/VaR）
  - complianceCheck：`src/server/agents/tools/compliance-check.ts`（交易/持仓/限制/风控/压力测试/合规报告）
  - marketData：`src/server/agents/tools/market-data.ts`（行情/实时/财务/财报）
  - toolSearch：`src/server/agents/tools/tool-search.ts`（元工具，按需加载工具详情）
  - hybridSearch：simpleAgent.ts 内联（见1.3）
- **HOW**：每个合并工具自动fetchStockData，LLM一次调用完成"取数据+计算"

### 1.3 RAG 混合检索（hybridSearch工具）
- **WHAT**：稠密+稀疏RRF融合粗排 → bge-reranker精排 → 图谱检索补充
- **WHY**：金融场景用户可能说"白酒龙头"（语义）也可能说"600519"（关键词），混合检索两种都命中
- **WHERE**：
  - hybridSearch工具定义：`src/server/agents/simpleAgent.ts:308-373`
  - 混合检索核心：`src/server/rag/retrieval/hybrid-retriever.ts:29-128`
  - 稠密检索：`src/server/rag/retrieval/dense-retriever.ts:152-220`（pgvector余弦相似度）
  - 稀疏检索：`src/server/rag/retrieval/sparse-retriever.ts:203-250`（BM25）
  - 重排序：`src/server/rag/reranking/reranker.ts:11-73`（bge-reranker API）
  - 查询扩展：`src/server/rag/query/query-expander.ts`（金融同义词）
  - 语义切分：`src/server/rag/chunking/semantic-chunker.ts`（标题+段落+表格行）
  - 增量嵌入：`src/server/rag/streaming/incremental-embedder.ts`

### 1.4 知识图谱（Neo4j）
- **WHAT**：从文档中提取实体关系三元组，存入Neo4j，检索时沿关系路径扩展上下文
- **WHY**：向量检索只能找语义相似的片段，无法发现实体间的隐含关系。例如"五粮液"→"宜宾"→"四川省"这种地理链路，或"五粮液"→"营收405亿"→"同比增长54%"这种财务链路。图谱补全了向量检索的盲区。
- **WHERE**：
  - 图谱构建：`src/server/rag/graph/graph-builder.ts`（Neo4j连接管理+三元组写入+删除）
  - 实体提取：`src/server/rag/graph/entity-extractor.ts`（LLM提取三元组，17种金融关系类型）
  - 图谱检索：`src/server/rag/graph/graph-retriever.ts`（LLM提取查询实体→Cypher路径查询→序列化）
  - Agent集成点：`src/server/agents/simpleAgent.ts:355-372`（hybridSearch工具内，精排后追加图谱结果）
  - 文档上传时构建图谱：`src/app/api/document/upload/route.ts:13`（import createGraph）
  - 文档删除时清理图谱：`src/app/api/document/list/route.ts:6`（import deleteGraph）
  - 图谱重建API：`src/app/api/document/rebuild-graph/[documentId]/route.ts`
  - 图谱可视化API：`src/app/api/document/graph/[documentId]/route.ts`
  - Neo4j健康检查：`src/app/api/health/route.ts:37-51`
- **HOW**：文档上传→LLM提取三元组→MERGE写入Neo4j。检索时：LLM提取查询实体→Cypher MATCH路径→序列化为文本→追加到hybridSearch结果
- **数据现状**：Neo4j中有602个Entity节点，主要是五粮液相关实体（公司→地址→财务数据）
- **注意**：`src/server/graph/` 目录已删除（之前的空壳，造成混淆），真正代码在 `src/server/rag/graph/`

### 1.5 反思/幻觉检测
- **WHAT**：Agent给出答案后，另一个LLM评估是否有数据支撑，检测幻觉
- **WHY**：金融数据容不得幻觉——编造股价会导致严重后果
- **WHERE**：
  - 反思判断：`src/server/agents/reflection-node.ts:10-112`（shouldRetrieveAgain）
  - 反思式检索：`src/server/agents/reflection-node.ts:114-168`（reflectiveRetrieval，最多3轮）
  - Agent集成点：`src/server/agents/simpleAgent.ts:1211-1329`

### 1.6 上下文压缩（Context Compaction）
- **WHAT**：对话>20条时，保留最近5条，早期消息由LLM生成结构化摘要
- **WHY**：金融对话容易很长，LLM上下文窗口有限。金融数值保留原始精度
- **WHERE**：`src/server/agents/context-compaction.ts` 全文（180行）
- **HOW**：LLM摘要失败时降级为正则提取金融数值

### 1.7 错误恢复（Checkpoint+Resume）
- **WHAT**：每轮工具调用后保存进度到Redis，错误时从断点恢复
- **WHY**：金融API可能因网络/限流/数据源故障失败
- **WHERE**：
  - Checkpoint：`src/server/agents/checkpoint.ts`（Redis存储，TTL=3600s，最多重试2次）
  - Agent集成：`src/server/agents/simpleAgent.ts:1676-1732`
  - LLM降级链：`src/server/llm/router.ts:88-145`（callWithFallback）
  - 工具验证重试：`src/server/agents/enhanced-react-executor.ts:131-163`

### 1.8 安全/合规护栏
- **WHAT**：意图识别→Unsafe拒绝/Controversial合规回答/Factual放行
- **WHY**：金融AI必须遵守《证券法》，提供投资建议是持牌业务
- **WHERE**：
  - 意图识别：`src/server/agents/simpleAgent.ts:58-153`（10个Unsafe+13个Controversial关键词）
  - 合规拒绝模板：`src/server/agents/simpleAgent.ts:158-259`
  - 合规日志：`src/server/compliance/log.ts`（保存5年，24h内3次Unsafe触发人工审核）
  - Agent入口拦截：`src/server/agents/simpleAgent.ts:650-804`

### 1.9 Prompt Engineering
- **WHAT**：19条核心规则约束Agent行为
- **WHY**：金融Agent行为约束比通用Agent严格——不能编造、不能给建议、必须标注来源
- **WHERE**：`src/server/agents/simpleAgent.ts:854-977`
- **关键规则**：严禁编造数据、股票代码6位+交易所前缀、必须标注数据来源、立即回答原则、禁止重复调用

---

## 二、记忆系统

### 2.1 四层记忆架构
- **WHAT**：L1对话/L2摘要/L3片段/L4画像，按token预算动态分配
- **WHY**：金融对话跨越多个会话（"上次讨论的茅台分析"），需要长期记忆
- **WHERE**：`src/server/agents/memory.ts` 全文（799行）
  - L1（最近10条）：第440-460行
  - L2（滚动摘要）：第462-491行，每6条消息触发LLM摘要（第535-623行）
  - L3（历史片段）：第493-523行，从摘要提取金融数值
  - L4（用户画像）：第525-531行，正则匹配偏好（第344-387行）
  - Token预算：第398-411行（L1=30%/L2=25%/L3=25%/L4=10%/buffer=10%）
  - 上下文组装：第421-438行
  - 三级作用域：第665-799行（personal/team/enterprise）

---

## 三、基础设施

### 3.1 多模型支持+降级链
- **WHERE**：`src/server/llm/router.ts` + `providers/bailian.ts` + `providers/agnes.ts`
- **HOW**：从 `config/api_keys.yaml` 读取模型链，逐一尝试。额度耗尽(304/403)时强制打开熔断器

### 3.2 限流/熔断
- **WHERE**：
  - 限流器：`src/server/lib/rate-limiter.ts`（20请求/60秒，Redis+内存双写）
  - 熔断器：`src/server/lib/circuit-breaker.ts`（closed→open(30s)→half-open，每个模型独立）
  - SSE入口限流：`src/app/api/agent/stream/route.ts:22-28`

### 3.3 LLM缓存
- **WHERE**：`src/server/llm/cache.ts`（精确匹配缓存，Redis+内存双写，TTL=30min）
- **注意**：这是精确匹配缓存，不是语义缓存。名称有误导。

### 3.4 流式输出（SSE）
- **WHERE**：`src/app/api/agent/stream/route.ts` 全文（113行）
- **HOW**：ReadableStream + SSE，每步通过onStep推送，最终推送done事件

### 3.5 Agent日志/可观测性
- **WHERE**：`src/server/agents/agent-logger.ts` + `simpleAgent.ts:284-291`（AgentStep接口）
- **HOW**：6种步骤类型（thinking/tool_call/tool_result/reflection/retrieval/answer），毫秒级耗时

---

## 四、评估系统

### 4.1 RAG评估
- **WHERE**：`src/server/evaluation/rag-evaluator.ts`（Faithfulness/AR/CR/CP 4维度）
- **当前基线**：V13-r6 综合 0.9153

### 4.2 Agent评估
- **WHERE**：`src/server/evaluation/agent-evaluator.ts`（工具选择/规划/合规/一致性/效率 5维度）

### 4.3 开放数据集适配器
- **WHERE**：
  - CFLUE：`src/server/evaluation/adapters/cflue-adapter.ts`
  - FinEval：`src/server/evaluation/adapters/fineval-adapter.ts`
  - 数据集路径解析：`src/server/evaluation/dataset-adapter.ts`

---

## 五、前端

### 5.1 聊天页面
- **WHERE**：`src/app/chat/page.tsx`
- **关键功能**：侧边栏历史对话、StepCard耗时显示、SSE流式接收

### 5.2 认证
- **WHERE**：
  - NextAuth配置：`src/lib/auth.ts`（JWT策略，30天过期）
  - 登录页：`src/app/(auth)/login/page.tsx`
  - 注册页：`src/app/(auth)/register/page.tsx`
  - SessionProvider：`src/components/AuthProvider.tsx`

### 5.3 历史对话API
- **WHERE**：`src/app/api/conversations/route.ts`（GET列表/GET详情/PATCH标题/DELETE删除）

---

## 六、Docker 容器

| 容器 | 作用 | 端口 | 必要性 |
|------|------|------|--------|
| aiagent_nginx | 统一入口，反向代理 | **80→用户访问** | ✅ |
| aiagent_main_service | Next.js主服务（Agent+前端） | 3005→3000 | ✅ |
| aiagent_rag_service | RAG检索服务 | 3001 | ✅ |
| aiagent_data_service | 金融数据服务 | 8001 | ✅ |
| aiagent_embedding | BGE-M3向量嵌入 | 8011 | ✅ |
| aiagent_reranker | BGE-Reranker重排序 | 8010 | ✅ |
| aiagent_neo4j | 知识图谱 | 7474/7687 | ✅ |
| aiagent_prometheus | 监控 | 9090 | 可选 |
| aiagent_grafana | 监控面板 | 3004 | 可选 |
| ai_novel_postgres | PostgreSQL（复用） | 5432 | ✅ |
| ai_novel_redis | Redis（复用） | 6379 | ✅ |

**请求链路**：浏览器→nginx:80→main_service:3000→(rag_service/data_service/embedding/reranker/neo4j/postgres/redis)

---

## 七、配置文件

| 文件 | 用途 | 注意事项 |
|------|------|---------|
| `.env.local` | 本地开发环境变量 | AUTH_URL=http://localhost:3005 |
| `.env.docker` | Docker环境变量 | AUTH_URL=http://localhost |
| `docker-compose.yml` | 容器编排 | AUTH_URL默认http://localhost |
| `config/api_keys.yaml` | LLM模型配置+降级链 | 需挂载到容器 |
| `src/lib/auth.ts` | NextAuth v5配置 | JWT策略，secret从环境变量读取 |

**关键约束**：.env.local不能挂载到Docker容器（AUTH_URL端口冲突会覆盖docker-compose.yml的正确值）