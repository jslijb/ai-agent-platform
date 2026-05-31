# AI Agent 全栈开发工程师面试题库

> 基于岗位 JD + 项目技术栈，8 大模块 × 10 道题，每题附参考答案

---

## 一、前端模块（TypeScript + Next.js + tRPC）

### Q1. tRPC 如何实现端到端类型安全？请结合项目中的 tRPC 路由说明从 Schema 定义到前端调用的完整链路。

**参考答案：**

tRPC 的端到端类型安全核心在于**共享类型推断**，无需代码生成：

1. **服务端定义 Router**：在 `src/server/trpc/routers/agent.ts` 中用 `t.procedure` 定义 API，input 用 Zod schema 校验，output 由返回值类型自动推断
2. **合并 Router**：`src/server/trpc/router.ts` 将多个子路由 merge 为 `appRouter`
3. **导出类型**：`export type AppRouter = typeof appRouter`，这是唯一的类型桥接点
4. **前端消费**：`@trpc/react-query` 的 `createTRPCReact<AppRouter>()` 根据 `AppRouter` 类型自动生成带类型的 hooks，如 `trpc.agent.run.useMutation()` 的参数和返回值都有完整类型提示

关键点：Zod schema 既是运行时校验器，又通过 `z.infer<>` 提供编译时类型，实现"单一数据源"。

### Q2. 项目中 Next.js App Router 的 API Route 和 tRPC 分别承担什么职责？为什么不统一用一种？

**参考答案：**

- **API Route**（`src/app/api/`）：处理**非结构化/外部-facing** 的请求，如文件上传、SSE 流式响应、Webhook、OAuth 回调等，这些场景 tRPC 不擅长
- **tRPC**：处理**结构化的业务 CRUD**，如文档列表查询、用户管理、Agent 配置等，享受端到端类型安全

项目中的分工实例：
- `api/agent/stream/route.ts` → SSE 流式输出用 API Route
- `api/document/upload/route.ts` → FormData 文件上传用 API Route
- `trpc/routers/document.ts` → 文档列表/删除等 CRUD 用 tRPC

### Q3. Drizzle ORM 相比 Prisma 有什么优劣？项目中为什么选择 Drizzle？

**参考答案：**

| 维度 | Drizzle | Prisma |
|------|---------|--------|
| **查询方式** | SQL-like，接近原生 SQL | 抽象 DSL，远离 SQL |
| **Bundle 大小** | 极小（~30KB） | 较大（需 Prisma Engine） |
| **Edge Runtime** | 原生支持 | 需 Prisma Accelerate |
| **类型推断** | 自动推断，无需 generate | 需要 `prisma generate` |
| **pgvector** | 原生支持自定义类型 | 需要扩展 |

项目选择 Drizzle 的核心原因：
1. **pgvector 支持**：项目使用向量检索，Drizzle 可直接定义 `vector(1024)` 类型
2. **Edge 兼容**：Next.js App Router 偏好 Edge-friendly 的库
3. **SQL 透明性**：复杂查询（如 RRF 融合排序）需要精确控制 SQL

### Q4. NextAuth v5 的 `auth()` 函数在 App Router 的 Server Component 和 Route Handler 中分别如何获取当前用户？项目中的认证中间件如何实现？

**参考答案：**

- **Server Component**：直接 `const session = await auth()` 即可
- **Route Handler**：同样 `const session = await auth()`，但需检查 `session` 是否为 null

项目中的认证模式：
- `src/app/api/evaluation/run/route.ts` 中通过 `auth()` 获取用户，未登录返回 401
- `src/app/api/evaluation/config/route.ts` 的 PATCH 操作额外检查 `role === "admin"`
- Drizzle Adapter 将 session 持久化到 PostgreSQL

### Q5. 请解释项目中 Recharts 在评估 Dashboard 中的使用模式，以及如何避免大量数据点时的渲染性能问题？

**参考答案：**

项目使用 Recharts 3.8 渲染：
- **LineChart**：评估趋势曲线（`trend/page.tsx`）
- **RadarChart**：能力雷达图（`evaluation/page.tsx`）
- **ReferenceLine**：里程碑标记

性能优化策略：
1. **数据采样**：趋势图只取最近 5-10 个版本的数据点，不做全量渲染
2. **isAnimationActive={false}**：关闭动画，减少重绘
3. **React.memo**：图表组件用 memo 包裹，避免父组件状态变化导致重渲染
4. **懒加载**：`dynamic(() => import(...), { ssr: false })` 动态导入图表组件

### Q6. 项目中 `react-force-graph-2d` 用于知识图谱可视化，请说明如何将 Neo4j 的图数据转换为该组件所需的格式？

**参考答案：**

`react-force-graph-2d` 需要的数据格式：
```typescript
{ nodes: [{ id, name, val }], links: [{ source, target, label }] }
```

转换流程：
1. Neo4j Cypher 查询返回节点和关系
2. 节点映射：Neo4j 节点 → `{ id: node.id, name: node.properties.name, val: node.properties.importance }`
3. 关系映射：Neo4j 关系 → `{ source: rel.startNode, target: rel.endNode, label: rel.type }`
4. 前端通过 API（`api/document/graph/[documentId]`）获取转换后的 JSON

### Q7. TypeScript 高级类型：项目中 `FinancialEvaluationReport extends EvaluationReport`，如何设计一个 `DeepPartial<T>` 工具类型，使得所有嵌套属性都变为可选？这在评估配置中有什么用？

**参考答案：**

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

在评估配置中的应用：`EvaluationWeights` 的所有字段都是可选的，用户可以只覆盖部分权重，其余使用默认值。`DeepPartial<EvaluationWeights>` 允许 `{ numericalAccuracy: 0.2 }` 这样的部分配置，而 `Partial<EvaluationWeights>` 只处理第一层。

项目中的实际用法：`{ ...DEFAULT_RAG_WEIGHTS, ...options?.weights }` 就是这种模式的体现。

### Q8. 项目中 `@tanstack/react-query` 的缓存策略是什么？如何确保评估结果列表在新增评估后自动刷新？

**参考答案：**

项目使用 React Query v4 的默认策略：
- **staleTime**：默认 0（数据立即标记为 stale）
- **cacheTime**：默认 5 分钟

自动刷新机制：
1. **Mutation 后 invalidate**：`POST /api/evaluation/run` 成功后，调用 `queryClient.invalidateQueries(['evaluation-results'])` 使相关缓存失效
2. **refetchOnWindowFocus**：默认开启，窗口聚焦时自动重新获取
3. **版本选择时 refetch**：切换版本下拉框时触发 `refetch`

### Q9. 项目前端没有使用 shadcn/ui，而是手写 Tailwind 组件。请分析这种选择在 AI Agent 项目中的利弊，以及何时应该引入组件库？

**参考答案：**

**利**：
- 完全控制样式，金融场景需要定制化强的 UI（如指标卡片、趋势图、雷达图）
- 减少依赖体积，项目 UI 主要是数据展示而非表单交互
- AI Coding 更容易生成一致的 Tailwind 类名

**弊**：
- 基础组件（Button、Dialog、Select）重复造轮子
- 无障碍性（a11y）难以保证
- 开发效率低于组件库

**何时引入**：当项目需要大量表单、弹窗、下拉选择等标准交互组件时，引入 shadcn/ui（基于 Radix UI + Tailwind）可以在保持定制性的同时提升效率。

### Q10. 请设计一个前端方案：在评估运行期间，实时展示评估进度（如"正在评估第 3/100 条..."），要求不阻塞 UI 且支持取消。

**参考答案：**

方案设计：

1. **SSE 流式推送**：后端 `POST /api/evaluation/run` 返回 SSE 流，每评估一条推送进度事件
```typescript
export async function POST(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < total; i++) {
        controller.enqueue(`data: ${JSON.stringify({ current: i+1, total })}\n\n`);
      }
      controller.enqueue(`data: ${JSON.stringify({ done: true, version })}\n\n`);
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}
```

2. **前端消费**：使用 `EventSource` 或 `fetch` + `getReader()` 消费 SSE
3. **取消机制**：通过 `AbortController` 取消 fetch，后端检查 `signal.aborted` 停止评估
4. **UI 状态**：React state 管理进度，Progress 组件展示

---

## 二、RAG 模块（检索增强生成）

### Q1. 项目中混合检索采用 RRF（Reciprocal Rank Fusion）算法，请详细解释 RRF 的计算公式，以及 K=60 这个参数的含义和调优策略。

**参考答案：**

RRF 公式：`score(d) = Σ 1/(K + rank_i(d))`

其中 `rank_i(d)` 是文档 d 在第 i 个检索系统中的排名位置。

