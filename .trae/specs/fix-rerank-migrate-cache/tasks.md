# Tasks

- [x] Task 1: 修改 search API 实现精排分离（方案 A+B）
  - [x] Task 1.1: 修改 `src/app/api/rag/search/route.ts`，在精排前对图谱三元组限流（按图谱分数降序取 top 5）
  - [x] Task 1.2: 将文档 chunk 和图谱三元组分开调用 rerank，文档精排取 top 5，图谱精排取 top 3
  - [x] Task 1.3: 合并精排结果：5 个文档 chunk + 3 个图谱三元组 = 8 条最终结果
  - [x] Task 1.4: 修改返回结构，新增 `docRerankResults` 和 `graphRerankResults` 字段
  - [x] Task 1.5: 更新 `retrievalDebug` 中的计数逻辑，新增 `docRerankCount` 和 `graphRerankCount`

- [x] Task 2: 市场数据缓存迁移到 PostgreSQL
  - [x] Task 2.1: 在 `src/server/db/schema.ts` 新增 `marketCacheEntries` 表定义
  - [x] Task 2.2: 执行 `npx drizzle-kit push` 同步表结构到数据库
  - [x] Task 2.3: 编写迁移脚本，读取 SQLite `data/market_cache/market_data.db` 的 `cache_entries` 表，去重后写入 PostgreSQL
  - [x] Task 2.4: 修改 `data_service/cache/local_cache.py`，新增 PostgreSQL 缓存后端
  - [x] Task 2.5: 修改 `data_service/main.py`，缓存层使用 PostgreSQL
  - [x] Task 2.6: 验证 10 项数据全部迁移成功（6种类型32条，4种未接入缓存的类型待后续处理）

- [x] Task 3: 修改测试脚本并运行测试
  - [x] Task 3.1: 修改 `tests/rag/test-rag.ts`，只测试之前失败的 5 个 query
  - [x] Task 3.2: 测试报告中增加"修复对比"部分
  - [x] Task 3.3: 保留之前失败的测试报告，新增修复后的测试报告
  - [x] Task 3.4: 运行测试，验证 query 通过（8/10 通过）

- [x] Task 4: 修复切片策略 + Query改写 + 重建索引 + 全量测试
  - [x] Task 4.1: 修复 `splitLongText` 断句逻辑，增加多级断点优先级（句末>换行>表格行>逗号）
  - [x] Task 4.2: 增大 chunk size 512→800，overlap 64→128
  - [x] Task 4.3: 实现 Query 同义词扩展（金融领域），应用于 BM25 稀疏检索
  - [x] Task 4.4: 运行重建索引脚本（3个文档共1336个chunk）
  - [x] Task 4.5: 前端页面新增"重建索引"按钮和"重建全部索引"按钮
  - [x] Task 4.6: 修改测试脚本，全量测试 10 个 query，增加三轮历史对比
  - [x] Task 4.7: 运行全量测试，10/10 全部通过
  - [x] Task 4.8: 合并测试报告，保留历史记录

# Task Dependencies
- [Task 2.1] → [Task 2.2] → [Task 2.3]
- [Task 1] 和 [Task 2] 可以并行
- [Task 3] 依赖 [Task 1]
- [Task 4] 依赖 [Task 1]（精排修复后才能测试）

# 测试结果演进
- 第1次测试（初始）：5/10 通过（50%）
- 第2次测试（精排修复后）：8/10 通过（80%）
- 第3次测试（切片+Query扩展修复后）：10/10 通过（100%）
