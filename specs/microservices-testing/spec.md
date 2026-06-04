# 微服务全面测试规范 (SDD + TDD)

**版本**: 1.0
**日期**: 2026-06-01
**状态**: 规划中
**方法论**: Specification-Driven Development + Test-Driven Development

---

## 1. 架构概览

### 1.1 微服务拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                         nginx (:80)                              │
│                    API Gateway / 反向代理                         │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│main-svc  │  │rag-svc   │  │llm-gw    │  │eval-svc      │
│ :3000    │  │ :3001    │  │ :3002    │  │ :3003        │
│ Next.js  │  │ Fastify  │  │ Fastify  │  │ Fastify      │
└──┬───┬───┘  └──┬───┬───┘  └──┬───┬───┘  └──┬───┬───────┘
   │   │         │   │         │   │         │   │
   │   │   ┌─────┘   │   ┌─────┘   │   ┌─────┘   │
   │   │   │   ┌─────┘   │   ┌─────┘   │   ┌─────┘
   ▼   ▼   ▼   ▼         ▼   ▼         ▼   ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐
│ PG   │ │Redis │ │Neo4j │ │Embed │ │data-service  │
│ :5432│ │ :6379│ │ :7687│ │ :8011│ │ :8001(Python)│
│pgvec │ │BullMQ│ │graph │ │bge-m3│ │FastAPI       │
└──────┘ └──────┘ └──────┘ └──────┘ └──────────────┘
                                      │
                              ┌───────┘
                              ▼
                      ┌──────────────┐
                      │  reranker    │
                      │  :8010       │
                      │  bge-rerank  │
                      └──────────────┘
```

### 1.2 服务职责矩阵

| 服务 | 端口 | 运行时 | 职责 | 依赖 |
|------|------|--------|------|------|
| **main-service** | 3000 | Next.js | Agent 编排、用户界面、API 路由、Skill 系统、工具注册、记忆管理 | PG, Redis, Neo4j, rag-svc, llm-gw, data-svc |
| **rag-service** | 3001 | Fastify | 混合检索、Embedding、重排序、文本分块、评估任务 | PG, Redis, Embedding, Reranker |
| **llm-gateway** | 3002 | Fastify | LLM 调用路由、模型切换、流式输出、限流、熔断 | Redis |
| **evaluation-service** | 3003 | Fastify | 评估任务队列、RAG 评估、回归测试 | PG, Redis |
| **data-service** | 8001 | Python | 交易数据、财报数据、实时行情 | baostock, efinance, mootdx |
| **embedding** | 8011 | llama.cpp | 文本向量化 (bge-m3) | 模型文件 |
| **reranker** | 8010 | llama.cpp | 文档重排序 (bge-reranker-v2-m3) | 模型文件 |
| **postgres** | 5432 | pgvector | 主数据库、向量存储、日志 | — |
| **redis** | 6379 | Redis 7 | 缓存、BullMQ 消息队列、限流 | — |
| **neo4j** | 7687 | Neo4j 5 | 知识图谱存储 | — |
| **nginx** | 80 | nginx | 反向代理、负载均衡 | — |

### 1.3 服务间通信矩阵

| 调用方 | 被调用方 | 协议 | 降级策略 |
|--------|---------|------|---------|
| main-service | rag-service | HTTP (POST /api/retrieve) | 进程内 hybridSearch |
| main-service | rag-service | HTTP (POST /api/embed) | 进程内 generateEmbedding |
| main-service | rag-service | HTTP (POST /api/chunk) | 进程内 cleanText + chunkText |
| main-service | llm-gateway | HTTP (POST /api/llm/chat) | 进程内 callWithFallback |
| main-service | llm-gateway | HTTP (POST /api/llm/stream) | 进程内流式调用 |
| main-service | evaluation-service | HTTP (POST /api/evaluation/run) | 进程内 triggerEvaluation |
| main-service | data-service | HTTP (GET/POST) | 无降级（唯一数据源） |
| rag-service | evaluation (BullMQ) | Redis Queue | — |
| 所有服务 | 自身 | HTTP (GET /api/health) | — |

---

## 2. SDD + TDD 方法论

### 2.1 SDD (Specification-Driven Development)

**先写 Spec，再写代码**。本 spec 即 Spec。

开发流程：
1. **Spec 定义** → 本 spec.md 定义每个服务的 API 契约、行为、边界条件
2. **Spec 评审** → 确认 Spec 覆盖所有场景
3. **自动生成测试骨架** → 从 Spec 生成测试用例结构
4. **实现** → 按照 Spec 实现服务代码
5. **验证** → 测试必须全部通过

### 2.2 TDD (Test-Driven Development)

**红-绿-重构**循环：

```
RED   →  写一个失败的测试（验证测试确实能失败）
GREEN →  写最小代码让测试通过
REFACTOR → 重构代码，保持测试通过
```

### 2.3 测试金字塔

```
        ┌───────┐
        │ E2E   │  10% — 关键用户旅程
        ├───────┤
        │ 集成  │  30% — 服务间契约
        ├───────┤
        │ 服务  │  30% — API 契约 + 行为
        ├───────┤
        │ 单元  │  30% — 函数/模块逻辑
        └───────┘