**K 的含义**：K 是平滑因子，控制低排名文档的影响力。K 越大，排名差异的影响越小（更"民主"）；K 越小，高排名文档的权重越大（更"精英"）。

**K=60 的选择**：这是原始论文（Cormack et al.）的实验最优值，在大多数场景下表现稳定。

**调优策略**：
- 如果稠密检索质量明显优于稀疏检索，可降低 K（如 30），让排名差异更显著
- 如果两个检索系统质量相当，K=60 是安全选择
- 项目中可通过 `evaluation-config.yaml` 配置化

### Q2. 项目使用 bge-m3 作为 Embedding 模型，bge-reranker-v2-m3 作为 Reranker。请解释为什么需要 Reranker，以及它与 Embedding 模型的本质区别。

**参考答案：**

| 维度 | Embedding (bge-m3) | Reranker (bge-reranker-v2-m3) |
|------|-----|-----|
| **输入** | 单条文本 | Query + Document 对 |
| **输出** | 向量（768/1024维） | 相关性分数（标量） |
| **计算方式** | 分别编码后余弦相似度 | 交叉编码（Cross-Encoder），联合注意力 |
| **速度** | 快（可预计算向量） | 慢（每对都要前向传播） |
| **精度** | 较低（双塔无法捕捉细粒度交互） | 较高（交叉注意力捕捉 Query-Doc 细粒度匹配） |

**为什么需要 Reranker**：Embedding 检索是"粗筛"，速度快但精度有限；Reranker 是"精排"，对 Top-K 候选重新打分，显著提升相关性。两阶段检索是 RAG 的最佳实践。

### Q3. 项目中 HyDE（Hypothetical Document Embedding）的实现原理是什么？在金融场景下有什么特殊风险？

**参考答案：**

**原理**：
1. 用户提问 → LLM 生成"假设性答案"（不是真实答案，而是"如果有一个完美文档，它会怎么写"）
2. 用假设答案的 Embedding 去检索（而非用原始问题检索）
3. 检索结果交给 LLM 生成最终答案

**金融场景风险**：
- **幻觉放大**：LLM 生成的假设答案可能包含错误的金融数据，用错误数据的向量去检索，可能检索到"看起来相关但实际不匹配"的文档
- **合规风险**：假设答案可能包含投资建议，检索到的文档可能被错误地"证实"
- **项目缓解**：对金融合规类查询跳过 HyDE，直接用原始查询检索

### Q4. 项目使用 pgvector 而非 Milvus/Pinecone 等专业向量数据库，请分析这种选择的优势和局限。

**参考答案：**

**优势**：
1. **架构简化**：不需要额外的向量数据库服务，PostgreSQL 一站式搞定关系数据+向量数据
2. **事务一致性**：文档元数据和向量在同一个数据库，支持事务更新
3. **运维成本低**：Docker Compose 中只需一个 PostgreSQL 容器
4. **JOIN 查询**：可以同时过滤元数据（如按分类、时间筛选）和向量相似度

**局限**：
1. **规模上限**：pgvector 在千万级向量以上性能下降明显，专业向量库可支撑亿级
2. **索引类型**：pgvector 仅支持 IVFFlat 和 HNSW，缺少 DiskANN 等高级索引
3. **分布式**：pgvector 无法水平扩展，Milvus/Pinecone 支持分布式
4. **GPU 加速**：专业向量库支持 GPU 索引构建和检索

**项目选择理由**：金融文档量级在百万以内，pgvector + HNSW 完全满足需求。

### Q5. 语义分块（Semantic Chunking）与固定长度分块的区别是什么？项目中为什么需要 Parent-Document 策略？

**参考答案：**

**语义分块 vs 固定分块**：
- 固定分块：按 512 token 切割，简单但不考虑语义边界，可能把一个完整段落切断
- 语义分块：通过 Embedding 相似度检测语义断裂点，在语义边界处切分，保持语义完整性

**Parent-Document 策略**：
- 问题：小分块检索精度高，但上下文不足；大分块上下文完整，但检索噪声大
- 解决：**检索小分块，返回大分块**
- 实现：每个小分块关联一个 parent document ID，检索到小分块后，通过 parent ID 找到完整文档作为 LLM 上下文

### Q6. 项目中 CDC（Change Data Capture）监听 PostgreSQL 的 `document_changes` 通道，请解释这个机制的实现原理和适用场景。

**参考答案：**

**实现原理**：
1. PostgreSQL 的 `LISTEN/NOTIFY` 机制：当文档表发生 INSERT/UPDATE/DELETE 时，通过触发器发送通知到 `document_changes` 通道
2. `pg-ears` 库监听该通道，收到通知后调用 `incremental-embedder` 处理变更
3. `incremental-embedder` 对新增/修改的文档重新生成 Embedding 并更新 pgvector 索引

**适用场景**：
- 文档增量更新（新增财报、研报等）
- 文档内容修正后自动重建索引
- 删除文档后清理向量

**局限**：`LISTEN/NOTIFY` 不保证消息持久化，如果服务重启期间有变更，可能丢失通知。生产环境可改用 Debezium + Kafka。

### Q7. 请解释项目中 Citation Injector 的工作原理，以及如何在 RAG 回答中实现"每句话都有据可查"。

**参考答案：**

**工作原理**：
1. **Source Tracker**：在检索阶段记录每个检索结果（chunk）的来源文档 ID、页码、段落位置
2. **Citation Injector**：在 LLM 生成答案后，扫描答案中的每个事实陈述，匹配到对应的检索结果
3. **注入引用标记**：在事实陈述后插入 `[来源1]`、`[来源2]` 等引用标记
4. **前端展示**：引用标记可点击，跳转到原始文档的对应位置

**实现难点**：
- 事实陈述与检索结果的匹配需要 LLM 辅助（判断"这句话的信息来自哪个 chunk"）
- 一个陈述可能综合了多个来源，需要多引用

### Q8. 项目中 PDF 解析使用 `pdf-parse` 库，请分析它在金融场景（含复杂表格、图表）下的局限性，以及 PaddleOCR 补充了什么能力。

**参考答案：**

**pdf-parse 的局限**：
1. **表格识别差**：只能提取文本，无法识别表格结构（合并单元格、跨页表格）
2. **图表丢失**：图表中的数据无法提取
3. **布局丢失**：多栏排版、页眉页脚干扰正文提取
4. **扫描件无效**：对图片型 PDF（扫描件）完全无法提取

**PaddleOCR 补充**：
1. **OCR 识别**：扫描件/图片型 PDF 的文字识别
2. **表格结构化**：`financial-statement-ocr.ts` 专门处理财报表格
3. **图表识别**：`chart-pattern-recognition.ts` 识别 K 线图、柱状图等
4. **双引擎降级**：PaddleOCR 失败时降级到 Qwen3.5-VL 视觉模型

### Q9. 项目中 Query Expander 如何将一个模糊的金融查询扩展为多个精确查询？请举例说明。

**参考答案：**

**原理**：用 LLM 将用户查询改写为多个不同角度的子查询，提高召回率。

**示例**：
- 原始查询："贵州茅台估值"
- 扩展后：
  1. "贵州茅台 PE 市盈率 2024"
  2. "贵州茅台 PB 市净率 历史分位"
  3. "贵州茅台 DCF 估值模型"
  4. "白酒行业估值对比 茅台 五粮液"

**金融场景注意**：
- 扩展查询不能改变原始意图（如"估值"不能扩展为"推荐买入"）
- 需要保留时间维度（"最新"→具体年份）
- 合规类查询不扩展（避免引入违规意图）

### Q10. 请设计一个 RAG 评估实验：比较"仅稠密检索" vs "混合检索+Reranker" vs "混合检索+Reranker+HyDE" 三种方案在金融问答上的效果差异。

**参考答案：**

| 方案 | 检索策略 | Reranker | 查询增强 |
|------|---------|----------|---------|
| A | 仅稠密检索 (pgvector) | 无 | 无 |
| B | 混合检索 (稠密+稀疏, RRF) | bge-reranker-v2-m3 | 无 |
| C | 混合检索 + Reranker | bge-reranker-v2-m3 | HyDE |

**评估指标**：
- Hits@5：前 5 个检索结果中包含相关文档的比例
- Context Relevance：检索上下文与查询的相关性
- Faithfulness：答案对上下文的忠实度
- Numerical Accuracy：数值精确度（金融特有）
- Compliance Score：合规性（金融特有）

**预期结果**：
- A → B：混合检索显著提升 Hits@5 和 Context Relevance（稀疏检索补充关键词匹配）
- B → C：HyDE 对模糊查询有提升，但对精确查询可能引入噪声
- 合规类查询：C 可能不如 B（HyDE 幻觉风险）

