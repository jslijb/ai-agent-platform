# AI Agent Platform 项目画像

> 最后更新：2026-05-31

---

## 一、项目概览

| 维度 | 信息 |
|------|------|
| **项目名称** | ai-agent-platform |
| **项目定位** | 金融行业 AI Agent 全栈平台（RAG + Agent + 评估） |
| **技术栈** | TypeScript + Next.js 14 + PostgreSQL + LangGraph + MCP |
| **代码规模** | ~50,000+ 行 TypeScript |
| **数据库表** | 16 张 |
| **API 端点** | 25+ 个 |
| **前端页面** | 12 个 |
| **MCP 工具** | 10 个 |
| **Agent 技能** | 13+ 个 |
| **评估指标** | RAG 10 个 + Agent 5 个 |

---

## 二、目录结构

```
ai-agent-platform/
├── src/
│   ├── app/                          # Next.js App Router 页面与 API
│   │   ├── layout.tsx                # 根布局
│   │   ├── page.tsx                  # 首页（重定向到 dashboard）
│   │   ├── chat/                     # 聊天页面
│   │   │   └── page.tsx
│   │   ├── dashboard/                # 仪表盘
│   │   │   ├── page.tsx              # 主面板
│   │   │   ├── evaluation/           # RAG 评估
│   │   │   │   ├── page.tsx          # 评估主页（指标+趋势+雷达+基准）
│   │   │   │   ├── trend/page.tsx    # 趋势曲线
│   │   │   │   ├── compare/page.tsx  # 版本对比
│   │   │   │   └── settings/         # 评估配置
│   │   │   │       └── settings/page.tsx
│   │   │   ├── agent-evaluation/     # Agent 评估
│   │   │   │   └── page.tsx
│   │   │   ├── documents/page.tsx    # 文档管理
│   │   │   ├── wrong-answers/page.tsx # 错误答案
│   │   │   ├── logs/page.tsx         # Agent 日志
│   │   │   ├── token-usage/page.tsx  # Token 用量
│   │   │   └── memories/page.tsx     # 记忆管理
│   │   └── api/                      # API 路由
│   │       ├── agent/
│   │       │   ├── run/route.ts      # POST Agent 执行
│   │       │   ├── stream/route.ts   # SSE Agent 流式输出
│   │       │   └── models/route.ts   # GET 可用模型列表
│   │       ├── chat/
│   │       │   └── route.ts          # POST 聊天
│   │       ├── document/
│   │       │   ├── upload/route.ts   # POST 文档上传
│   │       │   ├── list/route.ts     # GET 文档列表
│   │       │   └── graph/[documentId]/route.ts  # GET 文档图谱
│   │       ├── evaluation/
│   │       │   ├── run/route.ts      # POST 触发评估
│   │       │   ├── config/route.ts   # GET/PATCH 评估配置
│   │       │   ├── results/route.ts  # GET 评估结果
│   │       │   ├── versions/route.ts # GET 版本列表
│   │       │   ├── versions/[id]/route.ts  # GET 版本详情
│   │       │   ├── compare/route.ts  # GET 版本对比
│   │       │   ├── trend/route.ts    # GET 趋势数据
│   │       │   ├── radar/route.ts    # GET 雷达图数据
│   │       │   └── milestones/route.ts  # GET 里程碑
│   │       └── mcp/
│   │           └── sse/route.ts      # SSE MCP 端点
│   ├── components/                   # React 组件
│   │   ├── AuthProvider.tsx          # 认证 Provider
│   │   ├── ChatMessage.tsx           # 聊天消息
│   │   ├── DocumentUploader.tsx      # 文档上传
│   │   ├── EvaluationDashboard.tsx   # 评估面板
│   │   ├── ForceGraph.tsx            # 知识图谱可视化
│   │   └── ...                       # 其他组件
│   └── server/                       # 服务端核心
│       ├── agents/                   # Agent 系统
│       ├── db/                       # 数据库
│       ├── evaluation/               # 评估系统
│       ├── graph/                    # 知识图谱
│       ├── lib/                      # 基础库
│       ├── llm/                      # LLM 服务
│       ├── mcp/                      # MCP 协议
│       ├── rag/                      # RAG 系统
│       ├── trpc/                     # tRPC API
│       └── vision/                   # 视觉引擎
├── scripts/                          # 脚本
│   ├── run-evaluation.ts             # 评估运行脚本
│   ├── run-regression-test.ts        # 回归测试脚本
│   └── qa-golden.json                # 黄金测试集（103条）
├── docs/                             # 文档
│   └── interview-questions.md        # 面试题库
├── evaluation-reports/               # 评估报告输出
├── evaluation-config.yaml            # 评估配置
├── docker-compose.yml                # Docker 编排
├── drizzle.config.ts                 # ORM 配置
├── next.config.ts                    # Next.js 配置
├── package.json                      # 依赖管理
└── tsconfig.json                     # TypeScript 配置
```

