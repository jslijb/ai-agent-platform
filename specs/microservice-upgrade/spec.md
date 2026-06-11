# 微服务架构快速升级 Spec

**版本**: 2.0 (AI Coding 加速版)
**方法论**: SDD + TDD
**目标**: 快速升级，系统性能不减，维护大幅度缩减，不引入新错误

---

## Why

项目当前为 Next.js 模块化整体式架构，所有功能运行在单一 Node.js 进程中。三个真实痛点驱动升级：评估任务 OOM 拖垮全站、RAG 迭代需全量重启、LLM 调用无法独立限流扩容。AI Coding 时代开发效率提升 5-10 倍，传统渐进式升级不再必要，一次性拆分更快更稳。

## What Changes

- **BREAKING**：单一 Next.js 进程拆分为 4 个独立服务（主服务 + RAG + LLM Gateway + 评估）
- **BREAKING**：服务间通信从进程内函数调用改为 HTTP REST + BullMQ 消息队列
- 新增 Docker Compose 编排 10 个服务（4 应用 + 6 基础设施）
- 新增 Nginx API Gateway 路由规则
- 新增 traceId 分布式追踪
- 新增服务健康检查与优雅降级
- 保持数据库共享（PostgreSQL 不拆分）
- 保持前端 SSR 在主服务中（不拆分）

## Impact

- Affected specs: `infra-migration`（Docker Compose 重写）、`agent-memory-and-evaluation`（评估服务独立部署）、`agent-tool-routing-optimization`（Agent→RAG 调用改为跨服务）
- Affected code: `docker-compose.yml`、`nginx/default.conf`、`src/server/rag/`、`src/server/llm/`、`src/server/evaluation/`、`src/server/agents/`、`src/app/api/`

---

## 核心策略：薄封装，不重写

传统微服务升级需要"迁移代码到新服务"，本项目采用**薄封装策略**：

1. **Fastify 服务仅做路由层**：导入现有 TypeScript 模块，包装为 REST API
2. **Client SDK 仅做 HTTP 封装**：fetch + 超时 + 降级，与原函数签名一致
3. **主服务仅改调用方式**：`hybridSearch()` → `ragClient.search()`，接口不变
4. **零代码重写**：现有业务逻辑一行不改，只改调用入口

这意味着：
- 现有 174 个单元测试全部继续有效
- 现有 46 个集成测试全部继续有效
- 新增测试仅覆盖跨服务调用链

---

## ADDED Requirements

### Requirement: 微服务拆分架构

系统 SHALL 拆分为以下 4 个独立服务：

| 服务 | 职责 | 技术栈 | 端口 | 源码位置 |
|------|------|--------|------|---------|
| 主服务（Main） | 前端SSR + API Route + tRPC + Agent + MCP + 认证 | Next.js | 3000 | `src/`（现有） |
| RAG 服务 | 检索 + Embedding + Reranker + 分块 + 图谱检索 | Fastify | 3001 | `services/rag-service/` |
| LLM Gateway | 降级链 + 熔断 + 缓存 + 限流 + Token 统计 | Fastify | 3002 | `services/llm-gateway/` |
| 评估服务 | RAG 评估 + Agent 评估 + 回归测试 + 版本管理 | Fastify | 3003 | `services/evaluation-service/` |

#### Scenario: 服务独立启动
- **WHEN** 执行 `docker compose up rag-service`
- **THEN** 仅 RAG 服务及其依赖（PostgreSQL、Embedding、Reranker）启动
- **AND** 其他服务不启动

#### Scenario: 单服务崩溃不影响其他服务
- **WHEN** 评估服务因 OOM 崩溃
- **THEN** 主服务、RAG 服务、LLM Gateway 正常运行
- **AND** 用户聊天功能不受影响
- **AND** 评估服务由 Docker 自动重启

### Requirement: 服务间通信协议

系统 SHALL 按场景选择通信协议：

| 调用方 | 被调用方 | 协议 | 原因 |
|--------|---------|------|------|
| 主服务 → RAG 服务 | HTTP REST | 延迟容忍、调试方便 |
| 主服务 → LLM Gateway | HTTP REST | 需流式代理 |
| 主服务 → 评估服务 | BullMQ 消息队列 | 异步执行、解耦 |
| 评估服务 → RAG 服务 | HTTP REST | 评估时需检索 |
| 评估服务 → LLM Gateway | HTTP REST | 评估时需生成答案 |

#### Scenario: RAG 检索跨服务调用
- **WHEN** 主服务中的 Agent 需要检索
- **THEN** 调用 `http://rag-service:3001/api/retrieve` 并传入 query 和 options
- **AND** 响应时间与进程内调用差异 < 50ms
- **AND** 如果 RAG 服务不可用，返回空结果而非抛出异常

