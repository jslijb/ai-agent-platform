# AI Agent Platform（金融行业智能体平台）

基于 Next.js 14 全栈架构的金融行业 AI 智能体平台，集成 RAG 检索增强生成、GraphRAG 知识图谱推理、多 Agent 协作、MCP 工具协议等核心能力，为金融行业提供智能投研、量化分析、合规审查等解决方案。

---

## 架构演变

本项目经历了多次架构升级，从原型逐步演进为生产级系统。以下记录各层的核心演变路径。

### 前端 & API 层

| 阶段 | 之前 | 之后 | 驱动原因 |
|------|------|------|---------|
| API 框架 | tRPC（Batch Link） | Next.js App Router + Route Handlers | tRPC 仅适合内部 RPC，Route Handlers 原生支持 SSE 流式推送、更灵活的中间件集成 |
| ORM | Prisma | Drizzle ORM | Prisma 影子库需要 superuser 权限（`CREATE EXTENSION vector`）；Rust 引擎构建慢体积大；`$queryRaw` 对 pgvector 支持不友好 |
| 认证适配器 | `@auth/prisma-adapter` | `@auth/drizzle-adapter` | ORM 迁移连带切换 |
| 数据库迁移 | `prisma migrate dev`（影子库） | `drizzle-kit migrate`（直接执行） | 无需影子库和 superuser 权限 |
| 缓存后端 | SQLite（数据服务本地缓存） | PostgreSQL（`PgCache` 类） | 统一数据存储，消除 SQLite 文件锁和跨服务数据不一致 |

**tRPC 残留**：项目中仍保留 `src/lib/trpc/`、`src/server/trpc.ts`、`src/server/routers/` 等 tRPC 文件，仅用于用户查询等简单场景，核心 API 已全部迁移到 Route Handlers。

### RAG 管道

| 阶段 | 之前 | 之后 | 驱动原因 |
|------|------|------|---------|
| 检索方式 | 仅稠密检索（pgvector） | 混合检索（稠密 + BM25 稀疏 + RRF 融合） | 单一向量检索召回率不足，BM25 补充关键词精确匹配 |
| 知识图谱 | ❌ 无 | GraphRAG（Neo4j + 实体提取 + 三元组检索 + 多跳推理） | 文档间的隐式关系无法通过向量检索发现，图谱支持跨文档推理 |
| 精排策略 | 文档 chunk 与图谱三元组混合精排 | 分离精排：文档 chunk top5 + 图谱三元组 top3 | 图谱三元组（短文本）挤掉文档 chunk（长文本），导致检索质量下降 |
| 图谱限流 | 无 | 精排前按分数降序取 top5 | 过多噪声三元组进入精排影响排序质量 |
| 查询优化 | 原始 query 直接检索 | HyDE 查询改写 + 金融领域同义词扩展 | 用户 query 与文档表述存在词汇鸿沟，同义词扩展提升 BM25 召回 |
| 文本清洗 | ❌ 无（MinerU Markdown 原样入库） | 完整清洗管线（控制字符→空白规范→Markdown噪声→页眉去重→全半角统一→Unicode NFC） | 噪声参与 embedding 严重影响检索精度 |
| 切片边界 | 512 字符硬截断，36% 内容丢失 | 800 字符切片 + 128 字符重叠 + 句子边界截断 + 多级断点优先级 | 硬截断破坏语义完整性，切片以标点开头 |
| Embedding 输入 | 512 字符硬切 | 2000 字符句子边界截断 | BGE-M3 支持 8192 tokens，512 字符浪费模型能力 |
| 增量索引 | PDF 二进制 utf-8 解码必然失败 + 旧切片拼接 fallback | Buffer 直接传入 + rawContent fallback + 失败标记 | 二次切片失真，PDF 解码 bug |
| BM25 分词 | 无预处理 | 标点去除 + 英文小写 + 数字格式统一 | 标点和格式噪声干扰关键词匹配 |
| 知识过期 | ❌ 无 | 按文档类型自动过期（研报90天/年报365天/法规永不过期/通用180天） | 金融数据时效性是合规红线 |
| 答案溯源 | 无引用标注 | 引用注入 + 来源追踪 | 用户需验证答案来源，金融场景合规要求 |

### Agent 层

