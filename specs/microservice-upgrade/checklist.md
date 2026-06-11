# 微服务架构快速升级验收清单

## 基础设施骨架

- [x] `services/rag-service/`、`services/llm-gateway/`、`services/evaluation-service/` 目录结构完整
- [x] `packages/shared-types/` 包含所有跨服务接口定义（RAGRequest/Response、LLMRequest/Response、EvaluationTask/Status、HealthResponse）
- [x] `packages/shared-utils/` 包含结构化日志、traceId 生成/透传、ServiceError、gracefulShutdown
- [x] 根 package.json 配置了 npm workspaces
- [x] shared-types 和 shared-utils 单元测试全部通过

## RAG 服务

- [x] `POST /api/retrieve` 返回与原 `hybridSearch()` 相同格式的结果
- [x] `POST /api/embed` 返回与原 `generateEmbedding()` 相同格式的结果
- [x] `POST /api/rerank` 返回与原 `rerank()` 相同格式的结果
- [x] `POST /api/chunk` 返回与原 `semanticChunker()` 相同格式的结果
- [x] `GET /api/health` 返回服务健康状态（含 DB + embedding 可达性）
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

## 评估服务

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

- [x] 主服务不再直接导入 `src/server/rag/` 代码，改为通过 RAG Client SDK 调用
- [x] 主服务不再直接导入 `src/server/llm/` 代码，改为通过 LLM Client SDK 调用
- [x] 主服务不再直接导入 `src/server/evaluation/` 代码，改为推送 BullMQ 任务
- [x] traceId 从请求入口生成，透传到所有下游服务
- [x] 环境变量 `USE_MICROSERVICE=false` 可回退到进程内调用
- [x] 主服务集成测试全部通过（完整聊天流程跨服务调用）
- [x] 现有 174 个单元测试全部通过（回归验证）
- [x] 现有 46 个集成测试全部通过（回归验证）

## Docker Compose

- [x] `docker compose up` 可一键启动全部 10 个服务
- [x] 每个服务有健康检查配置
- [x] Nginx 正确路由所有 API 路径到对应服务
- [x] 内部 API（`/internal/*`）不对外暴露
- [x] 服务间通过 Docker DNS 互相访问
- [x] 数据卷持久化正确配置
- [x] 每个服务有独立的 Dockerfile（多阶段构建）

## 性能不退化

- [ ] 聊天端到端延迟增加 < 10%（基准：升级前 ~5s，升级后 < 5.5s）— 需实际部署后验证
- [ ] RAG 检索延迟增加 < 50ms（基准：升级前 ~200ms，升级后 < 250ms）— 需实际部署后验证
- [ ] 黄金测试集评估指标不退化（各指标差异 < 5%）— 需实际部署后验证
- [ ] 100 并发用户下吞吐量不低于升级前 — 需实际部署后验证

## 故障隔离

- [ ] 评估服务 OOM 崩溃 → 聊天功能正常 — 需实际部署后验证
- [ ] RAG 服务重启 → 主服务返回"检索服务暂时不可用"而非 500 — 需实际部署后验证
- [ ] LLM Gateway 重启 → 主服务返回"LLM 服务暂时不可用"而非 500 — 需实际部署后验证
- [ ] 单服务崩溃后 Docker 自动重启 — 需实际部署后验证

## 降级开关

- [x] `USE_MICROSERVICE=false` 时主服务回退到进程内调用
- [x] 降级开关切换不需要重启其他服务
- [x] 降级模式下所有功能正常（等同于升级前）
