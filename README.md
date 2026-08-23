# AI Agent Platform（金融行业智能体平台）

基于 Next.js 14 + FastAPI 微服务架构的金融行业 AI 智能体平台。用户通过自然语言提问，Agent 自主调用工具获取行情数据、计算技术指标、检索研报文档、检查合规性，最终给出有数据支撑的分析结论。

> **评估基线**: V13-r6 综合 0.9153 | **测试覆盖**: 837 通过 | **容器化**: Docker Compose 一键部署

---

## 核心特性

- **ReAct Agent**：迭代推理循环（最多5轮），自主决定调用工具还是直接回答，反思机制防止幻觉
- **LangGraph 编排**：3 种模式（单 Agent / 多 Agent 路由 / Supervisor），合规节点自动拒绝
- **6个合并工具**：21→6 工具合并，token 减少 60%，合并工具自动获取数据+计算
- **MCP Server**：6 核心工具（hybrid_search / technical_analysis / risk_analysis / compliance_check / market_data / graph_query）+ 6 内置工具，标准 MCP 协议对外暴露
- **CRM/OA 集成**：Odoo OA（10 工具）+ Twenty CRM（9 工具）+ SaaS 备选（3 工具），MCP Tool 注册
- **多端机器人**：飞书 / 钉钉 / 企微 / 微信小程序 4 平台适配器，YAML 配置 + 环境变量优先
- **两阶段 RAG**：粗排（pgvector 稠密 + BM25 稀疏 → RRF 融合）→ 精排（bge-reranker）→ 图谱补充（Neo4j，3237 节点 / 4752 关系）
- **语义缓存**：Redis 精确匹配 + pgvector 语义匹配（0.95 阈值），LLM 调用减少 40%
- **合规护栏**：三级意图分类（Unsafe/Controversial/Factual）+ Harness 规则引擎，拦截日志保存5年
- **统一拒绝话语**：合规拒绝 / 库外拒绝两种规范话术，Agent + 评估器共享识别模式
- **4层记忆**：L1 对话 / L2 摘要 / L3 片段 / L4 画像，金融数值保留原始精度
- **三层错误恢复**：Checkpoint+Resume / LLM 降级链 / 工具验证重试
- **上下文压缩**：对话 >20 条时 LLM 生成结构化摘要，降级为正则提取
- **流式输出**：SSE 实时推送 Agent 推理过程，前端 StepCard 展示每步耗时
- **API Gateway**：灰度发布 + Canary 路由 + 限流熔断
- **可观测性**：LangSmith 追踪 + Prometheus + Grafana 监控

---

## 技术栈

| 层级 | 技术 | 选择理由 |
|------|------|---------|
| **前端** | Next.js 14 (App Router) | SSR+SSG 混合渲染，API Routes 同构，TypeScript 全栈统一 |
| **后端** | Next.js API Routes + FastAPI | Next.js 处理 Agent 逻辑（TypeScript 生态），FastAPI 处理数据服务（Python 生态，pandas/numpy 金融计算） |
| **数据库** | PostgreSQL 16 + pgvector | 关系数据 + 向量检索统一，pgvector HNSW 索引支持高效相似度搜索，避免引入独立向量库（Milvus/Qdrant） |
| **缓存** | Redis 7 | 限流滑动窗口、熔断器状态、LLM 缓存、语义缓存、Checkpoint 存储，一库五用 |
| **向量嵌入** | BGE-M3（本地部署） | 多语言支持好，金融领域表现优，本地部署无 API 成本 |
| **重排序** | BGE-Reranker-v2-m3（本地部署） | 与 BGE-M3 配套，精排提升检索精度 |
| **知识图谱** | Neo4j 5 | 实体关系存储，路径查询补全向量检索盲区 |
| **LLM** | 阿里百炼 DashScope + AGNES | 降级链保证可用性，百炼为主力，AGNES 为备选 |
| **容器化** | Docker Compose + Nginx | 一键部署，nginx 统一入口，容器间网络隔离 |
| **认证** | NextAuth v5 (JWT) | 无服务端 session 存储，任何容器只需同一个 AUTH_SECRET 即可验证，适合容器化部署 |
| **ORM** | Drizzle ORM | TypeScript 原生，类型安全，轻量（比 Prisma 轻 10 倍） |
| **测试** | Vitest | TypeScript 原生测试框架，837 用例 |

