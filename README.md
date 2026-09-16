# AI Agent Platform（金融行业智能体平台）

基于 Next.js 14 + FastAPI 微服务架构的金融行业 AI 智能体平台。用户通过自然语言提问，Agent 自主调用工具获取行情数据、计算技术指标、检索研报文档、检查合规性，最终给出有数据支撑的分析结论。

## 📊 RAG 评估成绩（严格口径，可追溯）

> **诚实声明**：当前分数由**自研 LLM-as-judge** 体系评出。官方 RAGAS 库对同一批数据打分 **0.3205**，与自研 0.9153 差 2.86 倍——差距主要来自自研体系容错偏宽松、缺少答案正确性一票否决。**正在按下面的 roadmap 打实成绩，以下所有报告与数据集已入库可复核。**

| 轮次 | 评估器 | Judge 模型 | 样本 | 综合分 | 报告 |
|------|--------|-----------|------|--------|------|
| V13-r6 | 自研 | agnes-2.5-flash | 55 | 0.9153 | [ragas-report-v13-selfimpl-r6.json](tests/reports/evaluation/ragas-report-v13-selfimpl-r6.json) |
| V16 | 自研 | qwen3.8-flash（中途降级 sensenova） | 55 | 0.8386 | [ragas-report-v16-selfimpl-r1.json](tests/reports/evaluation/ragas-report-v16-selfimpl-r1.json) |
| 同数据基准 | **官方 RAGAS** | — | 55 | **0.3205** | 详见 [evaluation-improvement-plan.md](docs/1-requirements-bugs/evaluation-improvement-plan.md) |

**成绩构成**（V13-r6）：忠实度 1.000 / 答案相关性 0.994 / 上下文精确率 0.969 / 数值准确率 0.879 / 上下文召回率 0.705（该项 FAIL，被加权平均掩盖——这就是要修的短板机制）

**打实成绩 roadmap**（进行中）：
- P0：新增 AC（答案正确性）指标，直接比对 answer vs ground_truth，金融数值题一票否决
- P0：overall 短板机制——任一指标 FAIL 时综合分封顶，杜绝灾难样本被平均掉
- P1：30 条人工标注 golden 校准集，judge 与人工一致率 <85% 即换 judge；judge 换非同源模型
- P1：考卷扩到 100+（多跳 / 跨文档 / 干扰项 / 拒答），L1 抄书题降至 30% 以下
- 已知问题：L1-002（中国铁建营收，答案错 1000 倍仍得 CP/F/AR 三满分）已定位为体系性漏洞的实证

**测试覆盖**: 837 单测通过 | **容器化**: Docker Compose 一键部署

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

**架构图**（微服务拓扑 / 多实例容错 / Docker Compose 部署三段）：

![项目架构图](docs/assets/architecture-diagram.png)

---

## 系统截图

**① 复杂查询 · ReAct 多轮工具调用** —— 问「五粮液和格力电器的相关系数是多少？如果同时持有这两只股票各 50 万，压力测试结果如何？」。Agent 自主编排 `getStockHistory` → `calculateCorrelation`，2 轮迭代 8 个步骤，给出相关系数 0.6373 与四档压力测试下的组合损失估算；每一步的工具入参、原始返回都能在「执行过程」里展开核对。

![复杂查询的 ReAct 执行链路](docs/assets/screenshots/complex-query-trace.png)

**② 数据缺失不编造** —— 问「格力电器 2025 年报利润表各项」。数据接口只返回了营业收入 / 归母净利润 / 毛利率 / 每股收益，Agent 直接指明**缺**营业总成本、营业利润、利润总额，并提示「归母净利润 ≠ 净利润」，不补造数字，只给能算的指标（净利率 16.95%）。

![数据缺失时如实说明](docs/assets/screenshots/answer-no-hallucination.png)

**③ Agent 运行评估** —— 成功率 / 平均迭代轮次 / 平均响应时间，按模型拆分调用量与 Token 消耗；失败请求保留原始错误（百炼 403 限流连试 2 次、timeout、fetch failed），便于区分是上游限流还是自身链路问题。

![Agent 运行评估看板](docs/assets/screenshots/agent-evaluation.png)

**④ Token 用量监控** —— 总调用次数、总 Token 消耗，以及各模型用量明细与性能指标。

![Token 用量监控](docs/assets/screenshots/token-usage.png)

---

## 快速开始

### 1. 前置依赖

| 依赖 | 版本要求 | 用途 |
|------|---------|------|
| Docker Desktop | ≥ 4.30（Compose v2） | 一键启动全部服务 |
| Node.js | ≥ 20 | 本地开发 / 运行测试（容器内无需） |
| Python | ≥ 3.11（含 reportlab/paddleocr 环境） | 数据服务 / 评测脚本（容器内无需） |
| LLM API Key | 阿里百炼 DashScope（必填）、AGNES（可选兜底） | Agent 与 RAG 的模型调用 |

