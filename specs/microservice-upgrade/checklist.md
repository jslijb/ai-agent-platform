# 微服务架构快速升级验收清单

## 基础设施骨架

- [x] `services/rag-service/`、`services/llm-gateway/` 目录结构完整
- [x] `packages/shared-types/` 包含所有跨服务接口定义（RAGRequest/Response、LLMRequest/Response、EvaluationTask/Status、HealthResponse）
- [x] `packages/shared-utils/` 包含结构化日志、traceId 生成/透传、ServiceError、gracefulShutdown
- [x] 根 package.json 配置了 npm workspaces
- [x] shared-types 和 shared-utils 单元测试全部通过

## RAG 服务

- [x] `POST /api/retrieve` 返回与原 `hybridSearch()` 相同格式的结果
- [x] `POST /api/embed` 返回与原 `generateEmbedding()` 相同格式的结果
- [x] `POST /api/rerank` 返回与原 `rerank()` 相同格式的结果
- [x] `POST /api/chunk` 返回与原 `semanticChunker()` 相同格式的结果
- [x] `GET /api/health` 返回服务健康状态（含 DB + Redis + embedding 可达性）
- [x] RAG 服务集成测试全部通过（正常/异常/超时场景）
- [x] RAG Client SDK 封装了所有 RAG API 调用，含超时和降级逻辑
- [x] RAG Client SDK 单元测试全部通过（降级/超时/重试/traceId 透传）
- [x] RAG 服务独立重启时主服务返回"检索服务暂时不可用"而非崩溃

## LLM Gateway

- [x] `POST /api/llm/chat` 返回与原 `callWithFallback()` 相同格式的结果
- [x] `POST /api/llm/stream` 支持 SSE 流式转发
- [x] `GET /api/llm/usage` 返回 Token 用量统计
- [x] `GET /api/health` 返回服务健康状态（含熔断器状态）
- [x] 降级链正常工作（qwen-max → qwen-plus → qwen-turbo）
- [x] 熔断器正常工作（连续 3 次失败后熔断 60 秒）
- [x] 响应缓存正常工作（相同请求命中缓存）
- [x] 速率限制正常工作（超限返回 429）
- [x] LLM Gateway 集成测试全部通过
- [x] LLM Client SDK 封装了所有 LLM API 调用，含超时和降级逻辑
- [x] LLM Client SDK 单元测试全部通过

## 评估服务（已合并到 RAG 服务）

- [x] 评估任务通过 BullMQ 队列异步执行
- [x] `POST /api/evaluation/run` 立即返回 taskId
- [x] `GET /api/evaluation/status/:taskId` 返回任务进度
- [x] `GET /api/evaluation/results` 返回评估结果
- [x] `GET /api/health` 返回服务健康状态（含 Redis + DB 连接）
- [x] 评估运行期间主服务聊天功能不受影响
- [x] 评估服务通过 RAG Client 和 LLM Client 调用其他服务
- [x] 评估服务崩溃后 Docker 自动重启
- [x] 评估服务集成测试全部通过

## 主服务改造

- [x] 主服务通过 service-adapter.ts 调用 RAG/LLM/评估服务（薄封装策略）
- [x] service-adapter.ts 使用原生 fetch，无 workspace 包依赖
- [x] traceId 从请求入口生成，透传到所有下游服务（X-Trace-Id Header）
- [x] 环境变量 `USE_MICROSERVICE=false` 可回退到进程内调用
- [x] 主服务集成测试全部通过（完整聊天流程跨服务调用）

## Docker Compose

- [x] `docker compose --profile dev up` 可一键启动全部 10 个服务
- [x] 生产模式仅启动 9 个服务（llm-gateway 仅 dev profile）
- [x] 每个服务有健康检查配置
- [x] Nginx 正确路由所有 API 路径到对应服务
- [x] 内部 API（`/internal/*`）不对外暴露（返回 403）
- [x] 服务间通过 Docker DNS 互相访问
- [x] 数据卷持久化正确配置
- [x] 每个服务有独立的 Dockerfile（多阶段构建）
- [x] Next.js output: 'standalone' 配置正确
- [x] standalone-deps 阶段安装运行时依赖（redis, neo4j-driver, ioredis）

