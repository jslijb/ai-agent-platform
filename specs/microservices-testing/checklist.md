# 微服务测试 — 检查清单

**版本**: 1.0 | **日期**: 2026-06-01
**关联 Spec**: `specs/microservices-testing/spec.md`

---

## L1: 单元测试

### main-service 单元测试

| # | 测试文件 | 关键函数 | 状态 |
|---|---------|---------|------|
| U1 | tests/unit/test-memory-system.ts | calculateTokenBudget, assembleContext, formatUserProfileForPrompt | ✅ 29/29 |
| U2 | tests/unit/test-memory-overlap.ts | 记忆去重与合并 | ✅ 8/8 |
| U3 | tests/unit/test-skill-system.ts | executeSkill, executeEnhancedSkill | ✅ 35/35 |
| U4 | src/server/__tests__/validation.test.ts | ToolCallValidator, CallLimiter | ✅ 13/13 |
| U5 | src/server/__tests__/name-aliases.test.ts | resolveToolName | ✅ 8/8 |
| U6 | src/server/__tests__/routing.test.ts | ToolGroupManager, GroupRouter, SkillRouter | ✅ 15/15 |
| U7 | src/server/__tests__/description.test.ts | ToolDescriptionEnhancer, FewShotInjector | ✅ 6/6 |
| U8 | src/server/__tests__/vision.test.ts | PaddleOCR, VisionFallback, DualEngineRouter | ✅ 9/9 |
| U9 | tests/unit/test-config-resolution.ts | resolveEnvVars | ✅ |
| U10 | tests/unit/test-drizzle-runtime.ts | Drizzle 运行时 | ✅ |
| U11 | tests/unit/service-adapter.test.ts | searchRAG, callLLM, pushEvaluationTask | ⏳ |
| U12 | tests/unit/rate-limiter.test.ts | checkRateLimit | ⏳ |
| U13 | tests/unit/circuit-breaker.test.ts | getCircuitState, recordSuccess, recordFailure | ⏳ |

### rag-service 单元测试

| # | 测试文件 | 关键函数 | 状态 |
|---|---------|---------|------|
| U14 | tests/unit/test-dense-retriever-truncation.ts | truncateForEmbedding, generateEmbedding | ✅ |
| U15 | tests/unit/test-semantic-chunker-integration.ts | chunkText | ✅ |
| U16 | tests/unit/test-sparse-retriever-preprocess.ts | preprocess | ✅ |
| U17 | src/server/rag/chunking/text-cleaner.test.ts | cleanText, fixChunkBoundaries | ✅ |
| U18 | tests/unit/hybrid-retriever.test.ts | hybridSearch | ⏳ |
| U19 | tests/unit/reranker.test.ts | rerank | ⏳ |

### 进度: **14/19 (74%)**

---

## L2: 服务契约测试

### main-service (:3000)

| # | 端点 | 方法 | 场景 | 状态 |
|---|------|------|------|------|
| C1 | /api/health | GET | 正常 → 200 + {status, uptime, service, details} | ⏳ |
| C2 | /api/agent/run | POST | 正常 query → 200 + {answer, iterations, steps} | ⏳ |
| C3 | /api/agent/run | POST | 空 query → 400 | ⏳ |
| C4 | /api/agent/run | POST | 超长 query → 400 | ⏳ |
| C5 | /api/agent/stream | POST | SSE 流式输出 | ⏳ |
| C6 | /api/rag/search | POST | 正常 query → 200 + {results} | ⏳ |
| C7 | /api/rag/search | POST | 空 query → 400 | ⏳ |
| C8 | /api/rag/answer-with-citation | POST | 带引用的回答 | ⏳ |
| C9 | /api/document/upload | POST | PDF 上传 | ⏳ |
| C10 | /api/memories | GET | 获取记忆列表 | ⏳ |
| C11 | /api/memories | POST | 创建记忆 | ⏳ |

### rag-service (:3001)

