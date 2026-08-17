# 金融AI智能体平台 — 面试题库与项目问答

> 5 大模块 × 10 道题，由浅入深，附详细参考答案
> 模块：全栈架构 / RAG / Agent / 测试 / 部署交付

---

## 一、全栈架构

### Q1. 项目为什么选择 Next.js 14 全栈架构而不是前后端分离？App Router 相比 Pages Router 有什么优势？

**参考答案：**

选择 Next.js 全栈架构的原因：
1. **API 与前端同仓库**：Route Handlers 天然支持 SSE 流式推送，前后端类型共享（TypeScript），无需额外 API 网关
2. **SSR/SSG 按需选择**：Dashboard 页面可 SSR 提升首屏速度，聊天页面 CSR 保证交互流畅
3. **部署简化**：`output: 'standalone'` 单容器部署，无需前后端分别构建

App Router 优势：
- **布局嵌套**：Dashboard 的侧边栏布局只需定义一次，子页面自动继承
- **Server Components**：默认服务端渲染，减少客户端 JS 体积
- **Route Handlers**：替代 API Routes，原生支持 `ReadableStream`（SSE）
- **并行路由和拦截路由**：更灵活的页面组合

### Q2. 项目从 tRPC 迁移到 Route Handlers，请详细说明迁移原因、迁移策略和遇到的问题。

**参考答案：**

**迁移原因**：
1. tRPC Batch Link 不支持 SSE 流式推送，Agent 输出无法逐 token 推送
2. tRPC 协议为 TypeScript 专属，Python 数据服务和小程序无法调用
3. tRPC 中间件与 Next.js middleware 不兼容，无法统一注入 Trace ID

**迁移策略**：
1. 保留 tRPC 用于简单查询场景（`src/server/trpc/` 残留）
2. 核心 API（Agent/Document/Evaluation/RAG）全部迁移到 Route Handlers
3. 使用 Zod Schema 统一校验，部分弥补类型安全损失

**遇到的问题**：
- SSE 的 `ReadableStream` 在某些代理环境下被缓冲，需 Nginx 配置 `proxy_buffering off`
- 请求参数校验从 tRPC 的自动推断变为手动 Zod 校验

### Q3. 项目 ORM 从 Prisma 迁移到 Drizzle，请说明 Drizzle 的核心设计理念和项目中 pgvector 的使用方式。

**参考答案：**

**Drizzle 核心理念**：SQL-like，"如果你会 SQL，你就会 Drizzle"
- 查询语法接近原生 SQL：`db.select().from(table).where(eq(table.id, id))`
- 无 Rust 引擎依赖，Edge Runtime 兼容
- Schema 即代码，`drizzle-kit migrate` 直接执行 SQL 迁移

**pgvector 使用方式**：
```typescript
// Schema 定义
export const embeddings = pgTable('Embedding', {
  id: text('id').primaryKey(),
  embedding: vector('embedding', { dimensions: 1024 }),  // BGE-M3
  chunkText: text('chunk_text').notNull(),
});

// 向量查询（余弦相似度）
const results = await db.execute(sql`
  SELECT *, 1 - (embedding <=> ${queryVector}) as similarity
  FROM "Embedding"
  ORDER BY embedding <=> ${queryVector}
  LIMIT ${topK}
`);
```

关键：Drizzle 的 `sql` 模板标签支持原始 SQL，pgvector 的 `<=>`（余弦距离）操作符可直接使用。

### Q4. NextAuth v5 在项目中的认证流程是怎样的？如何实现角色权限控制（user/admin）？

**参考答案：**

**认证流程**：
1. 用户注册：`/api/auth/register` → bcrypt 加密密码 → 存入 User 表
2. 用户登录：NextAuth Credentials Provider → 验证邮箱密码 → 生成 JWT Session
3. Session 持久化：`@auth/drizzle-adapter` 将 session 存入 PostgreSQL
4. 获取用户：`const session = await auth()` 在 Server Component 和 Route Handler 中均可使用

**角色权限**：
- User 表的 `role` 字段：`user` / `admin`
- Route Handler 中检查：`if (session.user.role !== 'admin') return 403`
- 评估配置修改（PATCH `/evaluation/config`）需 admin 权限
- 评估触发（POST `/evaluation/run`）需登录即可

### Q5. 项目的 SSE 流式推送是如何实现的？前端如何消费 SSE 事件？

**参考答案：**

**后端实现**（`src/app/api/agent/stream/route.ts`）：
```typescript
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Agent 执行过程中逐 token 推送
      for await (const event of agentStream) {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
        );
      }
      controller.close();
    }
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  });
}
```

**前端消费**：
```typescript
const eventSource = new EventSource('/api/agent/stream?query=xxx');
eventSource.addEventListener('token', (e) => { appendText(e.data); });
eventSource.addEventListener('done', (e) => { eventSource.close(); });
```

Nginx 配置：`proxy_buffering off; proxy_read_timeout 300s;`

### Q6. 项目中 ServiceAdapter 如何实现单体/微服务双模式？这种设计有什么优缺点？

**参考答案：**

```typescript
const USE_MICROSERVICE = process.env.USE_MICROSERVICE !== 'false';

export async function searchRAG(query, topK, traceId) {
  if (USE_MICROSERVICE) {
    // 微服务模式：HTTP 调用 RAG Service
    return fetch(`${RAG_SERVICE_URL}/search`, { body: JSON.stringify({ query, topK }) });
  } else {
    // 单体模式：进程内直接调用
    return hybridSearch(query, { topK });
  }
}
```

