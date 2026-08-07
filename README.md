# AI Agent Platform（金融行业智能体平台）

基于 Next.js 14 + FastAPI 微服务架构的金融行业 AI 智能体平台。用户通过自然语言提问，Agent 自主调用工具获取行情数据、计算技术指标、检索研报文档、检查合规性，最终给出有数据支撑的分析结论。

> **评估基线**: V13-r6 综合 0.9153 | **测试覆盖**: 375 通过 | **容器化**: Docker Compose 一键部署

---

## 核心特性

- **ReAct Agent**：迭代推理循环（最多5轮），自主决定调用工具还是直接回答，反思机制防止幻觉
- **6个合并工具**：21→6 工具合并，token 减少 60%，合并工具自动获取数据+计算
- **两阶段 RAG**：粗排（pgvector 稠密 + BM25 稀疏 → RRF 融合）→ 精排（bge-reranker）→ 图谱补充（Neo4j）
- **合规护栏**：三级意图分类（Unsafe/Controversial/Factual），拦截日志保存5年
- **4层记忆**：L1 对话 / L2 摘要 / L3 片段 / L4 画像，金融数值保留原始精度
- **三层错误恢复**：Checkpoint+Resume / LLM 降级链 / 工具验证重试
- **上下文压缩**：对话 >20 条时 LLM 生成结构化摘要，降级为正则提取
- **流式输出**：SSE 实时推送 Agent 推理过程，前端 StepCard 展示每步耗时

---

## 技术栈

| 层级 | 技术 | 选择理由 |
|------|------|---------|
| **前端** | Next.js 14 (App Router) | SSR+SSG 混合渲染，API Routes 同构，TypeScript 全栈统一 |
| **后端** | Next.js API Routes + FastAPI | Next.js 处理 Agent 逻辑（TypeScript 生态），FastAPI 处理数据服务（Python 生态，pandas/numpy 金融计算） |
| **数据库** | PostgreSQL 16 + pgvector | 关系数据 + 向量检索统一，pgvector HNSW 索引支持高效相似度搜索，避免引入独立向量库（Milvus/Qdrant） |
| **缓存** | Redis 7 | 限流滑动窗口、熔断器状态、LLM 缓存、Checkpoint 存储，一库四用 |
| **向量嵌入** | BGE-M3（本地部署） | 多语言支持好，金融领域表现优，本地部署无 API 成本 |
| **重排序** | BGE-Reranker-v2-m3（本地部署） | 与 BGE-M3 配套，精排提升检索精度 |
| **知识图谱** | Neo4j 5 | 实体关系存储，路径查询补全向量检索盲区 |
| **LLM** | 阿里百炼 DashScope + AGNES | 降级链保证可用性，百炼为主力，AGNES 为备选 |
| **容器化** | Docker Compose + Nginx | 一键部署，nginx 统一入口，容器间网络隔离 |
| **认证** | NextAuth v5 (JWT) | 无服务端 session 存储，任何容器只需同一个 AUTH_SECRET 即可验证，适合容器化部署 |
| **ORM** | Drizzle ORM | TypeScript 原生，类型安全，轻量（比 Prisma 轻 10 倍） |
| **测试** | Vitest | TypeScript 原生测试框架，375 用例 |

---

## 项目架构

```
浏览器 → Nginx(80) → Main Service(3000)
                       ├── Next.js Frontend（聊天界面、Dashboard）
                       ├── Agent Engine（ReAct 循环 + 6 工具 + 合规护栏 + 4 层记忆）
                       └── RAG Pipeline（混合检索 + 重排序 + 图谱）
                            ├── RAG Service(3001)    — 混合检索 BM25+向量
                            ├── Data Service(8001)   — 金融数据 Tushare
                            ├── Embedding(8011)      — BGE-M3 向量嵌入
                            ├── Reranker(8010)       — BGE-Reranker 精排
                            ├── PostgreSQL(5432)     — 数据库 + pgvector
                            ├── Redis(6379)          — 缓存 + 限流 + 熔断 + Checkpoint
                            └── Neo4j(7687)          — 知识图谱
```

---

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd ai-agent-platform
```

### 2. 启动 Docker 容器

```bash
# 确保 Docker Desktop 运行
docker compose up -d
```

### 3. 访问应用

打开浏览器访问 http://localhost，注册账号后即可使用。

---

## 目录结构

```
ai-agent-platform/
├── src/
│   ├── app/                    # Next.js App Router（页面 + API）
│   │   ├── api/                # API 路由（auth/agent/rag/document/conversations）
│   │   ├── chat/               # 对话界面
│   │   └── dashboard/          # 控制台（文档/评估/日志/记忆）
│   ├── server/                 # 服务端核心逻辑
│   │   ├── agents/             # Agent（ReAct + 反思 + Skill + Memory + Checkpoint）
│   │   ├── rag/                # RAG 管道（检索/重排序/图谱/查询优化/切片）
│   │   ├── llm/                # LLM 调用（降级链 + 熔断器 + 缓存）
│   │   ├── lib/                # 通用工具（熔断器/限流/Redis）
│   │   ├── db/                 # Drizzle ORM（Schema + 客户端）
│   │   └── evaluation/         # 评估器（RAG 4维度 + Agent 5维度）
│   └── components/             # 前端组件
├── data_service/               # Python 数据服务（FastAPI）
├── scripts/                    # 运维/工具脚本
├── docs/                       # 项目文档
├── config/                     # 配置文件（api_keys.yaml）
└── docker-compose.yml          # Docker 编排
```

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [功能代码索引](docs/CODE_INDEX.md) | 每个功能的 WHAT/WHY/WHERE/HOW，无需搜索代码库 |
| [项目全景文档](docs/PROJECT_OVERVIEW.md) | 技术栈选择理由 + 架构图 + 项目优点 + 设计决策 |
| [Agent 技术审计](docs/agent-technology-audit.md) | 18 项 Agent 技术详解 + 面试话术 |
| [测试与评估](docs/TESTING_AND_EVALUATION.md) | 测试策略 + RAGAS 评估 |
| [评估可靠性调研](docs/evaluation-reliability-research.md) | 评估可靠性专题 |
| [踩坑记录](docs/pitfalls/) | 按日期归档的踩坑 |