```

### 2.4 测试优先级（按风险排序）

| 优先级 | 测试类型 | 理由 |
|--------|---------|------|
| P0 | 服务健康检查 | 所有服务必须能启动并通过 /api/health |
| P0 | 服务间契约测试 | 接口变更必须被两边测试捕获 |
| P0 | 降级路径测试 | 微服务不可用时系统不能崩溃 |
| P1 | 数据一致性测试 | 跨服务数据流转必须正确 |
| P1 | 消息队列测试 (BullMQ) | 异步任务必须可靠 |
| P1 | 限流/熔断测试 | 保护系统不被过载 |
| P2 | 性能基准测试 | 延迟和吞吐量达标 |
| P2 | 并发/压力测试 | 多用户同时访问的稳定性 |

---

## 3. 测试层级定义

### 3.1 L1: 单元测试 (Unit Tests)

**范围**: 单个服务内的函数/模块
**Mock**: 外部依赖（数据库、其他服务、网络调用）
**框架**: vitest
**目标覆盖率**: ≥80%

**每个服务必须覆盖**:
- 纯函数逻辑（计算、转换、校验）
- 错误处理分支
- 边界条件（空值、null、undefined、极大/极小值）
- 配置解析

### 3.2 L2: 服务契约测试 (Service Contract Tests)

**范围**: 单个服务的 HTTP API
**Mock**: 服务依赖的外部服务（用 mock server）
**验证**: API 输入/输出 schema、HTTP 状态码、错误格式、Trace-Id 传播

**每个端点必须覆盖**:
- 正常请求 → 200 + 正确响应体
- 缺少必填参数 → 400 + 错误信息
- 无效参数 → 400 + 错误信息
- 内部错误 → 500 + 错误信息（不暴露内部细节）
- 健康检查 → 200 + 服务状态

### 3.3 L3: 集成测试 (Integration Tests)

**范围**: 2+ 服务间的真实通信
**环境**: 真实服务实例（或 Docker Compose）
**验证**: 服务间 HTTP 调用、数据流转、Trace-Id 传播、降级行为

**每条通信路径必须覆盖**:
- 正常调用链路
- 被调用服务超时 → 降级
- 被调用服务 500 → 降级
- 被调用服务不可达 → 降级
- Trace-Id 从调用方传播到被调用方

### 3.4 L4: 端到端测试 (E2E Tests)

**范围**: 完整用户旅程
**环境**: 全服务 Docker Compose
**验证**: 用户角度验证功能正确性

**关键旅程**:
- 用户提问 → Agent 路由 → RAG 检索 → LLM 回答
- 用户提问 → Skill 执行 → 多工具调用 → 结果返回
- 文档上传 → 文本清洗 → 切片 → Embedding → 入库

---

## 4. 服务级测试规范

### 4.1 main-service (:3000)

#### 单元测试

| 模块 | 测试文件 | 关键函数 | 优先级 |
|------|---------|---------|--------|
| 记忆系统 | `tests/unit/test-memory-system.ts` | calculateTokenBudget, assembleContext, formatUserProfileForPrompt | P0 |
| 记忆重合 | `tests/unit/test-memory-overlap.ts` | 记忆去重与合并 | P0 |
| Skill 系统 | `tests/unit/test-skill-system.ts` | executeSkill, executeEnhancedSkill | P0 |
| 工具注册 | `tests/unit/tool-registry.test.ts` | register, get, listByGroup | P0 |
| 工具校验 | `src/server/__tests__/validation.test.ts` | ToolCallValidator, CallLimiter | P0 |
| 别名解析 | `src/server/__tests__/name-aliases.test.ts` | resolveToolName | P0 |
| 路由分组 | `src/server/__tests__/routing.test.ts` | ToolGroupManager, GroupRouter, SkillRouter | P0 |
| 描述增强 | `src/server/__tests__/description.test.ts` | ToolDescriptionEnhancer, FewShotInjector | P0 |
| 配置解析 | `tests/unit/test-config-resolution.ts` | resolveEnvVars | P1 |
| LLM 路由 | `tests/unit/test-llm-router.ts` | callWithFallback, getModelChain | P1 |
| 服务适配器 | `tests/unit/service-adapter.test.ts` | searchRAG, callLLM, pushEvaluationTask | P0 |

#### 服务契约测试 (API)

| 端点 | 方法 | 测试场景 |
|------|------|---------|
| `/api/health` | GET | 正常返回 200 + `{status, uptime, service, details}` |
| `/api/agent/run` | POST | 正常 query → 200 + `{answer, iterations, steps}` |
| `/api/agent/run` | POST | 空 query → 400 |
| `/api/agent/stream` | POST | SSE 流式输出 |
| `/api/rag/search` | POST | 正常检索 → 200 + `{results}` |
| `/api/rag/search` | POST | 空 query → 400 |
| `/api/rag/answer-with-citation` | POST | 带引用的回答 |
| `/api/document/upload` | POST | 文件上传 |
| `/api/memories` | GET | 获取记忆列表 |
| `/api/memories` | POST | 创建记忆 |

#### 服务间集成测试

| 调用路径 | 正常场景 | 降级场景 |
|---------|---------|---------|
| main → rag-service (retrieve) | rag-service 正常返回 | rag-service 超时 → 进程内回退 |
| main → rag-service (embed) | rag-service 正常返回 | rag-service 500 → 进程内回退 |
| main → rag-service (chunk) | rag-service 正常返回 | rag-service 不可达 → 进程内回退 |
| main → llm-gateway (chat) | llm-gateway 正常返回 | llm-gateway 超时 → 进程内回退 |
| main → llm-gateway (stream) | llm-gateway SSE 输出 | llm-gateway 500 → 进程内回退 |
| main → evaluation-service | evaluation-service 正常返回 | evaluation-service 不可达 → 进程内回退 |
| main → data-service | data-service 正常返回 | 无降级（唯一数据源） |

---

### 4.2 rag-service (:3001)

#### 单元测试

| 模块 | 测试文件 | 关键函数 |
|------|---------|---------|
| 文本清洗 | `src/server/rag/chunking/text-cleaner.test.ts` | cleanText, fixChunkBoundaries |
| 语义切片 | `tests/unit/test-semantic-chunker-integration.ts` | chunkText |
| BM25 预处理 | `tests/unit/test-sparse-retriever-preprocess.ts` | preprocess |
| Dense 检索 | `tests/unit/test-dense-retriever-truncation.ts` | truncateForEmbedding, generateEmbedding |
| 混合检索 | `tests/unit/hybrid-retriever.test.ts` | hybridSearch |
| 重排序 | `tests/unit/reranker.test.ts` | rerank |

#### 服务契约测试 (API)

| 端点 | 方法 | 正常响应 | 错误响应 |
|------|------|---------|---------|
| `/api/health` | GET | `{status:"ok", service:"rag-service", details:{db,redis}}` | `{status:"degraded"}` |
| `/api/retrieve` | POST | `{success:true, results:[...], latencyMs}` | 400: `{success:false, error:"query 参数必填"}` |
| `/api/embed` | POST | `{embeddings:[...]}` | 400: `{error:"texts 参数必填"}` |
| `/api/rerank` | POST | `{results:[...]}` | 400: `{error:"query 和 documents 参数必填"}` |
| `/api/chunk` | POST | `{chunks:[...]}` | 400: `{error:"text 参数必填"}` |
| `/api/evaluation/run` | POST | `{taskId, status:"queued"}` | — |
| `/api/evaluation/status/:taskId` | GET | `{taskId, status:"running\|completed\|failed"}` | `{error:"任务不存在"}` |
| `/api/evaluation/results` | GET | `{versions:[...]}` | — |

#### 数据一致性测试

| 场景 | 验证 |
|------|------|
| retrieve 返回结果与直接调用 hybridSearch 一致 | 结果数量、内容相同 |
| embed 返回的向量维度 = 1024 | 每个 embedding.length === 1024 |
| chunk 输出无标点开头切片 | !chunks.some(c => /^[，。、；]/.test(c.text)) |
| 相同输入 chunk 输出幂等 | 两次调用结果一致 |

---

### 4.3 llm-gateway (:3002)

#### 单元测试

| 模块 | 测试文件 | 关键函数 |
|------|---------|---------|
| LLM 路由 | `tests/unit/test-llm-router.ts` | callWithFallback, getModelChain |
| 限流器 | `tests/unit/rate-limiter.test.ts` | checkRateLimit |
| 熔断器 | `tests/unit/circuit-breaker.test.ts` | getCircuitState, recordSuccess, recordFailure |

#### 服务契约测试 (API)

| 端点 | 方法 | 正常响应 | 错误响应 |
|------|------|---------|---------|
| `/api/health` | GET | `{status:"ok", service:"llm-gateway", details:{circuitBreaker,redis}}` | `{status:"degraded"}` |
| `/api/llm/chat` | POST | `{content, model, usage, toolCalls}` | 400: `{content:null, error:"messages 参数必填"}` |
| `/api/llm/chat` | POST | 限流触发 → 429 | `{content:null, error:"请求过于频繁"}` |
| `/api/llm/stream` | POST | SSE 流 | — |
| `/api/llm/usage` | GET | `{totalTokens, byModel, byDate}` | — |

#### 模型自动切换测试

| 场景 | 预期 |
|------|------|
| 模型1 正常 | 使用模型1 |
| 模型1 429 → 模型2 | 自动切换到模型2 |
| 模型2 503 → 模型3 | 自动切换到模型3 |
| 所有模型失败 | 返回 503 + 错误信息 |
| api_keys.yaml 动态变化 | 启动时读取最新配置，模型数可变 |

#### 限流/熔断测试

| 场景 | 预期 |
|------|------|
| 正常请求 | 200 |
| 超过限流阈值 | 429 |
| 连续失败 → 熔断打开 | circuitState = "open" |
| 冷却后 → 半开 | 试探性请求 |
| 恢复 → 关闭 | circuitState = "closed" |

---

### 4.4 evaluation-service (:3003)

#### 服务契约测试

| 端点 | 方法 | 正常响应 |
|------|------|---------|
| `/api/health` | GET | `{status:"ok", service:"evaluation-service", details:{redis,db}}` |
| `/api/evaluation/run` | POST | `{taskId, status:"queued"}` |
| `/api/evaluation/status/:taskId` | GET | `{taskId, status, progress}` |
| `/api/evaluation/results` | GET | `{versions:[...]}` |

#### 异步任务测试 (BullMQ)

| 场景 | 验证 |
|------|------|
| 提交评估任务 | 任务进入队列，status="queued" |
| Worker 正常执行 | status → "running" → "completed" |
| Worker 执行失败 | status → "failed"，error 非空 |
| 任务幂等性 | 相同参数提交两次，不重复执行 |

---

### 4.5 data-service (:8001)

#### 服务契约测试 (Python API)

| 端点 | 方法 | 正常响应 | 错误响应 |
|------|------|---------|---------|
| `/health` | GET | `{"status":"ok"}` | — |
| `/api/market/history` | POST | `{"data":[...], "count": N}` | 400: `{"error":"..."}` |
| `/api/market/realtime` | POST | `{"latestPrice":..., "change":...}` | 400: `{"error":"..."}` |
| `/api/financial/profit` | GET | `{"data":[...]}` | 400: `{"error":"..."}` |

#### 数据源降级测试

| 场景 | 预期 |
|------|------|
| efinance 可用 | 优先使用 efinance |
| efinance 失败 → baostock | 自动降级，数据正常返回 |
| 所有数据源失败 | 返回明确错误，列出尝试的源 |
| 缓存命中 | 不调用外部 API，响应 < 100ms |

#### 真实数据验证

| 数据 | 股票 | 预期 |
|------|------|------|
| 历史K线 | sz.000858 (五粮液) | ≥242 条，含 date/open/high/low/close |
| 历史K线 | sz.000066 (中国长城) | ≥243 条 |
| 历史K线 | sz.000651 (格力电器) | ≥243 条 |
| 利润表 | sz.000066, 2025, Q4 | 含 revenue, netProfit, roeAvg |
| 实时行情 | 000858 | 含 latestPrice, change |
| 指数数据 | sh.000001 | ≥200 条 |

---

### 4.6 embedding (:8011) & reranker (:8010)

#### 服务契约测试

| 服务 | 端点 | 验证 |
|------|------|------|
| embedding | `GET /health` | 200 |
| embedding | `POST /embedding` | 返回 1024 维向量 |
| reranker | `GET /health` | 200 |
| reranker | `POST /reranking` | 返回排序后的文档列表 |

#### 性能基准测试

| 指标 | 目标 |
|------|------|
| embedding 单次延迟 (P50) | < 500ms |
| embedding 单次延迟 (P95) | < 1000ms |
| reranker 单次延迟 (P50) | < 300ms |
| reranker 单次延迟 (P95) | < 800ms |

---

## 5. 跨服务集成测试路径

### 路径 1: 全链路 — 用户提问 → Agent → RAG → LLM → 回答

```
用户 → main-service (:3000) → rag-service (:3001) → embedding (:8011)
                            → llm-gateway (:3002)
                            ← 回答