| 阶段 | 之前 | 之后 | 驱动原因 |
|------|------|------|---------|
| Agent 架构 | 单体 SimpleAgent（21 工具平铺） | 多 Agent 编排（Researcher/Quant/Compliance） + Skill 技能层 | 单体架构工具选择不精准，复杂任务迭代轮次多 |
| 工具调用 | 每轮只解析 1 个工具调用 | 多工具调用解析 + 链式执行 | 技术指标查询从 3 轮降到 2 轮，节省 30% Token |
| 工具注册 | 双系统（SimpleAgent 内联 21 个 + MCP 硬编码 6 个） | 统一工具注册表（ToolRegistry） | 两套系统各自为政，工具重叠 |
| Skill 编排 | ❌ 无 | 声明式 Skill 定义 + 并行执行（技术分析/合规检查/风控评估/综合诊断） | 高频任务模式固化，减少 LLM 决策负担 |
| 重复调用检测 | ❌ 无 | `toolCallHistory` + `duplicateCallCount`，连续 2 轮重复时强制输出 | Agent 反复调用相同工具不输出答案，8 轮迭代后超时 |
| 数据真实性 | 工具失败时幻觉编造数据 | 规则 15"数据真实性原则" + 工具结果成功性检查 | 工具返回 fetch failed 但 Agent 编造完整数据 |
| 迭代效率 | 无约束 | 规则 13 禁止重复调用 + 规则 14 迭代效率原则 | 避免无效迭代浪费 Token 和时间 |
| 超时控制 | 120 秒 | 240 秒 | 复杂查询（双公司对比、三公司综合）需要更多迭代时间 |
| 错题本 | ❌ 无 | WrongAnswer 表 + 标记按钮 + 管理页面 | 定期回顾错误模式，降低错误率 |
| 记忆系统 | 短期记忆（20 条/6000 token 简单截断） | 四层分层记忆（L1 原始消息/L2 滚动摘要/L3 历史检索/L4 用户画像）+ 自适应 Token 预算 | 无长期记忆和跨会话记忆，用户换会话丢失所有上下文 |

### 稳定性保障

| 阶段 | 之前 | 之后 | 驱动原因 |
|------|------|------|---------|
| LLM 调用 | 单模型，额度耗尽即瘫痪 | 多模型降级链（api_keys.yaml 驱动，自动切换） | 单点故障，qwen-max 挂了整个系统瘫痪 |
| 模型概念 | `BAILIAN_MODEL` 硬编码主模型 | models 列表驱动，列表顺序即优先级 | 主模型概念与降级链功能重叠，配置混乱 |
| 熔断器 | ❌ 无 | 三状态熔断器（closed → open → half-open），3 次失败触发，60 秒后半开 | LLM 持续不可用时重试加剧压力 |
| 强制熔断 | ❌ 无 | 403 额度耗尽立即强制熔断（5 倍半开周期） | 额度耗尽仍重试 3 次浪费请求 |
| LLM 缓存 | ❌ 无 | 语义缓存（temperature=0 时启用，TTL 30 分钟，最大 500 条） | 相同查询重复调用 LLM 浪费 Token |
| 确定性输出 | temperature=0.7 | temperature=0 + seed=42 | 金融分析对结果一致性要求极高 |
| 重试策略 | 固定 1 秒间隔 | 指数退避（1s → 2s → 4s） | 固定间隔在服务恢复初期造成压力集中 |
| 限流 | ❌ 无 | 基于 IP 的滑动窗口限流（20 次/分钟） | 百炼 API 有 QPS 限制，无保护会被打爆 |
| 健康检查 | ❌ 无 | `/api/health`（数据库 + Embedding 服务 + LLM 服务） | Docker 容器编排需要健康检查端点 |
| 向量索引 | HNSW 单一 | HNSW → 顺序扫描降级 | HNSW 索引异常时（如 IVFFlat 损坏）检索返回空结果 |
| 多级降级 | ❌ 无 | Reranker 失败→原始排序；图谱失败→跳过；Redis 不可用→内存缓存 | 单点故障导致整个流程中断 |

### 配置管理

| 阶段 | 之前 | 之后 | 驱动原因 |
|------|------|------|---------|
| 环境变量解析 | 所有字符串当环境变量名，字面量被解析为 None/空串 | 智能解析：仅全大写+下划线格式视为环境变量引用 | models 列表的 `qwen3.6-max-preview` 被错误解析 |
| 配置层级 | tushare/tickflow 嵌套在 market_data 下 | 提升为顶层节点，与代码访问路径一致 | 代码用 `get_value("tushare", ...)` 永远找不到嵌套配置 |
| 模型元数据 | context/description 与实际不符 | 准确反映模型规格（如 qwen3.6-max-preview: 256K 上下文） | 误导性描述影响模型选择决策 |

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 14 + TypeScript + Tailwind CSS + App Router |
| API 层 | Next.js Route Handlers + SSE 流式推送 |
| 认证 | NextAuth v5 |
| 数据库 | PostgreSQL（pgvector 向量扩展）+ Drizzle ORM |
| 图数据库 | Neo4j |
| 缓存 | Redis + 内存缓存（降级方案）+ PostgreSQL（数据服务缓存） |
| LLM | 阿里百炼 DashScope（多模型降级链）+ 本地 BGE-M3 Embedding |
| Agent 框架 | ReAct + 反思循环 + 多 Agent 编排 + Skill 技能层 |
| 数据服务 | Python FastAPI（efinance / Baostock / mootdx / Tushare） |
| 容器化 | Docker + Docker Compose |

---