**优点**：
- 开发环境单体运行，无需启动全部服务
- 微服务可逐个上线，降低迁移风险
- `USE_MICROSERVICE=false` 一键回退

**缺点**：
- 代码中存在条件分支，增加维护成本
- 微服务模式下网络延迟约 5-10ms/调用
- 需要同时维护两套测试

### Q7. 项目中 PostgreSQL 的 Proxy 延迟初始化是如何实现的？为什么要这样做？

**参考答案：**

```typescript
// src/server/db/client.ts
let _db: PgDatabase | null = null;

export const db = new Proxy({} as PgDatabase, {
  get(target, prop) {
    if (!_db) {
      _db = drizzle(postgres(process.env.DATABASE_URL!));
    }
    return Reflect.get(_db, prop);
  }
});
```

**原因**：ES Module 的 `import` 时序问题。`db` 在模块顶层 `import` 时，`process.env.DATABASE_URL` 可能还未加载（Next.js 的环境变量在 `next.config.js` 加载后才可用）。Proxy 延迟到首次属性访问时才真正创建连接，确保环境变量已就绪。

### Q8. 项目的 Nginx 反向代理配置有哪些关键点？SSE 和普通 API 的配置有什么区别？

**参考答案：**

**SSE 配置关键**：
```nginx
location /api/agent/stream {
    proxy_pass http://main-service:3000;
    proxy_buffering off;        # 禁用缓冲，逐事件推送
    proxy_cache off;            # 禁用缓存
    proxy_read_timeout 300s;    # 长连接超时 5 分钟
    proxy_set_header Connection '';
}
```

**普通 API 配置**：
```nginx
location /api/evaluation/ {
    proxy_pass http://main-service:3000;
    proxy_read_timeout 600s;    # 评估可能耗时 10 分钟
}
```

**RAG 服务路由**：
```nginx
location /api/rag/ {
    proxy_pass http://rag-service:3001;  # 直接路由到 RAG 微服务
}
```

### Q9. 项目中如何管理敏感配置（API Keys）？config.ts 的加载逻辑是怎样的？

**参考答案：**

**配置层级**：
1. `config/api_keys.yaml`：存储 API 密钥和模型配置（加密存储）
2. 环境变量：`DASHSCOPE_API_KEY` 等敏感值通过环境变量注入
3. `.env.example`：模板文件，列出所有需要的环境变量

**加载逻辑**（`src/server/lib/config.ts`）：
1. 读取 `api_keys.yaml`
2. 智能解析：全大写+下划线格式（如 `DASHSCOPE_API_KEY`）视为环境变量引用，从 `process.env` 读取实际值
3. 字面量（如 `qwen3.6-max-preview`）保持原值
4. 解密：加密字段通过 `crypto.ts` 解密

**历史 bug**：早期版本将 `qwen3.6-max-preview` 误解析为环境变量引用（因为包含点号），后修正为仅全大写+下划线格式才视为环境变量。

### Q10. 如果让你重新设计这个项目的架构，你会做哪些不同的选择？为什么？

**参考答案：**

1. **初始就选 Route Handlers**：tRPC 迁移成本高，如果初始就明确需要 SSE，应直接用 Route Handlers
2. **Python 全栈后端**：LangChain/LangGraph 的 Python 生态更成熟，TypeScript 版本功能滞后且 API 不稳定。可以用 FastAPI 后端 + Next.js 纯前端
3. **事件驱动替代轮询**：评估任务改用 WebSocket 或 BullMQ 事件通知，替代前端轮询评估状态
4. **Schema Registry**：API 类型定义用 OpenAPI Spec 自动生成，替代手写 Zod Schema
5. **Monorepo 工具链**：使用 Turborepo 替代手动 workspace 管理，优化构建缓存

---

## 二、RAG

### Q1. 什么是 RAG？与纯 LLM 生成相比有什么优势？在金融场景下为什么必须用 RAG？

**参考答案：**

RAG（Retrieval-Augmented Generation）= 检索增强生成，先从知识库检索相关文档，再让 LLM 基于检索结果生成答案。

**优势**：
1. **减少幻觉**：LLM 基于检索到的真实文档生成答案，而非凭空编造
2. **知识更新**：更新知识库即可，无需重新训练模型
3. **可溯源**：答案可追溯到具体文档和页码

**金融场景必须用 RAG 的原因**：
1. **数据时效性**：金融数据日更，LLM 训练数据有截止日期
2. **合规要求**：金融建议必须有来源依据，不能凭空生成
3. **专业深度**：研报、年报、法规等专业文档超出 LLM 通用知识范围
4. **数值准确性**：财务数据必须精确，LLM 容易编造数字

### Q2. 项目中混合检索（BM25 + Dense + RRF）的具体实现流程是什么？为什么不用单一检索？

**参考答案：**

**流程**：
1. **Query 预处理**：QueryExpander 金融同义词扩展 → HyDE 假设文档改写（可选）
2. **并行双路检索**：
   - Dense：pgvector 余弦相似度，BGE-M3 1024 维向量
   - Sparse：nodejieba 中文分词 + BM25 关键词匹配
3. **RRF 融合**（K=60）：`score = Σ 1/(K + rank_i)`，两路结果的排名融合
4. **分离精排**：
   - 文档 chunk Top-5 → BGE-Reranker-v2-m3
   - 图谱三元组 Top-3 → BGE-Reranker-v2-m3
5. **引用注入**：CitationInjector 标注来源

**不用单一检索的原因**：
- 纯 Dense：对股票代码（600519）、指标名称（ROE）等关键词精确匹配差
- 纯 Sparse：对语义相似但用词不同的查询（"茅台营收" vs "贵州茅台营业收入"）召回差
- 混合检索互补，Top-5 准确率提升 40%+