---

## 三、服务端模块详解

### 3.1 Agent 系统 (`src/server/agents/`)

```
agents/
├── base.ts                    # Agent 基类
├── orchestrator.ts            # Agent 编排器（路由+调度）
├── memory.ts                  # Agent 记忆（短期+长期）
├── agent-logger.ts            # Agent 行为日志
├── skills/
│   ├── index.ts               # SkillRegistry + executeSkill
│   ├── enhanced-registry.ts   # 增强注册表（向量检索匹配）
│   ├── skill-vector-retriever.ts  # 技能向量检索
│   ├── tool-vector-retriever.ts   # 工具向量检索
│   ├── group-router.ts        # 技能组路由
│   ├── multi-skill-matcher.ts # 多技能匹配
│   └── definitions/
│       ├── index.ts           # 技能注册入口
│       ├── technical-analysis.ts      # 技术分析（MA/MACD/RSI/BOLL）
│       ├── risk-assessment.ts         # 风险评估（VaR/回撤/波动率）
│       ├── compliance-check.ts        # 合规检查（交易/持仓/受限股）
│       ├── comprehensive-diagnosis.ts # 综合诊断
│       ├── investment/
│       │   ├── fundamental-analysis.ts  # 基本面分析
│       │   ├── debt-solvency-analysis.ts # 偿债能力分析
│       │   ├── valuation-analysis.ts    # 估值分析
│       │   ├── sector-rotation.ts       # 板块轮动
│       │   ├── sentiment-analysis.ts    # 情感分析
│       │   ├── stock-comparison.ts      # 股票对比
│       │   └── investment-thesis.ts     # 投资论点
│       └── vision/
│           ├── screenshot-to-structured-data.ts  # 截图结构化
│           ├── chart-pattern-recognition.ts       # 图表形态识别
│           └── financial-statement-ocr.ts         # 财报 OCR
└── tools/
    └── deepwiki-tool.ts       # DeepWiki 知识库工具
```

**核心导出**：
- `SkillRegistry` — 技能注册表
- `executeSkill(name, params)` — 执行技能
- `routeQuery(query)` — 查询路由
- `orchestrate(query, options)` — 编排执行

### 3.2 数据库 (`src/server/db/`)

```
db/
├── client.ts    # 数据库连接（Proxy 延迟初始化 + closeDb）
├── schema.ts    # 完整 Schema 定义（16张表）
└── index.ts     # 导出 db + schema
```

**核心导出**：
- `db` — Drizzle ORM 实例（Proxy 延迟初始化）
- `closeDb()` — 关闭数据库连接
- `sql` — Drizzle SQL 工具

### 3.3 评估系统 (`src/server/evaluation/`)

