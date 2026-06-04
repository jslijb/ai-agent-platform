# Tasks — 微服务架构快速升级

## SDD + TDD 工作流

每个 Task 遵循：**API 合约定义 → 集成测试编写 → 实现代码** 的循环。

---

- [ ] Task 1: 基础设施骨架 + 共享包
  - [ ] SubTask 1.1: 创建 `services/` 目录结构（rag-service、llm-gateway、evaluation-service）
  - [ ] SubTask 1.2: 创建 `packages/shared-types/`（跨服务接口定义：RAGRequest/Response、LLMRequest/Response、EvaluationTask/Status、HealthResponse）
  - [ ] SubTask 1.3: 创建 `packages/shared-utils/`（结构化日志 logger、traceId 生成/透传、ServiceError 错误类、gracefulShutdown）
  - [ ] SubTask 1.4: 配置 npm workspaces（根 package.json 添加 workspaces 字段）
  - [ ] SubTask 1.5: 每个 service 创建 package.json + tsconfig.json（共享根目录 tsconfig）
  - [ ] SubTask 1.6: 编写 shared-types 和 shared-utils 的单元测试（TDD）

- [ ] Task 2: RAG 服务（薄封装）
  - [ ] SubTask 2.1: **[SDD]** 定义 RAG 服务 API 合约（5 个端点的请求/响应 TypeScript 接口，写入 shared-types）
  - [ ] SubTask 2.2: **[TDD]** 编写 RAG 服务集成测试（5 个端点的正常/异常/超时场景，使用 vitest + Fastify inject）
  - [ ] SubTask 2.3: 创建 `services/rag-service/` Fastify 应用（注册插件、健康检查、CORS、traceId 中间件）
  - [ ] SubTask 2.4: 实现 `/api/retrieve`（导入 `hybrid-retriever.ts`，薄封装为 REST API）
  - [ ] SubTask 2.5: 实现 `/api/embed`（导入 `dense-retriever.ts`）
  - [ ] SubTask 2.6: 实现 `/api/rerank`（导入 `reranker.ts`）
  - [ ] SubTask 2.7: 实现 `/api/chunk`（导入 `semantic-chunker.ts`）
  - [ ] SubTask 2.8: 实现 `/api/health`（检查 DB 连接 + embedding 服务可达性）
  - [ ] SubTask 2.9: 运行集成测试，确保全部通过
  - [ ] SubTask 2.10: 创建 `packages/rag-client/`（RAG Client SDK：search/embed/rerank/chunk + 超时 + 降级 + 重试 + traceId 透传）
  - [ ] SubTask 2.11: **[TDD]** 编写 RAG Client SDK 单元测试（mock HTTP，验证降级/超时/重试逻辑）
  - [ ] SubTask 2.12: 运行 RAG Client SDK 测试，确保全部通过

- [ ] Task 3: LLM Gateway 服务（薄封装）
  - [ ] SubTask 3.1: **[SDD]** 定义 LLM Gateway API 合约（4 个端点的请求/响应接口，写入 shared-types）
  - [ ] SubTask 3.2: **[TDD]** 编写 LLM Gateway 集成测试（降级链、熔断、缓存、流式、超时场景）
  - [ ] SubTask 3.3: 创建 `services/llm-gateway/` Fastify 应用（注册插件、健康检查、CORS、traceId 中间件）
  - [ ] SubTask 3.4: 实现 `/api/llm/chat`（导入 `router.ts` + `callWithFallback`，薄封装为 REST API）
  - [ ] SubTask 3.5: 实现 `/api/llm/stream`（导入 `router.ts`，SSE 流式转发）
  - [ ] SubTask 3.6: 实现 `/api/llm/usage`（查询 LLMUsageLog 表，按模型/日期聚合）
  - [ ] SubTask 3.7: 实现 `/api/health`（检查熔断器状态 + Redis 连接）
  - [ ] SubTask 3.8: 迁移熔断器、速率限制、缓存逻辑确认（现有 `circuit-breaker.ts`、`rate-limiter.ts`、`cache.ts` 已在 llm 目录，直接导入）
  - [ ] SubTask 3.9: 运行集成测试，确保全部通过
  - [ ] SubTask 3.10: 创建 `packages/llm-client/`（LLM Client SDK：chat/stream/usage + 超时 + 降级 + traceId 透传）
  - [ ] SubTask 3.11: **[TDD]** 编写 LLM Client SDK 单元测试（mock HTTP，验证降级/超时/重试逻辑）
  - [ ] SubTask 3.12: 运行 LLM Client SDK 测试，确保全部通过

- [ ] Task 4: 评估服务（薄封装 + BullMQ）
  - [ ] SubTask 4.1: **[SDD]** 定义评估服务 API 合约（4 个端点的请求/响应接口，写入 shared-types）
  - [ ] SubTask 4.2: **[TDD]** 编写评估服务集成测试（异步任务提交、进度查询、结果获取、BullMQ 消费者）
  - [ ] SubTask 4.3: 创建 `services/evaluation-service/` Fastify 应用（注册插件、BullMQ 连接、健康检查）
  - [ ] SubTask 4.4: 实现 BullMQ 消费者（从队列接收评估任务，调用 ragClient + llmClient 执行评估）
  - [ ] SubTask 4.5: 实现 `/api/evaluation/run`（推送任务到 BullMQ 队列，返回 taskId）
  - [ ] SubTask 4.6: 实现 `/api/evaluation/status/:taskId`（查询 BullMQ 任务进度）
  - [ ] SubTask 4.7: 实现 `/api/evaluation/results`（查询评估结果，复用现有 evaluation-history 逻辑）
  - [ ] SubTask 4.8: 实现 `/api/health`（检查 Redis + DB 连接）
  - [ ] SubTask 4.9: 运行集成测试，确保全部通过