## SDD + TDD 集成测试结果（2026-06-02）

### 集成测试 52/52 全部通过

| Spec Requirement | 测试项 | 结果 |
|---|---|---|
| R1 微服务拆分架构 | 5 项 | ✅ 5/5 |
| R2 服务间通信协议 | 4 项 | ✅ 4/4 |
| R3 RAG 服务 REST API | 6 项 | ✅ 6/6 |
| R4 LLM Gateway REST API | 4 项 | ✅ 4/4 |
| R5 评估服务异步执行 | 3 项 | ✅ 3/3 |
| R6 Client SDK 薄封装 | 3 项 | ✅ 3/3 |
| R7 API Gateway 路由 | 7 项 | ✅ 7/7 |
| R8 分布式追踪 traceId | 4 项 | ✅ 4/4 |
| R9 数据库共享策略 | 2 项 | ✅ 2/2 |
| R10 降级开关 | 3 项 | ✅ 3/3 |
| R11 性能基线 | 4 项 | ✅ 4/4 |
| R12 故障隔离 | 3 项 | ✅ 3/3 |
| R13 Docker Compose 编排 | 4 项 | ✅ 4/4 |

### 故障隔离测试

- [x] RAG 服务停止 → 主服务返回 503（而非 500 崩溃）
- [x] Nginx 在 RAG 服务停止时仍然可达
- [x] RAG 服务重启后自动恢复

### 降级开关测试

- [x] `USE_MICROSERVICE=true` 时主服务通过 HTTP 调用 RAG 服务
- [x] `USE_MICROSERVICE=false` 时主服务回退到进程内调用
- [x] 降级开关切换不需要重启其他服务
- [x] 降级模式下所有功能正常（等同于升级前）
- [x] RAG_SERVICE_URL 指向 rag-service 容器（Docker DNS）

### 性能基线测试

- [x] RAG /api/retrieve 延迟 < 5000ms（含模型推理）
- [x] RAG /api/health 延迟 < 100ms
- [x] Nginx 代理额外延迟 < 50ms
- [x] LLM Gateway /api/health 延迟 < 100ms

## 修复记录

1. **service-adapter.ts** 重写为原生 fetch，移除 workspace 包依赖（解决 Docker 构建 webpack 解析失败）
2. **.dockerignore** 添加 data/.paddleocr_models/.tmp（构建上下文从 3GB 降到 35KB）
3. **node:20-alpine → node:20**（解决 esbuild ETXTBSY 竞态条件）
4. **Dockerfile minimal package.json**（解决 npm workspace 全量安装过慢）
5. **COPY 替代 ln -s**（解决 tsx 运行时无法解析符号链接）
6. **rag-service Dockerfile** 添加 drizzle-orm/postgres/neo4j-driver/ioredis/redis/js-yaml/bcryptjs
7. **主服务 Dockerfile standalone-deps** 阶段安装 redis/neo4j-driver/ioredis
8. **模型文件路径** 修正为 D:/models/modelscope/ 下的实际路径
9. **nginx healthcheck** 使用 127.0.0.1 替代 localhost（解决 IPv6 解析问题）
10. **main-service healthcheck** 接受 503 为健康（服务降级时仍可达）
11. **AUTH_SECRET/AUTH_URL** 添加到 docker-compose.yml（解决 NextAuth 配置错误）
12. **traceId onSend hook** 添加到 rag-service 和 llm-gateway（响应头返回 X-Trace-Id）
13. **redis 包** 添加到 rag-service Dockerfile（解决 Redis 连接失败）
14. **npm install --legacy-peer-deps**（解决 bullmq 与 redis 版本冲突）
