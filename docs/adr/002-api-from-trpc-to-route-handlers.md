# ADR-002: API 层从 tRPC 迁移到 Route Handlers + SSE

## 状态：已采纳（2025-05）

## 背景

项目初始使用 tRPC（Batch Link）作为全栈 API 层，在实现 Agent 流式输出时遇到瓶颈：

1. **SSE 不支持**：tRPC 的 Batch Link 设计面向请求-响应模式，无法原生支持 Server-Sent Events 流式推送
2. **中间件受限**：tRPC 中间件体系与 Next.js 原生中间件不兼容，无法统一注入 Trace ID、限流等横切关注点
3. **外部集成困难**：tRPC 协议为 TypeScript 专属，第三方客户端（Python 数据服务、小程序）无法直接调用

## 决策

将 API 层从 tRPC 迁移到 Next.js App Router Route Handlers + SSE。

## 理由

1. **原生 SSE 支持**：Route Handlers 可直接返回 `ReadableStream`，实现 Agent 流式输出
2. **标准 HTTP 接口**：RESTful API 可被任何语言/框架调用，Python 数据服务和小程序可直接对接
3. **中间件统一**：Next.js `middleware.ts` 统一处理 Trace ID 注入、限流、认证等横切关注点
4. **Nginx 友好**：标准 HTTP 接口可被 Nginx 反向代理路由，支持微服务拆分

## 后果

### 正面
- Agent 流式输出延迟从整轮等待降至逐 token 推送
- Python FastAPI 数据服务可直接通过 HTTP 调用
- 微服务拆分成为可能（RAG Service / LLM Gateway 独立部署）

### 负面
- 失去 tRPC 的端到端类型安全，需手动维护 API 类型定义
- 请求参数校验需额外引入 Zod

### 风险缓解
- 保留 `src/server/trpc/` 和 `src/lib/trpc/` 用于简单查询场景
- 使用 Zod Schema 统一校验请求参数，部分弥补类型安全损失