#### Scenario: 评估任务异步执行
- **WHEN** 用户触发评估
- **THEN** 主服务将评估任务推入 BullMQ 队列
- **AND** 评估服务从队列消费任务并执行
- **AND** 主服务通过轮询 `/api/evaluation/status/:taskId` 获取进度

### Requirement: RAG 服务 REST API

RAG 服务 SHALL 提供以下 API（薄封装现有模块）：

| 端点 | 方法 | 封装模块 | 请求体 | 响应体 |
|------|------|---------|--------|--------|
| `/api/retrieve` | POST | `hybrid-retriever.ts` | `{ query, topK?, options? }` | `{ success, results, latencyMs }` |
| `/api/embed` | POST | `dense-retriever.ts` | `{ texts }` | `{ embeddings }` |
| `/api/rerank` | POST | `reranker.ts` | `{ query, documents, topK? }` | `{ results }` |
| `/api/chunk` | POST | `semantic-chunker.ts` | `{ text, options? }` | `{ chunks }` |
| `/api/health` | GET | — | — | `{ status: "ok", uptime, db: boolean }` |

#### Scenario: RAG 策略热更新
- **WHEN** 修改 RAG 服务的检索配置（如 RRF K 值、Reranker 阈值）
- **THEN** 仅需重启 RAG 服务，主服务和其他服务不受影响
- **AND** 重启期间主服务返回"检索服务暂时不可用"而非崩溃

### Requirement: LLM Gateway REST API

LLM Gateway SHALL 提供以下 API（薄封装现有模块）：

| 端点 | 方法 | 封装模块 | 请求体 | 响应体 |
|------|------|---------|--------|--------|
| `/api/llm/chat` | POST | `router.ts` + `callWithFallback` | `{ messages, options? }` | `{ content, model, usage }` |
| `/api/llm/stream` | POST | `router.ts` + 流式 | `{ messages, options? }` | SSE 流 |
| `/api/llm/usage` | GET | — | — | `{ totalTokens, byModel, byDate }` |
| `/api/health` | GET | — | — | `{ status: "ok", uptime, circuitBreaker: string }` |

#### Scenario: LLM 降级链跨服务
- **WHEN** 主服务调用 `http://llm-gateway:3002/api/llm/chat`
- **THEN** LLM Gateway 按 qwen-max → qwen-plus → qwen-turbo 顺序尝试
- **AND** 返回最终成功的模型响应和使用的模型 ID
- **AND** 如果所有模型失败，返回 503 和错误信息

### Requirement: 评估服务异步执行

