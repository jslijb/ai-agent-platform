# RAG 精排修复 + 数据迁移 + 测试验证 Spec

## Why
1. 精排阶段图谱三元组（短文本）挤掉了文档 chunk（长文本），导致 10 个 query 只通过 4 个
2. 市场数据缓存在 SQLite 中，需要统一迁移到 PostgreSQL，去重补齐
3. 修复后需要重新测试失败的 6 个 query，生成对比测试报告

## What Changes
- 修改 `src/app/api/rag/search/route.ts`：分离图谱和文档的精排流程（方案 A），精排前对图谱三元组限流（方案 B）
- 修改 `src/server/rag/reranking/reranker.ts`：支持分组精排
- 新增 PostgreSQL 表 `market_cache_entries`，迁移 SQLite 数据
- 修改 `data_service/cache/local_cache.py`：改用 PostgreSQL 作为缓存后端
- 修改 `data_service/main.py`：缓存层切换到 PostgreSQL
- 修改 `tests/rag/test-rag.ts`：增加修复对比逻辑，只测试之前失败的 query
- 新增 Drizzle schema：`marketCacheEntries` 表定义

## Impact
- Affected code: `src/app/api/rag/search/route.ts`, `src/server/rag/reranking/reranker.ts`, `data_service/cache/local_cache.py`, `data_service/main.py`, `src/server/db/schema.ts`, `tests/rag/test-rag.ts`
- Affected data: SQLite `cache_entries` → PostgreSQL `market_cache_entries`

## ADDED Requirements

### Requirement: 分离图谱和文档的精排（方案 A）

系统 SHALL 在 RAG 搜索 API 中，将图谱三元组和文档 chunk 分开精排，而非混合精排。

#### Scenario: 图谱和文档分开精排
- **WHEN** RAG 搜索同时返回向量检索结果和图谱检索结果
- **THEN** 系统将文档 chunk 单独精排取 top K（默认 5），图谱三元组单独精排取 top M（默认 3），最终合并 K+M 条结果输入 LLM
- **AND** 精排后文档 chunk 的排名不再被图谱三元组挤占

#### Scenario: 图谱检索结果为空
- **WHEN** 图谱检索返回 0 条结果
- **THEN** 只对文档 chunk 精排，取 top K

#### Scenario: 文档检索结果为空
- **WHEN** 向量检索返回 0 条结果
- **THEN** 只对图谱三元组精排，取 top M

### Requirement: 精排前对图谱三元组限流（方案 B）

系统 SHALL 在进入精排前，对图谱三元组按自身分数排序后取 top N（默认 5），避免过多噪声进入精排。

#### Scenario: 图谱返回大量三元组
- **WHEN** 图谱检索返回超过 5 条三元组
- **THEN** 按图谱分数降序取前 5 条，其余丢弃
- **AND** 限流后的图谱三元组再进入分组精排

#### Scenario: 图谱返回少量三元组
- **WHEN** 图谱检索返回 3 条或更少三元组
- **THEN** 全部保留，不做截断

### Requirement: 市场数据缓存迁移到 PostgreSQL

系统 SHALL 将市场数据缓存从 SQLite 迁移到 PostgreSQL，表名保持 `cache_entries`，数据去重补齐。

#### Scenario: 迁移 SQLite 数据到 PostgreSQL
- **WHEN** 执行迁移脚本
- **THEN** SQLite 中 10 项缓存数据全部迁移到 PostgreSQL 的 `cache_entries` 表
- **AND** 重复数据（同一股票同一日期多源重复）被去重，只保留最新一条
- **AND** 缺失数据（如行业分类、概念板块、分钟K线、交易日历未接入缓存）标记为待补齐

#### Scenario: 数据服务使用 PostgreSQL 缓存
- **WHEN** FastAPI 数据服务启动
- **THEN** 缓存层连接 PostgreSQL 而非 SQLite
- **AND** 原有缓存读写接口（get/set/remove/get_stats/clear_expired）行为不变

### Requirement: 测试报告包含修复对比

系统 SHALL 在测试报告中标注之前失败、现在成功的 query，说明修复内容。

#### Scenario: 之前失败的 query 现在成功
- **WHEN** 运行 RAG 测试
- **THEN** 报告中对之前失败的 query 标注"之前失败 → 现在成功"
- **AND** 列出修复措施（如"精排分离：文档 top5 + 图谱 top3"）
- **AND** 保留之前失败时的测试数据作为对比

#### Scenario: 之前成功的 query
- **WHEN** 运行 RAG 测试
- **THEN** 跳过之前已成功的 query，不重复测试
- **AND** 报告中标注"之前已通过，跳过"

## MODIFIED Requirements

### Requirement: RAG 搜索 API 返回精排详情

原要求：返回 `beforeRerankResults` 和 `results`
修改为：返回 `beforeRerankResults`（含文档和图谱分开标注）、`docRerankResults`（文档精排结果）、`graphRerankResults`（图谱精排结果）、`results`（最终合并结果）