**项目实现**：通过 `evaluation-config.yaml` 切换检索策略，运行 `runFinancialEvaluation` 对比。

---

## 三、容器化部署模块

### Q1. 项目的 Docker Compose 包含 6 个服务，请画出服务依赖关系图，并解释 Nginx 的 `depends_on` 为什么只列了部分服务。

**参考答案：**

```
Nginx ──→ Next.js App (host)
  ├── PostgreSQL (pgvector)
  ├── Redis
  ├── Neo4j
  ├── Embedding (llama.cpp, bge-m3)
  └── Reranker (llama.cpp, bge-reranker)
```

**`depends_on` 只列部分服务的原因**：
- `depends_on` 控制的是**启动顺序**，不是运行时依赖
- Nginx 只需要确保后端服务（PostgreSQL、Redis、Neo4j、Embedding、Reranker）启动后再启动
- Next.js App 不在 Compose 中（开发时 `npm run dev`，生产时单独部署）
- `depends_on` 不等 health check 通过，需要配合 `healthcheck` 使用

### Q2. 项目使用 `pgvector/pgvector:pg16` 镜像，请解释为什么选择 PostgreSQL 16 而非 15 或 17，以及 pgvector 扩展的安装方式。

**参考答案：**

**PG16 的选择**：
- pgvector 在 PG16 上性能最优（支持并行向量查询）
- PG17 太新，pgvector 可能存在兼容性问题
- PG15 缺少一些 PG16 的查询优化器改进

**pgvector 安装方式**：
- `pgvector/pgvector:pg16` 镜像已预编译 pgvector 扩展
- 初始化时执行 `CREATE EXTENSION IF NOT EXISTS vector` 启用
- 项目的 `postgres/init.sql` 包含此语句

### Q3. 项目中 Embedding 和 Reranker 服务都使用 `llama.cpp` 的 server 模式，请解释 `--embedding` 和 `--reranking` 参数的区别，以及为什么用 GGUF 量化格式。

**参考答案：**

| 参数 | `--embedding` | `--reranking` |
|------|--------------|--------------|
| **用途** | 文本向量化 | 文本对相关性打分 |
| **输入** | 单条文本 | query + documents 列表 |
| **输出** | 浮点向量 | 相关性分数（标量） |
| **模型** | bge-m3 (embedding 模型) | bge-reranker-v2-m3 (reranker 模型) |

**GGUF 量化格式**：
- Q8_0 量化：8-bit 量化，模型体积减少约 75%，精度损失 <1%
- llama.cpp 原生支持 GGUF，CPU/GPU 混合推理
- 适合本地部署，无需 GPU 也能运行（虽然慢一些）

### Q4. 项目中 Redis 的作用是什么？为什么不用 PostgreSQL 替代缓存功能？

**参考答案：**

项目中 Redis 的作用：
1. **LLM 响应缓存**：相同请求的 LLM 响应缓存到 Redis，避免重复调用
2. **Session 存储**：NextAuth 的 session 可存储到 Redis
3. **速率限制**：`rate-limiter.ts` 基于 Redis 的原子计数器实现 API 限流

**不用 PostgreSQL 替代的原因**：
- **延迟**：Redis 内存操作 <1ms，PostgreSQL 磁盘操作 5-50ms
- **TTL 支持**：Redis 原生支持 key 过期，PostgreSQL 需要额外清理逻辑
- **原子计数**：Redis 的 `INCR` 是原子操作，PostgreSQL 需要事务+锁
- **连接开销**：缓存是高频操作，Redis 连接池开销远小于 PostgreSQL

### Q5. 请解释项目中 Docker 网络模式 `aiagent_net` (bridge) 的工作原理，以及容器间如何通过服务名互相访问。

**参考答案：**

**Bridge 网络原理**：
- Docker 创建虚拟网桥 `aiagent_net`，所有服务连接到同一网桥
- Docker 内置 DNS 服务，容器可通过服务名（如 `postgres`、`redis`）互相解析
- 每个容器获得独立 IP，通过网桥二层转发通信

**服务名访问示例**：
- Next.js App 连接 PostgreSQL：`DATABASE_URL=postgres://aiagent:aiagent_secret@postgres:5432/agentdb`
- 注意：容器内部用服务名 `postgres`，外部用 `localhost:5432`

### Q6. 项目中 Neo4j 配置了 APOC 插件和 512MB 堆内存。请解释 APOC 的作用，以及如何判断 512MB 堆是否足够。

**参考答案：**

**APOC (Awesome Procedures on Cypher)**：
- Neo4j 的扩展存储过程库
- 提供图算法、批量操作、路径扩展等高级功能
- 项目中 GraphRAG 的实体关系抽取和图谱构建可能用到 APOC 的批量导入功能

**512MB 堆是否足够**：
- 监控指标：`dbms.queryLog` 中的 GC 暂停时间
- 如果频繁 Full GC（>1s），说明堆不足
- 项目是金融文档知识图谱，节点量级在 10-100 万，512MB 通常足够
- 如果图谱规模增长，可调整为 `NEO4J_server_memory_heap_max__size: 1G`

### Q7. 项目使用华为云 SWR 镜像（`swr.cn-north-4.myhuaweicloud.com`）拉取 Redis 和 Nginx，请解释这种做法的原因和潜在风险。

**参考答案：**

**原因**：
- 国内网络访问 Docker Hub 受限/不稳定
- 华为云 SWR 是 Docker Hub 的镜像站，国内访问速度快
- 避免因网络问题导致 `docker-compose up` 失败

**潜在风险**：
- **镜像同步延迟**：SWR 镜像可能不是最新版本
- **供应链安全**：第三方镜像站可能被中间人攻击
- **可用性**：如果 SWR 服务中断，无法拉取镜像

**缓解**：可配置 Docker daemon 的 `registry-mirrors` 同时使用多个镜像源。

### Q8. 请设计一个生产环境的 Docker Compose 改进方案，解决以下问题：数据持久化、服务健康检查、优雅重启、日志管理。

**参考答案：**

```yaml
services:
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiagent -d agentdb && psql -U aiagent -d agentdb -c 'SELECT 1'"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "5"
    deploy:
      resources:
        limits:
          memory: 2G
```

### Q9. 项目中 `llama.cpp` 的 Embedding 服务配置了 `-c 8192 -b 1024 -ub 1024 -t 4`，请解释每个参数的含义及对性能的影响。

**参考答案：**

| 参数 | 含义 | 性能影响 |
|------|------|---------|
| `-c 8192` | 上下文窗口大小 8192 tokens | 越大，可处理越长文本，但内存占用越高 |
| `-b 1024` | 批处理大小 1024 | 越大，吞吐量越高，但延迟可能增加 |
| `-ub 1024` | 微批处理大小 1024 | 控制单次前向传播的 token 数，影响内存峰值 |
| `-t 4` | 使用 4 个 CPU 线程 | 越多，推理越快，但超过物理核心数会降低效率 |

**调优建议**：
- `-c`：金融文档通常较长，8192 是合理选择
- `-b`：批量 Embedding 时可增大到 2048
- `-t`：应等于物理核心数，超线程通常无帮助

### Q10. 请设计一个 CI/CD 流水线，实现"代码推送 → 自动测试 → 构建 Docker 镜像 → 部署到生产环境"的完整流程。

**参考答案：**

```yaml
name: CI/CD Pipeline
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npx tsc --noEmit

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: registry.example.com/ai-agent-platform:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          ssh deploy@prod-server "
            cd /opt/ai-agent-platform &&
            docker compose pull &&
            docker compose up -d &&
            docker compose exec -T next-app npx drizzle-kit migrate
          "
```

---

## 四、LLM 模块（大模型服务层）

### Q1. 项目的 LLM 路由采用降级链模式，请详细解释 `callWithFallback` 的执行流程，以及熔断器如何防止级联故障。

**参考答案：**

**执行流程**：
1. 从 `api_keys.yaml` 读取模型降级链（如 `qwen-max → qwen-plus → qwen-turbo`）
2. 依次尝试每个模型：
   - 检查熔断器状态，如果 `open` 则跳过
   - 调用 `callBailian(messages, model, temperature)`
   - 成功则返回，失败则继续下一个
3. 所有模型都失败则抛出异常

**熔断器机制**：
- **Closed**（正常）：请求正常通过，记录失败次数
- **Open**（熔断）：失败次数 ≥3 次，直接跳过该模型 60 秒
- **Half-Open**（半开）：60 秒后允许 1 次尝试，成功则恢复 Closed，失败则回到 Open
- **强制熔断**：额度耗尽（AllocationQuota/403/401）时立即强制 Open

### Q2. 项目使用阿里百炼（DashScope）的兼容 OpenAI 格式 API，请解释为什么选择百炼而非直接调用 OpenAI，以及 `api_keys.yaml` 的配置管理策略。