### Q3. 什么是 RRF（Reciprocal Rank Fusion）？K 参数的含义和选择依据是什么？

**参考答案：**

**RRF 公式**：`RRF_score(d) = Σ_{r∈R} 1/(K + rank_r(d))`

- `R` 是所有检索系统的集合（本项目中 R = {Dense, Sparse}）
- `rank_r(d)` 是文档 d 在检索系统 r 中的排名（从 1 开始）
- `K` 是平滑常数，默认 60

**K 的含义**：K 越大，排名靠前的文档优势越小，融合越平滑；K 越小，排名靠前的文档优势越大。

**选择 K=60 的依据**：原论文（Cormack et al., 2009）实验表明 K=60 在多数场景下效果最优。实践中 K 在 30-100 之间差异不大，60 是稳健的默认值。

### Q4. 项目中文本清洗管线包含哪些步骤？为什么 MinerU 的 Markdown 原样入库会严重影响检索精度？

**参考答案：**

**清洗管线**：
1. 控制字符清理（`\x00-\x1F`）
2. 空白规范（多空格/多换行→单空格/单换行）
3. Markdown 噪声过滤（页眉页脚重复、表格格式残留）
4. 全半角归一化（`Ａ`→`A`，`１２３`→`123`）
5. Unicode NFC 标准化（`é` 的两种编码统一）

**MinerU 原样入库的问题**：
1. **噪声参与 Embedding**：页眉"第X页 共Y页"在每个 chunk 中重复，向量被噪声主导
2. **BM25 干扰**：Markdown 格式符号（`|`、`---`、`**`）被分词器当作关键词
3. **切片边界破坏**：控制字符导致句子在中间截断，语义不完整
4. **全半角不一致**：`ROE` 和 `ＲＯＥ` 被当作两个不同的词

### Q5. 语义切片（Semantic Chunking）和固定长度切片有什么区别？项目中 800 字符 + 128 重叠 + 句子边界感知是如何实现的？

**参考答案：**

**区别**：
- 固定长度：每 512 字符硬切，36% 的内容在句子中间截断，语义不完整
- 语义切片：在句子/段落边界切分，保持语义完整性

**项目实现**：
1. **多级断点优先级**：段落（`\n\n`）> 句号（`。`）> 分号（`；`）> 逗号（`，`）
2. **800 字符目标 + 128 重叠**：目标 chunk 800 字符，相邻 chunk 重叠 128 字符保证上下文连续
3. **句子边界感知**：如果 800 字符处不是句子边界，向前搜索最近的断点
4. **多级断点策略**：如果没有高级断点，降级到低级断点，避免无限回退

**效果**：内容丢失率从 36% 降至 <5%

### Q6. HyDE（Hypothetical Document Embeddings）的原理是什么？在什么场景下有效，什么场景下无效？

**参考答案：**

**原理**：
1. 让 LLM 根据用户 query 生成一个"假设性答案"（可能不完全正确）
2. 用假设性答案的 Embedding 去检索（而非原始 query）
3. 假设性答案的语义更接近真实文档，检索效果更好

**有效场景**：
- 用户 query 简短模糊（如"茅台怎么样"），假设性答案更具体
- 用户 query 与文档表述存在词汇鸿沟

**无效/有害场景**：
- 用户 query 已经很具体（如"贵州茅台2024年Q3营收"），假设性答案可能引入噪声
- LLM 对领域不熟悉时，假设性答案方向错误，反而降低检索质量

**项目策略**：`useHyde` 参数可选，默认关闭，仅在 query 过于简短时启用。

### Q7. 项目中 GraphRAG 的知识图谱是如何构建的？与纯向量检索相比有什么优势？

**参考答案：**

**构建流程**：
1. LLM 从文档中抽取实体（公司、人物、指标、产品等 15+ 种金融关系）
2. 生成三元组（头实体-关系-尾实体），如 `(贵州茅台, 2024年营收, 1505.6亿元)`
3. 存入 Neo4j 图数据库
4. CDC 监听文档变更，增量同步图谱

**与纯向量检索相比的优势**：
1. **跨文档推理**：向量检索只能找相似文本，图谱可以多跳推理（茅台→子公司→子公司营收）
2. **关系发现**：文档间的隐式关系（如两家公司的共同股东）无法通过向量检索发现
3. **结构化查询**：Cypher 查询可精确匹配关系类型

**项目中的分离精排**：图谱三元组（短文本 50-100 字）和文档 chunk（长文本 500-800 字）混合精排时，短文本因语义集中获得更高分数挤掉长文本。解决方案：分离精排，文档 Top-5 + 图谱 Top-3。

### Q8. 知识过期机制是如何实现的？不同文档类型的过期时间为什么不同？

**参考答案：**

**实现**：
- Document 表的 `validUntil` 字段和 `documentType` 字段
- 上传时根据 `documentType` 自动设置 `validUntil`：
  - `research_report`（研报）：90 天
  - `annual_report`（年报）：365 天
  - `regulation`（法规）：永不过期
  - `general`（通用）：180 天
- `knowledge-cleanup.ts` 定期扫描过期文档，标记为 `expired`

**为什么不同**：
1. **研报时效性最强**：券商研报的观点和预测随市场变化快速失效
2. **年报相对稳定**：财务数据年度更新，但历史数据仍有参考价值
3. **法规长期有效**：法律法规修订周期长，不应自动过期
4. **金融合规红线**：使用过期数据给出投资建议是合规风险

