# 第2类：技术讨论 + 面试准备

> 本目录是面试和技术讨论的一站式查阅入口

---

## 核心文档（必读）

| 文档 | 内容 | 用途 |
|------|------|------|
| **[agent-tech-and-interview.md](agent-tech-and-interview.md)** | **18项技术清单 + 5个技术决策对比 + 14个面试问答 + 量化成果** | **面试主文档** |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | 技术栈+选择理由+架构图 | 项目介绍 |
| [CODE_INDEX.md](CODE_INDEX.md) | 每个功能的WHAT/WHY/WHERE/HOW | 代码定位 |
| [PROJECT_STATE.md](PROJECT_STATE.md) | 评估基线+迭代历史 | 准确率数据 |

## 技术决策记录（ADR）

| 编号 | 决策 | 核心结论 |
|------|------|---------|
| [ADR-003](adr/003-agent-from-monolith-to-multi-agent.md) | Agent架构 | 单Agent→多Agent演进路径 |
| [ADR-004](adr/004-rag-hybrid-retrieval-with-separated-reranking.md) | RAG检索 | 混合检索+分离重排 |
| [ADR-005](adr/005-vector-database-pgvector-over-milvus.md) | 向量数据库 | pgvector > Milvus（统一DB） |
| [ADR-006](adr/006-llm-provider-alibaba-over-openai.md) | LLM Provider | 阿里百炼 > OpenAI（国内合规） |
| [ADR-008](adr/008-agent-framework-langgraph-over-custom.md) | Agent框架 | LangGraph vs 自研对比 |
| [ADR-010](adr/010-mcp-dual-track-design.md) | MCP协议 | 双轨设计 |

## 架构演进

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md) | 从单体→微服务→容器化的完整演进 |
| [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md) | 未来升级路线图 |

## 方法论反思

| 文档 | 内容 |
|------|------|
| **[vibe-coding-retrospective.md](vibe-coding-retrospective.md)** | **Vibe Coding复盘：8项优势+10项不足+效率模型+面试话术+成熟度自评** |

## 面试辅助

| 文档 | 内容 |
|------|------|
| [rag_recall_rate_mindmap.html](rag_recall_rate_mindmap.html) | RAG召回率思维导图 |