**参考答案：**

**选择百炼的原因**：
1. **合规性**：国内金融场景数据不能出境，百炼是国内服务
2. **中文能力**：Qwen 系列中文理解能力强于 GPT-4
3. **成本**：Qwen-turbo 价格远低于 GPT-4
4. **Function Calling**：Qwen-max/plus 支持 Function Calling

**api_keys.yaml 管理策略**：
- 模型列表按优先级排列（最强模型在前）
- API Key 集中管理，不硬编码到代码中
- 支持 `functionCalling: true/false` 标记，区分支持/不支持 Function Calling 的模型
- yaml 文件不入版本控制（`.gitignore`）

### Q3. 项目的 LLM Cache 如何实现？在什么场景下缓存会带来问题？

**参考答案：**

**实现**：`callBailianWithCache` 在调用 LLM 前检查缓存：
- 缓存 Key：`model + hash(messages)`
- 缓存存储：Redis（带 TTL）
- 命中缓存直接返回，未命中则调用 LLM 并写入缓存

**缓存带来问题的场景**：
1. **实时数据查询**：如"贵州茅台最新股价"，缓存会导致返回过期数据
2. **合规检查**：规则可能更新，缓存的合规判断可能过时
3. **创意生成**：相同 prompt 应该生成不同答案

**缓解**：对实时性要求高的查询跳过缓存，或在 prompt 中注入时间戳使缓存 Key 不同。

### Q4. 请解释 Function Calling 的工作原理，以及项目中如何在百炼 API 中实现工具调用。

**参考答案：**

**Function Calling 流程**：
1. 用户请求 → 系统将可用工具定义（`tools` 参数）发送给 LLM
2. LLM 判断是否需要调用工具，如果需要，返回 `tool_calls`（工具名+参数）
3. 系统执行工具，将结果作为 `role: "tool"` 消息返回
4. LLM 基于工具结果生成最终回答

**项目中百炼 API 的实现**：
- `BailianTool` 接口定义工具结构（name、description、parameters）
- `BailianToolCall` 接口定义 LLM 返回的工具调用
- `BailianMessage` 支持 `tool_calls` 和 `tool_call_id` 字段
- MCP Server 注册的工具自动转换为 `BailianTool` 格式

### Q5. 项目中 `rate-limiter.ts` 的实现原理是什么？如何防止 LLM API 被突发流量打爆？

**参考答案：**

**实现原理**：基于 Redis 的滑动窗口计数器：
1. 每次请求时 `INCR` Redis key（key = `rate_limit:{userId}:{endpoint}`）
2. 设置 TTL 为窗口时间（如 60 秒）
3. 如果计数超过阈值，返回 429 Too Many Requests

**防突发流量**：
- **用户级限流**：每个用户每分钟最多 N 次请求
- **全局限流**：所有用户共享的 QPS 上限
- **模型级限流**：不同模型不同限额（qwen-max 限额低，qwen-turbo 限额高）
- **熔断器配合**：限流 + 熔断双重保护

### Q6. 请设计一个 LLM Gateway 的改进方案，支持以下功能：负载均衡、A/B 测试、Token 用量统计、成本预警。

**参考答案：**

```typescript
interface LLMGatewayConfig {
  models: Array<{
    id: string;
    weight: number;
    abGroup?: "A" | "B";
    costPerToken: number;
    dailyBudget: number;
  }>;
}

function selectModel(config: LLMGatewayConfig, userABGroup: "A" | "B"): string {
  const candidates = config.models.filter(m => !m.abGroup || m.abGroup === userABGroup);
  return weightedRandomSelect(candidates);
}

async function recordUsage(model: string, usage: TokenUsage) {
  await db.insert(llmUsageLog).values({
    model, promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    cost: (usage.total_tokens / 1000) * modelConfig.costPerToken,
    timestamp: new Date()
  });
}

async function checkDailyBudget() {
  const todayCost = await db.select(sum(llmUsageLog.cost)).where(eq(llmUsageLog.date, today));
  if (todayCost > DAILY_BUDGET * 0.8) sendAlert("LLM 日消耗已达 80% 预算");
}
```

### Q7. 项目中 LLM 调用的超时设置为 240 秒（`TIMEOUT_MS = 240000`），请分析这个值是否合理，以及在什么情况下需要调整。

**参考答案：**

**240 秒的合理性分析**：
- **合理场景**：Agent 多轮迭代（3-5 轮），每轮 LLM 调用可能 30-60 秒，总耗时可能超过 120 秒
- **不合理场景**：简单问答也等 240 秒才超时，用户体验差

**改进建议**：
- 按场景设置不同超时：简单问答 30s，Agent 迭代 120s，批量评估 240s
- 实现渐进式超时：首次调用 30s 超时，重试时延长到 60s
- 流式响应（SSE）场景：首 token 超时 10s，整体超时 120s

### Q8. 请解释项目中 `config.ts` 的配置加载机制，以及 `api_keys.yaml` 与 `.env.local` 的职责分工。

**参考答案：**

**职责分工**：
- `api_keys.yaml`：LLM 模型配置（模型列表、API Key、优先级、functionCalling 标记）
- `.env.local`：基础设施配置（数据库 URL、Redis URL、Neo4j 连接、端口等）

**分工原因**：
- yaml 支持嵌套结构，适合配置模型列表（数组+对象）
- env 适合简单的 key-value 配置
- 敏感信息（API Key）不应入版本控制

**加载机制**：`getConfigValue()` 和 `getRawSection()` 从 yaml 读取配置，环境变量从 `process.env` 读取。

### Q9. 项目中百炼 API 的重试策略（`MAX_RETRIES = 3, BASE_RETRY_INTERVAL = 1000`）使用的是什么退避算法？如何避免重试风暴？

**参考答案：**

**退避算法**：指数退避（Exponential Backoff）
- 第 1 次重试：等待 1s
- 第 2 次重试：等待 2s
- 第 3 次重试：等待 4s

**避免重试风暴**：
1. **最大重试次数**：限制为 3 次
2. **熔断器配合**：如果某个模型连续失败，熔断器打开，后续请求直接跳过
3. **不可重试错误**：401/403（认证失败/额度耗尽）不重试，直接降级到下一个模型
4. **可重试错误**：429（限流）、500（服务端错误）、网络超时才重试

### Q10. 请分析项目中 LLM 调用的 Token 消耗瓶颈在哪里，以及如何优化。

**参考答案：**

**Token 消耗瓶颈**：
1. **检索上下文注入**：每次 LLM 调用都携带完整检索结果（可能 5000+ tokens），这是最大消耗
2. **Agent 多轮迭代**：每轮都携带完整历史消息，3 轮迭代 Token 消耗是单轮的 3 倍+
3. **System Prompt**：金融合规约束的 System Prompt 较长（~1000 tokens）

**优化策略**：
1. **上下文压缩**：对检索结果做摘要/去重后再注入，减少 50%+ Token
2. **滑动窗口**：Agent 迭代时只保留最近 2 轮历史，更早的做摘要
3. **缓存 System Prompt**：百炼 API 支持 `system` 消息缓存，避免重复计算
4. **分级模型**：简单任务用 qwen-turbo（便宜），复杂任务用 qwen-max（贵但强）
5. **Token 预估**：`token-estimator.ts` 在调用前预估 Token 消耗，超阈值时降级

---

## 五、MCP 模块（Model Context Protocol）

### Q1. 请解释 MCP（Model Context Protocol）的核心概念，以及项目中 MCP Server 的架构设计。

**参考答案：**

**MCP 核心概念**：
- **Protocol**：标准化 AI 模型与外部工具/数据源的交互协议
- **Server**：提供工具（Tools）、资源（Resources）、提示（Prompts）的服务端
- **Client**：消费 MCP Server 能力的 AI 应用

**项目 MCP Server 架构**：
- `src/server/mcp/server.ts`：MCP Server 核心，管理工具注册和调用
- `src/server/mcp/tools/`：10 个金融工具实现
- `src/app/api/mcp/sse/route.ts`：SSE 端点，供外部 MCP Client 连接
- 双轨注册：MCP 注册的工具 + `ToolRegistry` 注册的工具，`callTool` 先查 MCP 再查 ToolRegistry

### Q2. 项目中 `ToolRegistry` 和 MCP Server 的工具注册有什么区别？为什么要设计双轨注册？

**参考答案：**

| 维度 | ToolRegistry | MCP Server |
|------|-------------|------------|
| **注册方式** | `ToolRegistry.register(tool)` | `registerTool(tool)` |
| **工具来源** | 内部定义的金融工具 | 可扩展的外部工具 |
| **调用方式** | `ToolRegistry.get(name).execute(params)` | `callTool(name, params)` |
| **协议** | 内部 API | MCP 标准协议 |

