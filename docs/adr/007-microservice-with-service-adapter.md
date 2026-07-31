# ADR-007: 微服务拆分与 ServiceAdapter 双模式架构

## 状态：已采纳（2026-06）

## 背景

单体 Next.js 应用在评估任务运行时出现 OOM，影响主站服务稳定性。RAG 和 LLM 调用需要独立扩容能力。

## 决策

拆分为微服务架构，通过 ServiceAdapter 实现单体/微服务双模式切换。

## 理由

1. **故障隔离**：评估服务 OOM 不影响主站，RAG/LLM 独立扩容
2. **技术栈适配**：RAG 服务和 LLM Gateway 使用 Fastify（纯 API 服务无需 SSR），评估服务使用 BullMQ 异步队列
3. **开发效率**：`USE_MICROSERVICE=false` 一键回退单体模式，开发环境无需启动全部服务
4. **渐进式拆分**：ServiceAdapter 统一路由，微服务可逐个上线，降低迁移风险

## 后果

### 正面
- 评估 OOM 不影响主站
- RAG/LLM 可独立扩容
- 开发环境仍可单体运行

### 负面
- 服务间通信引入网络延迟（约 5-10ms/调用）
- 部署复杂度增加（Docker Compose 从 6 服务增至 12 服务）
- 分布式追踪和日志聚合成为必须

### 风险缓解
- ServiceAdapter 单体模式零延迟（进程内直接调用）
- Nginx Gateway 统一路由 + TraceId 追踪
- Prometheus + Grafana 可观测性