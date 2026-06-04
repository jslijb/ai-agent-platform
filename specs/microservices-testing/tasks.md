# 微服务测试 — 任务分解 (SDD + TDD)

**版本**: 1.0 | **日期**: 2026-06-01
**关联 Spec**: `specs/microservices-testing/spec.md`

---

## TDD 开发流程

```
每个 Task 遵循: RED → GREEN → REFACTOR
1. 先写测试 → 运行确认失败 (RED)
2. 写最小代码 → 运行确认通过 (GREEN)
3. 重构优化 → 运行确认仍通过 (REFACTOR)
```

---

## Task 1: 基础设施连接测试

**优先级**: P0 — 所有测试的前提

- [ ] F1: PostgreSQL 连接测试 (pg_isready)
- [ ] F2: pgvector 扩展验证
- [ ] F3: 关键表存在验证 (agent_logs, llm_usage_logs, embeddings, memories, documents)
- [ ] F4: Neo4j 连接测试
- [ ] F5: Redis 连接测试 (PING)
- [ ] F6: Redis 持久化验证
- [ ] F7: Docker Compose 健康检查 (全部 healthy)
- [ ] F8: 服务启动顺序验证
- [ ] F9: 网络隔离验证

**TDD 第一步**: 编写 `tests/infrastructure/database-connection.test.ts` 等 9 个测试文件

---

## Task 2: 服务适配器单元测试

**优先级**: P0 — main-service 降级逻辑核心

- [ ] U11: `tests/unit/service-adapter.test.ts` — searchRAG, callLLM, pushEvaluationTask
- [ ] U12: `tests/unit/rate-limiter.test.ts` — checkRateLimit
- [ ] U13: `tests/unit/circuit-breaker.test.ts` — getCircuitState, recordSuccess, recordFailure

**TDD 第一步**: 编写 3 个测试文件；**Mock**: fetch, Redis

### 用例清单 (service-adapter)

| # | 场景 | 输入 | 预期 |
|---|------|------|------|
| U11.1 | searchRAG 微服务模式正常 | USE_MICROSERVICE=true, rag-service 返回 200 | success=true, results 非空 |
| U11.2 | searchRAG 微服务超时 | USE_MICROSERVICE=true, rag-service 超时 30s | 降级到进程内 hybridSearch |
| U11.3 | searchRAG 微服务 500 | USE_MICROSERVICE=true, rag-service 返回 500 | 降级到进程内 hybridSearch |
| U11.4 | searchRAG 进程内模式 | USE_MICROSERVICE=false | 直接调用 hybridSearch |
| U11.5 | callLLM 微服务正常 | USE_MICROSERVICE=true, llm-gateway 返回 200 | content 非 null, model 非空 |
| U11.6 | callLLM 微服务超时 | USE_MICROSERVICE=true, llm-gateway 超时 120s | 降级到进程内 callWithFallback |
| U11.7 | pushEvaluationTask 微服务正常 | USE_MICROSERVICE=true | taskId 非空, status="queued" |
| U11.8 | pushEvaluationTask 微服务不可达 | USE_MICROSERVICE=true, evaluation-service 不可达 | 降级到进程内 triggerEvaluation |

---

## Task 3: main-service 服务契约测试

**优先级**: P0 — 对外暴露的 API 接口

- [ ] C1: GET /api/health → 200 + {status, uptime, service, details}
- [ ] C2: POST /api/agent/run → 正常 query → 200 + {answer, iterations, steps}
- [ ] C3: POST /api/agent/run → 空 query → 400
- [ ] C4: POST /api/agent/run → 超长 query → 400
- [ ] C5: POST /api/agent/stream → SSE 流式输出
- [ ] C6: POST /api/rag/search → 正常 query → 200 + {results}
- [ ] C7: POST /api/rag/search → 空 query → 400
- [ ] C8: POST /api/rag/answer-with-citation → 带引用的回答
- [ ] C9: POST /api/document/upload → PDF 上传
- [ ] C10: GET /api/memories → 获取记忆列表
- [ ] C11: POST /api/memories → 创建记忆

**TDD 第一步**: 编写 `tests/contract/main-service/` 下 5 个测试文件

---

## Task 4: rag-service 服务契约测试

**优先级**: P0 — RAG 核心服务

- [ ] C12-C13: GET /api/health (正常 + DB不可用)
- [ ] C14-C15: POST /api/retrieve (正常 + 空query)
- [ ] C16-C17: POST /api/embed (正常 + 空texts)
- [ ] C18-C19: POST /api/rerank (正常 + 空query)
- [ ] C20-C21: POST /api/chunk (正常 + 空text)
- [ ] C22: POST /api/evaluation/run
- [ ] C23: GET /api/evaluation/status/:taskId
- [ ] C24: GET /api/evaluation/results

**TDD 第一步**: 编写 `tests/contract/rag-service/` 下 5 个测试文件

---

## Task 5: llm-gateway 服务契约测试

**优先级**: P0 — LLM 网关

- [ ] C25-C26: GET /api/health (正常 + 熔断打开)
- [ ] C27-C30: POST /api/llm/chat (正常 + 空messages + 限流429 + 全部失败503)
- [ ] C31: POST /api/llm/stream (SSE)
- [ ] C32: GET /api/llm/usage

**TDD 第一步**: 编写 `tests/contract/llm-gateway/` 下 4 个测试文件

---

## Task 6: evaluation-service 服务契约测试

**优先级**: P1 — 评估服务