**双轨注册的原因**：
1. **内部工具**（ToolRegistry）：高性能，直接函数调用，无需序列化
2. **外部工具**（MCP）：标准化协议，可被外部 AI 客户端（如 Claude Desktop）发现和调用
3. **统一入口**：`callTool` 先查 MCP 再查 ToolRegistry，对外提供统一调用接口

### Q3. 项目中 MCP 的 SSE 端点（`api/mcp/sse/route.ts`）的作用是什么？请解释 MCP 的传输层协议。

**参考答案：**

**SSE 端点作用**：为外部 MCP Client（如 Claude Desktop、Cursor）提供连接入口，让外部 AI 工具能发现和调用项目的金融工具。

**MCP 传输层协议**：
- **SSE + HTTP POST**：Client 通过 SSE 连接接收 Server 事件，通过 HTTP POST 发送请求
- **消息格式**：JSON-RPC 2.0
- **生命周期**：Client 连接 → 发现工具（`tools/list`）→ 调用工具（`tools/call`）→ 断开

### Q4. 请为项目设计一个新的 MCP Tool：`financial_news_sentiment`，实现金融新闻情感分析功能。

**参考答案：**

```typescript
import { registerTool } from "@/server/mcp/server";

registerTool({
  name: "financial_news_sentiment",
  description: "分析金融新闻的情感倾向，返回正面/负面/中性评分及关键观点提取",
  inputSchema: {
    type: "object",
    properties: {
      news: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "新闻标题" },
            content: { type: "string", description: "新闻正文" },
          },
          required: ["title", "content"],
        },
        description: "待分析的金融新闻列表",
      },
      targetStock: { type: "string", description: "目标股票代码（可选）" },
    },
    required: ["news"],
  },
  handler: async (params) => {
    const { news, targetStock } = params;
    const prompt = `分析以下金融新闻的情感倾向，返回JSON格式：
${news.map((n, i) => `${i+1}. ${n.title}: ${n.content}`).join("\n")}
${targetStock ? `重点关注对 ${targetStock} 的影响` : ""}
返回格式：[{index, sentiment: "positive"|"negative"|"neutral", score: 0-1, keyPoints: []}]`;

    const result = await callWithFallback([{ role: "user", content: prompt }], 0);
    return result.content;
  },
});
```

### Q5. MCP 协议中的 Resources 和 Tools 有什么区别？项目中目前只用了 Tools，如果需要暴露文档内容作为 Resources，应该如何设计？

**参考答案：**

| 维度 | Tools | Resources |
|------|-------|-----------|
| **语义** | 动作（有副作用） | 数据（只读） |
| **调用** | `tools/call`（LLM 主动调用） | `resources/read`（LLM 读取） |
| **示例** | 计算MACD、执行交易模拟 | 读取财报文档、查看知识图谱 |

**Resources 设计**：
```typescript
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: documents.map(doc => ({
    uri: `financial-doc://${doc.id}`,
    name: doc.title,
    mimeType: "text/markdown",
  })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const docId = request.params.uri.replace("financial-doc://", "");
  const doc = await getDocumentContent(docId);
  return { contents: [{ uri: request.params.uri, mimeType: "text/markdown", text: doc.content }] };
});
```

### Q6. 项目中 MCP 工具的 `inputSchema` 使用 JSON Schema 定义，请解释为什么不用 Zod（项目其他地方在用）？

**参考答案：**

**原因**：
1. **MCP 协议规范**：MCP 标准要求 `inputSchema` 使用 JSON Schema 格式，这是跨语言/跨平台的通用格式
2. **外部兼容**：Claude Desktop、Cursor 等外部 MCP Client 只理解 JSON Schema
3. **序列化**：Zod schema 无法直接序列化为 JSON，需要 `zod-to-json-schema` 转换

**项目中的折中**：
- MCP 工具用 JSON Schema（协议要求）
- tRPC API 用 Zod（端到端类型安全）
- 两者可以共存，`zod-to-json-schema` 可做桥接

### Q7. 请解释项目中 `skill-vector-retriever.ts` 和 `tool-vector-retriever.ts` 的作用，以及它们与 MCP 的关系。

**参考答案：**

**作用**：
- `skill-vector-retriever.ts`：根据用户查询，从 SkillRegistry 中检索最相关的技能（用向量相似度匹配 triggerKeywords/description）
- `tool-vector-retriever.ts`：根据用户查询，从 ToolRegistry 中检索最相关的工具

**与 MCP 的关系**：
- 这两个检索器是**Agent 路由的前置步骤**：先检索相关技能/工具，再决定调用哪个
- MCP 提供工具的**注册和执行**，检索器提供工具的**发现和匹配**
- 流程：用户查询 → 向量检索匹配技能/工具 → Agent 选择并调用 → MCP 执行

### Q8. 项目中 MCP Server 的 `callTool` 方法有降级逻辑（先查 MCP 注册，再查 ToolRegistry），请分析这种设计的潜在问题并提出改进方案。

**参考答案：**

**潜在问题**：
1. **命名冲突**：MCP 和 ToolRegistry 中可能有同名工具，MCP 优先可能不是期望行为
2. **性能不一致**：MCP 工具可能涉及网络调用，ToolRegistry 是本地函数，延迟差异大
3. **错误处理不统一**：两种注册方式的错误格式可能不同

**改进方案**：
```typescript
interface UnifiedTool {
  name: string;
  source: "mcp" | "internal";
  priority: number;
  handler: (params: any) => Promise<string>;
}

const unifiedRegistry = new Map<string, UnifiedTool>();

function registerUnifiedTool(tool: UnifiedTool) {
  const existing = unifiedRegistry.get(tool.name);
  if (existing && existing.priority >= tool.priority) return;
  unifiedRegistry.set(tool.name, tool);
}
```

### Q9. 请设计一个 MCP Prompt 模板系统，允许用户预定义金融分析 Prompt，并通过 MCP 协议暴露给 AI 客户端。

**参考答案：**

```typescript
const FINANCIAL_PROMPTS = [
  {
    name: "stock-comprehensive-analysis",
    description: "股票综合分析：基本面+技术面+资金面+消息面",
    arguments: [
      { name: "stockCode", description: "股票代码", required: true },
      { name: "period", description: "分析周期（如 1M/3M/1Y）", required: false },
    ],
    template: (args) => `请对 ${args.stockCode} 进行综合分析：
1. 基本面：营收增速、净利润率、ROE、负债率
2. 技术面：MA趋势、MACD信号、RSI超买超卖
3. 资金面：主力资金流向、换手率
4. 消息面：近期公告、行业政策
分析周期：${args.period || "3个月"}
注意：本分析仅供参考，不构成投资建议。`,
  },
];

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: FINANCIAL_PROMPTS.map(p => ({
    name: p.name, description: p.description, arguments: p.arguments,
  })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const prompt = FINANCIAL_PROMPTS.find(p => p.name === request.params.name);
  return {
    messages: [{
      role: "user",
      content: { type: "text", text: prompt.template(request.params.arguments) },
    }],
  };
});
```

### Q10. 请分析 MCP 协议在多 Agent 协作场景下的局限性，以及项目中 A2A（Agent-to-Agent）通信为什么选择 WebSocket 而非 MCP。

**参考答案：**

**MCP 的局限性**：
1. **请求-响应模式**：MCP 是同步的请求-响应协议，不支持 Agent 间的实时双向通信
2. **无状态**：MCP 不维护会话状态，每次调用独立
3. **单 Server 模型**：MCP 设计为 Client-Server 模式，不适合 P2P 的 Agent 间通信
4. **无广播**：MCP 不支持一个 Agent 向多个 Agent 广播消息

**A2A 选择 WebSocket 的原因**：
1. **全双工通信**：Agent 间需要实时双向消息传递
2. **低延迟**：WebSocket 长连接，避免 HTTP 握手开销
3. **状态维护**：WebSocket 连接天然维护会话状态
4. **协议轻量**：`a2a/protocol.ts` 定义了 Agent 间的消息格式，比 MCP 更轻量

**MCP 适合的场景**：AI 客户端（如 Claude）调用工具；**A2A 适合的场景**：Agent 间协作通信。

---

## 六、Agent 模块

### Q1. 项目中 Agent 的编排模式是什么？请解释 Orchestrator 如何根据查询路由到不同的专业 Agent。

**参考答案：**

**编排模式**：基于关键词的静态路由 + LangGraph 状态图

**路由逻辑**（`orchestrator.ts` 中的 `routeQuery`）：
1. 提取查询中的关键词
2. 匹配预定义的关键词列表：
   - 量化关键词（MA、MACD、RSI...）→ `quant` Agent
   - 合规关键词（合规、风控、VaR...）→ `compliance` Agent
   - 研究关键词（研报、财报、行业分析...）→ `research` Agent
   - 其他 → `general` 路由
3. 根据路由选择不同的 System Prompt 和工具集

**局限**：关键词路由无法理解语义，"帮我看看茅台能不能买"会被路由到 general 而非 compliance。

### Q2. 项目中 LangGraph 的状态图是如何设计的？请画出状态节点和边的流转图。

**参考答案：**

```
[START] → routeQuery → [research/quant/compliance/general]
                              ↓
                         callLLM (with tools)
                              ↓
                      checkToolCalls ──→ executeTools ──→ callLLM (循环)
                              ↓ (无工具调用)
                      shouldRetrieveAgain
                       ↓ Yes          ↓ No
                  hybridSearch      generateAnswer
                       ↓                ↓
                  callLLM          [END]