### Q9. BGE-M3 和 BGE-Reranker-v2-m3 在项目中的角色分别是什么？Embedding 模型和 Reranker 模型的本质区别是什么？

**参考答案：**

**角色**：
- BGE-M3：Embedding 模型，将文本转为 1024 维向量，用于稠密检索的相似度计算
- BGE-Reranker-v2-m3：Reranker 模型，对检索结果精排，输出相关性分数

**本质区别**：
1. **Embedding 模型**：单塔架构，分别编码 query 和 doc，计算向量距离。优点：可预计算 doc 向量，检索速度快；缺点：query 和 doc 不交互，精度有限
2. **Reranker 模型**：双塔/交叉架构，query 和 doc 拼接后编码，深度交互。优点：精度高；缺点：无法预计算，每次推理都需要 query+doc 对，速度慢

**项目中的分工**：Embedding 做粗筛（从百万级缩到 Top-20），Reranker 做精排（从 Top-20 缩到 Top-5）。

### Q10. 如果 RAG 检索质量持续不达标，你会从哪些维度排查和优化？

**参考答案：**

**排查维度**（按影响权重排序）：

1. **知识库覆盖（60%）**：
   - 问题：用户 query 在知识库中根本没有相关文档
   - 优化：补充知识库文档、扩大数据源

2. **检索算法（20%）**：
   - 问题：相关文档存在但检索不到
   - 优化：调整 RRF K 值、增加 BM25 权重、启用 HyDE、扩展同义词

3. **LLM 拒绝回答（10%）**：
   - 问题：检索到相关文档但 LLM 不愿回答
   - 优化：调整 prompt 鼓励基于已有信息回答、减少拒绝

4. **评估指标（10%）**：
   - 问题：评估标准过严，实际效果可接受
   - 优化：调整评估权重、区分"正确拒绝"和"错误拒绝"

**项目实际迭代**：V1→V8 共 8 轮优化，overall 从 0.6012 提升到 0.78+，主要改善来自知识库补充和检索算法调优。

---

## 三、Agent

### Q1. 什么是 ReAct 模式？与纯 Function Calling 相比有什么优劣？

**参考答案：**

**ReAct**（Reasoning + Acting）：LLM 在每轮交替进行"思考"和"行动"，直到得出最终答案。

**流程**：Thought → Action → Observation → Thought → Action → ... → Final Answer

**与 Function Calling 对比**：

| 维度 | ReAct | Function Calling |
|------|-------|-----------------|
| 推理可见性 | 思考过程可见 | 黑盒，直接返回工具调用 |
| 灵活性 | 可自主决定是否调用工具 | 由模型决定，不可控 |
| 错误恢复 | 可反思并重试 | 需外部实现重试 |
| Token 消耗 | 较高（思考过程占 Token） | 较低 |
| 稳定性 | 依赖 Prompt 工程 | 依赖模型 FC 能力 |

**项目策略**：SimpleAgent 使用 ReAct + Function Calling 混合模式——LLM 通过 Function Calling 调用工具，但保留反思循环判断是否需要再次检索。

### Q2. 项目的「Query → Skill → Tool」三层决策架构是如何工作的？为什么需要 Skill 层？

**参考答案：**

**三层决策**：
1. **Query → Skill**：Orchestrator 根据用户 query 路由到对应 Skill（如"技术分析"、"合规检查"）
2. **Skill → Tool**：Skill 定义声明式地绑定所需工具子集（如"技术分析" Skill 绑定 getStockPrice、calculateMA、calculateMACD）
3. **Tool → 执行**：只注入 Skill 绑定的工具子集到 LLM Prompt，而非全部 21 个工具

**为什么需要 Skill 层**：
1. **减少选择困惑**：21 个工具全部注入 Prompt，LLM 经常选错；Skill 只注入 3-5 个相关工具
2. **固化高频任务**：投研工作流模式固定（先查行情→算指标→出结论），Skill 一次定义多次复用
3. **Prompt Token 减少 50%+**：工具描述从 21 个缩减到 3-5 个

### Q3. Agent 的反思循环（Reflection Node）是如何实现的？什么条件下会触发再次检索？

**参考答案：**

```typescript
function shouldRetrieveAgain(state: AgentState): boolean {
  // 条件1：工具调用失败
  if (state.lastToolResult?.status === 'error') return true;
  // 条件2：LLM 判断信息不足（输出中包含"需要更多信息"等标记）
  if (state.lastThought?.includes('NEED_MORE_INFO')) return true;
  // 条件3：重复调用检测（连续 2 轮调用相同工具）
  if (state.duplicateCallCount >= 2) return false;  // 强制输出，不再检索
  return false;
}
```

**LangGraph 状态图**：
```
callLLM → shouldContinue → callTools → shouldRetrieveAgain → callLLM（循环）
                                  ↓
                              shouldContinue → END（输出答案）
```

### Q4. 项目中多工具调用解析是如何实现的？为什么能将技术指标查询从 3 轮降到 2 轮？

**参考答案：**

**实现**：LLM 的 Function Calling 响应中可包含多个 `tool_calls`，项目解析后并行执行：

```typescript
// 之前：每轮只解析 1 个工具调用
for (const toolCall of message.tool_calls) {
  await executeTool(toolCall);  // 串行，3 轮
}

// 之后：多工具调用并行执行
const results = await Promise.all(
  message.tool_calls.map(tc => executeTool(tc))
);  // 并行，2 轮
```

**3 轮→2 轮的原因**：
- 第 1 轮：LLM 同时调用 getStockPrice + calculateMA + calculateMACD（并行）
- 第 2 轮：LLM 基于三个工具结果生成综合分析