- [ ] Task 5: 主服务改造（Client SDK 集成）
  - [ ] SubTask 5.1: 在主服务中集成 RAG Client SDK（替换 `hybridSearch` 直接调用为 `ragClient.search`）
  - [ ] SubTask 5.2: 在主服务中集成 LLM Client SDK（替换 `callWithFallback` 直接调用为 `llmClient.chat`）
  - [ ] SubTask 5.3: 在主服务中集成评估任务推送（替换直接调用评估函数为 BullMQ 任务推送）
  - [ ] SubTask 5.4: 添加 traceId 中间件（Next.js middleware 生成 traceId，注入到所有下游调用）
  - [ ] SubTask 5.5: 添加环境变量配置（RAG_SERVICE_URL、LLM_GATEWAY_URL、EVALUATION_SERVICE_URL）
  - [ ] SubTask 5.6: 添加降级开关（环境变量 `USE_MICROSERVICE=false` 时回退到进程内调用，保证向后兼容）
  - [ ] SubTask 5.7: **[TDD]** 编写主服务集成测试（完整聊天流程：用户 → 主服务 → LLM Gateway → RAG 服务）
  - [ ] SubTask 5.8: 运行现有 174 个单元测试，确保全部通过（回归验证）
  - [ ] SubTask 5.9: 运行现有 46 个集成测试，确保全部通过（回归验证）

- [ ] Task 6: Docker Compose + Nginx + 端到端验证
  - [ ] SubTask 6.1: 为每个应用服务编写 Dockerfile（多阶段构建：install → build → production）
  - [ ] SubTask 6.2: 重写 `docker-compose.yml`（10 个服务 + 健康检查 + 依赖关系 + 网络隔离）
  - [ ] SubTask 6.3: 重写 `nginx/default.conf`（API Gateway 路由规则 + 内部 API 屏蔽）
  - [ ] SubTask 6.4: 配置服务环境变量（DATABASE_URL、REDIS_URL、RAG_SERVICE_URL 等）
  - [ ] SubTask 6.5: `docker compose up` 一键启动全部 10 个服务
  - [ ] SubTask 6.6: 运行端到端聊天流程测试（用户 → Nginx → 主服务 → LLM Gateway → RAG 服务）
  - [ ] SubTask 6.7: 运行评估流程测试（用户 → 主服务 → BullMQ → 评估服务 → RAG + LLM）
  - [ ] SubTask 6.8: 运行故障隔离测试（评估服务崩溃 → 聊天不受影响）
  - [ ] SubTask 6.9: 运行性能基准测试（对比升级前后延迟和吞吐量）
  - [ ] SubTask 6.10: 运行黄金测试集评估（对比升级前后评估指标，确保不退化）

# Task Dependencies

```
Task 1 (基础设施)
  ├──→ Task 2 (RAG 服务) ──┐
  └──→ Task 3 (LLM Gateway) ──┼──→ Task 4 (评估服务) ──→ Task 5 (主服务改造) ──→ Task 6 (Docker + E2E)
                              │
                              └── Task 2 和 Task 3 可并行执行
```

- [Task 1] 无依赖，最先执行
- [Task 2] depends on [Task 1]（需要共享类型包和工具包）
- [Task 3] depends on [Task 1]（同上）
- [Task 2] 和 [Task 3] 可并行
- [Task 4] depends on [Task 1] + [Task 2] + [Task 3]（评估服务需要 RAG Client 和 LLM Client）
- [Task 5] depends on [Task 2] + [Task 3] + [Task 4]（主服务需要集成各 Client SDK）
- [Task 6] depends on [Task 5]（所有服务代码就绪后才能编排 Docker）

# 并行执行策略

AI Coding 时代的关键优势：**并行开发**。

```
时间线:
─────────────────────────────────────────────────────────────
Day 1:  Task 1 (基础设施骨架 + 共享包)
Day 2:  Task 2 (RAG 服务) ║ Task 3 (LLM Gateway)  ← 并行
Day 3:  Task 2 (RAG 服务) ║ Task 3 (LLM Gateway)  ← 并行
Day 4:  Task 4 (评估服务)
Day 5:  Task 5 (主服务改造)
Day 6:  Task 6 (Docker Compose + E2E 验证)
─────────────────────────────────────────────────────────────
```

关键加速点：
1. **薄封装不重写**：每个服务只需写 Fastify 路由层 + Client SDK，不重写业务逻辑
2. **SDD 先定合约**：API 合约先行，前后端可并行
3. **TDD 保证质量**：测试先行，实现即验证，减少调试时间
4. **降级开关**：`USE_MICROSERVICE=false` 可随时回退，降低风险
5. **现有测试回归**：174 + 46 个现有测试全部继续有效，零回归风险