## 项目架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户界面 (Next.js 14)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  登录/注册 │  │  对话界面  │  │  控制台   │  │  文档管理/图谱预览 │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                        API 层 (Route Handlers + SSE)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  /auth/*  │  │ /agent/  │  │ /rag/*   │  │/document/*│           │
│  │  认证路由  │  │  run     │  │search    │  │ upload    │           │
│  │          │  │          │  │answer    │  │rebuild-   │           │
│  │          │  │          │  │          │  │graph      │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
├─────────────────────────────────────────────────────────────────────┤
│                     Agent 层 (ReAct + 反思循环 + Skill)              │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ SimpleAgent   │  │Researcher│  │  Quant   │  │ Compliance   │   │
│  │  ReAct主Agent │  │ 研究员   │  │ 量化分析师│  │  合规官Agent  │   │
│  └──────────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐    │
│  │ Skill 技能层      │  │ Memory（四层分层记忆）                 │    │
│  │ 技术分析/合规/风控 │  │ L1原始/L2摘要/L3检索/L4画像          │    │
│  └──────────────────┘  └──────────────────────────────────────┘    │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐    │
│  │ Reflection Node  │  │ 统一工具注册表 (ToolRegistry)          │    │
│  │ 反思/自适应检索   │  │ 21+ 金融工具统一管理                  │    │
│  └──────────────────┘  └──────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                     RAG 管道 (检索增强生成)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 文档解析   │  │ 文本清洗  │  │ 智能切片  │  │ 混合检索  │           │
│  │PDF/表格/图│  │噪声/标点  │  │语义/边界  │  │向量+BM25 │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ HyDE改写  │  │GraphRAG  │  │ 分离精排  │  │ 答案溯源  │           │
│  │同义词扩展  │  │多跳推理   │  │文档top5  │  │引用标注   │           │
│  └──────────┘  └──────────┘  │图谱top3  │  └──────────┘           │
│  ┌──────────┐  ┌──────────┐  └──────────┘  ┌──────────┐           │
│  │ 知识过期  │  │ 增量索引  │               │ 多模态    │           │
│  │自动清理   │  │CDC监听    │               │图片/表格  │           │
│  └──────────┘  └──────────┘               └──────────┘           │
├─────────────────────────────────────────────────────────────────────┤
│                     MCP 工具层 (21+ 金融工具)                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │市场数据 │ │量化分析 │ │模拟交易 │ │风控合规 │ │图谱查询 │           │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                      │
│  │文档分析 │ │计算器   │ │Web搜索 │ │DeepWiki│                      │
│  └────────┘ └────────┘ └────────┘ └────────┘                      │
├─────────────────────────────────────────────────────────────────────┤
│                     稳定性保障层                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ 熔断器        │  │ 模型降级链    │  │ LLM 语义缓存  │             │
│  │ CircuitBreaker│  │ api_keys.yaml│  │ MemoryCache  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ 限流中间件    │  │ 健康检查      │  │ 向量索引降级  │             │
│  │ RateLimiter  │  │ /api/health  │  │ HNSW→顺序扫描 │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
├─────────────────────────────────────────────────────────────────────┤
│                     LLM 调用层 (模型路由 + 语义缓存)                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│  │ 阿里百炼 (qwen)   │  │ 本地模型 (BGE-M3) │  │ Redis 语义缓存 │   │
│  │ 多模型降级链      │  │ Embedding :8011   │  │                │   │
│  └──────────────────┘  └──────────────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                     数据层                                           │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ PostgreSQL    │  │  Neo4j   │  │  Redis   │  │ Python 数据   │   │
│  │ + pgvector   │  │ 知识图谱  │  │  缓存    │  │ 服务(FastAPI) │   │
│  │ HNSW索引     │  │          │  │          │  │ +PgCache缓存  │   │
│  └──────────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
ai-agent-platform/
├── src/
│   ├── app/                          # Next.js App Router（页面 + API）
│   │   ├── api/                      # API 路由
│   │   │   ├── auth/                 # 认证（NextAuth v5）
│   │   │   ├── agent/run/            # Agent 执行入口（SSE 流式推送）
│   │   │   ├── rag/                  # RAG 检索与带引用答案
│   │   │   │   ├── search/           #   混合检索（向量+BM25+图谱+分离精排）
│   │   │   │   └── answer-with-citation/  # 带引用标注的答案生成
│   │   │   ├── document/             # 文档管理
│   │   │   │   ├── upload/           #   文档上传（解析+清洗+切片+向量化+图谱）
│   │   │   │   ├── graph/[id]/       #   获取文档图谱数据
│   │   │   │   ├── rebuild-graph/[id]/  # 重建文档知识图谱
│   │   │   │   └── rebuild-index/    #   重建索引（含清洗层）
│   │   │   ├── health/               # 健康检查端点
│   │   │   ├── wrong-answers/        # 错题本 API
│   │   │   └── mcp/                  # MCP SSE 端点
│   │   ├── (auth)/                   # 登录/注册页面
│   │   ├── dashboard/                # 主控制台
│   │   │   ├── documents/            #   文档管理（上传/预览/图谱/重建）
│   │   │   ├── wrong-answers/        #   错题本管理
│   │   │   ├── agent-evaluation/     #   Agent 评估
│   │   │   ├── evaluation/           #   RAG 评估
│   │   │   ├── logs/                 #   Agent 日志
│   │   │   ├── memories/             #   记忆管理
│   │   │   └── token-usage/          #   Token 用量
│   │   └── chat/                     # 对话界面
│   ├── server/                       # 服务端核心逻辑
│   │   ├── agents/                   # Agent 实现
│   │   │   ├── simpleAgent.ts        #   ReAct Agent（21+金融工具+反思循环+多工具调用）
│   │   │   ├── orchestrator.ts       #   多 Agent 编排器（查询路由）
│   │   │   ├── memory.ts             #   分层记忆（L1-L4 + 自适应 Token 预算）
│   │   │   ├── reflection-node.ts    #   反思评估节点
│   │   │   ├── agent-logger.ts       #   Agent 执行日志
│   │   │   ├── skills/               #   Skill 技能层
│   │   │   │   ├── definitions/      #     技能定义（技术分析/合规/风控/综合诊断）
│   │   │   │   ├── executor.ts       #     技能执行器（含并行执行）
│   │   │   │   └── types.ts          #     Skill 类型定义
│   │   │   ├── a2a/                  #   Agent-to-Agent 协议
│   │   │   └── tools/                #   Agent 专用工具
│   │   │       └── deepwiki-tool.ts  #     DeepWiki MCP 工具
│   │   ├── rag/                      # RAG 管道
│   │   │   ├── retrieval/            #   检索器
│   │   │   │   ├── hybrid-retriever.ts   # 混合检索（RRF 融合）
│   │   │   │   ├── dense-retriever.ts    # 稠密检索（pgvector + HNSW + 顺序扫描降级）
│   │   │   │   └── sparse-retriever.ts   # 稀疏检索（BM25 + 同义词扩展 + 预处理）
│   │   │   ├── reranking/            #   重排序
│   │   │   │   └── reranker.ts       #   BGE-Reranker 精排（支持分组精排）
│   │   │   ├── graph/                #   GraphRAG
│   │   │   │   ├── entity-extractor.ts  # 实体/三元组提取
│   │   │   │   ├── graph-builder.ts     # 图谱构建（Neo4j）
│   │   │   │   └── graph-retriever.ts   # 图谱检索（多跳推理）
│   │   │   ├── query/                #   查询优化
│   │   │   │   ├── hyde-transformer.ts  # HyDE 查询改写
│   │   │   │   └── query-expander.ts    # 金融领域同义词扩展
│   │   │   ├── chunking/             #   文档切片
│   │   │   │   ├── semantic-chunker.ts  # 语义切片（多级断点优先级）
│   │   │   │   ├── parent-document.ts   # 父子文档扩展
│   │   │   │   └── text-cleaner.ts      # 文本清洗（噪声/标点/全半角/Unicode）
│   │   │   ├── citation/             #   答案溯源
│   │   │   │   ├── citation-injector.ts # 引用注入
│   │   │   │   └── source-tracker.ts    # 来源追踪
│   │   │   ├── streaming/            #   增量索引
│   │   │   │   ├── cdc-listener.ts      # CDC 变更监听
│   │   │   │   └── incremental-embedder.ts # 增量嵌入（Buffer/rawContent fallback）
│   │   │   ├── multimodal/           #   多模态处理
│   │   │   │   ├── image-caption.ts     # 图片描述
│   │   │   │   ├── pdf-parser.ts        # PDF 解析（MinerU + pdf-parse）
│   │   │   │   └── table-extractor.ts   # 表格提取
│   │   │   └── knowledge-cleanup.ts  #   知识过期清理
│   │   ├── mcp/                      # MCP Server + 金融工具集
│   │   │   ├── server.ts             #   MCP 工具注册框架（统一注册表）
│   │   │   └── tools/                #   金融工具实现
│   │   │       ├── market_data.ts    #   市场数据（历史/实时/财务/指数）
│   │   │       ├── quant_analysis.ts #   量化分析（MA/RSI/MACD/Bollinger/KDJ/VWAP/夏普/回撤/波动率/VaR/相关/压力测试）
│   │   │       ├── compliance.ts     #   合规检查
│   │   │       ├── risk_control.ts   #   风控工具
│   │   │       ├── simulated_trade.ts #  模拟交易
│   │   │       ├── document_analysis.ts # 文档分析
│   │   │       ├── graph_query.ts    #   图谱查询
│   │   │       ├── calculator.ts     #   计算器
│   │   │       ├── web_search.ts     #   Web 搜索
│   │   │       └── sql.ts            #   SQL 查询
│   │   ├── llm/                      # LLM 调用层
│   │   │   ├── router.ts             #   模型降级链（api_keys.yaml 驱动 + 熔断器）
│   │   │   ├── providers/bailian.ts  #   百炼 DashScope 调用（含超时/指数退避/熔断）
│   │   │   └── cache.ts              #   LLM 语义缓存（temperature=0 时启用）
│   │   ├── lib/                      # 通用工具
│   │   │   ├── circuit-breaker.ts    #   熔断器（含强制熔断 forceOpenCircuit）
│   │   │   ├── rate-limiter.ts       #   限流中间件
│   │   │   ├── config.ts             #   配置管理（智能环境变量解析）
│   │   │   ├── logger.ts             #   日志
│   │   │   ├── redis.ts              #   Redis 客户端（动态导入，不可用自动降级）
│   │   │   └── s3.ts                 #   S3 存储
│   │   ├── db/                       # Drizzle ORM
│   │   │   ├── schema.ts             #   数据库 Schema（User/Document/Embedding/Conversation/Message/WrongAnswer/MarketCache）
│   │   │   └── client.ts             #   数据库客户端（postgres.js 驱动）
│   │   ├── evaluation/               #   评估
│   │   │   └── rag-evaluator.ts      #   RAG 评估器
│   │   ├── graph/                    #   图谱服务
│   │   │   ├── builder.ts            #   图谱构建
│   │   │   ├── graphrag.ts           #   GraphRAG 入口
│   │   │   └── neo4j.ts              #   Neo4j 客户端
│   │   ├── tools/                    #   工具注册
│   │   │   └── registry.ts           #   统一工具注册表
│   │   ├── routers/                  #   tRPC 路由（残留，仅用户查询）
│   │   │   └── user.ts
│   │   ├── trpc/                     #   tRPC 框架（残留）
│   │   │   ├── routers/
│   │   │   ├── context.ts
│   │   │   └── router.ts
│   │   ├── utils/                    #   工具函数
│   │   │   └── token-estimator.ts    #   Token 估算
│   │   ├── root.ts                   #   tRPC 根路由（残留）
│   │   └── trpc.ts                   #   tRPC 初始化（残留）
│   ├── components/                   # 前端组件
│   │   └── AuthProvider.tsx          #   认证 Provider
│   ├── lib/                          # 前端共享库
│   │   ├── auth.ts                   #   NextAuth 配置
│   │   ├── utils.ts                  #   工具函数
│   │   └── trpc/                     #   tRPC 客户端（残留）
│   │       ├── Provider.tsx
│   │       └── client.ts
│   └── types/                        # TypeScript 类型定义
├── data_service/                     # Python 数据服务（FastAPI，端口 8001）
│   ├── main.py                       #   服务入口
│   ├── config.py                     #   配置管理（智能环境变量解析）
│   ├── cache/                        #   缓存层
│   │   └── local_cache.py            #   PgCache（PostgreSQL）+ SQLite 降级
│   └── providers/                    #   数据源适配器
│       ├── efinance_provider.py      #   东方财富（实时行情、板块）
│       ├── baostock_provider.py      #   证券宝（历史行情、财务数据）
│       ├── mootdx_provider.py        #   通达信（分钟K线）
│       ├── tushare_provider.py       #   Tushare（综合数据）
│       └── tickflow_provider.py      #   逐笔数据
├── tests/                            # 测试代码与报告（详见下方）
├── scripts/                          # 运维/工具脚本（详见下方）
├── docs/                             # 项目文档
├── config/                           # 配置文件
│   └── api_keys.yaml                 #   百炼模型降级链配置（用户维护）
├── drizzle/                          # Drizzle ORM 迁移文件
└── docker-compose.yml                # Docker 编排
```

---

## 测试

### 测试目录结构

```
tests/
├── rag/                              # RAG 检索测试
│   ├── test-rag.ts                   #   10个Query测试（3份年报，含详细日志+MD报告）
│   └── reports/                      #   RAG 测试报告（自动生成）
│       ├── rag-test-report-*.md      #     完整测试报告（步骤耗时/Chunk详情/精排排名/回答内容）
│       └── rag-retrieval-test-report-*.md  #  早期检索测试报告
├── tools/                            # 金融工具测试
│   ├── test-21-tools.ts              #   21个MCP工具功能测试
│   ├── test-llm-router.ts            #   LLM模型降级链测试
│   ├── test-isolated.ts              #   隔离环境单Query测试
│   └── reports/                      #   工具测试报告（自动生成）
│       ├── tool-test-*.json          #     测试原始数据（JSON）
│       └── tool-test-summary-*.md    #     测试汇总报告
├── agent/                            # Agent 端到端测试
│   ├── test-agent-tools.ts           #   Agent 多工具联合查询测试（14个Query）
│   ├── test_agent_e2e.py             #   Agent全流程测试
│   └── reports/                      #   Agent 测试报告（自动生成）
├── db/                               # 数据库测试
│   ├── test-db-insert.ts             #   数据库插入测试
│   └── test-integrity.ts            #   数据完整性测试
├── pdf/                              # PDF 解析测试
│   └── test-pdf-parse.ts             #   PDF解析功能测试
├── unit/                             # 单元测试
│   ├── test-semantic-chunker-integration.ts  # 切片集成测试
│   ├── test-sparse-retriever-preprocess.ts   # BM25预处理测试
│   ├── test-dense-retriever-truncation.ts    # Embedding截断测试
│   ├── test-drizzle-runtime.ts               # Drizzle运行时测试
│   ├── test-memory-system.ts                 # 记忆系统测试
│   ├── test-skill-system.ts                  # Skill系统测试
│   └── test-config-resolution.ts/py          # 配置解析测试
├── data-service/                     # 数据服务测试
│   └── test_baostock_direct.py       #   Baostock直连测试
├── scenario/                         # 场景测试
│   ├── test_day2.py                  #   Day2：百炼模型+Agent工具
│   ├── test_day3_4_5_6.py            #   Day3-6：RAG管道
│   └── test_day7_8.py                #   Day7-8：增量索引+评估
└── run_all_tests.ts                  #   全量测试运行器
```

### 运行测试

```bash
# RAG 检索测试（10个Query，生成MD测试报告）
npx tsx tests/rag/test-rag.ts