```

**关键节点**：
- `routeQuery`：路由决策
- `callLLM`：调用 LLM（可能触发 Function Calling）
- `executeTools`：执行工具调用
- `shouldRetrieveAgain`：反思节点，判断是否需要再次检索
- `generateAnswer`：生成最终答案

### Q3. 项目中 Reflection Node（反思节点）的作用是什么？它如何判断是否需要再次检索？

**参考答案：**

**作用**：在 Agent 生成初步答案后，评估答案质量，决定是否需要再次检索补充信息。

**判断逻辑**（`shouldRetrieveAgain`）：
1. 检查答案是否包含"不确定"、"无法回答"等模糊表述
2. 检查答案中的数值数据是否有检索结果支撑
3. 检查答案是否覆盖了查询的所有关键方面
4. 如果迭代次数已达上限（`maxIterations`），强制停止

**实现方式**：用 LLM 判断，Prompt 为"评估以下回答是否完整回答了问题，如果需要更多信息返回 true"。

### Q4. 项目中 Agent 的记忆（`memory.ts`）如何实现？在多轮对话中如何保持上下文一致性？

**参考答案：**

**记忆实现**：
- 短期记忆：对话历史存储在 `messages` 数组中，每次 LLM 调用都携带完整历史
- 长期记忆：通过 `memories` API 端点持久化到 PostgreSQL

**上下文一致性**：
- `evaluateConsistency` 函数：检查多轮对话中数据引用是否一致、观点是否矛盾
- 每轮对话携带 `conversationId`，后端通过 ID 关联历史消息
- Token 限制时，对早期消息做摘要压缩

### Q5. 项目中 Skill 系统与 Tool 系统的区别是什么？一个 Skill（如 `technical-analysis`）内部如何编排多个 Tool？

**参考答案：**

| 维度 | Skill | Tool |
|------|-------|------|
| **粒度** | 粗粒度，多步骤任务 | 细粒度，单步操作 |
| **编排** | 内部有步骤序列 | 无内部编排 |
| **示例** | 技术分析（5步） | calculateMACD（1步） |

**Skill 编排 Tool 的方式**（以 `technical-analysis` 为例）：
1. 步骤1：调用 `hybridSearch` 检索股票数据
2. 步骤2：调用 `calculateMA` 计算5日/10日/20日均线
3. 步骤3：调用 `calculateMACD` 计算 MACD 指标
4. 步骤4：调用 `calculateRSI` 计算 RSI 指标
5. 步骤5：调用 LLM 综合分析所有指标，生成投资建议（含风险提示）

### Q6. 项目中 `multi-skill-matcher.ts` 的作用是什么？当用户查询需要多个 Skill 协作时，如何编排执行顺序？

**参考答案：**

**作用**：根据用户查询，从 SkillRegistry 中匹配多个相关技能，并确定执行顺序。

**多 Skill 编排**：
1. 向量检索匹配：用查询的 Embedding 与技能描述的 Embedding 计算相似度，返回 Top-K 技能
2. 依赖排序：如果技能间有依赖关系（如"基本面分析"的结果是"估值分析"的输入），按依赖拓扑排序
3. 并行执行：无依赖的技能并行执行（如"技术分析"和"资金面分析"可并行）
4. 结果聚合：所有技能结果汇总后交给 LLM 生成综合回答

### Q7. 项目中 Agent 的超时控制（`AGENT_TIMEOUT_MS = 120000`）是如何实现的？如果 Agent 在执行过程中超时，如何保证数据一致性？

**参考答案：**

**超时实现**：
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
try {
  const result = await runAgent(query, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

**数据一致性保障**：
1. **部分结果保存**：即使超时，已完成的工具调用结果仍保存到数据库
2. **幂等工具**：所有金融工具（计算 MACD、VaR 等）都是纯函数，重复调用无副作用
3. **事务回滚**：如果涉及写操作（如模拟交易），超时后回滚未完成的事务
4. **用户通知**：超时后返回已完成的部分结果 + "分析未完成，请缩小查询范围"

### Q8. 请解释项目中 `@langchain/langgraph-supervisor` 的作用，以及 Supervisor 模式与单 Agent 模式的优劣。

**参考答案：**

**Supervisor 作用**：作为"管理者"Agent，协调多个专业 Agent 的执行：
- 接收用户查询，决定分发给哪个 Agent
- 收集各 Agent 的结果，综合生成最终答案
- 处理 Agent 间的依赖和冲突

**Supervisor vs 单 Agent**：

| 维度 | Supervisor | 单 Agent |
|------|-----------|---------|
| **复杂任务** | 擅长（可拆分给专业 Agent） | 不擅长（工具过多时选择困难） |
| **延迟** | 较高（多 Agent 通信开销） | 较低 |
| **一致性** | 需要额外协调 | 天然一致 |
| **可扩展** | 新增 Agent 即可扩展能力 | 工具越来越多 |

### Q9. 项目中 Agent 的日志系统（`agent-logger.ts`）记录了哪些信息？如何利用这些日志进行 Agent 行为分析和调试？

**参考答案：**

**记录信息**：
1. **路由决策**：查询被路由到哪个 Agent，匹配了哪些关键词
2. **工具调用**：调用了哪个工具、参数是什么、返回了什么
3. **LLM 交互**：发送的 messages、模型响应、Token 消耗
4. **迭代信息**：当前迭代轮次、是否触发反思、反思结果
5. **耗时统计**：总耗时、各步骤耗时

**行为分析**：
- **工具选择准确率**：统计工具调用是否符合预期
- **平均迭代轮次**：评估 Agent 效率
- **路由准确率**：统计查询是否被路由到正确的 Agent
- **失败模式**：分析超时/错误的查询模式

### Q10. 请设计一个 Agent 评估框架，能够自动评估 Agent 在金融场景下的"合规性"、"规划能力"和"效率"，并给出改进建议。

**参考答案：**

项目已实现的 `agent-evaluator.ts` 框架：

1. **合规性评估**（`evaluateAgentCompliance`）：
   - 检查回答是否包含承诺收益、推荐买卖时点
   - 检查是否使用了不合规工具（`execute_trade` 等）
   - LLM 评估 + 规则降级

2. **规划能力评估**（`evaluatePlanning`）：
   - LLM 评估任务分解是否合理
   - 降级：按迭代轮次启发式评分（≤3轮=0.8，4-5轮=0.6，>5轮=0.3）

3. **效率评估**（`evaluateEfficiency`）：
   - 迭代效率（≤3轮=1分）
   - Token 效率（≤2000=1分）
   - 响应时间（≤5s=1分）

**改进建议生成**：
```typescript
function generateImprovementSuggestions(report: AgentEvaluationReport): string[] {
  const suggestions: string[] = [];
  if (report.avgComplianceScore < 0.8) {
    suggestions.push("合规性不足：建议在 System Prompt 中强化合规约束，增加'禁止承诺收益'等规则");
  }
  if (report.avgPlanningScore < 0.6) {
    suggestions.push("规划能力弱：建议优化 Skill 路由逻辑，减少不必要的迭代");
  }
  if (report.avgEfficiencyScore < 0.5) {
    suggestions.push("效率低下：建议限制最大迭代轮次为3，优化工具选择逻辑");
  }
  return suggestions;
}
```

---

## 七、Tools 模块（金融工具系统）

### Q1. 项目中 `quant_analysis.ts` 实现了哪些量化指标？请解释 MACD 的计算逻辑和金融含义。

**参考答案：**

**量化指标**：MA、MACD、RSI、Bollinger、KDJ、VWAP、Sharpe Ratio、Max Drawdown、Volatility、Correlation

**MACD 计算逻辑**：
1. 计算短期 EMA（12日）和长期 EMA（26日）
2. DIF = EMA12 - EMA26（快线）
3. DEA = EMA9(DIF)（慢线）
4. MACD 柱 = 2 × (DIF - DEA)

**金融含义**：
- DIF > 0 且上升：多头趋势加强
- DIF < 0 且下降：空头趋势加强
- MACD 柱由负转正：金叉，买入信号
- MACD 柱由正转负：死叉，卖出信号

### Q2. 项目中 `risk_control.ts` 的 VaR 计算使用的是什么方法？请解释参数化法和历史模拟法的区别。

**参考答案：**

**项目实现**：参数化法（方差-协方差法），假设收益率服从正态分布。

**VaR = Portfolio_Value × Z_α × σ × √t**

其中 Z_α 是置信水平对应的 Z 值（95% → 1.645），σ 是日收益率标准差，t 是持有期。

**参数化法 vs 历史模拟法**：

| 维度 | 参数化法 | 历史模拟法 |
|------|---------|-----------|
| **分布假设** | 正态分布 | 无假设（用历史数据） |
| **计算速度** | 快（公式计算） | 慢（需大量历史数据） |
| **尾部风险** | 低估（正态假设） | 更准确（反映真实尾部） |
| **适用场景** | 快速估算 | 精确评估 |

### Q3. 项目中 `compliance.ts` 实现了哪些合规检查？请解释 `checkTradeCompliance` 的检查逻辑。

**参考答案：**

**合规检查**：
1. `checkTradeCompliance`：交易合规性检查
2. `checkPositionLimit`：持仓限制检查
3. `checkRestrictedStock`：受限股票检查

**`checkTradeCompliance` 逻辑**：
1. 检查交易时间是否在允许范围内（A股 9:30-11:30, 13:00-15:00）
2. 检查是否触及涨跌停限制（主板 ±10%，科创板 ±20%）
3. 检查是否违反 T+1 规则（当日买入不可卖出）
4. 检查单笔交易量是否超过限额
5. 返回合规/不合规 + 违规项详情

### Q4. 项目中 `simulated_trade.ts` 的模拟交易功能如何确保不会误执行真实交易？

**参考答案：**

**安全机制**：
1. **命名隔离**：工具名明确为 `simulated_trade`，不使用 `execute_trade`、`place_order` 等暗示真实交易的名称
2. **Agent 合规检查**：`evaluateAgentCompliance` 会检查是否调用了不合规工具（`execute_trade`、`place_order`、`direct_buy`、`direct_sell`、`auto_trade`）
3. **无真实 API**：模拟交易只写内存/数据库标记，不连接任何券商 API
4. **返回标记**：结果明确标注"模拟交易，非实盘"
5. **权限隔离**：MCP Server 不暴露任何真实交易接口

### Q5. 项目中 `sql.ts` 工具允许 LLM 执行 SQL 查询，请分析这种设计的安全风险及缓解措施。

**参考答案：**

**安全风险**：
1. **SQL 注入**：LLM 生成的 SQL 可能包含恶意代码
2. **数据泄露**：可能查询到其他用户的数据
3. **数据篡改**：如果允许 INSERT/UPDATE/DELETE
4. **性能风险**：生成全表扫描等慢查询

**缓解措施**：
1. **只读限制**：只允许 SELECT，禁止 DML/DDL
2. **查询白名单**：只允许查询特定的表和视图
3. **行级安全**：PostgreSQL RLS 限制只能查当前用户的数据
4. **超时限制**：SQL 执行超时 5 秒自动终止
5. **结果行数限制**：最多返回 100 行
6. **查询审计**：记录所有 LLM 生成的 SQL 和执行结果

### Q6. 项目中 `web_search.ts` 工具如何实现？如何过滤不可靠的金融信息来源？

**参考答案：**

**实现**：调用搜索引擎 API（如 Bing Web Search），返回搜索结果摘要。

**信息源过滤**：
1. **域名白名单**：优先展示权威金融网站（东方财富、同花顺、巨潮资讯、证监会官网）
2. **时效性过滤**：优先展示最近 30 天的结果
3. **可信度评分**：LLM 对搜索结果进行可信度评估
4. **交叉验证**：关键数据需要至少 2 个独立来源确认
5. **风险提示**：搜索结果标注"来自互联网，仅供参考"

### Q7. 项目中 `market_data.ts` 工具获取的行情数据来自哪里？如何处理行情数据的延迟问题？

**参考答案：**

**数据来源**：
- 开源金融数据 API（如 Tushare、AKShare）
- 本地数据库缓存的历史行情

**延迟处理**：
1. **数据标注**：返回结果中包含数据时间戳，如"数据截至 2024-12-30 15:00"
2. **缓存策略**：盘中数据缓存 30 秒，盘后数据缓存到次日
3. **降级提示**：如果数据延迟超过 5 分钟，返回结果标注"数据可能延迟"
4. **时效性评估**：`evaluateTimeliness` 函数根据数据日期计算时效性得分

### Q8. 项目中 `document_analysis.ts` 工具如何与 RAG 系统协作？它与 `hybridSearch` 的区别是什么？

**参考答案：**

| 维度 | document_analysis | hybridSearch |
|------|-------------------|-------------|
| **输入** | 指定文档 ID + 分析指令 | 自由查询 |
| **范围** | 单个文档内分析 | 全库检索 |
| **深度** | 深度分析（全文理解） | 浅层匹配（片段检索） |
| **用途** | "分析这份财报的利润趋势" | "茅台 PE 是多少" |

**协作方式**：Agent 先用 `hybridSearch` 检索相关文档，再用 `document_analysis` 对命中文档做深度分析。

### Q9. 项目中 `graph_query.ts` 工具如何查询 Neo4j 知识图谱？请给出一个 Cypher 查询示例。

**参考答案：**

**实现**：通过 `neo4j-driver` 执行 Cypher 查询，返回图查询结果。

**示例查询**："查找与贵州茅台有竞争关系的公司及其最新营收"

```cypher
MATCH (m:Company {name: '贵州茅台'})-[:COMPETES_WITH]->(c:Company)
OPTIONAL MATCH (c)-[:HAS_FINANCIAL]->(f:Financial {metric: 'revenue'})
WHERE f.year = 2024
RETURN c.name AS competitor, f.value AS revenue_2024
ORDER BY revenue_2024 DESC
LIMIT 5
```

**安全措施**：只允许 MATCH（只读），禁止 CREATE/DELETE/SET。

### Q10. 请为项目设计一个新的金融工具：`portfolio_optimization`，实现马科维茨均值-方差模型。

**参考答案：**

```typescript
registerTool({
  name: "portfolio_optimization",
  description: "基于马科维茨均值-方差模型，计算给定股票组合的最优权重配置",
  inputSchema: {
    type: "object",
    properties: {
      stocks: {
        type: "array",
        items: { type: "string" },
        description: "股票代码列表，如 ['600519.SH', '000858.SZ']",
      },
      period: { type: "string", description: "回测周期，如 '1Y'" },
      riskFreeRate: { type: "number", description: "无风险利率，默认 0.03" },
      targetReturn: { type: "number", description: "目标年化收益率（可选）" },
    },
    required: ["stocks"],
  },
  handler: async (params) => {
    const { stocks, period = "1Y", riskFreeRate = 0.03, targetReturn } = params;

    const returns = await getHistoricalReturns(stocks, period);
    const meanReturns = returns.map(r => mean(r));
    const covMatrix = covarianceMatrix(returns);

    const optimalWeights = targetReturn
      ? efficientFrontier(meanReturns, covMatrix, targetReturn)
      : minVariancePortfolio(meanReturns, covMatrix);

    const portfolioReturn = dot(optimalWeights, meanReturns);
    const portfolioVol = Math.sqrt(
      dot(optimalWeights, covMatrix.map(row => dot(optimalWeights, row)))
    );
    const sharpeRatio = (portfolioReturn - riskFreeRate) / portfolioVol;

    return JSON.stringify({
      weights: Object.fromEntries(stocks.map((s, i) => [s, optimalWeights[i].toFixed(4)])),
      expectedReturn: (portfolioReturn * 100).toFixed(2) + "%",
      volatility: (portfolioVol * 100).toFixed(2) + "%",
      sharpeRatio: sharpeRatio.toFixed(3),
      disclaimer: "本结果基于历史数据，不构成投资建议。过往业绩不代表未来表现。",
    });
  },
});
```

---

## 八、知识图谱模块

### Q1. 项目中 GraphRAG 的完整流程是什么？从文档上传到图谱查询，经过哪些步骤？

**参考答案：**

```
文档上传 → PDF解析 → 文本分块 → 实体抽取 → 三元组构建 → Neo4j存储 → 图谱检索
```

**详细步骤**：
1. **文档上传**：`api/document/upload` 接收 PDF
2. **PDF 解析**：`pdf-parser.ts` 提取文本+表格
3. **文本分块**：`semantic-chunker.ts` 语义分块
4. **实体抽取**：`entity-extractor.ts` 用 LLM 从文本中抽取实体和关系
5. **三元组构建**：`graph-builder.ts` 将实体关系转为 (subject, predicate, object) 三元组
6. **Neo4j 存储**：通过 `neo4j-driver` 批量导入节点和关系
7. **图谱检索**：`graph-retriever.ts` 根据 query 检索相关子图

### Q2. 项目中 `entity-extractor.ts` 如何使用 LLM 抽取实体和关系？请设计抽取 Prompt。

**参考答案：**

**抽取 Prompt**：
```
从以下金融文本中抽取实体和关系，返回 JSON 格式。