- [ ] C33: GET /api/health
- [ ] C34: POST /api/evaluation/run
- [ ] C35-C37: GET /api/evaluation/status/:taskId (running + completed + failed)
- [ ] C38: GET /api/evaluation/results

**TDD 第一步**: 编写 `tests/contract/evaluation-service/` 下 3 个测试文件

---

## Task 7: data-service 服务契约测试 (Python)

**优先级**: P0 — 唯一数据来源

- [ ] C39: GET /health
- [ ] C40-C41: POST /api/market/history (正常 + 无效code)
- [ ] C42: POST /api/market/realtime
- [ ] C43: GET /api/financial/profit

**TDD 第一步**: 编写 `tests/contract/data-service/` 下 3 个测试文件

---

## Task 8: embedding & reranker 服务契约测试

**优先级**: P1 — AI 模型服务

- [ ] C44-C45: embedding 健康检查 + embedding 生成
- [ ] C46-C47: reranker 健康检查 + 重排序

**TDD 第一步**: 编写 `tests/contract/embedding-reranker/` 下 2 个测试文件

---

## Task 9: 全链路集成测试 (路径1)

**优先级**: P0 — 核心用户旅程

- [ ] I1: 正常流程 — 用户提问 → Agent → RAG → LLM → 回答
- [ ] I2: rag-service 不可用 → 降级到进程内检索
- [ ] I3: llm-gateway 不可用 → 降级到进程内 LLM
- [ ] I4: 双服务不可用 → 全部降级
- [ ] I5: Trace-Id 全链路传播

**TDD 第一步**: 编写 `tests/integration/path01-full-chain.test.ts`

---

## Task 10: 文档上传集成测试 (路径2)

**优先级**: P1 — 文档处理链路

- [ ] I6: PDF 上传 → 清洗 → 切片 → Embedding → 入库
- [ ] I7: 空文件 → 400
- [ ] I8: 超大文件 → 413
- [ ] I9: embedding 不可用 → 入库失败

**TDD 第一步**: 编写 `tests/integration/path02-document-upload.test.ts`

---

## Task 11: 评估异步任务集成测试 (路径3)

**优先级**: P1 — 消息队列可靠性

- [ ] I10: 标准评估 → 入队 → 异步完成 → 结果入库
- [ ] I11: 全面评估 → 含开源数据集
- [ ] I12: Redis 不可用 → 任务失败
- [ ] I13: Worker 崩溃 → 任务不丢失

**TDD 第一步**: 编写 `tests/integration/path03-evaluation-async.test.ts`

---

## Task 12: 数据服务降级集成测试 (路径4)

**优先级**: P0 — 数据可用性

- [ ] I14: efinance 正常获取
- [ ] I15: efinance 失败 → baostock 降级
- [ ] I16: baostock 也失败 → mootdx 降级
- [ ] I17: 全部失败 → 明确错误

**TDD 第一步**: 编写 `tests/integration/path04-data-fallback.test.ts`

---

## Task 13: 模型自动切换集成测试 (路径5)

**优先级**: P0 — LLM 可用性

- [ ] I18: 模型1 正常使用
- [ ] I19: 模型1 429 → 模型2 切换
- [ ] I20: 模型2 503 → 模型3 切换
- [ ] I21: 所有模型失败 → 503
- [ ] I22: api_keys.yaml 动态更新

**TDD 第一步**: 编写 `tests/integration/path05-model-switch.test.ts`

---

## Task 14: 端到端测试

**优先级**: P1 — 需要全服务运行

- [ ] E1: "分析五粮液技术面" → Agent 路由 → Skill 执行 → 回答
- [ ] E2: "中国长城2025年营收" → RAG 检索 → LLM 回答
- [ ] E3: "对比五粮液和格力电器" → Stock Comparison → 多工具调用
- [ ] E4: 上传年报 PDF → 全自动入库
- [ ] E5: 检索已上传文档 → 有引用
- [ ] E6: 服务降级后用户仍能得到回答
- [ ] E7: 模型额度耗尽 → 自动切换 → 用户无感知

**TDD 第一步**: 编写 `tests/e2e/` 下 3 个测试文件

---

## Task 15: 性能基准测试

**优先级**: P2 — 非阻塞上线

- [ ] P1-P2: embedding 延迟 (P50 < 500ms, P95 < 1000ms)
- [ ] P3-P4: reranker 延迟 (P50 < 300ms, P95 < 800ms)
- [ ] P5: rag-service retrieve P50 < 200ms
- [ ] P6: llm-gateway chat P50 < 5s
- [ ] P7: data-service history P50 < 500ms

---

## Task 16: 清理与整合

- [ ] 删除旧的 `specs/testing-coverage/` 和 `specs/integration-test-cross-module/`
- [ ] 合并已有的 4 条纯逻辑集成测试到新 L3 目录
- [ ] 更新 `.trae/rules/project_rules.md` 添加微服务测试规范
- [ ] 运行全部测试 → 生成测试报告
- [ ] 分析失败原因并修复

---

## 执行顺序依赖

```
Task 1 (基础设施) ──► Task 2 (适配器单元) ──► Task 3-8 (契约测试 可并行)
                                                      │
                                                      ▼
                                            Task 9-13 (集成测试)
                                                      │
                                                      ▼
                                            Task 14 (E2E 测试)
                                                      │
                                                      ▼
                                            Task 15 (性能基准)
                                                      │
                                                      ▼
                                            Task 16 (清理整合)
```

Task 3-8 的契约测试之间无依赖，可并行开发。