评估服务 SHALL 通过 BullMQ 消息队列接收评估任务：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/evaluation/run` | POST | 推送评估任务到队列，立即返回 taskId |
| `/api/evaluation/status/:taskId` | GET | 查询任务进度 |
| `/api/evaluation/results` | GET | 获取评估结果 |
| `/api/health` | GET | 健康检查 |

#### Scenario: 评估不阻塞主服务
- **WHEN** 用户触发 full 模式评估（303 条，预计 45 分钟）
- **THEN** 主服务立即返回 taskId
- **AND** 评估在独立进程中异步执行
- **AND** 评估期间用户聊天不受影响

### Requirement: Client SDK 薄封装

每个 Client SDK SHALL 满足以下约束：

1. **接口一致性**：SDK 方法签名与原函数签名一致（或兼容）
2. **超时控制**：默认 30 秒超时，可配置
3. **优雅降级**：服务不可用时返回空结果/默认值，不抛出异常
4. **重试机制**：网络错误自动重试 1 次
5. **traceId 透传**：自动将 traceId 注入 HTTP Header

#### Scenario: RAG Client SDK 降级
- **WHEN** RAG 服务不可用（连接超时或返回 5xx）
- **THEN** `ragClient.search()` 返回 `{ success: false, results: [], error: "RAG服务暂时不可用" }`
- **AND** 主服务 Agent 继续运行，告知用户"检索服务暂时不可用"

### Requirement: API Gateway 路由

Nginx SHALL 作为 API Gateway 统一路由外部请求：

| 路径 | 目标服务 | 说明 |
|------|---------|------|
| `/` | 主服务:3000 | 前端 SSR |
| `/api/agent/*` | 主服务:3000 | Agent API |
| `/api/chat/*` | 主服务:3000 | 聊天 API |
| `/api/document/*` | 主服务:3000 | 文档 API |
| `/api/evaluation/*` | 主服务:3000 → 评估服务:3003 | 评估 API（代理） |
| `/api/llm/*` | LLM Gateway:3002 | LLM API |
| `/api/mcp/*` | 主服务:3000 | MCP SSE |
| `/internal/rag/*` | RAG 服务:3001 | 内部 RAG API（仅容器网络） |

#### Scenario: 外部请求路由
- **WHEN** 外部请求到达 Nginx
- **THEN** Nginx 根据路径前缀转发到对应服务
- **AND** 内部 API（`/internal/*`）不对外暴露

### Requirement: 分布式追踪 traceId

系统 SHALL 实现轻量级分布式追踪：

1. 主服务在请求入口生成 traceId（UUID v4）
2. 所有跨服务调用通过 HTTP Header `X-Trace-Id` 透传
3. 所有服务日志包含 traceId 字段
4. 可通过 traceId 在日志中追踪完整调用链

#### Scenario: 跨服务请求追踪
- **WHEN** 用户发起聊天请求（经主服务 → LLM Gateway → RAG 服务）
- **THEN** 所有服务日志包含相同的 traceId
- **AND** 通过 `grep <traceId>` 可查看完整调用链

### Requirement: 数据库共享策略

系统 SHALL 保持 PostgreSQL 为共享数据库，不按服务拆分：

1. 所有服务连接同一个 PostgreSQL 实例
2. 每个服务使用独立的数据库连接池（最大 10 连接）
3. RAG 服务独占 pgvector 相关表（Embedding）
4. 评估服务独占 evaluation_* 表
5. 主服务访问其他所有表

#### Scenario: 跨服务数据一致性
- **WHEN** 评估服务写入 evaluation_versions 记录
- **THEN** 主服务可以立即查询到该记录
- **AND** 无需分布式事务（同一数据库，单事务保证）

---

## MODIFIED Requirements

### Requirement: Docker Compose 编排

Docker Compose SHALL 从当前 6 个服务扩展为 10 个服务：

| 服务 | 镜像 | 新增/修改 |
|------|------|----------|
| postgres | pgvector/pgvector:pg16 | 不变 |
| redis | redis:7-alpine | 不变 |
| neo4j | neo4j:5 | 不变 |
| embedding | llama.cpp:server | 不变 |
| reranker | llama.cpp:server | 不变 |
| nginx | nginx:alpine | **修改**：增加路由规则 |
| main-service | 自建镜像 | **新增** |
| rag-service | 自建镜像 | **新增** |
| llm-gateway | 自建镜像 | **新增** |
| evaluation-service | 自建镜像 | **新增** |

### Requirement: Agent→RAG 调用方式

Agent 对 RAG 的调用 SHALL 从进程内函数调用改为 HTTP REST 调用：

- 之前：`const results = await hybridSearch(query, 5)`
- 之后：`const results = await ragClient.search(query, 5)`

ragClient 内部调用 `http://rag-service:3001/api/retrieve`，并提供降级逻辑（RAG 服务不可用时返回空结果）。

---

## REMOVED Requirements

### Requirement: 单一 Node.js 进程运行所有功能
**Reason**: 微服务拆分后，各功能运行在独立进程中
**Migration**: Docker Compose 编排多个服务，Nginx 统一路由

---

## 技术选型

| 维度 | 选型 | 理由 |
|------|------|------|
| 服务框架 | Fastify（RAG/LLM/评估） | 比 Express 快 3 倍，TypeScript 原生支持 |
| 消息队列 | BullMQ (Redis) | 项目已有 Redis，无需新增基础设施 |
| 服务间同步调用 | HTTP REST | 调试方便，比 gRPC 简单 |
| 服务发现 | Docker Compose DNS | 10 个服务以内不需要 Consul/Nacos |
| 配置中心 | 环境变量 + .env | 10 个服务以内不需要 etcd |
| 链路追踪 | traceId 透传（HTTP Header） | 比 Jaeger 简单，10 个服务内够用 |
| 容器编排 | Docker Compose | 10 个服务以内不需要 K8s |

## 约束

1. **性能不减**：跨服务调用延迟增加 < 50ms（当前进程内调用 < 1ms，HTTP 调用 < 50ms）
2. **不引入新 Bug**：薄封装策略 + TDD 保证，现有测试全部继续有效
3. **SDD + TDD**：先写 API 合约 → 再写集成测试 → 最后写实现
4. **数据库不拆**：保持 PostgreSQL 共享，避免分布式事务
5. **前端不拆**：SSR 保持在主服务，避免额外复杂度
6. **Agent 不拆**：Agent 和 RAG 的紧密调用保持 HTTP 直连，不经过消息队列
7. **薄封装不重写**：Fastify 服务仅做路由层，导入现有模块，零代码重写

## 延迟项（本次不实现）

以下项目在核心架构稳定后再追加，不阻塞本次升级：

- CI/CD 流水线（GitHub Actions）
- Prometheus + Grafana 监控
- Loki 日志聚合
- 告警规则
- 镜像仓库推送

理由：核心目标是服务拆分 + 故障隔离 + 独立部署。监控和 CI/CD 是锦上添花，不影响架构正确性。AI Coding 时代，先跑通再迭代。