实体类型：Company(公司)、Person(人物)、Product(产品)、FinancialMetric(财务指标)、Event(事件)、Regulation(法规)
关系类型：INVESTS_IN(投资)、COMPETES_WITH(竞争)、REGULATES(监管)、OWNS(拥有)、REPORTS(报告)、AFFECTS(影响)

文本：{text}

返回格式：
{
  "entities": [{"name": "贵州茅台", "type": "Company", "properties": {"industry": "白酒"}}],
  "relations": [{"subject": "贵州茅台", "predicate": "REPORTS", "object": "营收增长15%", "properties": {"year": 2024}}]
}
```

**关键设计**：
- 限定实体和关系类型，避免 LLM 随意创造
- 要求返回 properties，丰富图谱信息
- 金融场景特有类型：FinancialMetric、Regulation

### Q3. 项目中 Neo4j 的 `neo4jAvailable` 标志位的作用是什么？当 Neo4j 不可用时，系统如何降级？

**参考答案：**

**作用**：标记 Neo4j 是否可用，避免每次请求都尝试连接。

**降级策略**：
1. `isNeo4jAvailable()` 检查标志位，如果为 false，跳过所有图谱操作
2. `hybridSearch` 只使用稠密+稀疏检索，不使用图谱检索
3. `graph_query` 工具返回"知识图谱服务不可用"
4. 文档上传时跳过实体抽取和图谱构建步骤

**标志位管理**：
- 首次调用 `isNeo4jAvailable()` 时尝试连接，结果缓存
- 连接失败后 `neo4jChecked = true, neo4jAvailable = false`
- 不自动重试，需重启服务才能重新检测

### Q4. 请解释知识图谱在 RAG 中的价值，以及项目中的 `graph-retriever.ts` 如何与 `hybrid-retriever.ts` 协作。

**参考答案：**

**知识图谱在 RAG 中的价值**：
1. **多跳推理**：向量检索只能找到"相似"文档，无法回答"A 公司的竞争对手的营收是多少"这种跨实体问题
2. **结构化关系**：图谱显式存储实体间关系，支持精确的关系查询
3. **全局视角**：向量检索是局部匹配，图谱提供全局关联视角

**协作方式**：
- `hybridSearch` 返回文本片段（答案的"证据"）
- `graphRetriever` 返回相关子图（答案的"关系链"）
- 两者结果合并后作为 LLM 上下文，LLM 同时基于文本和图谱生成答案

### Q5. 项目中图谱构建时如何处理实体消歧（Entity Disambiguation）？例如"茅台"和"贵州茅台"是否指向同一实体？

**参考答案：**

**当前实现**：项目依赖 LLM 在抽取时统一命名，但这种方式不够可靠。

**改进方案**：
1. **别名表**：维护 `{ "茅台": "贵州茅台", "茅台酒": "贵州茅台" }` 别名映射
2. **LLM 消歧**：抽取后用 LLM 判断两个实体是否相同
3. **向量相似度**：计算实体描述的 Embedding 相似度，>0.95 视为同一实体
4. **Neo4j MERGE**：使用 `MERGE` 而非 `CREATE` 插入节点，避免重复

```cypher
MERGE (c:Company {name: '贵州茅台'})
ON CREATE SET c.aliases = ['茅台', '茅台酒']
ON MATCH SET c.aliases = c.aliases + '茅台'
```

### Q6. 项目中 `graph-builder.ts` 使用 Neo4j 的 APOC 插件做什么？请给出一个 APOC 在图谱构建中的使用场景。

**参考答案：**

**APOC 使用场景**：批量导入三元组

```cypher
CALL apoc.periodic.iterate(
  "UNWIND $triples AS triple RETURN triple",
  "MERGE (s:Entity {name: triple.subject})
   MERGE (o:Entity {name: triple.object})
   MERGE (s)-[r:RELATES_TO {type: triple.predicate}]->(o)
   SET r += triple.properties",
  { batchSize: 1000, params: { triples: $triples } }
)
```

**为什么用 APOC**：
- 普通 Cypher 一次只能创建少量节点，大批量导入性能差
- APOC 的 `periodic.iterate` 支持分批提交，避免事务过大
- 支持并行处理，提升导入速度

### Q7. 请设计一个基于知识图谱的金融风控场景：当用户查询"某公司是否有违规记录"时，如何利用图谱提供更全面的回答？

**参考答案：**

**图谱查询设计**：

```cypher
MATCH (c:Company {name: $companyName})
OPTIONAL MATCH (c)-[:HAS_VIOLATION]->(v:Violation)
OPTIONAL MATCH (c)-[:HAS_EXECUTIVE]->(p:Person)-[:INVOLVED_IN]->(v2:Violation)
OPTIONAL MATCH (c)-[:SUBSIDIARY_OF]->(parent:Company)-[:HAS_VIOLATION]->(v3:Violation)
RETURN c.name AS company,
       collect(DISTINCT {type: v.type, date: v.date, penalty: v.penalty}) AS direct_violations,
       collect(DISTINCT {person: p.name, violation: v2.type}) AS executive_violations,
       collect(DISTINCT {parent: parent.name, violation: v3.type}) AS parent_violations