| # | 端点 | 方法 | 场景 | 状态 |
|---|------|------|------|------|
| C12 | /api/health | GET | 正常 → 200 + {status, service, details} | ⏳ |
| C13 | /api/health | GET | DB 不可用 → degraded | ⏳ |
| C14 | /api/retrieve | POST | 正常 query → 200 + {success, results, latencyMs} | ⏳ |
| C15 | /api/retrieve | POST | 空 query → 400 | ⏳ |
| C16 | /api/embed | POST | texts → 200 + {embeddings} | ⏳ |
| C17 | /api/embed | POST | 空 texts → 400 | ⏳ |
| C18 | /api/rerank | POST | query+documents → 200 + {results} | ⏳ |
| C19 | /api/rerank | POST | 空 query → 400 | ⏳ |
| C20 | /api/chunk | POST | text → 200 + {chunks} | ⏳ |
| C21 | /api/chunk | POST | 空 text → 400 | ⏳ |
| C22 | /api/evaluation/run | POST | → 200 + {taskId, status} | ⏳ |
| C23 | /api/evaluation/status/:taskId | GET | → 200 + {taskId, status} | ⏳ |
| C24 | /api/evaluation/results | GET | → 200 + {versions} | ⏳ |

### llm-gateway (:3002)

| # | 端点 | 方法 | 场景 | 状态 |
|---|------|------|------|------|
| C25 | /api/health | GET | 正常 → 200 + {status, service, details} | ⏳ |
| C26 | /api/health | GET | 熔断打开 → degraded | ⏳ |
| C27 | /api/llm/chat | POST | 正常 messages → 200 + {content, model, usage} | ⏳ |
| C28 | /api/llm/chat | POST | 空 messages → 400 | ⏳ |
| C29 | /api/llm/chat | POST | 限流触发 → 429 | ⏳ |
| C30 | /api/llm/chat | POST | 所有模型失败 → 503 | ⏳ |
| C31 | /api/llm/stream | POST | SSE 流式输出 | ⏳ |
| C32 | /api/llm/usage | GET | → 200 + {totalTokens, byModel} | ⏳ |

### evaluation-service (:3003)

| # | 端点 | 方法 | 场景 | 状态 |
|---|------|------|------|------|
| C33 | /api/health | GET | → 200 + {status, service, details} | ⏳ |
| C34 | /api/evaluation/run | POST | → 200 + {taskId, status:"queued"} | ⏳ |
| C35 | /api/evaluation/status/:taskId | GET | running → {taskId, status, progress} | ⏳ |
| C36 | /api/evaluation/status/:taskId | GET | completed → {taskId, status, result} | ⏳ |
| C37 | /api/evaluation/status/:taskId | GET | failed → {taskId, status, error} | ⏳ |
| C38 | /api/evaluation/results | GET | → 200 + {versions} | ⏳ |

### data-service (:8001)

| # | 端点 | 方法 | 场景 | 状态 |
|---|------|------|------|------|
| C39 | /health | GET | → 200 + {status:"ok"} | ⏳ |
| C40 | /api/market/history | POST | sz.000858 → 200 + {data, count} | ⏳ |
| C41 | /api/market/history | POST | 无效 code → 400 | ⏳ |
| C42 | /api/market/realtime | POST | 000858 → 200 + {latestPrice, change} | ⏳ |
| C43 | /api/financial/profit | GET | sz.000066 → 200 + {data} | ⏳ |

### embedding & reranker

| # | 服务 | 端点 | 场景 | 状态 |
|---|------|------|------|------|
| C44 | embedding (:8011) | GET /health | → 200 | ⏳ |
| C45 | embedding (:8011) | POST /embedding | → 1024 维向量 | ⏳ |
| C46 | reranker (:8010) | GET /health | → 200 | ⏳ |
| C47 | reranker (:8010) | POST /reranking | → 排序结果 | ⏳ |

### 进度: **0/47**

---

## L3: 跨服务集成测试

| # | 路径 | 场景 | 状态 |
|---|------|------|------|
| I1 | 全链路 | 正常流程: 用户提问 → Agent → RAG → LLM → 回答 | ⏳ |
| I2 | 全链路 | rag-service 不可用 → 降级到进程内检索 | ⏳ |
| I3 | 全链路 | llm-gateway 不可用 → 降级到进程内 LLM | ⏳ |
| I4 | 全链路 | 双服务不可用 → 全部降级到进程内 | ⏳ |
| I5 | 全链路 | Trace-Id 全链路传播 | ⏳ |
| I6 | 文档上传 | PDF 上传 → 清洗 → 切片 → Embedding → 入库 | ⏳ |
| I7 | 文档上传 | 空文件 → 400 | ⏳ |
| I8 | 文档上传 | 超大文件 → 413 | ⏳ |
| I9 | 文档上传 | embedding 不可用 → 入库失败 | ⏳ |
| I10 | 评估异步 | 标准评估 → 入队 → 异步完成 → 结果入库 | ⏳ |
| I11 | 评估异步 | 全面评估 → 含开源数据集 | ⏳ |
| I12 | 评估异步 | Redis 不可用 → 任务失败 | ⏳ |
| I13 | 评估异步 | Worker 崩溃 → 任务不丢失 | ⏳ |
| I14 | 数据降级 | efinance 正常 | ⏳ |
| I15 | 数据降级 | efinance 失败 → baostock | ⏳ |
| I16 | 数据降级 | baostock 也失败 → mootdx | ⏳ |
| I17 | 数据降级 | 全部失败 → 明确错误 | ⏳ |
| I18 | 模型切换 | 模型1 正常 | ⏳ |
| I19 | 模型切换 | 模型1 429 → 模型2 | ⏳ |
| I20 | 模型切换 | 模型2 503 → 模型3 | ⏳ |
| I21 | 模型切换 | 所有模型失败 → 503 | ⏳ |
| I22 | 模型切换 | api_keys.yaml 动态更新 | ⏳ |

