# 功能锁定清单（FUNCTIONS）

> 防止多轮对话后功能消失。每次代码改动后Grep核对清单功能仍在。
> 最后更新：2026-07-30

---

## 核心功能清单

| 功能ID | 功能 | 关键文件 | 测试位置 | 状态 |
|--------|------|---------|---------|------|
| F001 | RAG混合检索（dense+sparse） | src/server/retrieval/ | tests/unit/test-dense-retriever-truncation.ts, test-sparse-retriever-preprocess.ts | ✅ |
| F002 | Graph检索 | src/server/retrieval/ | tests/contract/rag-service.test.ts | ✅ |
| F003 | Rerank精排（bge-reranker-v2-m3） | src/server/retrieval/ | tests/contract/embedding-reranker.test.ts | ✅ |
| F004 | ParentDoc拆分 | src/server/retrieval/ | - | ✅ |
| F005 | 意图识别（合规/数值/对比等） | src/server/agents/ | tests/integration/path04-data-fallback.test.ts | ✅ |
| F006 | 合规风控（拒绝+日志+分级） | src/server/agents/ | tests/scenario/test_day7_8.py | ✅ |
| F007 | Agent工具路由 | src/server/agents/ | tests/integration/path03-tool-routing.test.ts | ✅ |
| F008 | LLM降级链（AGNES→百炼） | src/server/llm/ | tests/integration/path05-model-switch.test.ts | ✅ |
| F009 | 记忆系统 | src/server/memory/ | tests/unit/test-memory-system.ts | ✅ |
| F010 | 技能系统 | src/server/skills/ | tests/unit/test-skill-system.ts | ✅ |
| F011 | PDF解析 | src/server/document/ | tests/pdf/test-pdf-parse.ts | ✅ |
| F012 | 语义切片 | src/server/document/ | tests/unit/test-semantic-chunker-integration.ts | ✅ |
| F013 | Embedding服务（bge-m3本地） | src/server/retrieval/embedding-service.ts | - | ✅ |
| F014 | 评估数据收集（对齐生产管线） | scripts/collect-rag-data.ts | - | ✅ |
| F015 | RAGAS自实现评估 | scripts/ragas_evaluation.py | - | ✅ |
| F016 | RAGAS官方库评估 | scripts/ragas_official_evaluation.py | - | ⚠️embedding违规待修 |

---

## 改动核对协议

代码改动后，按以下步骤核对：
1. 改动前：跑回归测试，确认全绿（记录基线）
2. 改动前：Grep目标文件被谁引用，列影响范围
3. 改动后：立即跑回归测试，红了必须先恢复再继续
4. 改动后：Grep本清单功能对应文件仍存在
5. 同一bug修两次未解决：停止，git回滚到绿基线，重写而非修补
