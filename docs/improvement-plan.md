# 改进计划（IMPROVEMENT PLAN）

> 基于 2026-08-04 系统深入分析，5大改进问题。
> 标记：🏠=本地可做 | 🖥️=服务器环境 | ⏳=需审批

---

## 问题1：容器合并（7→5容器）

**状态**：🏠 待实施
**优先级**：P1
**目标**：减少容器数量，降低资源开销

### 方案

| 合并项 | 操作 | 理由 |
|--------|------|------|
| rag-service + evaluation-service | 合并为 rag-service | 代码90%重复，evaluation-service 无法独立运行 |
| llm-gateway → main-service | 合并到 main-service | 已默认不启动，main-service 单体模式已直接调用 LLM |

### 合并后架构

```
nginx(80) → main-service(3000/映射3005) + rag-service(3001,含评估) + data-service(8001)
           + embedding(8011) + reranker(8010)
基础设施: ai_novel_postgres(5432) + ai_novel_redis(6379) + neo4j(7474/7687)
```

### 实施步骤

1. 将 evaluation-service 的评估 Worker 代码整合到 rag-service
2. 删除 evaluation-service Dockerfile 和目录
3. 将 llm-gateway 的限流/熔断逻辑移入 main-service 的 service-adapter
4. 删除 llm-gateway Dockerfile 和目录
5. 更新 docker-compose.yml 和 nginx 配置
6. 回归测试

### 硬件影响

- 减少约 500MB 内存占用（2个 Node.js 容器→0）
- 减少容器间网络开销
- 16GB 内存下更从容

---

## 问题2：内存状态迁移 Redis

**状态**：🏠 待实施
**优先级**：P1
**目标**：消除5个内存状态，支持水平扩展

### 需迁移的状态

| 状态 | 当前存储 | 迁移到 | 文件 |
|------|----------|--------|------|
| 限流计数 | 进程内存 Map | Redis | `src/server/lib/rate-limiter.ts` |
| 熔断器状态 | 进程内存 Map | Redis | `src/server/lib/circuit-breaker.ts` |
| LLM 缓存 | 进程内存 Map(500条) | Redis | `src/server/llm/cache.ts` |
| 评估任务状态 | 进程内存 Map | Redis/DB | `services/rag-service/src/index.ts` |
| 评估 Worker 并发 | BullMQ concurrency=1 | Redis-backed 并发控制 | `services/rag-service/src/index.ts` |

### 实施步骤

1. rate-limiter.ts：用 Redis INCR+EXPIRE 替代内存 Map
2. circuit-breaker.ts：用 Redis HASH 替代内存 Map
3. llm/cache.ts：用 Redis SET+GET+TTL 替代内存 Map
4. 评估任务状态：用 Redis HASH 替代内存 Map
5. BullMQ Worker 并发度从1调到3（考虑 LLM API 限流）
6. 单元测试 + 回归测试

### 硬件影响

- 增加 Redis 内存使用（预计 <10MB）
- 多实例部署时状态共享，但本地单实例无额外开销
- ⚠️ 并发度提升需注意 LLM API 配额（当前 RPM=20）

---

## 问题3：系统扩展性

**状态**：🏠 部分可做 | 🖥️ 负载均衡留服务器
**优先级**：P2

### 本地可做

| 改进项 | 说明 | 预期收益 |
|--------|------|----------|
| Redis 连接池 | 当前单例连接，改为 pooled | 高并发下更稳定 |
| pgvector 索引优化 | HNSW 索引替代暴力搜索 | 检索延迟降低 |
| 数据库连接池 | postgres.js 配置 max 连接数 | 避免连接耗尽 |
| 无刷新Token问题 | 添加 refresh token 机制 | 用户体验 |

### 服务器环境

| 改进项 | 说明 | 依赖 |
|--------|------|------|
| nginx 负载均衡 | upstream 配置多实例 | GPU 服务器 |
| 多实例部署 | main-service/rag-service 水平扩展 | GPU 服务器 |
| PaddleOCR GPU 模式 | 大参数模型 | GPU 服务器 |

### 硬件约束分析

本地 i7/16GB/512SSD：
- **10并发**：理论可行，但 LLM API 延迟(2s)是瓶颈，实际吞吐量约5 QPS
- **1并发 vs 10并发**：1并发不浪费硬件，因为大部分时间在等 LLM API 响应
- **内存**：5容器+2复用 ≈ 6GB，剩余10GB足够
- **CPU**：embedding/reranker 用 llama.cpp CPU 推理，并发时 CPU 是瓶颈
- **结论**：本地优化重点在延迟而非并发，并发优化留服务器

---

## 问题4：评估可靠性调研

**状态**：⏳ 需审批
**优先级**：P0（影响所有评估结论的可信度）

### 已识别问题

| 问题 | 详情 | 风险等级 |
|------|------|----------|
| LLM 自评 LLM | 14个指标中9个依赖 LLM 评分 | 🔴 循环论证 |
| 测试集规模小 | qa-golden.json ~40条 | 🟡 统计显著性不足 |
| 数值精度宽松 | 误差<5%得0.5分 | 🟡 金融场景应更严 |
| 无对抗测试 | 缺少诱导幻觉的测试用例 | 🟡 鲁棒性未知 |
| Agent 评估仅20条 | 工具匹配率85%，样本太小 | 🟡 不具代表性 |
| 启发式降级 | Context Relevance 用 Jaccard | 🟡 低估检索质量 |

### 调研方案（待审批）

详见 `docs/evaluation-reliability-research.md`

---

## 问题5：性能压测

**状态**：🖥️ 服务器环境
**优先级**：P2

### 当前性能基线

| 组件 | P50 | P95 | 目标 | 状态 |
|------|-----|-----|------|------|
| Embedding | 105ms | 282ms | P50<500ms | ✅ |
| Reranker | 324ms | 497ms | P50<300ms | ❌ |
| RAG Retrieve | 170ms | 248ms | P50<2000ms | ✅ |
| LLM Chat | 1865ms | - | avg<10000ms | ✅ |
| Data Service | 3ms | 14ms | P50<500ms | ✅ |

### 压测计划（服务器环境）

1. **第1层**：基础设施压测（PostgreSQL/Redis/Neo4j）
2. **第2层**：模型服务压测（Embedding/Reranker 并发容量）
3. **第3层**：业务服务压测（data-service/rag-service 单服务）
4. **第4层**：全链路压测（nginx→main-service→下游）
5. **第5层**：混沌工程（模拟宕机/延迟/故障）

### 推荐工具

- k6（轻量 HTTP 压测）
- Locust（Python 生态）

### 本地可做

- Reranker P50 优化（324ms→<300ms）：考虑量化或减少线程竞争