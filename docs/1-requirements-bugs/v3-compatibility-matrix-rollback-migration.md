# V3.0 兼容性矩阵 + 回滚方案 + 数据迁移方案

> **需求编号**：R026-c（兼容性矩阵）、R026-d（回滚方案）、R026-e（数据迁移方案）
> **编写日期**：2026-08-13
> **基线版本**：V14（内部）/ V2.x（对外 SemVer）
> **目标版本**：V15（内部）/ V3.0.0（对外 SemVer）
> **关联文档**：`v3-upgrade-research-report.md`、`spec.md`（R026）、`design.md`

---

## 目录

1. [兼容性矩阵（R026-c）](#一兼容性矩阵r026-c)
2. [回滚方案（R026-d）](#二回滚方案r026-d)
3. [数据迁移方案（R026-e）](#三数据迁移方案r026-e)

---

## 一、兼容性矩阵（R026-c）

### 1.1 当前系统组件清单（V14）

| 组件 | 版本/规格 | 端口 | 容器名 | 数据存储 |
|------|----------|------|--------|---------|
| 前端 | Next.js 14 App Router + TypeScript | 3000（容器内） | aiagent_main_service | - |
| 主服务 | Node.js/Express（含 Next.js SSR） | 3000→映射3005 | aiagent_main_service | PostgreSQL + Redis + Neo4j |
| RAG 服务 | FastAPI（Python） | 3001 | aiagent_rag_service | PostgreSQL + Redis |
| 数据服务 | FastAPI（Python，PaddleOCR） | 8001 | aiagent_data_service | - |
| 评估服务 | Node.js | 3003 | aiagent_evaluation_service | PostgreSQL + Redis |
| PostgreSQL | pg16 + pgvector | 5432 | aiagent_postgres | postgres_data volume |
| Redis | 7-alpine | 6379 | aiagent_redis | redis_data volume |
| Neo4j | 5 + APOC | 7474/7687 | aiagent_neo4j | neo4j_data volume |
| Embedding | llama.cpp server + bge-m3 | 8011 | aiagent_embedding | 模型文件挂载 |
| Reranker | llama.cpp server + bge-reranker-v2-m3 | 8010 | aiagent_reranker | 模型文件挂载 |
| Nginx | alpine | 80 | aiagent_nginx | 配置文件挂载 |
| Prometheus | v2.51.0 | 9090 | aiagent_prometheus | prometheus_data volume |
| Grafana | 10.4.0 | 3004 | aiagent_grafana | grafana_data volume |

**V14 数据库表清单**：

| Schema | 表名 | 用途 | 记录量级 |
|--------|------|------|---------|
| public | documents | 知识库文档 | 数百 |
| public | document_chunks | 文档切片（含 pgvector） | 数千 |
| public | conversations | 对话会话 | 数百 |
| public | messages | 对话消息 | 数千 |
| public | agent_logs | Agent 执行日志 | 数千 |
| public | evaluations | 评估记录 | 数十 |
| public | evaluation_results | 评估结果 | 数百 |
| public | financial_income | 利润表（标准化） | 数百 |
| public | financial_balancesheet | 资产负债表（标准化） | 数百 |
| public | financial_cashflow | 现金流量表（标准化） | 数百 |
| public | financial_indicators | 衍生指标 | 数百 |
| public | financial_raw_tables | 原始财报表格（jsonb） | 数百 |
| public | stock_mapping | 股票代码映射 | 数千 |
| public | indicator_aliases | 指标别名 | 数十 |
| public | semantic_cache | 语义缓存（pgvector） | 数百 |
| public | pg_cache | 精确匹配缓存 | 数百 |
| public | users | 用户表 | 个位数 |
| public | accounts | 账户表 | 个位数 |
| public | sessions | 会话表 | 个位数 |
| public | verification_tokens | 验证令牌 | 个位数 |
| Neo4j | Entity | 实体节点（多标签） | 数千 |
| Neo4j | Relation | 语义关系（有向） | 数千 |
| Redis | rate-limiter:* | 限流计数器 | 实时 |
| Redis | circuit-breaker:* | 熔断状态 | 实时 |
| Redis | llm-cache:* | LLM 精确匹配缓存 | 数百 |
| Redis | semantic-cache:* | 语义缓存索引 | 数百 |

### 1.2 V3.0 新增组件清单

| 组件 | 版本/规格 | 预计端口 | 内存占用 | 数据存储 | 对应需求 |
|------|----------|---------|---------|---------|---------|
| Odoo Community | 17+（Python） | 8069 | ~3GB | odoo_data volume + 独立 PostgreSQL schema | R022 |
| Twenty CRM | latest（TypeScript） | 3006 | ~2GB | twenty_data volume + 独立 PostgreSQL schema | R022 |
| MCP Server | Node.js | 3007 | ~256MB | PostgreSQL（mcp_tools 表） | R023 |
| LangSmith SDK | npm 包（无独立服务） | - | ~64MB | 外部 SaaS（可导出） | R023 |
| NeMo Guardrails | Python 包（嵌入 main-service） | - | ~128MB | 配置文件（.colang） | R023 |
| 飞书机器人 | Bot Adapter（嵌入 main-service） | - | ~32MB | Redis（bot:* 键空间） | R028 |
| 钉钉机器人 | Bot Adapter（嵌入 main-service） | - | ~32MB | Redis（bot:* 键空间） | R028 |
| Taro 4 小程序 | React/TS 编译产物 | - | - | 微信平台托管 | R024 |
| Capacitor App | WebView 包 Next.js | - | - | App Store/Google Play | R024 |
| 鸿蒙 App | ArkTS/ArkUI | - | - | 华为应用市场 | R024 |

### 1.3 全维度兼容性矩阵

#### 1.3.1 API 兼容性

| API 端点 | V14（v1） | V3.0（v1） | V3.0（v2） | 兼容策略 | Breaking? | 迁移成本 |
|----------|----------|-----------|-----------|---------|-----------|---------|
| POST /api/v1/chat | 对话（SSE 流式） | **不变** | 增强（含端类型/CRM 上下文） | v1 冻结，v2 新增 | No | 0 |
| GET /api/v1/history | 历史对话列表 | **不变** | 增强（含端类型/CRM 关联） | v1 返回格式 A，v2 返回格式 A+B | No | 0 |
| GET /api/v1/conversations/:id | 单个对话详情 | **不变** | 增强（含 Agent 步骤详情） | v1 冻结 | No | 0 |
| POST /api/v1/evaluate | 触发评估 | **不变** | 不变 | v1/v2 共用 | No | 0 |
| GET /api/v1/documents | 文档列表 | **不变** | 不变 | v1/v2 共用 | No | 0 |
| POST /api/v1/upload | 上传文档 | **不变** | 不变 | v1/v2 共用 | No | 0 |
| GET /api/v1/tools | 工具列表 | **不变** | 增强（含 MCP 工具） | v1 只返回内置工具，v2 返回全部 | No | 0 |
| GET /api/v1/health | 健康检查 | **不变** | 增强（含各子系统状态） | v1 返回简化，v2 返回详细 | No | 0 |
| POST /api/v2/chat | - | - | 新增：对话（含端类型标识） | 仅 v2 | N/A | 1人天 |
| GET /api/v2/crm/customers | - | - | 新增：CRM 客户列表 | 仅 v2 | N/A | 3人天 |
| POST /api/v2/crm/customers | - | - | 新增：创建 CRM 客户 | 仅 v2 | N/A | 3人天 |
| GET /api/v2/crm/opportunities | - | - | 新增：商机列表 | 仅 v2 | N/A | 2人天 |
| PATCH /api/v2/crm/opportunities/:id | - | - | 新增：更新商机阶段 | 仅 v2 | N/A | 2人天 |
| GET /api/v2/crm/contracts | - | - | 新增：合同列表 | 仅 v2 | N/A | 2人天 |
| GET /api/v2/oa/approvals | - | - | 新增：审批列表 | 仅 v2 | N/A | 2人天 |
| POST /api/v2/oa/approvals | - | - | 新增：提交审批 | 仅 v2 | N/A | 3人天 |
| PATCH /api/v2/oa/approvals/:id | - | - | 新增：审批操作（同意/拒绝） | 仅 v2 | N/A | 3人天 |
| GET /api/v2/oa/notifications | - | - | 新增：通知列表 | 仅 v2 | N/A | 1人天 |
| GET /api/v2/oa/schedule | - | - | 新增：日程查询 | 仅 v2 | N/A | 1人天 |
| GET /api/v2/mcp/tools | - | - | 新增：MCP 工具发现 | 仅 v2 | N/A | 2人天 |
| POST /api/v2/mcp/execute | - | - | 新增：MCP 工具执行 | 仅 v2 | N/A | 3人天 |
| GET /api/v2/bot/platforms | - | - | 新增：机器人平台列表 | 仅 v2 | N/A | 1人天 |
| POST /api/v2/bot/:platform/webhook | - | - | 新增：机器人 Webhook | 仅 v2 | N/A | 3人天 |
| GET /api/v2/user/mapping | - | - | 新增：用户身份映射 | 仅 v2 | N/A | 2人天 |
| GET /api/v2/features | - | - | 新增：Feature Flag 查询 | 仅 v2 | N/A | 1人天 |

**API 兼容性测试矩阵**：

| 测试场景 | v1 客户端 + v1 后端 | v1 客户端 + v2 后端 | v2 客户端 + v1 后端 | v2 客户端 + v2 后端 |
|----------|-------------------|-------------------|-------------------|-------------------|
| 基础对话 | ✅ 完全兼容 | ✅ v1 路径不变 | ✅ 降级到 v1 行为 | ✅ 完整功能 |
| CRM 操作 | N/A | N/A | ❌ v1 无此 API | ✅ |
| OA 审批 | N/A | N/A | ❌ v1 无此 API | ✅ |
| 历史对话 | ✅ 格式 A | ✅ v1 返回格式 A | ✅ 忽略新字段 | ✅ 格式 A+B |
| MCP 工具 | N/A | N/A | ❌ v1 无此 API | ✅ |
| 机器人对话 | N/A | N/A | ❌ v1 无此 API | ✅ |

#### 1.3.2 数据库 Schema 兼容性

| 表/列 | V14 状态 | V3.0 变更 | 兼容策略 | Breaking? | 回滚方式 |
|-------|---------|----------|---------|-----------|---------|
| documents | 只读 | 不变 | - | No | - |
| document_chunks | 只读 | 不变 | - | No | - |
| conversations | 读写 | ADD COLUMN client_type VARCHAR(20) DEFAULT 'web' | 新列有默认值 | No | DROP COLUMN |
| conversations | 读写 | ADD COLUMN platform VARCHAR(20) DEFAULT 'web' | 新列有默认值 | No | DROP COLUMN |
| messages | 读写 | ADD COLUMN metadata JSONB DEFAULT '{}' | 新列有默认值 | No | DROP COLUMN |
| users | 读写 | ADD COLUMN odoo_user_id VARCHAR(64) | 可为 NULL | No | DROP COLUMN |
| users | 读写 | ADD COLUMN twenty_user_id VARCHAR(64) | 可为 NULL | No | DROP COLUMN |
| users | 读写 | ADD COLUMN feishu_user_id VARCHAR(64) | 可为 NULL | No | DROP COLUMN |
| users | 读写 | ADD COLUMN dingtalk_user_id VARCHAR(64) | 可为 NULL | No | DROP COLUMN |
| agent_logs | 读写 | ADD COLUMN mcp_tool_calls JSONB | 可为 NULL | No | DROP COLUMN |
| agent_logs | 读写 | ADD COLUMN guardrail_actions JSONB | 可为 NULL | No | DROP COLUMN |
| **user_mapping**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **crm_customers**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **crm_opportunities**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **crm_contracts**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **crm_activities**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **oa_workflows**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **oa_approvals**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **oa_notifications**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **oa_schedule**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **mcp_tools**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **mcp_executions**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **bot_messages**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **feature_flags**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |
| **audit_logs**（新表） | 不存在 | CREATE TABLE | 独立新表 | No | DROP TABLE |

**关键原则**：
- **只增不删**：V3.0 不删除任何 V14 表和列
- **只扩不缩**：不修改任何现有列的类型/约束
- **默认值**：所有新增列必须有 DEFAULT 值，V14 代码读写不受影响
- **独立新表**：CRM/OA/MCP/Bot 相关数据使用独立新表，不与现有表混合

#### 1.3.3 前端路由兼容性

| 路由 | V14 | V3.0 | 兼容策略 | Breaking? |
|------|-----|------|---------|-----------|
| / | 首页/对话 | **不变** | - | No |
| /chat | 对话页 | **不变** | - | No |
| /documents | 文档管理 | **不变** | - | No |
| /evaluations | 评估管理 | **不变** | - | No |
| /settings | 设置 | **不变** | - | No |
| /crm | 不存在 | **新增**：CRM 仪表盘 | 独立新页面 | No |
| /crm/customers | 不存在 | **新增**：客户管理 | 独立新页面 | No |
| /crm/opportunities | 不存在 | **新增**：商机管理 | 独立新页面 | No |
| /crm/contracts | 不存在 | **新增**：合同管理 | 独立新页面 | No |
| /oa | 不存在 | **新增**：OA 仪表盘 | 独立新页面 | No |
| /oa/approvals | 不存在 | **新增**：审批中心 | 独立新页面 | No |
| /oa/notifications | 不存在 | **新增**：通知中心 | 独立新页面 | No |
| /oa/schedule | 不存在 | **新增**：日程管理 | 独立新页面 | No |
| /admin/features | 不存在 | **新增**：Feature Flag 管理 | 独立新页面 | No |
| /admin/audit | 不存在 | **新增**：审计日志 | 独立新页面 | No |

#### 1.3.4 Docker Compose 兼容性

| 服务 | V14 | V3.0 | 兼容策略 | Breaking? | 内存增量 |
|------|-----|------|---------|-----------|---------|
| postgres | pg16 + pgvector | **不变**（新增 schema/表） | 只增不改 | No | ~0 |
| redis | 7-alpine | **不变**（新增键空间） | 命名空间隔离 | No | ~50MB |
| neo4j | 5 + APOC | **不变** | - | No | ~0 |
| embedding | llama.cpp + bge-m3 | **不变** | - | No | ~0 |
| reranker | llama.cpp + bge-reranker-v2-m3 | **不变** | - | No | ~0 |
| data-service | FastAPI | **不变** | - | No | ~0 |
| rag-service | FastAPI | **不变**（可能新增 MCP 工具注册） | 只增不改 | No | ~0 |
| main-service | Node.js/Express | **增强**（嵌入 NeMo Guardrails + Bot Adapter） | 增量更新 | No | ~200MB |
| evaluation-service | Node.js | **不变** | - | No | ~0 |
| nginx | alpine | **增强**（新增 v2 路由 + bot webhook） | 只增不改 | No | ~0 |
| prometheus | v2.51.0 | **不变**（新增采集目标） | 只增不改 | No | ~50MB |
| grafana | 10.4.0 | **不变**（新增仪表盘） | 只增不改 | No | ~0 |
| **odoo** | 不存在 | **新增**：Odoo Community | 独立新服务 | No | ~3GB |
| **odoo-db** | 不存在 | **新增**：Odoo 专用 PostgreSQL | 独立新服务 | No | ~500MB |
| **twenty** | 不存在 | **新增**：Twenty CRM | 独立新服务 | No | ~2GB |
| **twenty-db** | 不存在 | **新增**：Twenty 专用 PostgreSQL | 独立新服务 | No | ~500MB |
| **mcp-server** | 不存在 | **新增**：MCP Server | 独立新服务 | No | ~256MB |

**容器数量变化**：V14 的 13 个容器 → V3.0 的 17 个容器（+4 新增）

**总内存增量**：约 6.5GB（Odoo 3GB + Twenty 2GB + MCP 256MB + Odoo DB 500MB + Twenty DB 500MB + 其他 ~244MB）

**内存压力评估**：
- 当前 i7/16GB 机器：V14 占用约 8GB，V3.0 预计占用约 14.5GB → **接近上限**
- **缓解方案**：Odoo/Twenty 可通过 Feature Flag 按需启停，不使用时关闭节省 6GB
- 服务器 GPU 环境：内存更充裕，无压力

#### 1.3.5 环境变量兼容性

| 变量 | V14 | V3.0 | 兼容策略 | Breaking? |
|------|-----|------|---------|-----------|
| DASHSCOPE_API_KEY | 必需 | **不变** | - | No |
| AGNES_KEY | 必需 | **不变** | - | No |
| DATABASE_URL | 必需 | **不变** | - | No |
| REDIS_URL | 必需 | **不变** | - | No |
| NEO4J_URI | 必需 | **不变** | - | No |
| AUTH_SECRET | 必需 | **不变**（⚠️ 必须全环境一致） | - | No |
| AUTH_URL | 必需 | **不变** | - | No |
| EMBEDDING_SERVICE_URL | 必需 | **不变** | - | No |
| RERANKER_SERVICE_URL | 必需 | **不变** | - | No |
| **ODOO_URL** | 不存在 | **新增**：Odoo 服务地址 | 新增，有默认值 | No |
| **ODOO_DB** | 不存在 | **新增**：Odoo 数据库名 | 新增，有默认值 | No |
| **ODOO_USER** | 不存在 | **新增**：Odoo 管理员用户 | 新增 | No |
| **ODOO_PASSWORD** | 不存在 | **新增**：Odoo 管理员密码 | 新增 | No |
| **TWENTY_URL** | 不存在 | **新增**：Twenty CRM 地址 | 新增，有默认值 | No |
| **TWENTY_API_KEY** | 不存在 | **新增**：Twenty API 密钥 | 新增 | No |
| **MCP_SERVER_URL** | 不存在 | **新增**：MCP Server 地址 | 新增，有默认值 | No |
| **LANGSMITH_API_KEY** | 不存在 | **新增**：LangSmith 追踪密钥 | 新增，可选 | No |
| **LANGSMITH_PROJECT** | 不存在 | **新增**：LangSmith 项目名 | 新增，有默认值 | No |
| **FEISHU_APP_ID** | 不存在 | **新增**：飞书应用 ID | 新增，可选 | No |
| **FEISHU_APP_SECRET** | 不存在 | **新增**：飞书应用密钥 | 新增，可选 | No |
| **DINGTALK_APP_KEY** | 不存在 | **新增**：钉钉应用 Key | 新增，可选 | No |
| **DINGTALK_APP_SECRET** | 不存在 | **新增**：钉钉应用密钥 | 新增，可选 | No |
| **NEMO_GUARDRAILS_ENABLED** | 不存在 | **新增**：NeMo Guardrails 开关 | 新增，默认 false | No |
| **FEATURE_V3_CRM** | 不存在 | **新增**：CRM 功能开关 | 新增，默认 false | No |
| **FEATURE_V3_OA** | 不存在 | **新增**：OA 功能开关 | 新增，默认 false | No |
| **FEATURE_V3_MCP** | 不存在 | **新增**：MCP 功能开关 | 新增，默认 false | No |
| **FEATURE_V3_BOT** | 不存在 | **新增**：机器人功能开关 | 新增，默认 false | No |

#### 1.3.6 用户数据兼容性

| 数据 | V14 | V3.0 | 兼容策略 | Breaking? |
|------|-----|------|---------|-----------|
| 用户账号 | NextAuth（email+password） | **不变** + 新增 OAuth（飞书/钉钉） | V14 登录方式保留 | No |
| JWT Token | V14 格式 | **不变** + 新增端类型/平台 claim | V14 token 在 V3.0 仍有效 | No |
| 对话历史 | conversations + messages | **不变** + 新增 client_type/platform 字段 | V14 对话完整保留 | No |
| Agent 日志 | agent_logs | **不变** + 新增 mcp_tool_calls/guardrail_actions | V14 日志完整保留 | No |
| 评估数据 | evaluations + evaluation_results | **不变** | - | No |
| 知识库 | documents + document_chunks | **不变** | - | No |
| 财务数据 | financial_* 五表 | **不变** | - | No |
| 知识图谱 | Neo4j Entity/Relation | **不变** | - | No |
| 用户映射 | 不存在 | **新增**：agent_user_id ↔ odoo_user_id ↔ twenty_user_id | 独立新表 | No |
| CRM 数据 | 不存在 | **新增**：客户/商机/合同/活动 | 独立新表 | No |
| OA 数据 | 不存在 | **新增**：审批/通知/日程/工作流 | 独立新表 | No |
| 审计日志 | 不存在 | **新增**：操作审计记录 | 独立新表 | No |

#### 1.3.7 LLM 降级链兼容性

| 组件 | V14 | V3.0 | 兼容策略 | Breaking? |
|------|-----|------|---------|-----------|
| 主模型 | AGNES（agnes-2.5-flash） | **不变** | - | No |
| 降级模型 | 百炼（qwen-plus） | **不变** | - | No |
| Embedding | bge-m3（本地 llama.cpp:8011） | **不变** | - | No |
| Reranker | bge-reranker-v2-m3（本地:8010） | **不变** | - | No |
| NeMo Guardrails | 不存在 | **新增**：拦截层（在 LLM 调用前） | 可通过 Feature Flag 关断 | No |
| LangSmith 追踪 | 不存在 | **新增**：追踪层（不改变 LLM 调用逻辑） | 可通过环境变量关闭 | No |

#### 1.3.8 多端兼容性

| 端 | 最低版本 | API 版本 | SSE 支持 | 特殊处理 | 功能范围 |
|----|---------|---------|---------|---------|---------|
| Web（Next.js） | V14+ | v1+v2 | ✅ 原生 | 全功能 | 100% |
| 微信小程序（Taro 4） | V3.0 | v2 | ✅ wx.request + EventSource | 受限 UI（无 CRM 审批页） | ~60% |
| Android（Capacitor） | V3.0 | v2 | ✅ WebView 原生 | 推送 + 离线缓存 | ~80% |
| iOS（Capacitor） | V3.0 | v2 | ✅ WebView 原生 | 推送 + 离线缓存 | ~80% |
| 鸿蒙（ArkTS） | V3.0 | v2 | ✅ HTTP 请求 + 流式 | 鸿蒙推送 | ~40%（MVP） |
| 飞书机器人 | V3.0 | v2 | ✅ 流式消息卡片 | 消息格式适配 | ~50% |
| 钉钉机器人 | V3.0 | v2 | ✅ 流式消息 | 消息格式适配 | ~50% |

### 1.4 兼容性风险汇总

| 风险编号 | 风险描述 | 可能性 | 影响 | 缓解措施 |
|----------|---------|--------|------|---------|
| C-R01 | v1 API 行为被意外修改 | 低 | 高 | 契约测试 + API 回归测试 |
| C-R02 | 新增列缺少 DEFAULT 导致 V14 代码报错 | 低 | 高 | 代码审查 + 迁移脚本检查 |
| C-R03 | Redis 键空间冲突（v1/v2 键名重叠） | 低 | 中 | 命名空间前缀隔离（v1: / v2:） |
| C-R04 | JWT Token 新增 claim 导致 V14 验证失败 | 低 | 高 | V3.0 验证逻辑忽略未知 claim |
| C-R05 | Odoo/Twenty 启动后内存不足导致其他服务 OOM | 中 | 高 | Feature Flag 按需启停 + 内存监控 |
| C-R06 | nginx 路由规则冲突（v1/v2 路径重叠） | 低 | 中 | v2 路径前缀 /api/v2/ 无重叠 |
| C-R07 | 多端 API 返回格式不一致 | 中 | 中 | API Gateway 统一响应格式 |
| C-R08 | Odoo/Twenty 内部 PostgreSQL 与主库端口冲突 | 低 | 中 | 使用不同端口（5433/5434） |
| C-R09 | NeMo Guardrails 误拦截正常请求 | 中 | 中 | Feature Flag 可秒级关断 |
| C-R10 | LangSmith SDK 与现有依赖版本冲突 | 中 | 低 | 独立安装 + 版本锁定 |

### 1.5 兼容性验证清单

**Phase 1 门禁（PDCP）必须通过**：

- [ ] V14 前端 + V3.0 后端：所有 v1 API 正常工作
- [ ] V3.0 前端 + V14 后端：降级到 v1 行为，核心功能可用
- [ ] V14 数据库 + V3.0 迁移脚本：迁移成功，V14 代码仍可读写
- [ ] V3.0 数据库 + V14 回滚脚本：回滚成功，数据完整
- [ ] V14 JWT Token 在 V3.0 后端验证通过
- [ ] V3.0 JWT Token 在 V14 后端验证通过（忽略新 claim）
- [ ] Redis v1/v2 键空间无冲突
- [ ] Docker Compose V14 服务在 V3.0 compose 文件中仍可启动
- [ ] nginx v1 路由在 V3.0 配置中仍可访问
- [ ] 所有新增环境变量有默认值，V14 不依赖

---

## 二、回滚方案（R026-d）

### 2.1 回滚策略分级

| 级别 | 名称 | 触发场景 | 回滚方式 | 恢复时间 | 数据影响 | 适用 Phase |
|------|------|---------|---------|---------|---------|-----------|
| L0 | Feature Flag 关断 | 新功能异常但核心不受影响 | Redis flag 切换 | <10s | 无 | Phase 2+ |
| L1 | 容器级回滚 | 单服务异常 | Docker 镜像版本回退 | <2min | 无 | Phase 1+ |
| L2 | 全容器回滚 | 多服务异常 | docker compose 全量回退 | <5min | 无 | Phase 1+ |
| L3 | 数据库回滚 | Schema 迁移导致数据问题 | 数据库快照恢复 | <30min | 丢失回滚后写入 | Phase 1+ |
| L4 | 全量回滚 | 系统级严重故障 | 代码+数据+配置全量回退 | <2h | 需数据 reconciliation | Phase 3+ |

### 2.2 Git Tag 与镜像版本化策略

**Tag 命名规范**：

```
v3.0.0-phase{N}-{date}       # Phase 级别 tag
v3.0.0-rc{N}                 # 发布候选
v3.0.0                       # 正式发布
v14-latest                    # V14 最后稳定版（回滚锚点）
```

**Docker 镜像 Tag**：

```
aiagent_main_service:v14-latest     # V14 稳定版
aiagent_main_service:v3.0.0-phase1  # Phase 1 版本
aiagent_main_service:v3.0.0-phase2  # Phase 2 版本
aiagent_main_service:v3.0.0-rc1     # RC1
aiagent_main_service:v3.0.0         # 正式版
```

**每个 Phase 部署前必须执行**：

```powershell
# 1. 打 git tag
git tag -a v3.0.0-phase{N}-$(Get-Date -Format 'yyyyMMdd') -m "Phase {N} 部署前快照"

# 2. 构建 Docker 镜像并打 tag
docker compose build
docker tag aiagent_main_service:latest aiagent_main_service:v3.0.0-phase{N}

# 3. 备份数据库
pg_dump -h localhost -p 5432 -U aiagent -d agentdb -F c -f "backup_v14_$(Get-Date -Format 'yyyyMMdd_HHmm').dump"

# 4. 备份 Redis
docker exec aiagent_redis redis-cli BGSAVE
docker cp aiagent_redis:/data/dump.rdb "backup_redis_v14_$(Get-Date -Format 'yyyyMMdd_HHmm').rdb"

# 5. 备份环境变量
Copy-Item .env.docker "backup_env_v14_$(Get-Date -Format 'yyyyMMdd_HHmm').env"
Copy-Item .env.local "backup_env_local_v14_$(Get-Date -Format 'yyyyMMdd_HHmm').env"

# 6. 备份 nginx 配置
Copy-Item nginx/default.conf "backup_nginx_v14_$(Get-Date -Format 'yyyyMMdd_HHmm').conf"
```

### 2.3 L0：Feature Flag 关断（<10s）

**适用场景**：新功能（CRM/OA/MCP/Bot/Guardrails）异常，但核心对话功能正常。

**操作步骤**：

```powershell
# 关断 CRM 功能
docker exec aiagent_redis redis-cli SET feature:v3:crm "false"
# 关断 OA 功能
docker exec aiagent_redis redis-cli SET feature:v3:oa "false"
# 关断 MCP 功能
docker exec aiagent_redis redis-cli SET feature:v3:mcp "false"
# 关断机器人功能
docker exec aiagent_redis redis-cli SET feature:v3:bot "false"
# 关断 NeMo Guardrails
docker exec aiagent_redis redis-cli SET feature:v3:guardrails "false"
```

**验证**：

```powershell
# 确认 flag 已设置
docker exec aiagent_redis redis-cli GET feature:v3:crm
# 确认 v1 API 正常
curl http://localhost:80/api/v1/health
# 确认对话功能正常
curl -X POST http://localhost:80/api/v1/chat -H "Content-Type: application/json" -d '{"message":"测试回滚"}'
```

**Feature Flag 清单**：

| Flag 键 | 默认值 | 控制功能 | 关断效果 |
|---------|--------|---------|---------|
| feature:v3:crm | false | CRM 全功能 | /api/v2/crm/* 返回 503 |
| feature:v3:oa | false | OA 全功能 | /api/v2/oa/* 返回 503 |
| feature:v3:mcp | false | MCP 工具注册与执行 | /api/v2/mcp/* 返回 503 |
| feature:v3:bot | false | 飞书/钉钉机器人 | Webhook 返回 200 但不处理 |
| feature:v3:guardrails | false | NeMo Guardrails | 跳过 Guardrails 拦截 |
| feature:v3:langsmith | false | LangSmith 追踪 | 不发送追踪数据 |
| feature:v3:odoo | false | Odoo 服务启动 | Odoo 容器可停止 |
| feature:v3:twenty | false | Twenty 服务启动 | Twenty 容器可停止 |

### 2.4 L1：容器级回滚（<2min）

**适用场景**：单个服务（如 main-service）异常，其他服务正常。

**操作步骤**：

```powershell
# 1. 停止异常服务
docker compose stop main-service

# 2. 回退到 V14 镜像
# 修改 docker-compose.yml 中 main-service 的 image 为 v14-latest
# 或直接指定镜像运行
docker compose up -d main-service --no-deps

# 3. 验证
curl http://localhost:80/api/v1/health
```

**各服务回滚优先级**：

| 服务 | 回滚影响 | 回滚方式 | 独立回滚可行? |
|------|---------|---------|-------------|
| main-service | 高（核心入口） | 镜像回退 | ✅ 可独立 |
| rag-service | 高（检索服务） | 镜像回退 | ✅ 可独立 |
| data-service | 中（OCR 服务） | 镜像回退 | ✅ 可独立 |
| nginx | 高（路由入口） | 配置回退 | ✅ 可独立 |
| odoo | 低（OA 功能） | 停止容器 | ✅ 可独立 |
| twenty | 低（CRM 功能） | 停止容器 | ✅ 可独立 |
| mcp-server | 中（MCP 工具） | 停止容器 + Flag 关断 | ✅ 可独立 |

### 2.5 L2：全容器回滚（<5min）

**适用场景**：多服务异常或 V3.0 整体不稳定，需要回退到 V14。

**操作步骤**：

```powershell
# 1. 停止所有 V3.0 服务
docker compose down

# 2. 恢复 V14 代码
git checkout v14-latest

# 3. 恢复 V14 环境变量
Copy-Item backup_env_v14_YYYYMMDD_HHMM.env .env.docker

# 4. 恢复 V14 nginx 配置
Copy-Item backup_nginx_v14_YYYYMMDD_HHMM.conf nginx/default.conf

# 5. 启动 V14 服务
docker compose up -d --build

# 6. 等待健康检查通过（约 60-90s）
Start-Sleep -Seconds 90

# 7. 验证
curl http://localhost:80/api/v1/health
curl http://localhost:80/api/v1/history
```

**验证清单**：

- [ ] nginx(80) 可访问
- [ ] /api/v1/health 返回 200
- [ ] /api/v1/chat 对话正常（SSE 流式）
- [ ] /api/v1/history 历史对话显示
- [ ] /api/v1/documents 文档列表正常
- [ ] /api/v1/evaluate 评估功能正常
- [ ] 前端页面正常渲染
- [ ] 知识图谱检索正常

### 2.6 L3：数据库回滚（<30min）

**适用场景**：Schema 迁移导致数据不一致或查询异常。

**方案 A：Migration 回退（推荐，数据丢失最少）**

```powershell
# 1. 执行回滚 migration
# 使用 drizzle-kit 或手动 SQL
psql -h localhost -p 5432 -U aiagent -d agentdb -f migrations/rollback/V3.0_rollback.sql

# 回滚脚本内容（示例）：
# DROP TABLE IF EXISTS crm_customers, crm_opportunities, crm_contracts, crm_activities;
# DROP TABLE IF EXISTS oa_workflows, oa_approvals, oa_notifications, oa_schedule;
# DROP TABLE IF EXISTS mcp_tools, mcp_executions, bot_messages, feature_flags, audit_logs;
# DROP TABLE IF EXISTS user_mapping;
# ALTER TABLE conversations DROP COLUMN IF EXISTS client_type;
# ALTER TABLE conversations DROP COLUMN IF EXISTS platform;
# ALTER TABLE messages DROP COLUMN IF EXISTS metadata;
# ALTER TABLE users DROP COLUMN IF EXISTS odoo_user_id;
# ALTER TABLE users DROP COLUMN IF EXISTS twenty_user_id;
# ALTER TABLE users DROP COLUMN IF EXISTS feishu_user_id;
# ALTER TABLE users DROP COLUMN IF EXISTS dingtalk_user_id;
# ALTER TABLE agent_logs DROP COLUMN IF EXISTS mcp_tool_calls;
# ALTER TABLE agent_logs DROP COLUMN IF EXISTS guardrail_actions;
```

**方案 B：快照恢复（数据丢失回滚后写入）**

```powershell
# 1. 停止所有服务
docker compose down

# 2. 恢复 PostgreSQL 快照
pg_restore -h localhost -p 5432 -U aiagent -d agentdb -c "backup_v14_YYYYMMDD_HHMM.dump"

# 3. 恢复 Redis 快照
docker cp backup_redis_v14_YYYYMMDD_HHMM.rdb aiagent_redis:/data/dump.rdb
docker compose up -d redis

# 4. 启动服务
docker compose up -d

# 5. 验证数据完整性
psql -h localhost -p 5432 -U aiagent -d agentdb -c "SELECT count(*) FROM conversations"
psql -h localhost -p 5432 -U aiagent -d agentdb -c "SELECT count(*) FROM documents"
```

### 2.7 L4：全量回滚（<2h）

**适用场景**：系统级严重故障，需要代码+数据+配置全量回退。

**操作步骤**：

```powershell
# 1. 停止所有服务
docker compose down

# 2. 恢复 V14 代码
git checkout v14-latest

# 3. 恢复 V14 环境变量
Copy-Item backup_env_v14_YYYYMMDD_HHMM.env .env.docker
Copy-Item backup_env_local_v14_YYYYMMDD_HHMM.env .env.local

# 4. 恢复 V14 nginx 配置
Copy-Item backup_nginx_v14_YYYYMMDD_HHMM.conf nginx/default.conf

# 5. 恢复数据库快照
pg_restore -h localhost -p 5432 -U aiagent -d agentdb -c "backup_v14_YYYYMMDD_HHMM.dump"

# 6. 恢复 Redis 快照
docker compose up -d redis
Start-Sleep -Seconds 5
docker cp backup_redis_v14_YYYYMMDD_HHMM.rdb aiagent_redis:/data/dump.rdb
docker compose restart redis

# 7. 重建并启动 V14 服务
docker compose up -d --build

# 8. 等待健康检查
Start-Sleep -Seconds 120

# 9. 全量验证
curl http://localhost:80/api/v1/health
curl http://localhost:80/api/v1/chat -X POST -H "Content-Type: application/json" -d '{"message":"全量回滚验证"}'
curl http://localhost:80/api/v1/history
```

**数据 reconciliation（如需要）**：

```sql
-- 查找回滚后丢失的数据（V3.0 期间新增的对话）
-- 需要从 V3.0 数据库备份中提取
-- 1. 启动临时 PostgreSQL 加载 V3.0 备份
-- 2. 对比 conversations 表，找出 V3.0 新增记录
-- 3. 手动插入到回滚后的数据库
```

### 2.8 回滚触发条件

| 触发条件 | 严重级别 | 回滚级别 | 决策人 | 通知范围 |
|----------|---------|---------|--------|---------|
| 评估基线退化 >5%（综合 <0.8695） | 🟡 P2 | L0（Flag 关断新功能）→ 重跑评估 | 技术负责人 | 开发团队 |
| 评估基线退化 >10%（综合 <0.8238） | 🟠 P1 | L2（全容器回滚） | 项目负责人 | 全员 |
| 核心对话功能不可用 >5min | 🔴 P0 | L2（全容器回滚） | 任何发现者 | 全员+用户 |
| RAG 检索失败率 >10% | 🟠 P1 | L1（rag-service 回滚） | 技术负责人 | 开发团队 |
| CRM/OA 数据丢失 | 🔴 P0 | L3（数据库回滚） | 项目负责人 | 全员+用户 |
| CRM/OA 审批流逻辑错误 | 🟠 P1 | L0（Flag 关断 CRM/OA） | 技术负责人 | 开发团队 |
| 安全漏洞被利用 | 🔴 P0 | L4（全量回滚） | 项目负责人 | 全员+安全团队 |
| 数据越权访问 | 🔴 P0 | L0（Flag 关断）→ L4 | 项目负责人 | 全员+安全团队 |
| Docker 容器 OOM 重启 >3次/小时 | 🟠 P1 | L1（容器级回滚） | 运维 | 开发团队 |
| 内存使用率 >90% 持续 10min | 🟡 P2 | L0（关断 Odoo/Twenty） | 运维 | 开发团队 |
| API 错误率 >5% 持续 5min | 🟠 P1 | L1/L2 | 技术负责人 | 开发团队 |
| P99 延迟增加 >50% | 🟡 P2 | L0（Flag 关断新功能） | 技术负责人 | 开发团队 |
| 回滚脚本执行失败 | 🔴 P0 | 升级到更高级别回滚 | 项目负责人 | 全员 |

### 2.9 回滚演练计划

**演练时间**：每个 Phase 部署前 1 天

**演练清单**：

| 演练项 | 演练内容 | 通过标准 | 频率 |
|--------|---------|---------|------|
| L0 演练 | Feature Flag 关断+验证 | 10s 内新功能停止，核心功能正常 | 每个 Phase |
| L1 演练 | main-service 容器回滚 | 2min 内恢复 V14 行为 | Phase 1+ |
| L2 演练 | 全容器回滚 | 5min 内恢复 V14 全服务 | Phase 2+ |
| L3 演练 | 数据库 migration 回退 | 30min 内恢复 V14 schema | Phase 1 |
| L3 演练 | 数据库快照恢复 | 30min 内恢复 V14 数据 | Phase 1 |
| L4 演练 | 全量回滚 | 2h 内恢复 V14 全系统 | Phase 3 |
| 数据验证 | 回滚后数据完整性检查 | conversations/documents/messages 计数一致 | 每次回滚 |

### 2.10 回滚后操作

| 步骤 | 操作 | 负责人 | 时间 |
|------|------|--------|------|
| 1 | 确认回滚成功（健康检查+冒烟测试） | 运维 | 回滚后 5min |
| 2 | 通知用户（如影响用户） | 产品 | 回滚后 10min |
| 3 | 收集回滚原因数据（日志+指标+截图） | 开发 | 回滚后 30min |
| 4 | 根因分析（5-Why） | 技术负责人 | 回滚后 4h |
| 5 | 制定修复方案 | 开发 | 回滚后 24h |
| 6 | 修复验证 | 测试 | 修复后 |
| 7 | 重新部署（修复版） | 运维 | 验证通过后 |
| 8 | 复盘会议 | 全员 | 回滚后 72h |
| 9 | 更新回滚方案（如发现流程缺陷） | 运维 | 复盘后 |

---

## 三、数据迁移方案（R026-e）

### 3.1 当前数据资产清单

#### 3.1.1 PostgreSQL（主库：agentdb）

| 表名 | 记录量级 | 数据大小 | 关键性 | 迁移策略 |
|------|---------|---------|--------|---------|
| documents | ~200 | ~50MB | 🔴高（知识库核心） | 不变 |
| document_chunks | ~5000 | ~200MB | 🔴高（向量检索核心） | 不变 |
| conversations | ~300 | ~10MB | 🔴高（用户数据） | 不变+新增列 |
| messages | ~3000 | ~20MB | 🔴高（用户数据） | 不变+新增列 |
| agent_logs | ~2000 | ~50MB | 🟡中（调试数据） | 不变+新增列 |
| evaluations | ~50 | ~1MB | 🟡中 | 不变 |
| evaluation_results | ~500 | ~5MB | 🟡中 | 不变 |
| financial_income | ~500 | ~5MB | 🔴高（金融数据） | 不变 |
| financial_balancesheet | ~500 | ~5MB | 🔴高 | 不变 |
| financial_cashflow | ~500 | ~5MB | 🔴高 | 不变 |
| financial_indicators | ~500 | ~5MB | 🔴高 | 不变 |
| financial_raw_tables | ~200 | ~50MB | 🟡中 | 不变 |
| stock_mapping | ~5000 | ~2MB | 🟡中 | 不变 |
| indicator_aliases | ~50 | ~100KB | 🟡中 | 不变 |
| semantic_cache | ~500 | ~50MB | 🟢低（缓存） | 不变 |
| pg_cache | ~500 | ~10MB | 🟢低（缓存） | 不变 |
| users | ~5 | ~10KB | 🔴高 | 不变+新增列 |
| accounts | ~5 | ~10KB | 🔴高 | 不变 |
| sessions | ~10 | ~10KB | 🟡中 | 不变 |
| verification_tokens | ~5 | ~5KB | 🟢低 | 不变 |

#### 3.1.2 Neo4j（知识图谱）

| 数据 | 节点/关系数 | 数据大小 | 关键性 | 迁移策略 |
|------|-----------|---------|--------|---------|
| Entity 节点 | ~3000 | ~50MB | 🔴高 | 不变 |
| Relation 关系 | ~3000 | ~30MB | 🔴高 | 不变 |
| entity_aliases | ~100 | ~1MB | 🟡中 | 不变 |

#### 3.1.3 Redis

| 键空间 | 键数量 | 内存占用 | 关键性 | 迁移策略 |
|--------|--------|---------|--------|---------|
| rate-limiter:* | ~100 | ~1MB | 🟡中 | 不变+新增 v2 前缀 |
| circuit-breaker:* | ~10 | ~100KB | 🟡中 | 不变+新增 v2 前缀 |
| llm-cache:* | ~500 | ~50MB | 🟢低（缓存） | 不变 |
| semantic-cache:* | ~500 | ~50MB | 🟢低（缓存） | 不变 |
| feature:* | 0（V3.0 新增） | 0 | 🟡中 | 新增 |
| bot:* | 0（V3.0 新增） | 0 | 🟡中 | 新增 |

### 3.2 V3.0 新增数据设计

#### 3.2.1 用户映射表（核心关联表）

```sql
CREATE TABLE IF NOT EXISTS user_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    odoo_user_id VARCHAR(64),
    twenty_user_id VARCHAR(64),
    feishu_user_id VARCHAR(64),
    dingtalk_user_id VARCHAR(64),
    wecom_user_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_user_id),
    UNIQUE(odoo_user_id),
    UNIQUE(twenty_user_id),
    UNIQUE(feishu_user_id),
    UNIQUE(dingtalk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mapping_agent ON user_mapping(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mapping_odoo ON user_mapping(odoo_user_id) WHERE odoo_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_mapping_twenty ON user_mapping(twenty_user_id) WHERE twenty_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_mapping_feishu ON user_mapping(feishu_user_id) WHERE feishu_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_mapping_dingtalk ON user_mapping(dingtalk_user_id) WHERE dingtalk_user_id IS NOT NULL;
```

#### 3.2.2 CRM 数据表

```sql
CREATE TABLE IF NOT EXISTS crm_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    twenty_customer_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    industry VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES crm_customers(id) ON DELETE SET NULL,
    twenty_opportunity_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2),
    stage VARCHAR(50) DEFAULT 'qualification',
    probability INTEGER DEFAULT 10,
    close_date DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES crm_customers(id) ON DELETE SET NULL,
    opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
    twenty_contract_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'draft',
    start_date DATE,
    end_date DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_customers_user ON crm_customers(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_user ON crm_opportunities(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_user ON crm_contracts(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON crm_activities(customer_id);
```

#### 3.2.3 OA 数据表

```sql
CREATE TABLE IF NOT EXISTS oa_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    odoo_workflow_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    definition JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oa_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    workflow_id UUID REFERENCES oa_workflows(id) ON DELETE SET NULL,
    odoo_approval_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'normal',
    submitter_id UUID REFERENCES users(id),
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER DEFAULT 1,
    form_data JSONB DEFAULT '{}',
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oa_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oa_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    odoo_event_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(255),
    attendees JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oa_approvals_user ON oa_approvals(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_oa_approvals_status ON oa_approvals(status);
CREATE INDEX IF NOT EXISTS idx_oa_notifications_user ON oa_notifications(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_oa_notifications_read ON oa_notifications(agent_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_oa_schedule_user ON oa_schedule(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_oa_schedule_time ON oa_schedule(start_time, end_time);
```

#### 3.2.4 MCP/Bot/Audit 数据表

```sql
CREATE TABLE IF NOT EXISTS mcp_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    input_schema JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(50) NOT NULL DEFAULT 'builtin',
    source_url VARCHAR(1024),
    is_enabled BOOLEAN DEFAULT true,
    required_permissions TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID REFERENCES users(id),
    tool_id UUID REFERENCES mcp_tools(id) ON DELETE SET NULL,
    tool_name VARCHAR(255) NOT NULL,
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error TEXT,
    duration_ms INTEGER,
    trace_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    platform_message_id VARCHAR(255),
    direction VARCHAR(20) NOT NULL,
    agent_user_id UUID REFERENCES users(id),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_executions_user ON mcp_executions(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_executions_tool ON mcp_executions(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_executions_trace ON mcp_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_bot_messages_platform ON bot_messages(platform, created_at);
CREATE INDEX IF NOT EXISTS idx_bot_messages_user ON bot_messages(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at);
```

#### 3.2.5 现有表新增列

```sql
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) DEFAULT 'web';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'web';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS odoo_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS twenty_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS feishu_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS dingtalk_user_id VARCHAR(64);
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS mcp_tool_calls JSONB;
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS guardrail_actions JSONB;
```

### 3.3 迁移原则

| 原则 | 说明 | 验证方法 |
|------|------|---------|
| 零数据丢失 | 不删除任何现有数据 | 迁移前后 COUNT 对比 |
| 只增不改 | 不修改现有表结构（类型/约束/索引） | schema diff 工具 |
| 独立新表 | CRM/OA/MCP/Bot 数据使用独立新表 | 新表与旧表无外键依赖 |
| 默认值 | 所有新增列必须有 DEFAULT | V14 代码不报错 |
| 幂等性 | 迁移脚本可重复执行 | 执行两次结果一致 |
| 事务性 | 每个迁移脚本包裹在事务中 | 失败自动回滚 |
| 可逆性 | 每个迁移脚本配对回滚脚本 | 回滚脚本可恢复原状 |
| 审计性 | 迁移操作记录到 audit_logs | 可追溯 |

### 3.4 迁移脚本设计

#### 脚本命名规范

```
migrations/
├── V3.0_001__create_user_mapping.sql          # 正向迁移
├── V3.0_001__rollback_user_mapping.sql        # 回滚脚本
├── V3.0_002__create_crm_tables.sql
├── V3.0_002__rollback_crm_tables.sql
├── V3.0_003__create_oa_tables.sql
├── V3.0_003__rollback_oa_tables.sql
├── V3.0_004__create_mcp_bot_audit_tables.sql
├── V3.0_004__rollback_mcp_bot_audit_tables.sql
├── V3.0_005__alter_existing_tables.sql
├── V3.0_005__rollback_alter_existing_tables.sql
├── V3.0_006__seed_feature_flags.sql
├── V3.0_006__rollback_seed_feature_flags.sql
├── seed/
│   ├── 001_seed_user_mapping.py               # 种子数据：用户映射
│   ├── 002_seed_odoo_test_data.py             # 种子数据：Odoo 测试数据
│   └── 003_seed_twenty_test_data.py           # 种子数据：Twenty 测试数据
└── verify/
    ├── verify_migration.sql                    # 迁移后验证 SQL
    └── verify_rollback.sql                    # 回滚后验证 SQL
```

#### 3.4.1 001：用户映射表

**正向迁移**：`V3.0_001__create_user_mapping.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS user_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    odoo_user_id VARCHAR(64),
    twenty_user_id VARCHAR(64),
    feishu_user_id VARCHAR(64),
    dingtalk_user_id VARCHAR(64),
    wecom_user_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_user_id),
    UNIQUE(odoo_user_id),
    UNIQUE(twenty_user_id),
    UNIQUE(feishu_user_id),
    UNIQUE(dingtalk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mapping_agent ON user_mapping(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mapping_odoo ON user_mapping(odoo_user_id) WHERE odoo_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_mapping_twenty ON user_mapping(twenty_user_id) WHERE twenty_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_mapping_feishu ON user_mapping(feishu_user_id) WHERE feishu_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_mapping_dingtalk ON user_mapping(dingtalk_user_id) WHERE dingtalk_user_id IS NOT NULL;

COMMIT;
```

**回滚脚本**：`V3.0_001__rollback_user_mapping.sql`

```sql
BEGIN;
DROP TABLE IF EXISTS user_mapping CASCADE;
COMMIT;
```

#### 3.4.2 002：CRM 数据表

**正向迁移**：`V3.0_002__create_crm_tables.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS crm_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    twenty_customer_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    industry VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES crm_customers(id) ON DELETE SET NULL,
    twenty_opportunity_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2),
    stage VARCHAR(50) DEFAULT 'qualification',
    probability INTEGER DEFAULT 10,
    close_date DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES crm_customers(id) ON DELETE SET NULL,
    opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
    twenty_contract_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'draft',
    start_date DATE,
    end_date DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_customers_user ON crm_customers(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_user ON crm_opportunities(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_user ON crm_contracts(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON crm_activities(customer_id);

COMMIT;
```

**回滚脚本**：`V3.0_002__rollback_crm_tables.sql`

```sql
BEGIN;
DROP TABLE IF EXISTS crm_activities CASCADE;
DROP TABLE IF EXISTS crm_contracts CASCADE;
DROP TABLE IF EXISTS crm_opportunities CASCADE;
DROP TABLE IF EXISTS crm_customers CASCADE;
COMMIT;
```

#### 3.4.3 003：OA 数据表

**正向迁移**：`V3.0_003__create_oa_tables.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS oa_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    odoo_workflow_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    definition JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oa_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    workflow_id UUID REFERENCES oa_workflows(id) ON DELETE SET NULL,
    odoo_approval_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'normal',
    submitter_id UUID REFERENCES users(id),
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER DEFAULT 1,
    form_data JSONB DEFAULT '{}',
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oa_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oa_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID NOT NULL REFERENCES users(id),
    odoo_event_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(255),
    attendees JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oa_approvals_user ON oa_approvals(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_oa_approvals_status ON oa_approvals(status);
CREATE INDEX IF NOT EXISTS idx_oa_notifications_user ON oa_notifications(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_oa_notifications_read ON oa_notifications(agent_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_oa_schedule_user ON oa_schedule(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_oa_schedule_time ON oa_schedule(start_time, end_time);

COMMIT;
```

**回滚脚本**：`V3.0_003__rollback_oa_tables.sql`

```sql
BEGIN;
DROP TABLE IF EXISTS oa_schedule CASCADE;
DROP TABLE IF EXISTS oa_notifications CASCADE;
DROP TABLE IF EXISTS oa_approvals CASCADE;
DROP TABLE IF EXISTS oa_workflows CASCADE;
COMMIT;
```

#### 3.4.4 004：MCP/Bot/Audit 数据表

**正向迁移**：`V3.0_004__create_mcp_bot_audit_tables.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS mcp_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    input_schema JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(50) NOT NULL DEFAULT 'builtin',
    source_url VARCHAR(1024),
    is_enabled BOOLEAN DEFAULT true,
    required_permissions TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID REFERENCES users(id),
    tool_id UUID REFERENCES mcp_tools(id) ON DELETE SET NULL,
    tool_name VARCHAR(255) NOT NULL,
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error TEXT,
    duration_ms INTEGER,
    trace_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    platform_message_id VARCHAR(255),
    direction VARCHAR(20) NOT NULL,
    agent_user_id UUID REFERENCES users(id),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_executions_user ON mcp_executions(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_executions_tool ON mcp_executions(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_executions_trace ON mcp_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_bot_messages_platform ON bot_messages(platform, created_at);
CREATE INDEX IF NOT EXISTS idx_bot_messages_user ON bot_messages(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at);

COMMIT;
```

**回滚脚本**：`V3.0_004__rollback_mcp_bot_audit_tables.sql`

```sql
BEGIN;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS bot_messages CASCADE;
DROP TABLE IF EXISTS mcp_executions CASCADE;
DROP TABLE IF EXISTS mcp_tools CASCADE;
COMMIT;
```

#### 3.4.5 005：现有表新增列

**正向迁移**：`V3.0_005__alter_existing_tables.sql`

```sql
BEGIN;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) DEFAULT 'web';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'web';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS odoo_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS twenty_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS feishu_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS dingtalk_user_id VARCHAR(64);
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS mcp_tool_calls JSONB;
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS guardrail_actions JSONB;

COMMIT;
```

**回滚脚本**：`V3.0_005__rollback_alter_existing_tables.sql`

```sql
BEGIN;

ALTER TABLE agent_logs DROP COLUMN IF EXISTS guardrail_actions;
ALTER TABLE agent_logs DROP COLUMN IF EXISTS mcp_tool_calls;
ALTER TABLE users DROP COLUMN IF EXISTS dingtalk_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS feishu_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS twenty_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS odoo_user_id;
ALTER TABLE messages DROP COLUMN IF EXISTS metadata;
ALTER TABLE conversations DROP COLUMN IF EXISTS platform;
ALTER TABLE conversations DROP COLUMN IF EXISTS client_type;

COMMIT;
```

#### 3.4.6 006：Feature Flag 种子数据

**正向迁移**：`V3.0_006__seed_feature_flags.sql`

```sql
BEGIN;

INSERT INTO feature_flags (key, value, description) VALUES
    ('feature:v3:crm', false, 'CRM 功能开关'),
    ('feature:v3:oa', false, 'OA 功能开关'),
    ('feature:v3:mcp', false, 'MCP 工具开关'),
    ('feature:v3:bot', false, '机器人功能开关'),
    ('feature:v3:guardrails', false, 'NeMo Guardrails 开关'),
    ('feature:v3:langsmith', false, 'LangSmith 追踪开关'),
    ('feature:v3:odoo', false, 'Odoo 服务开关'),
    ('feature:v3:twenty', false, 'Twenty CRM 服务开关')
ON CONFLICT (key) DO NOTHING;

COMMIT;
```

**回滚脚本**：`V3.0_006__rollback_seed_feature_flags.sql`

```sql
BEGIN;
DELETE FROM feature_flags WHERE key LIKE 'feature:v3:%';
COMMIT;
```

### 3.5 种子数据脚本

#### 3.5.1 001_seed_user_mapping.py

```python
"""
种子数据：为现有用户创建用户映射记录
运行方式：conda activate bigmodel && python migrations/seed/001_seed_user_mapping.py
"""
import os
import sys
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

def seed_user_mapping():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM users")
            users = cur.fetchall()

            for user_id, email in users:
                cur.execute(
                    """
                    INSERT INTO user_mapping (agent_user_id)
                    VALUES (%s)
                    ON CONFLICT (agent_user_id) DO NOTHING
                    """,
                    (user_id,)
                )
                print(f"  用户映射已创建: {email} → {user_id}")

            conn.commit()

            cur.execute("SELECT count(*) FROM user_mapping")
            count = cur.fetchone()[0]
            print(f"用户映射表共 {count} 条记录")

if __name__ == "__main__":
    print("开始创建用户映射种子数据...")
    seed_user_mapping()
    print("完成！")
```

#### 3.5.2 002_seed_odoo_test_data.py

```python
"""
种子数据：在 Odoo 和本地表中创建测试数据
运行方式：conda activate bigmodel && python migrations/seed/002_seed_odoo_test_data.py
前置条件：Odoo 服务已启动，Feature Flag feature:v3:odoo=true
"""
import os
import sys
import json
import xmlrpc.client
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "odoo")
ODOO_USER = os.getenv("ODOO_USER", "admin")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD", "admin")

TEST_APPROVAL_TEMPLATES = [
    {"name": "请假审批", "type": "leave"},
    {"name": "报销审批", "type": "expense"},
    {"name": "采购审批", "type": "purchase"},
]

TEST_APPROVALS = [
    {"title": "张三请假3天", "type": "leave", "status": "pending", "priority": "normal"},
    {"title": "李四报销差旅费", "type": "expense", "status": "approved", "priority": "high"},
    {"title": "王五采购办公设备", "type": "purchase", "status": "pending", "priority": "normal"},
]

TEST_NOTIFICATIONS = [
    {"type": "approval", "title": "您有一条待审批：张三请假3天", "content": "请假时间：8月15日-8月17日"},
    {"type": "system", "title": "系统通知：V3.0 升级完成", "content": "OA 功能已上线"},
]

TEST_SCHEDULE = [
    {"title": "项目周会", "start": "2026-08-18 09:00", "end": "2026-08-18 10:00", "location": "会议室A"},
    {"title": "客户拜访", "start": "2026-08-19 14:00", "end": "2026-08-19 16:00", "location": "客户公司"},
]

def seed_odoo_test_data():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users LIMIT 1")
            user_row = cur.fetchone()
            if not user_row:
                print("  跳过：无用户数据")
                return
            user_id = user_row[0]

            for template in TEST_APPROVAL_TEMPLATES:
                cur.execute(
                    """
                    INSERT INTO oa_workflows (agent_user_id, name, type, definition)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (user_id, template["name"], template["type"], json.dumps({"steps": 2}))
                )
                print(f"  工作流已创建: {template['name']}")

            for approval in TEST_APPROVALS:
                cur.execute(
                    """
                    INSERT INTO oa_approvals (agent_user_id, title, status, priority, submitter_id, form_data)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (user_id, approval["title"], approval["status"], approval["priority"],
                     user_id, json.dumps({"type": approval["type"]}))
                )
                print(f"  审批已创建: {approval['title']}")

            for notif in TEST_NOTIFICATIONS:
                cur.execute(
                    """
                    INSERT INTO oa_notifications (agent_user_id, type, title, content)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, notif["type"], notif["title"], notif["content"])
                )
                print(f"  通知已创建: {notif['title']}")

            for event in TEST_SCHEDULE:
                cur.execute(
                    """
                    INSERT INTO oa_schedule (agent_user_id, title, start_time, end_time, location)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, event["title"], event["start"], event["end"], event["location"])
                )
                print(f"  日程已创建: {event['title']}")

            conn.commit()

            cur.execute("SELECT count(*) FROM oa_workflows")
            print(f"OA 工作流共 {cur.fetchone()[0]} 条")
            cur.execute("SELECT count(*) FROM oa_approvals")
            print(f"OA 审批共 {cur.fetchone()[0]} 条")
            cur.execute("SELECT count(*) FROM oa_notifications")
            print(f"OA 通知共 {cur.fetchone()[0]} 条")
            cur.execute("SELECT count(*) FROM oa_schedule")
            print(f"OA 日程共 {cur.fetchone()[0]} 条")

if __name__ == "__main__":
    print("开始创建 Odoo 测试种子数据...")
    seed_odoo_test_data()
    print("完成！")
```

#### 3.5.3 003_seed_twenty_test_data.py

```python
"""
种子数据：在 Twenty CRM 和本地表中创建测试数据
运行方式：conda activate bigmodel && python migrations/seed/003_seed_twenty_test_data.py
前置条件：Twenty 服务已启动，Feature Flag feature:v3:twenty=true
"""
import os
import sys
import json
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

TEST_CUSTOMERS = [
    {"name": "华为技术有限公司", "company": "华为", "industry": "通信", "email": "contact@huawei.com"},
    {"name": "阿里巴巴集团", "company": "阿里巴巴", "industry": "互联网", "email": "contact@alibaba.com"},
    {"name": "腾讯控股", "company": "腾讯", "industry": "互联网", "email": "contact@tencent.com"},
]

TEST_OPPORTUNITIES = [
    {"title": "华为AI平台合作", "amount": 500000, "stage": "proposal", "probability": 60, "customer_idx": 0},
    {"title": "阿里云服务采购", "amount": 200000, "stage": "negotiation", "probability": 80, "customer_idx": 1},
    {"title": "腾讯小程序开发", "amount": 150000, "stage": "qualification", "probability": 20, "customer_idx": 2},
]

TEST_CONTRACTS = [
    {"title": "华为AI平台服务合同", "value": 500000, "status": "draft", "customer_idx": 0, "opportunity_idx": 0},
    {"title": "阿里云服务采购合同", "value": 200000, "status": "active", "customer_idx": 1, "opportunity_idx": 1},
]

def seed_twenty_test_data():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users LIMIT 1")
            user_row = cur.fetchone()
            if not user_row:
                print("  跳过：无用户数据")
                return
            user_id = user_row[0]

            customer_ids = []
            for customer in TEST_CUSTOMERS:
                cur.execute(
                    """
                    INSERT INTO crm_customers (agent_user_id, name, company, industry, email)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (user_id, customer["name"], customer["company"],
                     customer["industry"], customer["email"])
                )
                cid = cur.fetchone()[0]
                customer_ids.append(cid)
                print(f"  客户已创建: {customer['name']}")

            opportunity_ids = []
            for opp in TEST_OPPORTUNITIES:
                cur.execute(
                    """
                    INSERT INTO crm_opportunities (agent_user_id, customer_id, title, amount, stage, probability)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (user_id, customer_ids[opp["customer_idx"]], opp["title"],
                     opp["amount"], opp["stage"], opp["probability"])
                )
                oid = cur.fetchone()[0]
                opportunity_ids.append(oid)
                print(f"  商机已创建: {opp['title']}")

            for contract in TEST_CONTRACTS:
                cur.execute(
                    """
                    INSERT INTO crm_contracts (agent_user_id, customer_id, opportunity_id, title, value, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (user_id, customer_ids[contract["customer_idx"]],
                     opportunity_ids[contract["opportunity_idx"]],
                     contract["title"], contract["value"], contract["status"])
                )
                print(f"  合同已创建: {contract['title']}")

            conn.commit()

            cur.execute("SELECT count(*) FROM crm_customers")
            print(f"CRM 客户共 {cur.fetchone()[0]} 条")
            cur.execute("SELECT count(*) FROM crm_opportunities")
            print(f"CRM 商机共 {cur.fetchone()[0]} 条")
            cur.execute("SELECT count(*) FROM crm_contracts")
            print(f"CRM 合同共 {cur.fetchone()[0]} 条")

if __name__ == "__main__":
    print("开始创建 Twenty CRM 测试种子数据...")
    seed_twenty_test_data()
    print("完成！")
```

### 3.6 迁移验证脚本

**迁移后验证**：`migrations/verify/verify_migration.sql`

```sql
-- V3.0 迁移后验证 SQL
-- 所有查询应返回预期值，否则迁移失败

-- 1. 验证新表存在
SELECT 'user_mapping' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='user_mapping') AS exists;
SELECT 'crm_customers' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_customers') AS exists;
SELECT 'crm_opportunities' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_opportunities') AS exists;
SELECT 'crm_contracts' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_contracts') AS exists;
SELECT 'crm_activities' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_activities') AS exists;
SELECT 'oa_workflows' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='oa_workflows') AS exists;
SELECT 'oa_approvals' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='oa_approvals') AS exists;
SELECT 'oa_notifications' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='oa_notifications') AS exists;
SELECT 'oa_schedule' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='oa_schedule') AS exists;
SELECT 'mcp_tools' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='mcp_tools') AS exists;
SELECT 'mcp_executions' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='mcp_executions') AS exists;
SELECT 'bot_messages' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='bot_messages') AS exists;
SELECT 'feature_flags' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='feature_flags') AS exists;
SELECT 'audit_logs' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='audit_logs') AS exists;

-- 2. 验证新列存在且有默认值
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name='conversations' AND column_name IN ('client_type', 'platform');

SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name='messages' AND column_name = 'metadata';

SELECT column_name
FROM information_schema.columns
WHERE table_name='users' AND column_name IN ('odoo_user_id', 'twenty_user_id', 'feishu_user_id', 'dingtalk_user_id');

SELECT column_name
FROM information_schema.columns
WHERE table_name='agent_logs' AND column_name IN ('mcp_tool_calls', 'guardrail_actions');

-- 3. 验证旧表数据完整
SELECT 'documents' AS table_name, count(*) FROM documents;
SELECT 'document_chunks' AS table_name, count(*) FROM document_chunks;
SELECT 'conversations' AS table_name, count(*) FROM conversations;
SELECT 'messages' AS table_name, count(*) FROM messages;
SELECT 'users' AS table_name, count(*) FROM users;

-- 4. 验证 Feature Flag 种子数据
SELECT key, value FROM feature_flags WHERE key LIKE 'feature:v3:%';

-- 5. 验证索引存在
SELECT indexname FROM pg_indexes WHERE tablename='user_mapping';
SELECT indexname FROM pg_indexes WHERE tablename='crm_customers';
SELECT indexname FROM pg_indexes WHERE tablename='oa_approvals';
```

**回滚后验证**：`migrations/verify/verify_rollback.sql`

```sql
-- V3.0 回滚后验证 SQL
-- 验证回滚后 V14 数据库恢复正常

-- 1. 验证 V3.0 新表已删除
SELECT 'user_mapping' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='user_mapping') AS should_be_false;
SELECT 'crm_customers' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_customers') AS should_be_false;
SELECT 'oa_workflows' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='oa_workflows') AS should_be_false;
SELECT 'mcp_tools' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='mcp_tools') AS should_be_false;

-- 2. 验证 V3.0 新列已删除
SELECT count(*) AS should_be_zero
FROM information_schema.columns
WHERE table_name='conversations' AND column_name IN ('client_type', 'platform');

SELECT count(*) AS should_be_zero
FROM information_schema.columns
WHERE table_name='users' AND column_name IN ('odoo_user_id', 'twenty_user_id', 'feishu_user_id', 'dingtalk_user_id');

-- 3. 验证旧表数据完整
SELECT 'documents' AS table_name, count(*) FROM documents;
SELECT 'conversations' AS table_name, count(*) FROM conversations;
SELECT 'messages' AS table_name, count(*) FROM messages;
SELECT 'users' AS table_name, count(*) FROM users;
```

### 3.7 迁移执行流程

```
Phase 1 部署日（T-6周）
│
├── 1. 备份（30min）
│   ├── pg_dump 全量备份
│   ├── Redis BGSAVE + 复制 RDB
│   ├── 复制 .env.docker / .env.local
│   ├── 复制 nginx/default.conf
│   └── Git tag: v3.0.0-phase1-{date}
│
├── 2. 执行迁移（10min）
│   ├── psql -f V3.0_001__create_user_mapping.sql
│   ├── psql -f V3.0_002__create_crm_tables.sql
│   ├── psql -f V3.0_003__create_oa_tables.sql
│   ├── psql -f V3.0_004__create_mcp_bot_audit_tables.sql
│   ├── psql -f V3.0_005__alter_existing_tables.sql
│   ├── psql -f V3.0_006__seed_feature_flags.sql
│   └── psql -f verify/verify_migration.sql → 全部通过
│
├── 3. 验证迁移（5min）
│   ├── V14 代码连接迁移后数据库 → 正常读写
│   ├── V3.0 代码连接迁移后数据库 → 新表可操作
│   ├── conversations 新列有默认值 → V14 不报错
│   └── Feature Flag 全部 false → V3.0 新功能不激活
│
├── 4. 部署 V3.0 代码（5min）
│   ├── docker compose up -d --build
│   └── 等待健康检查通过
│
├── 5. 冒烟测试（10min）
│   ├── curl /api/v1/health → 200
│   ├── curl /api/v1/chat → SSE 正常
│   ├── curl /api/v1/history → 历史对话显示
│   └── curl /api/v2/features → Feature Flag 列表
│
└── 6. 回滚演练（可选，30min）
    ├── 执行回滚脚本
    ├── 验证回滚后数据库
    └── 重新执行迁移
```

### 3.8 Odoo/Twenty 独立数据库说明

**设计决策**：Odoo 和 Twenty 各自使用独立 PostgreSQL 容器，不共享主库 agentdb。

**理由**：
1. **隔离性**：Odoo/Twenty 有自己的 schema 管理和 migration 机制，混入主库会冲突
2. **可维护性**：Odoo/Twenty 升级不影响主库 schema
3. **可回滚性**：停止/删除 Odoo/Twenty 容器即可回滚，无需操作主库
4. **资源隔离**：Odoo/Twenty 的查询不占用主库资源

**Docker Compose 新增**：

```yaml
odoo-db:
  image: postgres:16
  container_name: aiagent_odoo_db
  environment:
    POSTGRES_USER: odoo
    POSTGRES_PASSWORD: ${ODOO_DB_PASSWORD:-odoo_secret}
    POSTGRES_DB: odoo
  volumes:
    - odoo_db_data:/var/lib/postgresql/data
  networks:
    - aiagent_net
  restart: unless-stopped

twenty-db:
  image: postgres:16
  container_name: aiagent_twenty_db
  environment:
    POSTGRES_USER: twenty
    POSTGRES_PASSWORD: ${TWENTY_DB_PASSWORD:-twenty_secret}
    POSTGRES_DB: twenty
  volumes:
    - twenty_db_data:/var/lib/postgresql/data
  networks:
    - aiagent_net
  restart: unless-stopped
```

**本地映射表的作用**：主库中的 `crm_*` / `oa_*` 表是 Odoo/Twenty 数据的**本地缓存/镜像**，用于：
- Agent 快速查询（不直接调 Odoo/Twenty API）
- 审计追踪（记录谁通过 Agent 操作了什么）
- 离线降级（Odoo/Twenty 不可用时读取本地缓存）

**数据同步策略**：

| 方向 | 触发 | 方式 | 延迟 |
|------|------|------|------|
| 本地 → Odoo/Twenty | Agent 操作 | API 调用 + 本地记录 | 实时 |
| Odoo/Twenty → 本地 | 定时同步 | Webhook + 轮询 | ≤5min |
| 冲突处理 | 检测到冲突 | 以 Odoo/Twenty 为准 | 人工确认 |

### 3.9 迁移风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 迁移脚本执行中途失败 | 低 | 中 | 事务包裹 + 幂等性 + 可重入 |
| 新增列 DEFAULT 值不合适 | 低 | 中 | 代码审查 + 测试环境验证 |
| Odoo/Twenty DB 端口与主库冲突 | 低 | 低 | 使用不同端口（5433/5434） |
| 种子数据脚本依赖不满足 | 中 | 低 | 前置条件检查 + 跳过策略 |
| 迁移后 V14 代码报错 | 低 | 高 | 迁移后立即用 V14 代码测试 |
| 回滚脚本不完整 | 低 | 高 | 回滚演练 + 验证脚本 |
| 大表 ADD COLUMN 锁表时间过长 | 低 | 中 | 使用 IF NOT EXISTS + PostgreSQL 在线加列 |
| 新表外键约束导致删除失败 | 低 | 低 | CASCADE 设计 + 回滚脚本顺序正确 |

### 3.10 迁移时间估算

| 迁移步骤 | 预计耗时 | 说明 |
|----------|---------|------|
| 全量备份 | 5-10min | pg_dump ~350MB 数据库 |
| 执行 6 个迁移脚本 | 2-3min | 主要是 CREATE TABLE + ADD COLUMN |
| 执行验证脚本 | 1min | SELECT 查询 |
| V14 兼容性测试 | 5min | 核心 API 冒烟测试 |
| 种子数据（可选） | 2-3min | 仅在需要测试数据时执行 |
| **总计** | **15-22min** | 不含回滚演练 |

---

## 附录

### A. 文档变更记录

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|---------|------|
| 2026-08-13 | v1.0 | 初始版本：兼容性矩阵+回滚方案+数据迁移方案 | AI Agent |

### B. 关联文档

| 文档 | 路径 | 关系 |
|------|------|------|
| V3.0 升级调研报告 | `docs/1-requirements-bugs/v3-upgrade-research-report.md` | 理论基础+风险矩阵 |
| 全局规格 | `docs/3-standards/spec.md` | R026 需求定义 |
| 全局设计 | `docs/3-standards/design.md` | 架构参考 |
| OA/CRM 业务测试指南 | `docs/1-requirements-bugs/oa-crm-business-test-guide.md` | 测试场景 |
| V3.0 系统使用指南 | `docs/1-requirements-bugs/v3-system-user-guide.md` | 端到端测试依据 |
| 开源 OA/CRM 调研 | `docs/1-requirements-bugs/open-source-oa-crm-research.md` | Odoo/Twenty 选型 |
| 个人账号限制调研 | `docs/1-requirements-bugs/wecom-dingtalk-feishu-personal-account-research.md` | 机器人平台选型 |

### C. 待办事项

- [ ] Phase 0：本方案评审通过（PDCP 门禁）
- [ ] Phase 1：迁移脚本在测试环境执行并验证
- [ ] Phase 1：回滚演练通过
- [ ] Phase 1：种子数据脚本执行并验证
- [ ] Phase 2：Odoo/Twenty Docker Compose 配置编写
- [ ] Phase 2：用户映射 API 开发
- [ ] Phase 3：迁移+回滚全流程 E2E 测试