```
evaluation/
├── rag-evaluator.ts                    # RAG 评估器（10个指标）
├── agent-evaluator.ts                  # Agent 评估器（5个指标）
├── evaluation-history.ts               # 评估历史（版本/趋势/对比/雷达/里程碑）
├── evaluation-trigger.ts               # 评估触发机制（手动/自动）
├── regression-tester.ts                # 回归测试（基线/对比/告警）
├── historical-query-collector.ts       # 历史查询采集（去重/聚类/标注）
├── historical-query-evaluator.ts       # 历史查询评估
├── dataset-adapter.ts                  # 数据集适配器框架
├── open-dataset-evaluator.ts           # 开源数据集评估执行器
└── adapters/
    ├── fineval-adapter.ts              # FinEval 多选题适配
    ├── cflue-adapter.ts                # CFLUE 分类/抽取适配
    ├── finqa-adapter.ts                # FinQA 数值推理适配
    └── convfinqa-adapter.ts            # ConvFinQA 多轮对话适配
```

**RAG 评估指标（10个）**：

| 指标 | 类型 | 计算方式 |
|------|------|---------|
| Hits@K | 通用 | 检索命中率 |
| ContextRelevance | 通用 | LLM 评估上下文相关性 |
| ContextRecall | 通用 | LLM 评估上下文召回率 |
| Faithfulness | 通用 | LLM 评估答案忠实度 |
| AnswerRelevance | 通用 | LLM 评估答案相关性 |
| NumericalAccuracy | 金融 | 正则匹配数值 ±5% 容忍 |
| ComplianceScore | 金融 | LLM 检测违规内容 |
| HallucinationRate | 金融 | LLM 检测无法溯源数据 |
| RiskDisclosure | 金融 | 规则检查风险提示 |
| Timeliness | 金融 | 数据日期衰减计算 |

**Agent 评估指标（5个）**：

| 指标 | 计算方式 |
|------|---------|
| ToolSelectionScore | LLM 评估工具选择合理性 |
| PlanningScore | LLM 评估任务规划能力 |
| AgentComplianceScore | LLM 检测 Agent 合规性 |
| ConsistencyScore | LLM 评估多轮一致性 |
| EfficiencyScore | 迭代轮次+Token+延迟综合 |

### 3.4 知识图谱 (`src/server/graph/`)

```
graph/
├── neo4j.ts        # Neo4j 连接管理（单例+可用性检测）
└── builder.ts      # 图谱构建（实体抽取+三元组导入）
```

**核心导出**：
- `isNeo4jAvailable()` — 检查 Neo4j 可用性
- `getNeo4jDriver()` — 获取 Neo4j 驱动
- `buildGraphFromDocument(doc)` — 从文档构建图谱

### 3.5 基础库 (`src/server/lib/`)

```
lib/
├── circuit-breaker.ts  # 熔断器（3次失败→60s熔断）
├── config.ts           # 配置加载（api_keys.yaml）
├── logger.ts           # 日志工具
├── rate-limiter.ts     # 速率限制（Redis 滑动窗口）
├── redis.ts            # Redis 客户端
└── s3.ts               # S3 对象存储
```

### 3.6 LLM 服务 (`src/server/llm/`)

```
llm/
├── router.ts              # LLM 路由（降级链+熔断）
├── config.ts              # api_keys.yaml 配置加载
├── token-estimator.ts     # Token 消耗预估
├── llm-cache.ts           # LLM 响应缓存
└── providers/
    ├── bailian.ts         # 阿里百炼（DashScope API）
    └── local.ts           # 本地模型（Ollama）
```

**核心导出**：
- `callWithFallback(messages, temperature)` — 降级链调用
- `callBailian(messages, model, temperature)` — 百炼 API 调用
- `callBailianWithCache(messages, model, temperature)` — 带缓存的调用

**降级链**：qwen-max → qwen-plus → qwen-turbo

### 3.7 MCP 协议 (`src/server/mcp/`)