```

| # | 场景 | 预期 |
|---|------|------|
| I1.1 | 正常流程 | 回答基于检索结果，非空 |
| I1.2 | rag-service 不可用 | 降级到进程内检索，回答正常 |
| I1.3 | llm-gateway 不可用 | 降级到进程内 LLM，回答正常 |
| I1.4 | rag-service + llm-gateway 都不可用 | 降级到进程内全部，回答正常 |
| I1.5 | Trace-Id 全链路传播 | 所有服务日志含相同 Trace-Id |

### 路径 2: 文档上传 → 清洗 → 切片 → Embedding → 入库

```
用户 → main-service (:3000) → rag-service (:3001) → embedding (:8011)
                                                   → PostgreSQL
```

| # | 场景 | 预期 |
|---|------|------|
| I2.1 | PDF 上传 → 全链路 | 文档入库，可检索 |
| I2.2 | 空文件上传 | 400 错误 |
| I2.3 | 超大文件（>100MB） | 400 或 413 错误 |
| I2.4 | embedding 不可用 | 入库失败，明确错误信息 |

### 路径 3: 评估任务 → 消息队列 → 异步执行

```
用户 → evaluation-service (:3003) → Redis (BullMQ) → Worker → PostgreSQL
```

| # | 场景 | 预期 |
|---|------|------|
| I3.1 | 标准评估 | 任务入队，异步完成，结果入库 |
| I3.2 | 全面评估 | 含开源数据集评估 |
| I3.3 | Redis 不可用 | 任务提交失败，明确错误 |
| I3.4 | Worker 崩溃后恢复 | 任务不丢失，重新执行 |

### 路径 4: 数据服务降级链

```
main-service → data-service (:8001) → efinance → baostock → mootdx
```

| # | 场景 | 预期 |
|---|------|------|
| I4.1 | 正常获取 | 数据正确返回 |
| I4.2 | efinance 失败 | 自动降级 baostock |
| I4.3 | baostock 也失败 | 降级 mootdx |
| I4.4 | 全部失败 | 明确错误 + 列出尝试的源 |

### 路径 5: 模型自动切换

```
main-service → llm-gateway (:3002) → 模型1 → 模型2 → ... → 模型N
```

| # | 场景 | 预期 |
|---|------|------|
| I5.1 | 模型1 正常 | 使用模型1 |
| I5.2 | 模型1 429 → 模型2 | 自动切换 |
| I5.3 | 前一模型恢复 | 继续使用当前模型，不回退 |
| I5.4 | api_keys.yaml 动态更新 | 重启后读取新配置 |

---

## 6. 基础设施测试

### 6.1 数据库

| # | 测试 | 验证 |
|---|------|------|
| DB1 | PostgreSQL 连接 | pg_isready 成功 |
| DB2 | pgvector 扩展 | `SELECT 1 FROM pg_extension WHERE extname='vector'` |
| DB3 | 关键表存在 | agent_logs, llm_usage_logs, embeddings, memories, documents |
| DB4 | Neo4j 连接 | `RETURN 1` 成功 |
| DB5 | Redis 连接 | PING → PONG |
| DB6 | Redis 持久化 | 重启后数据不丢失 |

### 6.2 Docker Compose 健康检查

| # | 测试 | 验证 |
|---|------|------|
| HC1 | 所有服务健康检查通过 | `docker compose ps` 全部 healthy |
| HC2 | 服务启动顺序正确 | depends_on 被遵守 |
| HC3 | 网络隔离 | 外部无法直接访问内部服务 |

---

## 7. 真实数据约定

| 股票 | 代码 | baostock | 利润表 | PDF 年报 | BM25 索引 | 历史K线 |
|------|------|----------|--------|---------|----------|---------|
| 五粮液 | 000858 | sz.000858 | ✅ | ✅ | ✅ | ~242条 |
| 中国长城 | 000066 | sz.000066 | ✅ | ✅ | ✅ | ~243条 |
| 格力电器 | 000651 | sz.000651 | ✅ | ✅ | ✅ | ~243条 |

> **数据来源**: 交易数据全部从 data_service (:8001) 获取；PDF 年报全文检索通过 rag-service (:3001) 的 BM25 + Dense 混合检索；BM25 索引已从 DB 构建，无需重建。

> **api_keys.yaml**: 模型配置动态变化，模型数量可能 > 6 或 < 6，测试代码动态加载，不写死数量。

---

## 8. 测试执行计划

```bash
# L1: 单元测试（每个服务独立运行）
npm run test -- tests/unit/                          # main-service 单元测试
npm run test -- services/rag-service                 # rag-service 单元测试
npm run test -- services/llm-gateway                 # llm-gateway 单元测试
npm run test -- services/evaluation-service          # evaluation-service 单元测试

