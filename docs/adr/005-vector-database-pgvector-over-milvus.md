# ADR-005: 向量数据库选择 pgvector 而非 Milvus

## 状态：已采纳（2025-05）

## 背景

项目需要向量检索能力支持 RAG 管道，需在 pgvector（PostgreSQL 扩展）和 Milvus（专用向量数据库）之间选择。

## 决策

选择 pgvector 作为向量数据库。

## 理由

1. **架构简化**：项目已使用 PostgreSQL 作为主数据库，pgvector 作为扩展无需引入新组件，减少运维复杂度
2. **百万级内够用**：金融文档知识库规模在百万级以内，pgvector 的 IVFFlat/HNSW 索引可满足性能需求
3. **事务一致性**：向量数据和业务数据在同一数据库，可利用 PostgreSQL 事务保证一致性
4. **Drizzle 原生支持**：Drizzle ORM 支持 `vector(1024)` 列类型，类型安全的向量查询

## 后果

### 正面
- Docker Compose 服务数减少 1 个，部署和运维更简单
- 向量查询和业务查询可 JOIN，无需数据同步
- 成本更低（无需独立 Milvus 集群）

### 负面
- 千万级以上向量数据性能不如 Milvus
- 缺乏 Milvus 的高级特性（动态 Schema、多向量字段、分布式检索）
- HNSW 索引构建时间较长（百万级约 10 分钟）

### 风险缓解
- HNSW 索引异常时降级到顺序扫描
- 如果未来数据量超过千万级，可迁移到 Milvus，检索接口已抽象（`denseSearch`）