```
mcp/
├── server.ts              # MCP Server 核心（工具注册+调用）
├── tool-registry.ts       # 内部工具注册表
└── tools/
    ├── calculator.ts      # 计算器
    ├── compliance.ts      # 合规检查
    ├── document_analysis.ts  # 文档分析
    ├── graph_query.ts     # 图谱查询
    ├── market_data.ts     # 行情数据
    ├── quant_analysis.ts  # 量化分析
    ├── risk_control.ts    # 风控工具
    ├── simulated_trade.ts # 模拟交易
    ├── sql.ts             # SQL 查询
    └── web_search.ts      # 网络搜索
```

**10 个 MCP 工具**：

| 工具 | 功能 | 风险等级 |
|------|------|---------|
| calculator | 数学计算 | 低 |
| compliance | 交易合规检查 | 中 |
| document_analysis | 文档深度分析 | 低 |
| graph_query | Neo4j 图谱查询 | 中 |
| market_data | 行情数据获取 | 低 |
| quant_analysis | 量化指标计算 | 低 |
| risk_control | VaR/回撤/波动率 | 低 |
| simulated_trade | 模拟交易 | 高（安全隔离） |
| sql | SQL 查询（只读） | 高（RLS 保护） |
| web_search | 网络搜索 | 中 |

### 3.8 RAG 系统 (`src/server/rag/`)

```
rag/
├── embedding.ts               # Embedding 生成（bge-m3）
├── retrieval/
│   ├── dense-retriever.ts     # 稠密检索（pgvector）
│   ├── sparse-retriever.ts    # 稀疏检索（nodejieba + BM25）
│   └── hybrid-retriever.ts    # 混合检索（RRF K=60）
├── reranking/
│   └── reranker.ts            # 重排序（bge-reranker-v2-m3）
├── query/
│   ├── query-expander.ts      # 查询扩展
│   └── hyde.ts                # HyDE 假设文档嵌入
├── chunking/
│   ├── semantic-chunker.ts    # 语义分块
│   └── parent-document.ts    # 父文档策略
├── citation/
│   ├── citation-injector.ts   # 引用注入
│   └── source-tracker.ts      # 来源追踪
├── multimodal/
│   ├── pdf-parser.ts          # PDF 解析
│   ├── table-extractor.ts     # 表格提取
│   └── image-caption.ts       # 图片描述
├── graph/
│   ├── graph-builder.ts       # 图谱构建
│   └── graph-retriever.ts     # 图谱检索
├── streaming/
│   └── cdc-listener.ts        # CDC 增量更新监听
├── knowledge-cleanup.ts       # 知识库清理
└── incremental-embedder.ts    # 增量 Embedding 更新
```

**核心导出**：
- `hybridSearch(query, options)` — 混合检索入口
- `denseSearch(query, options)` — 稠密检索
- `sparseSearch(query, options)` — 稀疏检索
- `rerank(query, documents)` — 重排序
- `generateEmbedding(text)` — 生成向量

### 3.9 tRPC API (`src/server/trpc/`)

```
trpc/
├── index.ts          # tRPC 初始化
├── router.ts         # 合并所有子路由
└── routers/
    ├── agent.ts      # Agent 相关 API
    └── document.ts   # 文档相关 API
```

### 3.10 视觉引擎 (`src/server/vision/`)

```
vision/
├── index.ts                    # 视觉引擎入口
├── dual-engine-router.ts       # 双引擎路由（PaddleOCR 主 + Qwen-VL 降级）
├── paddle-ocr.ts               # PaddleOCR 封装
└── qwen-vl.ts                  # Qwen3.5-VL 封装
```

---

## 四、前端页面清单