# L2: 服务契约测试（需要目标服务运行）
npm run test -- tests/contract/                      # 所有服务契约测试

# L3: 集成测试（需要 Docker Compose 或相关服务运行）
npm run test -- tests/integration/                   # 跨服务集成测试

# L4: E2E 测试（需要全服务 Docker Compose）
npm run test -- tests/e2e/                           # 端到端测试

# 基础设施测试
npm run test -- tests/infrastructure/                # DB/Redis/Neo4j 连接测试

# 全部测试
npm run test
```

---

## 9. 测试文件目录结构

```
tests/
├── unit/                          # L1: 单元测试
│   ├── test-memory-system.ts      # ✅ 已有
│   ├── test-memory-overlap.ts     # ✅ 已有
│   ├── test-skill-system.ts       # ✅ 已有
│   ├── test-config-resolution.ts  # ✅ 已有
│   ├── test-drizzle-runtime.ts    # ✅ 已有
│   ├── test-dense-retriever-truncation.ts  # ✅ 已有
│   ├── test-semantic-chunker-integration.ts # ✅ 已有
│   ├── test-sparse-retriever-preprocess.ts  # ✅ 已有
│   ├── service-adapter.test.ts    # ⏳ 新增
│   ├── rate-limiter.test.ts       # ⏳ 新增
│   └── circuit-breaker.test.ts    # ⏳ 新增
│
├── contract/                      # L2: 服务契约测试
│   ├── main-service/
│   │   ├── health.test.ts         # ⏳ 新增
│   │   ├── agent-run.test.ts      # ⏳ 新增
│   │   ├── agent-stream.test.ts   # ⏳ 新增
│   │   ├── rag-search.test.ts     # ⏳ 新增
│   │   └── document-upload.test.ts # ⏳ 新增
│   ├── rag-service/
│   │   ├── health.test.ts         # ⏳ 新增
│   │   ├── retrieve.test.ts       # ⏳ 新增
│   │   ├── embed.test.ts          # ⏳ 新增
│   │   ├── rerank.test.ts         # ⏳ 新增
│   │   └── chunk.test.ts          # ⏳ 新增
│   ├── llm-gateway/
│   │   ├── health.test.ts         # ⏳ 新增
│   │   ├── chat.test.ts           # ⏳ 新增
│   │   ├── stream.test.ts         # ⏳ 新增
│   │   └── usage.test.ts          # ⏳ 新增
│   ├── evaluation-service/
│   │   ├── health.test.ts         # ⏳ 新增
│   │   ├── run.test.ts            # ⏳ 新增
│   │   └── status.test.ts         # ⏳ 新增
│   ├── data-service/
│   │   ├── health.test.ts         # ⏳ 新增
│   │   ├── history.test.ts        # ⏳ 新增
│   │   └── profit.test.ts         # ⏳ 新增
│   └── embedding-reranker/
│       ├── embedding-health.test.ts # ⏳ 新增
│       └── reranker-health.test.ts  # ⏳ 新增
│
├── integration/                   # L3: 跨服务集成测试
│   ├── path01-full-chain.test.ts  # ⏳ 新增
│   ├── path02-document-upload.test.ts # ⏳ 新增
│   ├── path03-evaluation-async.test.ts # ⏳ 新增
│   ├── path04-data-fallback.test.ts    # ⏳ 新增
│   ├── path05-model-switch.test.ts     # ⏳ 新增
│   └── trace-id-propagation.test.ts    # ⏳ 新增
│
├── e2e/                           # L4: 端到端测试
│   ├── user-ask-agent.test.ts     # ⏳ 新增
│   ├── skill-execution.test.ts    # ⏳ 新增
│   └── document-workflow.test.ts  # ⏳ 新增
│
└── infrastructure/                # 基础设施测试
    ├── database-connection.test.ts # ⏳ 新增
    ├── redis-connection.test.ts    # ⏳ 新增
    ├── neo4j-connection.test.ts    # ⏳ 新增
    └── docker-health.test.ts       # ⏳ 新增
```

---

## 10. 测试数据管理

### 10.1 测试数据策略

| 策略 | 适用场景 | 说明 |
|------|---------|------|
| 真实数据 | 集成测试、E2E 测试 | 五粮液/中国长城/格力电器 真实财报和交易数据 |
| 构造数据 | 单元测试、契约测试 | 符合 schema 的测试数据 |
| 边界数据 | 所有层级 | 空值、null、超长、特殊字符 |

### 10.2 测试隔离

- 每个测试文件独立运行，不依赖执行顺序
- 契约测试使用独立 mock server
- 集成测试使用独立的测试数据库或事务回滚
- E2E 测试在专用 Docker Compose 环境运行

---

## 11. 当前进度

| 层级 | 测试文件数 | 测试用例数 | 状态 |
|------|-----------|-----------|------|
| L1 单元测试 | ~15 | ~170 | ✅ 大部分已实现 |
| L2 服务契约 | 0 | ~60 | ⏳ 待实现 |
| L3 集成测试 | 0 | ~30 | ⏳ 待实现 |
| L4 E2E 测试 | 0 | ~10 | ⏳ 待实现 |
| 基础设施测试 | 0 | ~10 | ⏳ 待实现 |
| **总计** | **~15** | **~280** | **~60% (L1)** |