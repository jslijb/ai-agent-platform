# AI Agent Platform（金融行业智能体平台）

基于 Next.js 14 全栈架构的金融行业 AI 智能体平台，集成 RAG 检索增强生成、GraphRAG 知识图谱推理、多 Agent 协作、MCP 工具协议等核心能力，为金融行业提供智能投研、量化分析、合规审查等解决方案。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 14 + TypeScript + Tailwind CSS + App Router |
| API 层 | Next.js Route Handlers + SSE 流式推送 |
| 认证 | NextAuth v5 |
| 数据库 | PostgreSQL（pgvector 向量扩展）+ Drizzle ORM |
| 图数据库 | Neo4j |
| 缓存 | Redis + 内存缓存（降级方案）+ SQLite（数据服务本地缓存） |
| LLM | 阿里百炼 DashScope（多模型降级链）+ 本地 BGE-M3 Embedding |
| Agent 框架 | ReAct + 反思循环 + 多 Agent 编排 |
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
│                     Agent 层 (ReAct + 反思循环)                      │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ SimpleAgent   │  │Researcher│  │  Quant   │  │ Compliance   │   │
│  │  ReAct主Agent │  │ 研究员   │  │ 量化分析师│  │  合规官Agent  │   │
│  └──────────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐    │
│  │ Reflection Node  │  │ Memory（短期记忆 + 会话管理）          │    │
│  │ 反思/自适应检索   │  │ Conversation/Message 持久化          │    │
│  └──────────────────┘  └──────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                     RAG 管道 (检索增强生成)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 文档解析   │  │ 智能切片  │  │ 混合检索  │  │  重排序   │           │
│  │PDF/表格/图│  │语义/父子  │  │向量+BM25 │  │BGE-Rerank│           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ HyDE改写  │  │GraphRAG  │  │ 答案溯源  │  │ 增量索引  │           │
│  │查询扩展   │  │多跳推理   │  │引用标注   │  │CDC监听    │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
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
│  │ HNSW索引     │  │          │  │          │  │ +SQLite缓存   │   │
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
│   │   │   │   ├── search/           #   混合检索（向量+BM25+图谱+重排序）
│   │   │   │   └── answer-with-citation/  # 带引用标注的答案生成
│   │   │   ├── document/             # 文档管理
│   │   │   │   ├── upload/           #   文档上传（解析+切片+向量化+图谱）
│   │   │   │   ├── graph/[id]/       #   获取文档图谱数据
│   │   │   │   └── rebuild-graph/[id]/  # 重建文档知识图谱
│   │   │   ├── health/               # 健康检查端点
│   │   │   └── mcp/                  # MCP SSE 端点
│   │   ├── (auth)/                   # 登录/注册页面
│   │   ├── dashboard/                # 主控制台
│   │   │   ├── documents/            #   文档管理（上传/预览/图谱/重建）
│   │   │   └── wrong-answers/        #   错误答案管理
│   │   └── chat/                     # 对话界面
│   ├── server/                       # 服务端核心逻辑
│   │   ├── agents/                   # Agent 实现
│   │   │   ├── simpleAgent.ts        #   ReAct Agent（21+金融工具+反思循环）
│   │   │   ├── orchestrator.ts       #   多 Agent 编排器（查询路由）
│   │   │   ├── memory.ts             #   短期记忆（会话管理）
│   │   │   ├── reflection-node.ts    #   反思评估节点
│   │   │   └── agent-logger.ts       #   Agent 执行日志
│   │   ├── rag/                      # RAG 管道
│   │   │   ├── retrieval/            #   检索器
│   │   │   │   ├── hybrid-retriever.ts   # 混合检索（RRF 融合）
│   │   │   │   ├── dense-retriever.ts    # 稠密检索（pgvector + HNSW）
│   │   │   │   └── sparse-retriever.ts   # 稀疏检索（BM25）
│   │   │   ├── reranking/            #   重排序
│   │   │   │   └── reranker.ts       #   BGE-Reranker 精排
│   │   │   ├── graph/                #   GraphRAG
│   │   │   │   ├── entity-extractor.ts  # 实体/三元组提取
│   │   │   │   ├── graph-builder.ts     # 图谱构建（Neo4j）
│   │   │   │   └── graph-retriever.ts   # 图谱检索
│   │   │   ├── query/                #   查询优化
│   │   │   │   └── hyde-transformer.ts  # HyDE 查询改写
│   │   │   ├── chunking/             #   文档切片
│   │   │   │   └── parent-document.ts   # 父子文档扩展
│   │   │   ├── citation/             #   答案溯源
│   │   │   └── multimodal/           #   多模态处理
│   │   ├── mcp/                      # MCP Server + 金融工具集
│   │   │   ├── server.ts             #   MCP 工具注册框架
│   │   │   └── tools/                #   金融工具实现
│   │   │       ├── quant_analysis.ts #   量化分析（MA/RSI/MACD/Bollinger/KDJ/VWAP/夏普/回撤/波动率/VaR）
│   │   │       ├── compliance.ts     #   合规检查
│   │   │       └── risk_control.ts   #   风控工具
│   │   ├── llm/                      # LLM 调用层
│   │   │   ├── router.ts             #   模型降级链（从 api_keys.yaml 动态读取）
│   │   │   ├── providers/bailian.ts  #   百炼 DashScope 调用（含超时/重试/熔断）
│   │   │   └── cache.ts              #   LLM 语义缓存（temperature=0 时启用）
│   │   ├── lib/                      # 通用工具
│   │   │   ├── circuit-breaker.ts    #   熔断器（含强制熔断 forceOpenCircuit）
│   │   │   ├── rate-limiter.ts       #   限流中间件
│   │   │   ├── config.ts             #   配置管理
│   │   │   └── logger.ts             #   日志
│   │   └── db/                       # Drizzle ORM
│   │       ├── schema.ts             #   数据库 Schema（Document/Embedding/User/Conversation/Message）
│   │       └── client.ts             #   数据库客户端
│   ├── lib/                          # 前端共享库
│   │   └── auth.ts                   #   NextAuth 配置
│   └── types/                        # TypeScript 类型定义
├── data_service/                     # Python 数据服务（FastAPI，端口 8001）
│   ├── main.py                       #   服务入口
│   ├── config.py                     #   配置管理
│   ├── cache/                        #   缓存层
│   │   └── local_cache.py            #   SQLite 本地缓存（data/market_cache/）
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
├── db/                               # 数据库测试
│   ├── test-db-insert.ts             #   数据库插入测试
│   └── test-integrity.ts            #   数据完整性测试
├── pdf/                              # PDF 解析测试
│   └── test-pdf-parse.ts             #   PDF解析功能测试
├── agent/                            # Agent 端到端测试
│   └── test_agent_e2e.py             #   Agent全流程测试
├── data-service/                     # 数据服务测试
│   └── test_baostock_direct.py       #   Baostock直连测试
└── scenario/                         # 场景测试
    ├── test_day2.py                  #   Day2：百炼模型+Agent工具
    ├── test_day3_4_5_6.py            #   Day3-6：RAG管道
    └── test_day7_8.py                #   Day7-8：增量索引+评估