| 路由 | 文件 | 功能 |
|------|------|------|
| `/` | `app/page.tsx` | 首页（重定向到 dashboard） |
| `/chat` | `app/chat/page.tsx` | 聊天界面 |
| `/dashboard` | `app/dashboard/page.tsx` | 主面板（概览+统计） |
| `/dashboard/evaluation` | `app/dashboard/evaluation/page.tsx` | RAG 评估（指标+趋势+雷达+基准+触发） |
| `/dashboard/evaluation/trend` | `app/dashboard/evaluation/trend/page.tsx` | 指标趋势曲线+里程碑 |
| `/dashboard/evaluation/compare` | `app/dashboard/evaluation/compare/page.tsx` | 多版本对比（表格+趋势+Δ标识） |
| `/dashboard/evaluation/settings` | `app/dashboard/evaluation/settings/settings/page.tsx` | 评估配置（级别/权重/触发/预设） |
| `/dashboard/agent-evaluation` | `app/dashboard/agent-evaluation/page.tsx` | Agent 评估（指标+趋势+触发） |
| `/dashboard/documents` | `app/dashboard/documents/page.tsx` | 文档管理（上传/列表/图谱预览） |
| `/dashboard/wrong-answers` | `app/dashboard/wrong-answers/page.tsx` | 错误答案管理 |
| `/dashboard/logs` | `app/dashboard/logs/page.tsx` | Agent 日志查看 |
| `/dashboard/token-usage` | `app/dashboard/token-usage/page.tsx` | Token 用量统计 |
| `/dashboard/memories` | `app/dashboard/memories/page.tsx` | 记忆管理 |

---

## 五、API 端点清单

### 5.1 Agent API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/agent/run` | 执行 Agent 查询 |
| GET | `/api/agent/stream` | SSE 流式 Agent 输出 |
| GET | `/api/agent/models` | 获取可用模型列表 |

### 5.2 Chat API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/chat` | 聊天对话 |

### 5.3 Document API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/document/upload` | 上传文档 |
| GET | `/api/document/list` | 文档列表 |
| GET | `/api/document/graph/[id]` | 文档知识图谱 |

### 5.4 Evaluation API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/evaluation/run` | 触发评估（需认证） |
| GET | `/api/evaluation/config` | 获取评估配置 |
| PATCH | `/api/evaluation/config` | 更新评估配置（需 admin） |
| GET | `/api/evaluation/results` | 获取最新评估结果 |
| GET | `/api/evaluation/versions` | 版本列表（支持筛选） |
| GET | `/api/evaluation/versions/[id]` | 版本详情 |
| GET | `/api/evaluation/compare` | 多版本对比（versionIds 参数） |
| GET | `/api/evaluation/trend` | 指标趋势数据 |
| GET | `/api/evaluation/radar` | 雷达图数据 |
| GET | `/api/evaluation/milestones` | 里程碑列表 |

### 5.5 MCP API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/mcp/sse` | MCP SSE 端点（外部客户端连接） |

---

## 六、数据库 Schema 详解

### 6.1 表清单与关系

```
User ──1:N── Document ──1:N── Embedding
  │
  ├──1:N── Conversation ──1:N── Message
  │              │
  │              └──1:N── MemorySummary
  │
  ├──1:N── AgentLog
  ├──1:N── LLMUsageLog
  ├──1:N── WrongAnswer
  ├──1:N── MemoryProfile
  ├──1:N── MemoryFragment
  ├──1:N── Team ──1:N── TeamMember
  │
  └──(系统表)
       evaluation_pool
       evaluation_versions
       market_cache_entries
```

### 6.2 核心表字段

#### User（用户）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text | PK, uuid | 用户 ID |
| email | text | unique, not null | 邮箱 |
| name | text | not null | 姓名 |
| password | text | not null | bcrypt 加密 |
| role | text | not null, default "user" | 角色（user/admin） |
| createdAt | timestamp | not null, default now() | 创建时间 |

#### Document（文档）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text | PK, uuid | 文档 ID |
| userId | text | FK→User.id | 所属用户 |
| fileName | text | not null | 文件名 |
| fileKey | text | not null | S3 Key |
| status | text | not null, default "pending" | 状态 |
| contentHash | text | | 内容哈希（去重） |
| version | integer | not null, default 1 | 版本号 |
| validUntil | timestamp | | 有效期（时效性） |
| documentType | text | not null, default "general" | 文档类型 |
| rawContent | text | | 原始内容 |
| metadata | jsonb | default {} | 扩展元数据 |