```

**图谱优势**：
1. **关联发现**：不仅查公司自身的违规，还查高管、母公司的违规
2. **路径推理**：通过关系链发现间接风险
3. **实时更新**：新违规事件入库后立即可查

### Q8. 项目中 `react-force-graph-2d` 渲染知识图谱时，如何处理大规模节点（>1000个）的性能问题？

**参考答案：**

**性能优化策略**：
1. **分层展示**：默认只展示核心节点（度数 Top-50），双击展开关联节点
2. **LOD（Level of Detail）**：远距离只渲染节点，近距离才渲染标签和边
3. **WebGL 渲染**：`react-force-graph-2d` 支持 `forceGraph2D` → `forceGraph3D` 切换到 WebGL
4. **节点聚合**：同类型节点聚合为超级节点，减少渲染数量
5. **虚拟化**：只渲染视口内的节点

### Q9. 项目中知识图谱和向量检索的融合策略是什么？请设计一个"图谱增强的混合检索"方案。

**参考答案：**

**融合策略**：三路检索 + 加权融合

```
Query → [稠密检索] → Top-K₁ 文本片段
      → [稀疏检索] → Top-K₂ 文本片段
      → [图谱检索] → Top-K₃ 相关子图
                    ↓
              RRF 融合排序
                    ↓
              Reranker 精排
                    ↓
              LLM 生成答案
```

**图谱增强的关键**：
1. **实体识别**：从 Query 中识别实体（如"贵州茅台"、"PE"）
2. **子图检索**：以识别出的实体为锚点，扩展 2 跳邻居
3. **图谱文本化**：将子图转为自然语言描述（如"贵州茅台 → 竞争 → 五粮液"），与文本片段一起作为 LLM 上下文

### Q10. 请评估项目当前 GraphRAG 实现的成熟度，并列出从 PoC 到生产级需要解决的 Top 5 问题。

**参考答案：**

**成熟度评估**：PoC 阶段（可用但不可靠）

**Top 5 问题**：

1. **实体抽取质量**：LLM 抽取的实体和关系不一致（同一实体不同名称、关系类型不统一），需要后处理和人工审核
2. **图谱更新策略**：文档更新后图谱如何增量更新？当前可能需要全量重建
3. **Neo4j 可用性**：单点故障，无集群部署，Neo4j 挂了整个图谱功能不可用
4. **图谱评估**：没有图谱质量的评估指标（实体覆盖率、关系准确率、图谱完整性）
5. **查询复杂度**：复杂多跳查询（3+跳）的 Cypher 生成质量不稳定，LLM 可能生成语法错误的 Cypher

**改进路线**：
- 短期：增加实体消歧、别名管理、图谱质量评估
- 中期：增量更新、Neo4j 集群、Cypher 模板库
- 长期：自动图谱补全、图谱推理、多模态图谱（图表节点）