# 21个金融工具测试
npx tsx tests/tools/test-21-tools.ts

# LLM 模型降级链测试
npx tsx tests/tools/test-llm-router.ts

# Agent 多工具联合查询测试（14个Query）
npx tsx tests/agent/test-agent-tools.ts

# Agent 端到端测试
conda activate agent
python tests/agent/test_agent_e2e.py

# Day 2 测试：百炼模型调用 + Agent 工具
python tests/scenario/test_day2.py

# Day 3-6 测试：RAG 管道（检索、图谱、重排、多模态）
python tests/scenario/test_day3_4_5_6.py

# Day 7-8 测试：增量索引 + 评估体系
python tests/scenario/test_day7_8.py
```

### 测试报告说明

| 报告类型 | 路径 | 内容 |
|----------|------|------|
| RAG 测试报告 | `tests/rag/reports/rag-test-report-*.md` | 文档状态、总体结果、按难度统计、检索步骤耗时、精排前/后Chunk详情和排名、最终回答内容 |
| 工具测试报告 | `tests/tools/reports/tool-test-summary-*.md` | 21个工具的调用结果、参数、响应时间 |
| Agent 测试报告 | `tests/agent/reports/agent_tool_test_*.md` | 14个Query的多工具联合测试结果、工具调用过程、成功/失败标记 |
| 工具测试原始数据 | `tests/tools/reports/tool-test-*.json` | 完整的工具调用请求和响应JSON |

---

## 运维脚本

```
scripts/
├── 文档管理
│   ├── upload-pdfs.ts               # 批量上传PDF文档
│   ├── upload-single-doc.ts         # 单文档上传
│   ├── upload-rag-docs.ts           # RAG专用文档上传
│   ├── upload-and-rebuild.ts        # 上传并重建图谱
│   ├── rebuild-graph.ts             # 重建知识图谱
│   ├── rebuild-index.ts             # 重建索引（含清洗层）
│   ├── seed-graph.ts                # 图谱种子数据
│   └── cleanup-stuck-docs.ts        # 清理卡住的文档
├── 数据检查
│   ├── check-docs.ts                # 检查文档状态
│   ├── check-embeddings.ts          # 检查Embedding数据
│   ├── check-db.ts                  # 检查数据库连接
│   └── check-cache.py               # 检查缓存状态
├── 数据预热
│   ├── prefetch-data.ts             # 预取市场数据
│   ├── cache-warmup.py              # 缓存预热
│   └── warmup-model.ts              # 模型预热
├── 数据迁移
│   └── migrate-cache-to-pg.py       # SQLite→PostgreSQL 缓存迁移
├── 评估
│   └── run-evaluation.ts            # 运行RAG评估
├── 查询工具
│   ├── query-docs.ts                # 查询文档
│   ├── query-users.ts               # 查询用户
│   └── search-chunk.ts              # 搜索Chunk
├── 模型转换
│   ├── convert_hf_to_gguf.py        # HuggingFace→GGUF格式
│   └── convert_reranker_to_gguf.py  # Reranker模型转换
├── 其他
│   ├── crawl_financial_reports.py   # 爬取年报
│   ├── init-db.ps1                  # 初始化数据库
│   ├── jieba-worker.cjs             # jieba分词Worker
│   ├── pdf-parse-worker.cjs         # PDF解析Worker
│   └── qa-golden.json               # QA黄金数据集
```

---

## 环境要求

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Node.js | 18+ | 前端 + API 服务 |
| Python | 3.10+ | 数据服务（conda 虚拟环境 `agent`） |
| Docker | 最新稳定版 | 容器化部署 |
| PostgreSQL | 14+ | 需安装 pgvector 扩展（推荐 HNSW 索引） |
| Neo4j | 5+ | 知识图谱存储 |
| Redis | 7+ | 缓存 + 会话存储（可选，有内存降级方案） |
| BGE-M3 | - | 本地 Embedding 服务（端口 8011） |

---

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd ai-agent-platform
```