#### Embedding（向量）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text | PK, uuid | 向量 ID |
| documentId | text | FK→Document.id | 所属文档 |
| chunkIndex | integer | not null | 分块序号 |
| chunkText | text | not null | 分块文本 |
| embedding | vector(1024) | | bge-m3 向量 |
| tokenCount | integer | | Token 数量 |
| metadata | jsonb | default {} | 元数据 |

#### AgentLog（Agent 日志）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text | PK, uuid | 日志 ID |
| conversationId | text | | 会话 ID |
| userId | text | not null | 用户 ID |
| query | text | not null | 查询 |
| answer | text | | 回答 |
| model | text | | 使用的模型 |
| iterations | integer | not null, default 0 | 迭代轮次 |
| totalSteps | integer | not null, default 0 | 总步骤数 |
| steps | jsonb | not null, default [] | 步骤详情 |
| promptTokens | integer | default 0 | Prompt Token |
| completionTokens | integer | default 0 | 完成 Token |
| totalTokens | integer | default 0 | 总 Token |
| latencyMs | integer | | 延迟毫秒 |
| status | text | not null, default "success" | 状态 |

#### evaluation_versions（评估版本）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | serial | PK | 自增 ID |
| version | integer | not null | 版本号 |
| timestamp | varchar(64) | not null | 评估时间 |
| evaluationType | varchar(32) | not null | 类型（rag/agent） |
| evaluationLevel | varchar(16) | not null | 级别（daily/standard/full） |
| dataSource | varchar(32) | not null | 数据来源 |
| triggerMode | varchar(16) | not null | 触发模式 |
| milestone | varchar(256) | | 里程碑 |
| totalTests | integer | not null | 测试条数 |
| overallScore | numeric(8,4) | not null | 综合得分 |
| financialOverallScore | numeric(8,4) | | 金融综合得分 |
| avgHitsAtK ~ avgEfficiencyScore | numeric(8,4) | | 各指标均值 |
| reportJson | text | | 完整报告 JSON |

#### evaluation_pool（评估数据池）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | serial | PK | 自增 ID |
| query | text | not null | 查询 |
| answer | text | | 回答 |
| context | text | | 上下文 |
| toolsUsed | varchar(512) | | 使用的工具 |
| category | varchar(64) | | 分类 |
| source | varchar(32) | not null | 来源 |
| userFeedback | varchar(16) | | 用户反馈 |
| conversationId | varchar(64) | | 会话 ID |
| model | varchar(64) | | 模型 |
| iterations | integer | | 迭代轮次 |
| latencyMs | integer | | 延迟 |
| tokenUsage | integer | | Token 用量 |

### 6.3 索引清单

| 表 | 索引 | 类型 |
|----|------|------|
| Embedding | documentId_idx | B-tree |
| Embedding | embedding_idx | IVFFlat (vector) |
| MemoryFragment | embedding_idx | IVFFlat (vector) |
| AgentLog | userId_idx, conversationId_idx, createdAt_idx | B-tree |
| LLMUsageLog | model_idx, createdAt_idx | B-tree |
| WrongAnswer | userId_idx, errorType_idx, resolved_idx, createdAt_idx | B-tree |
| evaluation_pool | source_idx, category_idx, createdAt_idx | B-tree |
| evaluation_versions | evaluationType_idx, evaluationLevel_idx, timestamp_idx, createdAt_idx | B-tree |

---

## 七、配置文件详解

### 7.1 evaluation-config.yaml