之前需要 3 轮是因为每轮只能调用 1 个工具。

### Q5. Agent 的四层分层记忆系统是如何设计的？每层的作用和 Token 预算分配是怎样的？

**参考答案：**

| 层级 | 名称 | 存储 | Token 预算 | 作用 |
|------|------|------|-----------|------|
| L1 | 原始消息 | Conversation 表 | 4000 | 最近 20 条对话原文 |
| L2 | 滚动摘要 | MemorySummary 表 | 1000 | 历史对话压缩摘要 |
| L3 | 历史检索 | MemoryFragment 表（向量） | 500 | 向量召回相关历史片段 |
| L4 | 用户画像 | MemoryProfile 表 | 500 | 偏好/常持股票/风险偏好 |

**自适应 Token 预算**：
- 总预算 = 模型上下文窗口 - 系统 Prompt - 工具描述 - 预留输出
- L1 占比最高（当前对话最重要），L4 占比最低（画像相对稳定）
- 如果对话历史短，L1 未用完的预算分配给 L3（更多历史检索）

### Q6. 项目中如何防止 Agent 幻觉编造数据？数据真实性校验的具体实现是什么？

**参考答案：**

**三层防护**：

1. **Prompt 规则**（规则 15"数据真实性原则"）：
   - "如果工具调用失败或返回空结果，必须明确告知用户数据获取失败，禁止编造数据"

2. **工具结果校验**：
```typescript
if (toolResult.status === 'error' || !toolResult.data) {
  // 注入提示："工具返回失败，请告知用户数据不可用"
  return { content: 'DATA_UNAVAILABLE: 工具调用失败', success: false };
}
```

3. **重复调用检测**：
```typescript
const callKey = `${toolName}:${JSON.stringify(args)}`;
if (state.toolCallHistory[callKey] >= 2) {
  // 强制输出，避免反复调用失败工具
  return { forceOutput: true };
}
```

**历史 bug**：工具返回 `fetch failed`，但 LLM 编造了完整的财务数据表格。修复后强制检查 `toolResult.success`。

### Q7. MCP（Model Context Protocol）在项目中的角色是什么？与 ToolRegistry 的双轨设计解决了什么问题？

**参考答案：**

**MCP 角色**：标准化工具协议，让外部客户端（如 Claude Desktop、其他 AI 应用）通过 SSE 连接使用项目的金融工具。

**双轨设计解决的问题**：
1. **内部性能**：ToolRegistry 进程内直接调用，无 HTTP 开销
2. **外部标准化**：MCP SSE 遵循行业标准，任何 MCP 客户端可直接接入
3. **统一管理**：工具定义以 ToolRegistry 为单一数据源，MCP Schema 从中自动生成

**之前的问题**：SimpleAgent 内联 21 个工具 + MCP 硬编码 6 个工具，两套系统各自为政，工具重叠（如市场数据工具在两处都有定义）。

### Q8. LangGraph 的状态图（StateGraph）在项目中是如何定义的？与自研状态机相比有什么优劣？

**参考答案：**

```typescript
const workflow = new StateGraph(AgentState)
  .addNode('agent', callLLM)
  .addNode('tools', executeTools)
  .addNode('reflection', shouldRetrieveAgain)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, {
    continue: 'tools',
    end: END,
  })
  .addEdge('tools', 'reflection')
  .addConditionalEdges('reflection', (state) => state.needRetrieval, {
    true: 'agent',
    false: END,
  });
```

**与自研状态机对比**：
- **优势**：声明式定义、条件边原生支持、检查点持久化、社区生态
- **劣势**：API 不稳定（v0.x→v1.x 破坏性变更）、调试不直观、LangChain 依赖重

### Q9. 项目的工具描述增强（when_to_use / when_not_to_use / few-shot）是如何提升工具选择准确率的？

**参考答案：**

**标准工具描述**：只有 `name` + `description`，LLM 难以区分相似工具。

**增强后**：
```typescript
{
  name: 'getStockFinancial',
  description: '获取股票财务数据',
  when_to_use: '当用户询问营收、利润、ROE等财务指标时使用',
  when_not_to_use: '当用户询问实时股价时不要使用（应用getStockPrice）',
  example_calls: [
    { query: '茅台2024年ROE', args: { symbol: '600519', metric: 'ROE', year: 2024 } }
  ]
}
```

**效果**：
- `when_not_to_use` 减少混淆（getStockFinancial vs getStockPrice）
- `example_calls` 提供 few-shot 示例，LLM 参数填充更准确
- 工具选择准确率从约 70% 提升到 90%+

### Q10. 如果 Agent 在复杂查询中持续超时，你会如何排查和优化？

**参考答案：**

**排查步骤**：
1. 查看 AgentLog 表的 `iterations`、`totalSteps`、`steps` 字段，定位卡在哪一步
2. 检查 `duplicateCallCount`，是否在反复调用相同工具
3. 检查工具响应时间，是否有工具超时

**优化策略**：
1. **减少迭代轮次**：Skill 固化高频任务、多工具并行执行
2. **重复调用检测**：连续 2 轮重复强制输出
3. **超时控制**：从 120s 提升到 240s（复杂查询需要更多时间）
4. **工具结果缓存**：相同参数的工具调用直接返回缓存结果
5. **Prompt 优化**：规则 13"禁止重复调用" + 规则 14"迭代效率原则"

---

## 四、测试

### Q1. 项目的测试策略是什么？Vitest 在项目中如何配置和使用？

**参考答案：**