### 进度: **0/22**

---

## L4: 端到端测试

| # | 旅程 | 场景 | 状态 |
|---|------|------|------|
| E1 | 用户提问 | "分析五粮液技术面" → Agent 路由 → Skill 执行 → 工具调用 → 回答 | ⏳ |
| E2 | 用户提问 | "中国长城2025年营收" → RAG 检索 → LLM 回答 | ⏳ |
| E3 | 用户提问 | "对比五粮液和格力电器" → Stock Comparison Skill → 多工具调用 | ⏳ |
| E4 | 文档工作流 | 上传年报 PDF → 自动清洗/切片/Embedding → 可检索 | ⏳ |
| E5 | 文档工作流 | 检索已上传文档 → 有引用来源 | ⏳ |
| E6 | 错误恢复 | 服务降级后用户仍能得到回答 | ⏳ |
| E7 | 模型切换 | 模型额度耗尽 → 自动切换 → 用户无感知 | ⏳ |

### 进度: **0/7**

---

## 基础设施测试

| # | 测试 | 验证 | 状态 |
|---|------|------|------|
| F1 | PostgreSQL 连接 | pg_isready 成功 | ⏳ |
| F2 | pgvector 扩展 | 扩展已安装 | ⏳ |
| F3 | 关键表存在 | agent_logs, llm_usage_logs, embeddings, memories, documents | ⏳ |
| F4 | Neo4j 连接 | RETURN 1 成功 | ⏳ |
| F5 | Redis 连接 | PING → PONG | ⏳ |
| F6 | Redis 持久化 | 重启后数据不丢失 | ⏳ |
| F7 | Docker Compose 健康 | 全部 healthy | ⏳ |
| F8 | 服务启动顺序 | depends_on 遵守 | ⏳ |
| F9 | 网络隔离 | 外部不可访问内部服务 | ⏳ |

### 进度: **0/9**

---

## 性能基准测试

| # | 指标 | 目标 | 状态 |
|---|------|------|------|
| P1 | embedding P50 延迟 | < 500ms | ⏳ |
| P2 | embedding P95 延迟 | < 1000ms | ⏳ |
| P3 | reranker P50 延迟 | < 300ms | ⏳ |
| P4 | reranker P95 延迟 | < 800ms | ⏳ |
| P5 | rag-service retrieve P50 | < 200ms | ⏳ |
| P6 | llm-gateway chat P50 | < 5s | ⏳ |
| P7 | data-service history P50 | < 500ms | ⏳ |

### 进度: **0/7**

---

## 总体进度

| 层级 | 总数 | 完成 | 进度 |
|------|------|------|------|
| L1 单元测试 | 19 | 14 | 74% |
| L2 服务契约 | 47 | 0 | 0% |
| L3 集成测试 | 22 | 0 | 0% |
| L4 E2E 测试 | 7 | 0 | 0% |
| 基础设施 | 9 | 0 | 0% |
| 性能基准 | 7 | 0 | 0% |
| **合计** | **111** | **14** | **13%** |

---

## 真实数据就绪确认

| 数据项 | 状态 | 来源 |
|--------|------|------|
| 五粮液 2025 年报 PDF | ✅ | data/financial_reports/2025_annual/ |
| 中国长城 2025 年报 PDF | ✅ | data/financial_reports/2025_annual/ |
| 格力电器 2025 年报 PDF | ✅ | data/financial_reports/2025_annual/ |
| BM25 索引 | ✅ | 从 DB embeddings 表构建 |
| Dense Embedding | ✅ | bge-m3 (:8011) |
| 交易数据 | ✅ | data-service (:8001) |
| api_keys.yaml | ✅ | 动态加载，模型数可变 |