```

### 运行测试

```bash
# RAG 检索测试（10个Query，生成MD测试报告）
npx tsx tests/rag/test-rag.ts

# 21个金融工具测试
npx tsx tests/tools/test-21-tools.ts

# LLM 模型降级链测试
npx tsx tests/tools/test-llm-router.ts

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
│   ├── seed-graph.ts                # 图谱种子数据
│   └── cleanup-stuck-docs.ts        # 清理卡住的文档
├── 数据检查
│   ├── check-docs.ts                # 检查文档状态
│   ├── check-embeddings.ts          # 检查Embedding数据
│   ├── check-db.ts                  # 检查数据库连接
│   └── check-cache.py               # 检查SQLite缓存状态
├── 数据预热
│   ├── prefetch-data.ts             # 预取市场数据
│   ├── cache-warmup.py              # 缓存预热
│   └── warmup-model.ts              # 模型预热
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
| `/api/rag/search` | POST | RAG 混合检索（向量+BM25+GraphRAG+重排序） |
| `/api/rag/answer-with-citation` | POST | 带引用标注的答案生成 |
| `/api/document/upload` | POST | 文档上传（PDF解析+切片+向量化+图谱构建） |
| `/api/document/graph/[id]` | GET | 获取文档知识图谱数据 |
| `/api/document/rebuild-graph/[id]` | POST | 重建文档知识图谱 |
| `/api/health` | GET | 健康检查（数据库+Embedding服务+LLM服务） |
| `/api/mcp/sse` | GET/POST | MCP Server 端点 |

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
| 量化分析 | calculateCorrelation | 相关系数 |
| 量化分析 | calculateStressTest | 压力测试 |
| 风控合规 | checkRiskLimits | 风险限额检查 |
| 风控合规 | checkTradeCompliance | A股交易合规检查 |
| RAG | hybridSearch | RAG混合检索 |

### 稳定性保障

| 措施 | 实现 | 说明 |
|------|------|------|
| 模型降级链 | api_keys.yaml 动态读取 | 主模型403/401时自动切换下一个模型 |
| 熔断器 | CircuitBreaker + forceOpenCircuit | 连续3次失败后熔断；403额度耗尽立即强制熔断 |
| 向量索引降级 | HNSW → 顺序扫描 | HNSW索引异常时自动降级为 ORDER BY score |
| 确定性输出 | temperature=0 + seed=42 | 相同输入产生相同输出 |
| LLM 缓存 | MemoryCache | temperature=0 时启用，TTL 30分钟 |
| 限流 | RateLimiter | 每IP每分钟20次请求 |
| 整体超时 | 120秒 | Agent 执行超时强制终止 |
| 健康检查 | /api/health | 检测数据库、Embedding服务、LLM服务 |
| 多级降级 | Reranker失败→原始排序，图谱失败→跳过，Redis不可用→内存缓存 | |

### 已知问题与修复记录

| 问题 | 根因 | 修复 |
|------|------|------|
| 中国长城向量召回为0 | IVFFlat索引损坏，部分分区返回空结果 | 重建为HNSW索引；dense-retriever增加顺序扫描降级 |
| 403额度耗尽仍重试3次 | callBailian内部catch块对不可重试错误继续重试 | 403/401错误立即throw，不再重试 |
| 模型降级链为空 | resolveEnvVars把模型ID当环境变量解析为空 | router.ts直接从api_keys.yaml读取模型列表 |
| 精排返回所有chunk | reranker未截取topK | 增加 .slice(0, topK) |
| 技术指标日期错误 | 返回结果缺少最新交易日 | 所有工具返回latestTradeDate，prompt强制使用 |

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
