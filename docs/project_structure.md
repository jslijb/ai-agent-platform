# 项目目录结构

```
ai-agent-platform/
├── .env.local                     # 环境变量（数据库、API密钥）
├── .cursorrules                   # AI 编程工具规则文件
├── docker-compose.yml             # PostgreSQL + Neo4j + Redis
├── Dockerfile                     # 生产环境镜像
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── prisma/
│   ├── schema.prisma              # 数据库模型（User, Document, AgentTask, GraphTriple...）
│   └── migrations/
├── public/                        # 静态资源
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── trpc/[trpc]/route.ts
│   │   │   ├── agent/run/route.ts          # Agent 执行入口（SSE流式）
│   │   │   ├── graph/build/route.ts        # 构建知识图谱
│   │   │   └── mcp/sse/route.ts            # MCP Server SSE端点
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx                    # 主控制台
│   │   ├── chat/
│   │   │   └── page.tsx                    # 对话界面（Agent交互）
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── server/                     # 服务端核心逻辑（不经过API路由）
│   │   ├── trpc/
│   │   │   ├── context.ts          # tRPC 上下文（含用户session）
│   │   │   ├── router.ts           # 根路由汇总
│   │   │   └── routers/
│   │   │       ├── user.ts
│   │   │       ├── document.ts
│   │   │       └── agent.ts
│   │   ├── agents/                 # 多Agent核心
│   │   │   ├── base.ts             # 基础Agent类
│   │   │   ├── researcher.ts       # 研究员Agent（GraphRAG）
│   │   │   ├── quant.ts            # 量化分析师Agent
│   │   │   ├── compliance.ts       # 合规官Agent
│   │   │   ├── orchestrator.ts     # 主控Agent（LangGraph编排）
│   │   │   └── a2a/                # Agent-to-Agent通信
│   │   │       ├── protocol.ts     # 消息类型定义
│   │   │       └── websocket.ts    # WebSocket服务端（可选）
│   │   ├── graph/                  # 图数据库操作
│   │   │   ├── neo4j.ts            # Neo4j驱动封装
│   │   │   ├── graphrag.ts         # GraphRAG检索器
│   │   │   └── builder.ts          # 从文本构建图谱
│   │   ├── mcp/                    # MCP Server实现
│   │   │   ├── server.ts           # MCP服务器主逻辑
│   │   │   └── tools/              # 具体工具实现
│   │   │       ├── sql.ts
│   │   │       ├── graph_query.ts
│   │   │       ├── calculator.ts
│   │   │       └── web_search.ts
│   │   ├── llm/                    # 大模型调用层（模型无关）
│   │   │   ├── router.ts           # 模型路由（阿里百炼多模型）
│   │   │   ├── cache.ts            # Redis语义缓存
│   │   │   └── providers/          # 各模型适配器
│   │   │       ├── bailian.ts
│   │   │       └── local.ts        # 预留本地模型
│   │   ├── lib/                    # 通用工具
│   │   │   ├── redis.ts
│   │   │   ├── s3.ts               # 文件存储（可选）
│   │   │   └── logger.ts
│   │   └── db/                     # Prisma客户端单例
│   │       └── client.ts
│   ├── lib/                        # 前端共享库
│   │   ├── trpc/
│   │   │   └── client.ts           # tRPC客户端
│   │   └── utils.ts
│   └── types/                      # 全局类型定义
│       ├── agent.ts
│       └── graph.ts
└── scripts/                        # 辅助脚本
    ├── warmup-model.ts             # 预热本地模型
    └── seed-graph.ts               # 示例图谱数据导入
```

## 目录说明

| 目录/文件 | 说明 |
|---|---|
| `prisma/` | Prisma ORM 数据库模型和迁移文件 |
| `src/app/` | Next.js App Router 页面和 API 路由 |
| `src/app/api/` | 后端 API 端点（认证、Agent、RAG、文档等） |
| `src/app/(auth)/` | 认证相关页面（登录、注册） |
| `src/app/dashboard/` | 主控制台和评估面板 |
| `src/app/chat/` | Agent 对话交互界面 |
| `src/server/agents/` | 多 Agent 核心实现（ReAct、反思、编排等） |
| `src/server/graph/` | Neo4j 图数据库操作和 GraphRAG |
| `src/server/mcp/` | MCP Server 和金融工具集 |
| `src/server/llm/` | 大模型调用层（阿里百炼、本地模型） |
| `src/server/rag/` | RAG 管道（切片、检索、重排、溯源等） |
| `src/server/lib/` | 通用工具（Redis、S3、日志等） |
| `src/server/db/` | Prisma 客户端单例 |
| `src/lib/` | 前端共享库（tRPC 客户端、工具函数） |
| `src/types/` | 全局 TypeScript 类型定义 |
| `scripts/` | 辅助脚本（模型预热、图谱种子数据等） |
| `data_service/` | Python 数据服务（Baostock、mootdx 等数据源） |
| `tests/` | 测试代码和测试报告 |
| `config/` | 配置文件（API Keys 等） |
| `docs/` | 项目文档（开发计划、架构说明等） |