**测试策略**：测试金字塔
- **单元测试**（325/333）：`src/server/` 下的核心逻辑（Agent/RAG/Evaluation/LLM/DB）
- **集成测试**：API 端点测试（需要数据库和 LLM 服务）
- **E2E 测试**：完整用户流程测试

**Vitest 配置**（`vitest.config.ts`）：
```typescript
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/server/**/*.test.ts'],
    coverage: { provider: 'v8' },
  }
});
```

**CI 中的处理**：仅运行 `src/server/` 下的单元测试，跳过需要基础设施（数据库、LLM）的集成测试，避免 CI 失败。

### Q2. RAG 评估的 10 个指标分别是什么？如何区分通用指标和金融专属指标？

**参考答案：**

**通用指标（5 个）**：
| 指标 | 计算方式 |
|------|---------|
| Hits@K | 检索命中率（相关文档是否在 Top-K） |
| ContextRelevance | LLM 评估上下文与 query 的相关性 |
| ContextRecall | LLM 评估上下文是否覆盖答案所需信息 |
| Faithfulness | LLM 评估答案是否忠于上下文 |
| AnswerRelevance | LLM 评估答案与 query 的相关性 |

**金融专属指标（5 个）**：
| 指标 | 计算方式 |
|------|---------|
| NumericalAccuracy | 正则匹配数值，±5% 容忍 |
| ComplianceScore | LLM 检测违规内容（投资建议、收益承诺） |
| HallucinationRate | LLM 检测无法溯源数据 |
| RiskDisclosure | 规则检查是否包含风险提示 |
| Timeliness | 数据日期衰减计算（越旧越扣分） |

### Q3. Agent 评估的 5 个指标是什么？EfficiencyScore 是如何综合计算的？

**参考答案：**

| 指标 | 计算方式 |
|------|---------|
| ToolSelectionScore | LLM 评估工具选择合理性 |
| PlanningScore | LLM 评估任务规划能力 |
| AgentComplianceScore | LLM 检测 Agent 合规性 |
| ConsistencyScore | LLM 评估多轮一致性 |
| EfficiencyScore | 迭代轮次 + Token + 延迟综合 |

**EfficiencyScore 计算**：
```
EfficiencyScore = 1 - (actualIterations / maxIterations * 0.4
                     + actualTokens / maxTokens * 0.3
                     + actualLatencyMs / maxLatencyMs * 0.3)
```

权重：迭代轮次 40%、Token 消耗 30%、延迟 30%。越接近 1 越高效。

### Q4. 项目中的黄金测试集（103 条）是如何设计的？覆盖了哪些金融场景？

**参考答案：**

**9 类金融场景**：
1. 技术分析（MA/MACD/RSI/BOLL）
2. 基本面分析（营收/利润/ROE）
3. 风险评估（VaR/回撤/波动率）
4. 合规检查（交易限制/持仓限制）
5. 综合诊断（多维度分析）
6. 板块轮动
7. 股票对比
8. 投资论点
9. 通用问答

**设计原则**：
- 每类 10-15 条，覆盖简单/中等/复杂三个难度
- 包含边界情况（不存在的股票代码、过期的研报数据）
- 包含合规测试（诱导给出投资建议、承诺收益）

### Q5. 开源数据集评估（FinEval/CFLUE/FinQA/ConvFinQA）的适配器模式是如何实现的？

**参考答案：**

```typescript
// 适配器框架
abstract class DatasetAdapter {
  abstract name: string;
  abstract loadDataset(): Promise<RawItem[]>;
  abstract adaptItem(raw: RawItem): EvalItem;
}

// FinEval 适配器（多选题）
class FinEvalAdapter extends DatasetAdapter {
  adaptItem(raw) {
    return {
      query: raw.question,
      expectedAnswer: raw.options[raw.answer],
      category: raw.category,
      canAnswer: true,  // 多选题一定可回答
    };
  }
}

// FinQA 适配器（数值推理）
class FinQAAdapter extends DatasetAdapter {
  adaptItem(raw) {
    return {
      query: raw.question,
      expectedAnswer: raw.answer,
      category: 'numerical',
      canAnswer: true,
    };
  }
}
```

**关键设计**：`canAnswer` 字段区分"正确拒绝"和"错误拒绝"——如果知识库中没有相关数据，Agent 拒绝回答是正确的，不应扣分。

### Q6. 评估的融合权重（heuristic + relevance + correctness）是如何演变的？V1→V8 每次调整的依据是什么？

**参考答案：**

| 版本 | heuristic | relevance | correctness | 调整依据 |
|------|-----------|-----------|-------------|---------|
| V1 | 40% | 30% | 30% | 初始均衡 |
| V4 | 40% | 30% | 30% | LLM 权重提升 |
| V5 | 20% | 30% | 50% | 启发式不可靠，增加正确性权重 |
| V6 | - | - | 100% | 合并 3 个 LLM 评估为 1 个调用 |
| V7 | 10% | 30% | 60% | 部分回答给中等分 |
| V8 | 20% | 40% | 40% | 区分正确拒绝和错误拒绝 |

**调整依据**：
1. V5：发现启发式评估（关键词匹配）对金融场景不准确，增加 LLM 评估权重
2. V6：3 个 LLM 评估调用导致超时，合并为 1 个调用
3. V8：发现"正确拒绝"被严重扣分，增加 canAnswer 感知

### Q7. 回归测试（Regression Test）是如何实现的？退化告警阈值是如何设定的？

**参考答案：**

**实现**：
1. 保存基线版本（上一次全量评估结果）
2. 新版本评估完成后，逐指标对比基线
3. 退化超过 5% 触发告警

