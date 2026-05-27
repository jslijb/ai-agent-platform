# AI Agent Platform（金融行业智能体平台）

基于 Next.js 14 全栈架构的金融行业 AI 智能体平台，集成 RAG 检索增强生成、GraphRAG 知识图谱推理、多 Agent 协作、MCP 工具协议等核心能力，为金融行业提供智能投研、量化分析、合规审查等解决方案。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 14 + TypeScript + Tailwind CSS + App Router |
| API 层 | tRPC（类型安全 RPC）+ Next.js Route Handlers |
| 认证 | NextAuth v5 |
| 数据库 | PostgreSQL（pgvector 向量扩展）+ Drizzle ORM |
| 图数据库 | Neo4j |
| 缓存 | Redis + 内存缓存（降级方案） |
| LLM | 阿里百炼（DashScope）+ 本地模型（BGE-M3） |
| Agent 框架 | LangGraph.js（ReAct + 反思循环 + 多 Agent 编排） |
| 数据服务 | Python FastAPI（efinance / Baostock / mootdx / Tushare） |
| 容器化 | Docker + Docker Compose |

---

## 项目架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户界面 (Next.js 14)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  登录/注册 │  │  对话界面  │  │  控制台   │  │  评估面板         │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                        API 层 (Route Handlers + tRPC)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  /auth/*  │  │ /agent/  │  │ /rag/*   │  │/document/*│           │
│  │  认证路由  │  │  run     │  │search    │  │ upload    │           │
│  │          │  │          │  │answer    │  │           │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────┐  ┌──────────┐                                        │
│  │ /health  │  │ /mcp/sse │                                        │
│  │ 健康检查  │  │ MCP端点  │                                        │
│  └──────────┘  └──────────┘                                        │
├─────────────────────────────────────────────────────────────────────┤
│                     Agent 层 (LangGraph.js 多Agent)                  │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Orchestrator  │  │Researcher│  │  Quant   │  │ Compliance   │   │
│  │  主控编排Agent │  │ 研究员   │  │ 量化分析师│  │  合规官Agent  │   │
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
│  ┌──────────────────┐  ┌──────────────────────────────────────┐    │
│  │ 知识过期清理       │  │ 知识版本管理（contentHash + version）│    │
│  └──────────────────┘  └──────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                     MCP 工具层 (Model Context Protocol)              │
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
│  │ CircuitBreaker│  │ qwen-max→plus│  │ MemoryCache  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ 限流中间件    │  │ 健康检查      │  │ 确定性输出    │             │
│  │ RateLimiter  │  │ /api/health  │  │ temp=0+seed  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
├─────────────────────────────────────────────────────────────────────┤
│                     LLM 调用层 (模型路由 + 语义缓存)                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│  │ 阿里百炼 (qwen)   │  │ 本地模型 (BGE-M3) │  │ Redis 语义缓存 │   │
│  └──────────────────┘  └──────────────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                     数据层                                           │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ PostgreSQL    │  │  Neo4j   │  │  Redis   │  │ Python 数据   │   │
│  │ + pgvector   │  │ 知识图谱  │  │  缓存    │  │ 服务(FastAPI) │   │
│  └──────────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
ai-agent-platform/
├── src/
│   ├── app/                    # Next.js App Router（页面 + API）
│   │   ├── api/                # API 路由
│   │   │   ├── auth/           # 认证（NextAuth v5）
│   │   │   ├── agent/run/      # Agent 执行入口
│   │   │   ├── rag/            # RAG 检索与带引用答案
│   │   │   ├── document/       # 文档上传
│   │   │   ├── graph/          # 知识图谱构建
│   │   │   ├── health/         # 健康检查端点
│   │   │   ├── mcp/            # MCP SSE 端点
│   │   │   └── evaluation/     # 评估结果
│   │   ├── (auth)/             # 登录/注册页面
│   │   ├── dashboard/          # 主控制台 + 评估面板
│   │   └── chat/               # 对话界面
│   ├── server/                 # 服务端核心逻辑
│   │   ├── agents/             # 多 Agent（Orchestrator、Researcher、Quant、Compliance）
│   │   │   ├── base.ts         # Agent 抽象基类
│   │   │   ├── memory.ts       # 短期记忆（会话管理）
│   │   │   ├── orchestrator.ts # 多 Agent 编排器（查询路由）
│   │   │   ├── simpleAgent.ts  # ReAct Agent（含反思循环）
│   │   │   └── reflection-node.ts # 反思评估节点
│   │   ├── rag/                # RAG 管道（切片、检索、重排、溯源、增量索引）
│   │   │   ├── knowledge-cleanup.ts # 知识过期清理
│   │   │   └── streaming/      # CDC 监听 + 增量嵌入
│   │   ├── mcp/                # MCP Server + 金融工具集
│   │   │   └── server.ts       # MCP 工具注册框架
│   │   ├── llm/                # LLM 调用层（百炼、路由、缓存）
│   │   │   ├── router.ts       # 模型降级链（qwen-max → qwen-plus → qwen-turbo）
│   │   │   └── cache.ts        # LLM 语义缓存（内存缓存，temperature=0 时启用）
│   │   ├── graph/              # Neo4j 图数据库操作
│   │   ├── trpc/               # tRPC 路由
│   │   ├── evaluation/         # RAG 评估器
│   │   ├── lib/                # 通用工具
│   │   │   ├── circuit-breaker.ts # 熔断器
│   │   │   ├── rate-limiter.ts # 限流中间件
│   │   │   ├── redis.ts        # Redis 客户端（含降级）
│   │   │   ├── logger.ts       # 日志
│   │   │   ├── config.ts       # 配置管理
│   │   │   └── s3.ts           # 文件存储
│   │   └── db/                 # Drizzle ORM（Schema + Client）
│   ├── lib/                    # 前端共享库
│   └── types/                  # TypeScript 类型定义
├── data_service/               # Python 数据服务（FastAPI）
│   ├── main.py                 # 服务入口
│   ├── config.py               # 配置管理
│   └── providers/              # 数据源适配器
├── drizzle/                    # Drizzle ORM 迁移文件
├── scripts/                    # 辅助脚本
├── tests/                      # 测试代码
├── config/                     # 配置文件
├── docs/                       # 项目文档
└── docker-compose.yml          # Docker 编排
```

详细目录结构请参考 [docs/project_structure.md](docs/project_structure.md)。

---

## 环境要求

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Node.js | 18+ | 前端 + API 服务 |
| Python | 3.10+ | 数据服务（conda 虚拟环境 `agent`） |
| Docker | 最新稳定版 | 容器化部署 |
| PostgreSQL | 14+ | 需安装 pgvector 扩展 |
| Neo4j | 5+ | 知识图谱存储 |
| Redis | 7+ | 缓存 + 会话存储（可选，有内存降级方案） |

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
```