### 2. 安装 Node 依赖

```bash
npm install
```

### 3. 安装 Python 依赖

```bash
conda activate agent
pip install fastapi uvicorn pyyaml baostock pandas python-dateutil requests mootdx efinance tushare neo4j
```

### 4. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填写以下配置：

```env
# 数据库
DATABASE_URL="postgresql://aiagent:password@localhost:5432/agentdb"

# Neo4j
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="password"

# Redis（可选，未配置时自动降级为内存缓存）
REDIS_URL="redis://localhost:6379"

# 阿里百炼
DASHSCOPE_API_KEY="your-api-key"

# NextAuth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# Embedding 服务
EMBEDDING_SERVICE_URL="http://localhost:8011"
```

### 5. 配置模型降级链

编辑 `config/api_keys.yaml`，配置可用的百炼模型列表：

```yaml
llm:
  models:
    - id: qwen-max
    - id: qwen-plus
    - id: qwen-turbo
```

系统会按列表顺序依次尝试，模型额度耗尽时自动降级到下一个模型。

### 6. 启动 Docker 容器

```bash
docker compose up -d
```

### 7. 初始化数据库

```bash
npx drizzle-kit push
```

### 8. 启动数据服务

```bash
conda activate agent
python -m data_service.main
```

数据服务默认运行在 `http://localhost:8001`。