```yaml
evaluation:
  levels:
    daily: { maxTestItems: 10, timeoutMinutes: 10 }
    standard: { maxTestItems: null, timeoutMinutes: 20 }
    full: { maxTestItems: null, timeoutMinutes: 60 }

  rag_weights:
    hitsAtK: 0.10
    contextRelevance: 0.10
    contextRecall: 0.10
    faithfulness: 0.15
    answerRelevance: 0.05
    numericalAccuracy: 0.15
    complianceScore: 0.15
    hallucinationRate: 0.10
    riskDisclosure: 0.05
    timeliness: 0.05

  agent_weights:
    toolSelection: 0.25
    planning: 0.25
    compliance: 0.25
    consistency: 0.15
    efficiency: 0.10

  thresholds:
    regressionAlert: 5    # 退化告警阈值（%）
    complianceMinimum: 0.8
    hallucinationMaximum: 0.2

  presets:
    compliance_first: { ... }    # 合规优先权重
    accuracy_first: { ... }      # 准确性优先权重
    efficiency_first: { ... }    # 效率优先权重

  trigger:
    default_mode: manual
    auto:
      schedule: { enabled: false, cron: "0 8 * * 1-5", level: "daily" }
      post_deploy: { enabled: false, level: "standard" }
      post_document_update: { enabled: false, level: "daily" }
      error_rate_spike: { enabled: false, level: "standard", threshold: 0.3 }
```

### 7.2 docker-compose.yml

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| postgres | pgvector/pgvector:pg16 | 5432 | 主数据库+向量 |
| redis | redis:7-alpine | 6379 | 缓存+限流 |
| neo4j | neo4j:5 + APOC | 7474/7687 | 知识图谱 |
| embedding | llama.cpp server | 8011 | bge-m3 Embedding |
| reranker | llama.cpp server | 8010 | bge-reranker-v2-m3 |
| nginx | nginx:alpine | 80/443 | 反向代理 |

### 7.3 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| DATABASE_URL | PostgreSQL 连接串 | postgres://aiagent:***@localhost:5432/agentdb |
| NEO4J_URI | Neo4j 连接 | bolt://localhost:7687 |
| NEO4J_USER | Neo4j 用户 | neo4j |
| NEO4J_PASSWORD | Neo4j 密码 | *** |
| REDIS_URL | Redis 连接 | redis://localhost:6379 |
| AUTH_SECRET | NextAuth 密钥 | *** |
| AUTH_URL | 认证回调 URL | http://localhost:3000 |

---

## 八、脚本与工具链

| 脚本 | 用途 | 命令 |
|------|------|------|
| `scripts/run-evaluation.ts` | 运行评估 | `npx tsx scripts/run-evaluation.ts [--level daily/standard/full] [--type rag/agent] [--preset xxx] [--milestone xxx]` |
| `scripts/run-regression-test.ts` | 回归测试 | `npx tsx scripts/run-regression-test.ts` |
| `scripts/qa-golden.json` | 黄金测试集 | 103 条，8 个分类 |

### package.json scripts

| 命令 | 用途 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 生产启动 |
| `npm run lint` | ESLint 检查 |
| `npm run db:generate` | 生成 Drizzle 迁移 |
| `npm run db:migrate` | 执行数据库迁移 |
| `npm run db:push` | 推送 Schema 到数据库 |
| `npm run db:studio` | Drizzle Studio |

---

## 九、依赖清单

