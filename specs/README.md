# Spec 索引

> 本文档为所有 spec 的统一索引，记录执行状态和依赖关系。

---

## Spec 清单

| # | Spec 目录 | 定位 | 状态 | 核心变更 |
|---|-----------|------|------|---------|
| 1 | `agent-tool-routing-optimization` | Agent 工具路由优化 | ✅ 已实现并测试通过 | Skill路由编排 + 工具分组 + 动态检索 + 描述增强 + 调用校验 + 视觉双引擎 |
| 2 | `rag-data-quality-fix` | RAG 数据质量修复 | ✅ 已实现 | 文本清洗 + 切片边界修正 + Embedding截断优化 + 精排分离 + 缓存迁移 |
| 3 | `infra-migration` | 基础设施迁移与配置修复 | ✅ 已实现 | Prisma→Drizzle + 中文编码 + api_keys.yaml修复 + 移除主模型概念 |
| 4 | `agent-memory-and-evaluation` | Agent 记忆与评估体系 | 🔄 部分实现 | L1-L4分层记忆 + 金融评估指标 + 趋势追踪 + 版本管理 |
| 5 | `testing-coverage` | 测试覆盖 | 🔄 部分实现 | 14个工具测试query + 17条集成路径99用例 |
| 6 | `microservice-upgrade` | 微服务架构快速升级 | ✅ 代码已实现 | 4服务薄封装拆分 + Docker编排 + 降级开关 + traceId追踪 |

---

## 执行顺序与依赖

```
infra-migration (3) ──→ rag-data-quality-fix (2) ──→ agent-tool-routing-optimization (1)
                                                              ↓
                                                    agent-memory-and-evaluation (4)
                                                              ↓
                                                    testing-coverage (5)
                                                              ↓
                                                    microservice-upgrade (6)
```

- **(3)** 基础设施迁移必须先完成（ORM/编码/配置是所有其他改动的基础）
- **(2)** RAG 数据质量修复依赖新 ORM 客户端
- **(1)** Agent 工具路由优化依赖 RAG 检索质量
- **(4)** 记忆与评估体系依赖工具路由和检索能力
- **(5)** 测试覆盖依赖所有功能模块完成
- **(6)** 微服务升级依赖所有功能模块稳定 + 测试覆盖完成

---

## 原始 Spec 来源映射

| Spec 目录 | 来源说明 |
|-----------|---------|
| `agent-tool-routing-optimization` | 合并自多个早期 spec |
| `rag-data-quality-fix` | 合并自多个早期 spec |
| `infra-migration` | 合并自多个早期 spec |
| `agent-memory-and-evaluation` | 合并自多个早期 spec |
| `testing-coverage` | 合并自多个早期 spec |
| `microservice-upgrade` | 基于项目架构演进评估独立创建 |