```typescript
const regressionAlert = 5;  // 退化告警阈值（%）
for (const metric of metrics) {
  const change = ((newScore - baselineScore) / baselineScore) * 100;
  if (change < -regressionAlert) {
    alert(`退化告警：${metric} 下降 ${Math.abs(change).toFixed(1)}%`);
  }
}
```

**阈值设定**：5% 是经验值。低于 5% 可能是评估波动（LLM 评估有随机性），高于 5% 大概率是真实退化。

### Q8. 评估的断点续传是如何实现的？为什么需要这个功能？

**参考答案：**

**原因**：全量评估 130 条，每条需要调用 LLM（约 5-10s），总耗时约 15-30 分钟。如果中途 LLM API 超时或额度耗尽，需要能从断点继续。

**实现**：
```typescript
// eval-progress.json
{
  "completedItems": 45,
  "totalItems": 130,
  "results": [...],  // 已完成的结果
  "lastError": "LLM timeout at item 46"
}

// 恢复时跳过已完成项
for (let i = progress.completedItems; i < items.length; i++) {
  await evaluateItem(items[i]);
}
```

### Q9. 项目中如何测试 LLM 相关的功能？如何处理 LLM 输出的不确定性？

**参考答案：**

**策略**：
1. **确定性输出**：`temperature=0 + seed=42`，相同输入产生相同输出
2. **Mock LLM**：单元测试中 mock `callWithFallback`，返回预设响应
3. **语义缓存**：`temperature=0` 时启用 LLM 语义缓存，相同查询命中缓存
4. **多次评估取平均**：评估指标运行多次取平均，减少单次波动

**单元测试示例**：
```typescript
vi.mock('@/server/llm/router', () => ({
  callWithFallback: vi.fn().mockResolvedValue('预设的LLM响应'),
}));
```

### Q10. 如何设计一个自动化评估流水线，让每次代码提交都自动运行评估并报告结果？

**参考答案：**

**设计方案**：

1. **CI 触发**：GitHub Actions 在 PR 合并到 main 时触发
2. **Daily 评估**：每天凌晨自动运行 `daily` 级别（10 条，10 分钟）
3. **全量评估**：每周一运行 `full` 级别（130 条，30 分钟）
4. **结果对比**：自动与基线对比，退化 >5% 阻止合并
5. **报告推送**：结果推送到企业微信/飞书

```yaml
# .github/workflows/eval.yml
on:
  schedule:
    - cron: '0 8 * * 1-5'  # 工作日早8点
  workflow_dispatch:

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - run: npx tsx scripts/run-evaluation.ts --level daily
      - run: npx tsx scripts/run-regression-test.ts
```

---

## 五、部署交付

### Q1. 项目的 Docker Compose 编排包含哪些服务？服务间的依赖关系是怎样的？

**参考答案：**

**12 个服务**：

| 服务 | 镜像 | 端口 | 依赖 |
|------|------|------|------|
| postgres | pgvector/pgvector:pg16 | 5432 | 无 |
| redis | redis:7-alpine | 6379 | 无 |
| neo4j | neo4j:5 + APOC | 7474/7687 | 无 |
| embedding | llama.cpp server | 8011 | 无 |
| reranker | llama.cpp server | 8010 | 无 |
| data-service | 自建 | 8001 | 无 |
| rag-service | 自建 | 3001 | postgres, redis, embedding, reranker |
| llm-gateway | 自建 | 3002 | postgres, redis |
| evaluation-service | 自建 | 3003 | postgres, redis |
| main-service | 自建 | 3000 | postgres, redis, neo4j, embedding, reranker, rag-service, data-service |
| nginx | nginx:alpine | 80 | main-service, rag-service, data-service |
| prometheus | prom/prometheus | 9090 | 无 |
| grafana | grafana/grafana | 3004 | prometheus |

**依赖链**：基础设施（PG/Redis/Neo4j/模型服务）→ 微服务 → 主服务 → Nginx

### Q2. Next.js 的 `output: 'standalone'` 在 Docker 部署中有什么作用？多阶段构建的流程是怎样的？

**参考答案：**

**`output: 'standalone'`**：Next.js 构建时生成独立部署包，包含运行所需的最小文件，不依赖 `node_modules`。镜像体积从 ~1GB 降至 ~200MB。

**多阶段构建**：
```dockerfile
# 阶段1：安装依赖
FROM node:20-alpine AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 阶段2：构建
FROM node:20-alpine AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 阶段3：运行
FROM node:20-alpine AS runner
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

### Q3. 项目中 Docker Compose 的覆盖配置（override）是如何实现开发/生产环境切换的？

**参考答案：**

Docker Compose 自动加载 `docker-compose.override.yml`，项目设计了两个覆盖文件：

- **`docker-compose.override.local.yml`**（本地开发）：main-service、data-service、nginx 在宿主机运行，只启动基础设施服务（PG/Redis/Neo4j/模型）
- **`docker-compose.override.server.yml`**（服务器生产）：全量容器化，GPU 直通，PaddleOCR GPU 容器

**切换方式**：
```bash
# 本地开发
docker compose up  # 自动加载 override.local.yml