---

## 项目架构

```
浏览器 → Nginx(80) → Main Service(3000)
                       ├── Next.js Frontend（聊天界面、Dashboard）
                       ├── Agent Engine（ReAct + LangGraph + 6 工具 + 合规护栏 + 4 层记忆）
                       ├── MCP Server（标准 MCP 协议，6 核心 + 6 内置工具）
                       ├── CRM/OA（Odoo 10 工具 + Twenty 9 工具 + SaaS 3 工具）
                       ├── 多端机器人（飞书/钉钉/企微/微信）
                       └── RAG Pipeline（混合检索 + 重排序 + 图谱）
                            ├── RAG Service(3001)    — 混合检索 BM25+向量
                            ├── Data Service(8001)   — 金融数据 Tushare
                            ├── Embedding(8011)      — BGE-M3 向量嵌入
                            ├── Reranker(8010)       — BGE-Reranker 精排
                            ├── PostgreSQL(5432)     — 数据库 + pgvector（语义缓存）
                            ├── Redis(6379)          — 缓存 + 限流 + 熔断 + 语义缓存 + Checkpoint
                            ├── Neo4j(7687)          — 知识图谱（3237 节点 / 4752 关系）
                            ├── Odoo(8069)           — OA 审批 + CRM（可选）
                            └── Twenty(3003)         — CRM（可选）
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
│   │   ├── api/                # API 路由（auth/agent/rag/mcp/conversations）
│   │   ├── chat/               # 对话界面
│   │   └── dashboard/          # 控制台（文档/评估/日志/记忆）
│   ├── server/                 # 服务端核心逻辑
│   │   ├── agents/             # Agent（ReAct + LangGraph + Skill + Memory + Checkpoint + Refusal）
│   │   ├── mcp/                # MCP Server（SSE 传输 + 协议 + 12 工具）
│   │   ├── bots/               # 多端机器人（飞书/钉钉/企微/微信 适配器）
│   │   ├── crm-oa/             # CRM/OA 集成（Odoo/Twenty/SaaS 适配器 + 工具）
│   │   ├── rag/                # RAG 管道（检索/重排序/图谱/查询优化/切片）
│   │   ├── llm/                # LLM 调用（降级链 + 熔断器 + 语义缓存）
│   │   ├── gateway/            # API Gateway（灰度 + Canary + 限流熔断）
│   │   ├── guardrails/         # 合规护栏（Harness 规则引擎 + 安全审计）
│   │   ├── lib/                # 通用工具（熔断器/限流/Redis）
│   │   ├── db/                 # Drizzle ORM（Schema + 客户端）
│   │   └── evaluation/         # 评估器（RAG 4维度 + Agent 5维度）
│   └── components/             # 前端组件
├── data_service/               # Python 数据服务（FastAPI）
├── scripts/                    # 运维/工具脚本（含 E2E 回归 + 图谱重建）
├── docs/                       # 项目文档（三类目录：需求/技术/规范）
├── config/                     # 配置文件（api_keys.yaml + bot-config.yaml）
└── docker-compose.yml          # Docker 编排（nginx + 7 服务 + 2 可选）
```

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求清单 | `docs/1-requirements-bugs/REQUIREMENTS.md` | R001-R028 全局需求跟踪 |
| 踩坑记录 | `docs/1-requirements-bugs/` | 按日期归档（含 V3.0 踩坑） |
| 技术全景+面试 | `docs/2-tech-interview/agent-tech-and-interview.md` | 18 项技术 + 5 决策对比 + 14 问答 |
| Vibe Coding 复盘 | `docs/2-tech-interview/vibe-coding-retrospective.md` | 8 优势 + 10 不足 + 效率模型 |
| 功能代码索引 | `docs/2-tech-interview/CODE_INDEX.md` | 每个功能的 WHAT/WHY/WHERE/HOW |
| 项目全景 | `docs/2-tech-interview/PROJECT_OVERVIEW.md` | 技术栈 + 架构图 + 设计决策 |
| ADR 决策记录 | `docs/2-tech-interview/adr/` | 11 份技术决策记录 |
| SDD 规格/设计/任务 | `docs/3-standards/` | spec.md / design.md / task.md |
| 多实体检索调研 | `docs/1-requirements-bugs/multi-entity-parallel-retrieval-research.md` | R003 跨公司对比方案 |