### 9. 启动 Next.js

```bash
npm run dev
```

### 10. 访问应用

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

---

## API 文档

### Next.js API 路由

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth/*` | GET/POST | NextAuth v5 认证相关 |
| `/api/agent/run` | POST | Agent 查询执行（SSE 流式推送，支持多轮对话） |
| `/api/rag/search` | POST | RAG 混合检索（向量+BM25+GraphRAG+分离精排） |
| `/api/rag/answer-with-citation` | POST | 带引用标注的答案生成 |
| `/api/document/upload` | POST | 文档上传（PDF解析+清洗+切片+向量化+图谱构建） |
| `/api/document/graph/[id]` | GET | 获取文档知识图谱数据 |
| `/api/document/rebuild-graph/[id]` | POST | 重建文档知识图谱 |
| `/api/document/rebuild-index` | POST | 重建索引（含清洗层） |
| `/api/health` | GET | 健康检查（数据库+Embedding服务+LLM服务） |
| `/api/mcp/sse` | GET/POST | MCP Server 端点 |
| `/api/wrong-answers` | GET/POST/PUT/DELETE | 错题本管理 |

### Agent API 请求格式

```json
{
  "query": "分析贵州茅台的技术指标",
  "maxIterations": 5,
  "conversationId": "可选，传入已有会话ID以继续对话"
}
```

### Python 数据服务 API（localhost:8001）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/market/history` | POST | 历史行情（支持多数据源） |
| `/api/market/realtime` | POST | 实时行情 |
| `/api/market/financial` | POST | 财务数据 |
| `/api/market/index` | POST | 指数数据 |
| `/health` | GET | 健康检查 |

---

## 核心特性

### Agent 工具集（21+）

| 类别 | 工具 | 说明 |
|------|------|------|
| 市场数据 | getStockHistory | 历史K线（自动缓存，含MA5/10/20/60+RSI14+MACD+布林带+KDJ） |
| 市场数据 | getStockRealtime | 实时行情快照 |
| 市场数据 | getStockFinancial | 财务数据 |
| 市场数据 | getMarketIndex | 指数数据 |
| 市场数据 | getFinancialReport | 财务报表（自动补充盈利能力指标） |
| 量化分析 | calculateMA | 移动平均线（含公式+计算过程） |
| 量化分析 | calculateRSI | RSI相对强弱指数（含公式+计算过程） |
| 量化分析 | calculateMACD | MACD指标 |
| 量化分析 | calculateBollinger | 布林带 |
| 量化分析 | calculateKDJ | KDJ随机指标 |
| 量化分析 | calculateVWAP | 成交量加权平均价 |
| 量化分析 | calculateSharpeRatio | 夏普比率 |
| 量化分析 | calculateMaxDrawdown | 最大回撤 |
| 量化分析 | calculateVolatility | 波动率 |
| 量化分析 | calculateVaR | VaR在险价值 |
| 量化分析 | calculateCorrelation | 相关系数（支持 code1/code2 双股票） |
| 量化分析 | calculateStressTest | 压力测试 |
| 风控合规 | checkRiskLimits | 风险限额检查 |
| 风控合规 | checkTradeCompliance | A股交易合规检查 |
| RAG | hybridSearch | RAG混合检索 |

### Skill 技能层

| Skill | 编排流程 | 说明 |
|-------|---------|------|
| 技术分析 | getStockHistory → [calculateMA + calculateRSI + calculateBollinger](并行) → getStockRealtime → 综合结论 | 完整技术面分析 |
| 合规检查 | getStockRealtime → [checkTradeCompliance + checkPositionLimit + checkRestrictedStock](并行) → 合规报告 | 交易合规审查 |
| 风控评估 | getStockHistory → [calculateVaR + calculateMaxDrawdown + calculateVolatility](并行) → checkRiskLimits → 风控报告 | 风险量化评估 |
| 综合诊断 | [技术分析 + 合规检查 + 风控评估](并行) → 综合诊断报告 | 全面投资分析 |

### 稳定性保障

| 措施 | 实现 | 说明 |
|------|------|------|
| 模型降级链 | api_keys.yaml models 列表驱动 | 主模型403/401时自动切换下一个模型 |
| 熔断器 | CircuitBreaker + forceOpenCircuit | 连续3次失败后熔断；403额度耗尽立即强制熔断（5倍半开周期） |
| 向量索引降级 | HNSW → 顺序扫描 | HNSW索引异常时自动降级为 ORDER BY score |
| 确定性输出 | temperature=0 + seed=42 | 相同输入产生相同输出 |
| LLM 缓存 | MemoryCache | temperature=0 时启用，TTL 30分钟 |
| 指数退避 | 1s → 2s → 4s | LLM 调用失败时指数退避重试 |
| 限流 | RateLimiter | 每IP每分钟20次请求 |
| 整体超时 | 240秒 | Agent 执行超时强制终止 |
| 健康检查 | /api/health | 检测数据库、Embedding服务、LLM服务 |
| 多级降级 | Reranker失败→原始排序，图谱失败→跳过，Redis不可用→内存缓存 | |

### 已知问题与修复记录

| 问题 | 根因 | 修复 |
|------|------|------|
| 中国长城向量召回为0 | IVFFlat索引损坏，部分分区返回空结果 | 重建为HNSW索引；dense-retriever增加顺序扫描降级 |
| 403额度耗尽仍重试3次 | callBailian内部catch块对不可重试错误继续重试 | 403/401错误立即throw，不再重试；强制熔断5倍半开周期 |
| 模型降级链为空 | resolveEnvVars把模型ID当环境变量解析为空 | 智能环境变量解析：仅全大写+下划线格式视为环境变量引用 |
| 精排返回所有chunk | reranker未截取topK | 增加 .slice(0, topK) |
| 图谱三元组挤掉文档chunk | 短文本三元组在精排中排名高于长文本chunk | 分离精排：文档chunk top5 + 图谱三元组 top3 |
| 技术指标日期错误 | 返回结果缺少最新交易日 | 所有工具返回latestTradeDate，prompt强制使用 |
| 切片以标点开头 | 512字符硬截断破坏断句边界 | 文本清洗层 + 边界修正 + 800字符切片 + 多级断点优先级 |
| PDF二进制utf-8解码失败 | incremental-embedder对Buffer调用toString("utf-8") | Buffer直接传入chunkDocument + rawContent fallback |
| Agent重复调用不输出答案 | 无重复检测，8轮迭代后超时 | toolCallHistory + duplicateCallCount，连续2轮重复强制输出 |
| Agent工具失败时幻觉编造数据 | 无数据真实性检查 | 规则15数据真实性原则 + 工具结果成功性检查 |
| tushare/tickflow配置找不到 | 嵌套在market_data下，代码用顶层section名访问 | 提升为顶层节点 |

---

## 数据源

| 数据源 | 说明 | 用途 |
|---|---|---|
| efinance | 东方财富数据接口（首选） | 实时行情、行业板块、概念板块、基金数据 |
| Baostock | 证券宝开源数据接口 | A 股历史行情、财务数据 |
| mootdx | 通达信数据接口（备选） | 分钟级别数据 |
| Tushare | 金融数据接口 | A 股、期货、基金等综合数据 |
| TickFlow | 逐笔数据接口 | 高频逐笔成交数据 |

---

## 文档索引

| 文档 | 说明 |
|---|---|
| [Day 2 计划](docs/day2_plan.md) | 百炼模型接入 + Agent 工具 + ReAct Agent + API 路由 |
| [Day 3 计划](docs/day3_plan.md) | 向量检索 + 混合检索（BM25 + 向量 + RRF） |
| [Day 4 计划](docs/day4_plan.md) | GraphRAG 知识图谱 + 多跳推理 |
| [Day 5 计划](docs/day5_plan.md) | RAG 高级优化（BGE-Reranker + HyDE + 父子文档） |
| [Day 6 计划](docs/day6_plan.md) | 多模态 RAG + 答案溯源 |
| [Day 7 计划](docs/day7_plan.md) | 流式 RAG（增量索引）+ Agentic RAG 自适应检索 |
| [Day 8 计划](docs/day8_plan.md) | 评估体系 + 可观测性 + DeepWiki MCP 集成 |
| [Agent 工具全景](docs/agent_tools.md) | 金融行业 AI Agent 工具分类与说明 |
| [项目目录结构](docs/project_structure.md) | 完整目录结构及说明 |
| [P0/P1 改造说明](docs/upgrade_p0_p1.md) | P0/P1 优先级改造详细说明 |
| [用户操作手册](docs/user_guide.md) | RAG 问答、文档上传、Agent 用途等操作指南 |
| [模型部署踩坑记录](docs/llama_cpp_model_deployment_pitfalls.md) | llama.cpp 部署 Embedding/Reranker 模型踩坑与解决方案 |

---

## 需要安装的 npm 包

```
npm install redis js-yaml
```

> - `redis`：Redis 客户端使用动态 `import("redis")`，未安装时自动降级为内存缓存
> - `js-yaml`：用于读取 `config/api_keys.yaml` 模型降级链配置

---

## License

MIT