### 2. 配置环境变量

```bash
# ① 容器基础配置（端口 / 数据库密码 / 模型路径），已带默认值，按需修改
cp .env.docker .env

# ② 应用密钥配置（挂载进 main service 容器）
cp .env.example .env.local
```

`.env.local` 必填项：

```bash
# LLM API Key（config/api_keys.yaml 中 key 字段填的是环境变量名，运行时从 .env.local 解析）
DASHSCOPE_API_KEY2=sk-xxxx          # 阿里百炼主力 key
AGNES_KEY=agnes-xxxx                # 兜底模型 key（可选）
# 数据源 key（可选，仅使用 Tushare 数据源时需要；代码直接读该环境变量）
TUSHARE_TOKEN=xxxx
AUTH_SECRET=<openssl rand -hex 32 生成>
AUTH_URL=http://localhost
DATABASE_URL=postgresql://aiagent:aiagent_secret@postgres:5432/agentdb
```

> 密钥一律只写在 `.env.local`（已在 `.gitignore` 排除）：源码与 `config/api_keys.yaml` 里只出现变量名，不写真实值。

### 3. 放置本地模型文件

嵌入 / 重排序模型本地部署（无 API 成本），下载后放到 `MODEL_BASE_PATH` 指向的目录（默认 `D:\models\modelscope\models`，服务器部署在 `.env` 中改为 Linux 路径）：

| 模型 | 文件 | 用途 |
|------|------|------|
| BGE-M3 | `bge-m3-q8_0.gguf` | 向量嵌入 |
| BGE-Reranker-v2-m3 | `bge-reranker-v2-m3-Q8_0.gguf` | 精排 |

### 4. 启动与验证

```bash
docker compose up -d        # nginx + main + rag + data + embedding + reranker + postgres + redis + neo4j
docker compose ps           # 全部 Up 且 healthy 即启动成功
```

打开浏览器访问 http://localhost ，注册账号后即可使用。

### 5. 使用示例

登录后在对话页直接用自然语言提问，Agent 会自主选择工具（SQL 查询 / 行情接口 / 文档检索 / 技术指标 / 合规检查）：

```text
中国铁建 2025 年年报营业收入是多少？     → 命中指标词典 → 模板 SQL → 返回数值 + 引用
对比贵州茅台和五粮液最近 5 个季度毛利率   → 跨公司并行检索 → 多实体对比回答
帮我看看现在能不能买入 600519，风险点在哪 → 技术指标 + 合规护栏（不构成投资建议）
```

### 6. 运行测试

项目使用 **pnpm** 管理依赖（`pnpm-lock.yaml` 为唯一 lockfile，CI 用 `pnpm install --frozen-lockfile`）：

```bash
pnpm install               # 安装依赖（Node ≥ 20）
pnpm test                  # Vitest 全量 837 用例
pnpm run test:ci           # CI 模式（排除 contract/integration）
```

### 7. 评估复现

RAG 评测报告与数据集在 `tests/reports/evaluation/`（已入库，见顶部成绩表）。复现评测：

```bash
python scripts/unified_evaluation.py --input tests/reports/evaluation/ragas-eval-data-v13-r6.json --skip-llm   # 仅性能/数值准确率，0 LLM 调用
python scripts/unified_evaluation.py --input tests/reports/evaluation/ragas-eval-data-v13-r6.json              # 全量（消耗 LLM token）
```

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
├── docs/                       # 项目文档（需求/技术/规范/踩坑/版本快照）
├── config/                     # 配置文件（api_keys.yaml + bot-config.yaml）
└── docker-compose.yml          # Docker 编排（nginx + 7 服务 + 2 可选）
```

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求清单 | `docs/1-requirements-bugs/REQUIREMENTS.md` | R001-R028 全局需求跟踪 |
| 踩坑记录 | `docs/pitfalls/` | 按日期归档（9 份，含 V3.0 踩坑） |
| 功能代码索引 | `docs/CODE_INDEX.md` | 每个功能的 WHAT/WHY/WHERE/HOW |
| 项目全景 | `docs/PROJECT_OVERVIEW.md` | 技术栈 + 架构图 + 设计决策 |
| 项目状态卡 | `docs/PROJECT_STATE.md` | 评估基线 + 迭代历史 |
| 架构演进 | `docs/ARCHITECTURE_EVOLUTION.md` | 架构变更历史 |
| 测试与评估 | `docs/TESTING_AND_EVALUATION.md` | 测试策略 + 评估方法 |
| 升级路线图 | `docs/UPGRADE_ROADMAP.md` | 后续升级项 |
| ADR 决策记录 | `docs/adr/` | 11 份技术决策记录 |
| SDD 规格/设计/任务 | `docs/3-standards/` | spec.md / design.md / task.md |
| 多实体检索调研 | `docs/1-requirements-bugs/multi-entity-parallel-retrieval-research.md` | R003 跨公司对比方案 |

---

## License

[MIT](LICENSE)