# 服务器生产
docker compose -f docker-compose.yml -f docker-compose.override.server.yml up -d
```

### Q4. 项目的健康检查端点（/api/health）检查了哪些组件？为什么需要分级健康检查？

**参考答案：**

**检查组件**：
1. PostgreSQL（数据库连接）
2. Neo4j（图数据库连接）
3. Embedding Service（BGE-M3 向量化）
4. Reranker Service（BGE-Reranker 精排）
5. LLM Service（模型调用）

**分级检查**：
- **关键**（数据库）：不可用则整个服务不可用
- **重要**（Embedding/Reranker）：不可用可降级运行
- **可选**（Neo4j）：不可用跳过图谱检索

**Docker 健康检查**：
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Q5. 项目中熔断器（Circuit Breaker）的三状态模型是如何实现的？304/403 为什么需要永久排除？

**参考答案：**

**三状态**：
- **Closed**（正常）：请求正常通过，失败计数器递增
- **Open**（熔断）：5 次失败后触发，所有请求直接失败，不调用 LLM
- **Half-Open**（半开）：30 秒后进入，允许 1 个请求通过，成功则恢复 Closed，失败则回到 Open

**304/403 永久排除**：
- 304 是百炼 API 额度耗尽的专用码
- 403 是权限不足
- 这两种情况**不可能通过重试恢复**，继续请求只会浪费资源
- 实现：检测到 304/403 时，将该模型从降级链中永久移除，不再调度

### Q6. 项目中 Prometheus + Grafana 可观测性方案是如何配置的？监控了哪些核心指标？

**参考答案：**

**Prometheus 配置**（`monitoring/prometheus.yml`）：
```yaml
scrape_configs:
  - job_name: 'main-service'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['main-service:3000']
```

**核心指标**：
1. **LLM 调用**：`llm_call_duration_seconds`、`llm_call_total`（按模型/成功失败）
2. **Agent 执行**：`agent_execution_duration_seconds`、`agent_iterations_total`
3. **RAG 检索**：`rag_search_duration_seconds`、`rag_search_results_count`
4. **HTTP 请求**：`http_request_duration_seconds`、`http_request_total`
5. **系统资源**：Node.js 进程内存、事件循环延迟

**Grafana 仪表盘**：`monitoring/grafana-dashboards/` 预配置了 LLM/Agent/RAG 三个面板。

### Q7. TraceId 分布式追踪在项目中是如何实现的？如何在微服务间传递？

**参考答案：**

**注入**（`src/middleware.ts`）：
```typescript
export function middleware(request: NextRequest) {
  const traceId = request.headers.get('x-trace-id') || crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set('x-trace-id', traceId);
  return response;
}
```

**微服务间传递**：ServiceAdapter 在调用微服务时自动携带 TraceId：
```typescript
const response = await fetch(`${RAG_SERVICE_URL}/search`, {
  headers: { 'x-trace-id': traceId },
});
```

**日志关联**：所有日志输出包含 TraceId，可通过 TraceId 追踪一个请求在多个服务间的完整调用链。

### Q8. 项目中 BullMQ 异步队列是如何使用的？为什么评估任务需要异步处理？

**参考答案：**

**为什么需要异步**：
- 全量评估 130 条，耗时 15-30 分钟
- 如果同步处理，HTTP 请求会超时（Nginx 最大 600s）
- 评估过程中 LLM API 可能限流，需要重试和断点续传

**BullMQ 实现**（evaluation-service）：
```typescript
const evaluationQueue = new Queue('evaluation', { connection: redis });
const worker = new Worker('evaluation', async (job) => {
  return await runEvaluation(job.data);
}, { connection: redis });

// 触发评估
await evaluationQueue.add('evaluate', {
  level: 'standard',
  type: 'rag',
  milestone: 'v2.6.0',
});
```

**状态查询**：前端轮询 `/api/evaluation/results` 获取最新结果。

### Q9. 金融行业私有化部署 LLM 的方案是什么？如何保证 LLM 服务的稳定性？

**参考答案：**

**部署方案**：
1. **模型选择**：Qwen3-235B-A22B（MoE，22B 激活，4×A800）或 DeepSeek-V3（671B-A37B，8-16×A800）
2. **推理引擎**：vLLM（PagedAttention + Continuous Batching）或 SGLang
3. **国产化路径**：华为昇腾 NPU（DeepSeek-V3 已官方适配）

**稳定性保障**：
1. **多副本负载均衡**：2+ vLLM 实例 + Nginx/HAProxy
2. **GPU 健康检查**：nvidia-smi 监控 + 进程守护自动重启
3. **降级链**：72B 主模型 → 14B 备用模型 → 规则引擎兜底
4. **量化优化**：AWQ 4-bit 量化，72B 从 4×A800 降到 2×A800
5. **请求队列**：vLLM Continuous Batching 避免请求排队

### Q10. 如果让你负责将这个项目交付给金融客户，你会关注哪些交付要点？可能遇到什么风险？

**参考答案：**

**交付要点**：
1. **数据合规**：确保 LLM API 不出境（私有化部署或阿里百炼国内节点）
2. **安全加固**：API Key 加密存储、数据脱敏、审计日志、IP 限流
3. **性能基线**：提供评估报告（RAG 10 指标 + Agent 5 指标）作为交付验收标准
4. **运维手册**：Docker Compose 一键部署、健康检查、监控告警、日志查看
5. **知识库初始化**：客户自有文档导入、切片质量验证、图谱构建

**风险**：
1. **知识库质量**：客户文档格式多样（扫描件、手写表格），解析和切片质量不可控
2. **LLM 幻觉**：金融场景对准确性要求极高，任何幻觉都可能导致合规风险
3. **模型能力**：私有化部署的 72B 模型能力可能不如云端 GPT-4 级别
4. **运维能力**：客户 IT 团队可能不熟悉 LLM 推理引擎运维
5. **监管审批**：金融行业 AI 应用可能需要监管审批，周期不确定