### 核心依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| next | 14.2.21 | 全栈框架 |
| react | 18.3.1 | UI 框架 |
| @trpc/server | 10.45.2 | 端到端类型安全 API |
| @trpc/next | 10.45.4 | tRPC Next.js 集成 |
| @tanstack/react-query | 4.44.0 | 服务端状态管理 |
| drizzle-orm | 0.45.2 | ORM |
| postgres | 3.4.5 | PostgreSQL 驱动 |
| next-auth | 5.0.0-beta.25 | 认证 |
| @auth/drizzle-adapter | 1.7.4 | 认证数据库适配 |
| @langchain/core | 0.3.40 | LangChain 核心 |
| @langchain/langgraph | 1.3.2 | Agent 状态图 |
| @langchain/langgraph-supervisor | 0.1.5 | Supervisor 编排 |
| @langchain/community | 0.3.36 | LangChain 社区工具 |
| @reaatech/rag-eval-metrics | 1.0.7 | RAG 评估指标 |
| recharts | 3.8.1 | 图表库 |
| react-force-graph-2d | 1.27.2 | 知识图谱可视化 |
| nodejieba | 3.2.0 | 中文分词 |
| sharp | 0.34.1 | 图片处理 |
| neo4j-driver | 5.28.1 | Neo4j 驱动 |
| ioredis | 5.6.1 | Redis 客户端 |
| zod | 3.24.2 | Schema 校验 |
| bcryptjs | 2.4.3 | 密码加密 |
| tailwindcss | 3.4.14 | CSS 框架 |

### 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| typescript | 5.7.3 | TypeScript 编译 |
| drizzle-kit | 0.30.5 | 数据库迁移工具 |
| eslint | 9.18.0 | 代码检查 |
| @types/node | 22.10.5 | Node.js 类型 |
| vitest | 4.1.1 | 单元测试 |

---

## 十、数据流全景

### 10.1 聊天流程

```
用户输入 → /api/agent/stream (SSE)
  → Orchestrator.routeQuery() → 选择 Agent
  → LangGraph 状态图执行
    → callLLM (Function Calling)
    → executeTools (MCP/ToolRegistry)
    → shouldRetrieveAgain (反思)
    → hybridSearch (如需检索)
  → SSE 流式输出
  → AgentLog 记录
  → evaluation_pool 采集
```

### 10.2 RAG 检索流程

```
Query → QueryExpander (扩展子查询)
  → HyDE (假设文档嵌入，可选)
  → 并行检索:
    ├── denseSearch (pgvector 余弦相似度)
    └── sparseSearch (nodejieba + 关键词)
  → RRF 融合 (K=60)
  → Reranker 精排 (bge-reranker-v2-m3)
  → CitationInjector (引用注入)
  → 返回 Top-K 结果
```

### 10.3 评估流程

```
触发评估 (手动/自动)
  → 加载测试集 (黄金/历史/开源)
  → 逐条评估:
    ├── cachedSearchFn (检索，带缓存)
    ├── answerFn (LLM 生成答案)
    └── Promise.all (8个评估函数并行)
  → 计算综合得分
  → saveEvaluationVersion (持久化)
  → 回归对比 (可选)
  → 生成报告
```

### 10.4 文档处理流程

```
上传 PDF → /api/document/upload
  → S3 存储
  → pdf-parse / PaddleOCR (解析)
  → semantic-chunker (分块)
  → bge-m3 (生成 Embedding)
  → pgvector (存储向量)
  → entity-extractor (实体抽取，可选)
  → Neo4j (图谱存储，可选)
  → CDC 通知 (增量更新)
```

---

## 十一、关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 向量数据库 | pgvector 而非 Milvus | 架构简化，百万级内够用 |
| ORM | Drizzle 而非 Prisma | pgvector 支持 + Edge 兼容 |
| LLM 提供商 | 阿里百炼而非 OpenAI | 数据合规 + 中文能力 + 成本 |
| Agent 框架 | LangGraph 而非自研 | 状态图 + Function Calling 原生支持 |
| 工具协议 | MCP + ToolRegistry 双轨 | 内部高性能 + 外部标准化 |
| 评估指标 | 5通用+5金融 | 金融行业特殊性（合规/幻觉/数值） |
| DB 连接 | Proxy 延迟初始化 | 解决 ES Module import 时序问题 |
| 检索策略 | 混合检索+Reranker | 稠密+稀疏互补，精排提升精度 |
| 视觉引擎 | PaddleOCR + Qwen-VL 双引擎 | 主引擎高性能，降级引擎保可用 |
| 缓存 | Redis 而非 PG | 延迟 <1ms + TTL + 原子计数 |