### 5. 启动 Docker 容器

```bash
docker compose up -d
```

### 6. 初始化数据库

```bash
npx drizzle-kit push
```

### 7. 启动数据服务

```bash
conda activate agent
python -m data_service.main
```

数据服务默认运行在 `http://localhost:8001`。

### 8. 启动 Next.js

```bash
npm run dev
```

### 9. 访问应用

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

---

## API 文档

### Next.js API 路由

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth/*` | GET/POST | NextAuth v5 认证相关（登录、注册、会话） |
| `/api/agent/run` | POST | Agent 查询执行（支持多轮对话、自适应检索） |
| `/api/document/upload` | POST | 文档上传（PDF 解析、切片、向量化、图谱构建） |
| `/api/rag/search` | POST | RAG 混合检索（向量 + BM25 + GraphRAG + 重排序） |
| `/api/rag/answer-with-citation` | POST | 带引用标注的答案生成 |
| `/api/evaluation/results` | GET | 获取评估结果指标 |
| `/api/graph/build` | POST | 手动触发知识图谱构建 |
| `/api/health` | GET | 健康检查（数据库 + Embedding 服务 + LLM 服务） |
| `/api/mcp/sse` | GET/POST | MCP Server 端点（工具列表 + 工具调用） |

### Agent API 请求格式

```json
{
  "query": "分析贵州茅台的技术指标",
  "maxIterations": 5,
  "conversationId": "可选，传入已有会话ID以继续对话"
}
```

### Agent API 响应格式

```json
{
  "success": true,
  "answer": "回答内容",
  "iterations": 3,
  "conversationId": "会话ID，下次请求传入以继续对话"
}
```

### Python 数据服务 API（localhost:8001）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/market/history` | POST | 历史行情 |
| `/api/market/realtime` | POST | 实时行情 |
| `/api/market/financial` | POST | 财务数据 |
| `/api/market/index` | POST | 指数数据 |
| `/health` | GET | 健康检查 |

---

## 核心特性

### Agent 记忆系统

| 层级 | 机制 | 存储 | 说明 |
|------|------|------|------|
| 工作记忆 | 请求内 messages 数组 | 内存 | 单轮 ReAct 循环内的上下文传递 |
| 短期记忆 | Conversation/Message 模型 | PostgreSQL | 多轮对话上下文保持，滑动窗口 + token 截断 |
| 长期记忆 | 对话摘要 + 语义召回 | pgvector | 跨会话记忆（P2 规划中） |

### 知识生命周期管理

| 机制 | 说明 |
|------|------|
| 知识过期 | Document.validUntil 字段，检索时自动过滤过期文档 |
| 知识版本 | Document.version + contentHash，增量更新时检测内容变化 |
| 知识清理 | cleanExpiredDocuments() 定期清理过期文档及其 embedding |
| 文档类型 | research_report(90天)、financial_report(365天)、regulation(永不过期)、general(180天) |
| CDC 同步 | 文档更新时自动同步 Embedding + Neo4j 图谱 + BM25 索引 |

### Agent 稳定性保障

| 措施 | 实现 | 说明 |
|------|------|------|
| 确定性输出 | temperature=0 + seed=42 | 相同输入产生相同输出 |
| 指数退避重试 | 1s → 2s → 4s | 避免服务不可用时雪崩 |
| 熔断器 | CircuitBreaker | 连续3次失败后熔断，30秒后半开试探 |
| 模型降级链 | qwen-max → qwen-plus → qwen-turbo | 主模型不可用时自动降级 |
| LLM 缓存 | MemoryCache | temperature=0 时启用，TTL 30分钟 |
| 限流 | RateLimiter | 每IP每分钟20次请求 |
| 整体超时 | 120秒 | Agent 执行超时强制终止 |
| 健康检查 | /api/health | 检测数据库、Embedding服务、LLM服务 |
| 降级策略 | 多级降级 | Reranker失败→原始排序，图谱失败→跳过，Redis不可用→内存缓存 |

### MCP Server

MCP Server 通过 `/api/mcp/sse` 端点暴露工具能力：

| 工具 | 说明 |
|------|------|
| hybrid_search | RAG 混合检索 |
| calculate_ma | 移动平均线计算 |
| calculate_rsi | RSI 指标计算 |
| check_trade_compliance | A股交易合规检查 |
| calculate_var | VaR 在险价值计算 |
| get_market_data | A股行情数据获取 |

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

## 测试

```bash
# Day 2 测试：百炼模型调用 + Agent 工具 + ReAct Agent
python tests/test_day2.py

# Day 3-6 测试：RAG 管道（检索、图谱、重排、多模态）
python tests/test_day3_4_5_6.py

# Day 7-8 测试：增量索引 + 评估体系
python tests/test_day7_8.py
```

---

## P2 未来升级方向

| 方向 | 说明 | 业务驱动 |
|------|------|----------|
| 长期记忆 | 对话摘要 + pgvector 语义召回 + 用户偏好持久化 | 跨会话"你还记得我上次问的XX吗"场景 |
| 知识冲突检测 | Neo4j 关系边增加时间戳/置信度，检索时检测矛盾 | 多源信息矛盾时的用户提醒 |
| MCP Client | 连接外部 MCP Server，动态发现和调用远程工具 | DeepWiki 等外部能力标准化接入 |
| A2A WebSocket | 实时双向通信 | 行情告警、实时风控通知等推送场景 |
| 结构化日志 | Pino + Correlation ID + 日志级别管理 | 生产环境排错和请求链路追踪 |
| 监控指标 | Prometheus + OpenTelemetry | 长期运维和性能趋势分析 |
| 输出结构化验证 | Zod schema 对 Agent 输入/输出进行运行时校验 | 防止 LLM 返回格式错误导致下游崩溃 |
| 优雅关闭 | process signal handler | 进程重启时保证进行中请求完成 |

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
npm install redis
```

> Redis 客户端使用动态 `import("redis")`，未安装时自动降级为内存缓存，不影响核心功能。

---

## License

MIT
