# AI Agent Platform - 项目记忆索引

> 本文件是 agent 每次会话的"开机自检清单"。新会话开始时自动读取。
> 最后更新：2026-08-05

## 快速恢复：项目当前状态

- **架构**：Next.js + FastAPI 微服务，nginx(80) 统一入口
- **容器化**：✅ 已完成（7→5容器，postgres/redis 复用 ai_novel）
- **评估基线**：V13-r6 综合 0.9153（达标）
- **80端口**：✅ 可用（nginx→main-service）
- **硬件**：本地 i7/16GB/512SSD，服务器 GPU
- **用户访问方式**：**浏览器访问 nginx 容器（http://localhost:80）**，不是本地 dev
- **用户账号**：jslijb@163.com，userId=69ea0f70-00a0-426b-aa5f-0e198d0f69d3

## 用户反复强调的需求（勿忘！）

1. **浏览器通过 nginx(80) 访问**——不是 localhost:3005，不是 npm run dev
2. **历史对话必须显示**——已报多次，是核心体验
3. **不要反复问用户已说过的事**——重要信息必须写入文档
4. **踩坑必须记录**——会话压缩后不能丢失关键信息

## 文档索引（按需读取）

| 文档 | 路径 | 用途 |
|------|------|------|
| **功能代码索引** | **`docs/CODE_INDEX.md`** | **每个功能的WHAT/WHY/WHERE/HOW，不需要搜索代码库** |
| 项目全景文档 | `docs/PROJECT_OVERVIEW.md` | 技术栈+选择理由+架构图+项目优点+设计决策 |
| 项目状态卡 | `docs/PROJECT_STATE.md` | 评估基线、版本历史、当前阻塞 |
| Agent技术审计 | `docs/agent-technology-audit.md` | 18项Agent技术详解+面试话术 |
| 踩坑记录 | `docs/pitfalls/` | 按日期归档的踩坑 |
| 架构演进 | `docs/ARCHITECTURE_EVOLUTION.md` | 架构变更历史 |
| 测试与评估 | `docs/TESTING_AND_EVALUATION.md` | 测试策略 |
| 规格说明 | `docs/spec.md` | SDD 规格 |
| 设计文档 | `docs/design.md` | SDD 设计 |
| 任务文档 | `docs/task.md` | SDD 任务 |
| 改进计划 | `docs/improvement-plan.md` | 5大改进问题方案 |
| 硬件档案 | `docs/hardware-profile.md` | 本地/服务器硬件约束 |
| 评估可靠性调研 | `docs/evaluation-reliability-research.md` | 评估可靠性专题 |
| 评估改造详细方案 | `docs/evaluation-improvement-plan.md` | 自动评估改造方案（⏳需审批） |

## 容器架构（当前运行）

```
nginx(80) → main-service(3000/映射3005) + rag-service(3001) + data-service(8001)
           + embedding(8011) + reranker(8010) + neo4j(7474/7687)
复用: ai_novel_postgres(5432) + ai_novel_redis(6379)
```

启动命令：`docker compose up -d`（确保 Docker Desktop 运行）

## 关键踩坑速查

1. **Docker构建需host.docker.internal**：Dockerfile build 阶段 DB/Redis 地址必须用 `host.docker.internal`
2. **端口3000被占用**：ai_novel_frontend 占用3000，main-service 用3005
3. **compose override自动加载**：文件名必须是 `docker-compose.override.yml`（不是 .local.yml）
4. **容器内config必须挂载**：main-service 需要 volumes 挂载 `config/api_keys.yaml` 和 `.env.local`
5. **AUTH_URL必须与浏览器访问URL一致**：用户通过80端口访问，AUTH_URL 应为 `http://localhost`
6. **AUTH_SECRET必须全环境一致**：.env.local / .env.docker / docker-compose.yml 三处必须相同
7. **历史对话bug根因**：AUTH_SECRET不一致→JWT验证失败→API返回401→前端静默吞掉→显示"暂无历史对话"
8. **Docker配置变更后必须重建容器**：改了docker-compose.yml或.env.docker后，必须 `docker compose up -d --build`

## 当前任务

- [x] 容器化部署完成
- [x] 容器合并（rag+evaluation → rag-service，llm-gateway → main-service）
- [x] 内存状态迁移Redis（限流/熔断/LLM缓存）
- [x] 本地性能优化（Redis连接池/DB连接池/pgvector HNSW索引）
- [x] 工具参数JSON Schema修复（number[]→array+items，AGNES API兼容）
- [x] R016: 工具合并+按需加载（21→6工具，technicalAnalysis/riskAnalysis/complianceCheck/marketData/toolSearch/hybridSearch）
- [x] R017: Context Compaction（对话>20条时压缩早期消息为结构化摘要）
- [x] R018: Agent错误恢复（Checkpoint+Resume，Redis存储，最多重试2次）
- [x] R019: Transcript分析+耗时追踪（前端StepCard显示耗时+CLI分析脚本）
- [ ] E2E测试：5个query完整链路+耗时报告
- [ ] 评估可靠性调研（需审批，见 docs/evaluation-reliability-research.md）
- [ ] 服务器环境：负载均衡、压测、GPU部署、Reranker GPU加速