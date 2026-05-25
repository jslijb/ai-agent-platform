
## Day 3 任务：向量检索 + 混合检索（BM25 + 向量 + RRF）

---

### 第 1 步：安装依赖

在项目根目录运行：
```bash
npm install pgvector @langchain/community pdf-parse nodejieba
```

- `pgvector`：PostgreSQL 向量扩展（需要数据库支持）
- `@langchain/community`：提供文档加载器、文本分割器等
- `pdf-parse`：解析 PDF 文件内容
- `nodejieba`：中文分词，用于 BM25 关键词检索

> 第一步已完成，无需理会，放在这里是为了项目的完整性。

---

### 第 2 步：数据库启用 pgvector

在 PostgreSQL 中启用向量扩展：
```bash
# 进入 PostgreSQL 容器
docker exec -it 60949cc0f2f6  psql -U aiagent -d agentdb

# 在 psql 中执行
CREATE EXTENSION IF NOT EXISTS vector;
```

> 第二步已完成，无需理会，放在这里是为了项目的完整性。

然后修改 `prisma/schema.prisma`，添加向量列支持（Prisma 本身不支持 vector 类型，需要使用原始 SQL 或 `@db.Unsupported`）。
或者单独创建一张 `embeddings` 表，字段包括：`id`, `document_id`, `chunk_text`, `embedding vector(1024)`。embedding 模型使用 BGE-M3 模型。本地部署，存储路径：`D:\models\modelscope`

**建议使用原始 SQL 迁移**：在 `prisma/migrations/` 下手动创建 SQL 文件。

---

### 第 3 步：实现智能切片模块

**提示词（后续放入 Trae）**：
```
在 /app/server/rag/chunking/semantic-chunker.ts 中，实现：
- 使用 RecursiveCharacterTextSplitter 或 SemanticChunker 对文档文本进行分块
- 使用 MinerU 2.5-Pro 云端api先对 pdf 文档进行解析，输出 markdown 格式，你需要根据 markdown 格式进行切分。设计合理的切分策略。
- 导出函数 chunkDocument(text: string): Promise<string[]>
```

---

### 第 4 步：实现稠密检索（向量）

**提示词**：
```
在 /app/server/rag/retrieval/dense-retriever.ts 中，实现：
- 使用 BGE-M3 模型生成查询和文档块的向量
- 在 PostgreSQL 中使用 pgvector 的余弦相似度（<=>）进行检索
- 函数 denseSearch(query: string, topK: number): Promise<Array<{text: string, score: number}>>
```

---

### 第 5 步：实现稀疏检索（BM25）

**提示词**：
```
在 /app/server/rag/retrieval/sparse-retriever.ts 中，实现：
- 使用 nodejieba 对中文文档和查询进行分词
- 实现 BM25 算法（或使用现有库如 bm25）
- 维护倒排索引（可存储在 Redis 或内存中，初期可每次重新计算）
- 函数 sparseSearch(query: string, topK: number): Promise<Array<{text: string, score: number}>>
```

---

### 第 6 步：实现 RRF 融合算法

**提示词**：
```
在 /app/server/rag/retrieval/hybrid-retriever.ts 中，实现：
- 导入 denseSearch 和 sparseSearch
- 使用 RRF（Reciprocal Rank Fusion）公式：score = sum(1/(k + rank))
- k 取 60（常用值）
- 融合两路结果，输出最终排序的前 topK 个文档块
- 函数 hybridSearch(query: string, topK: number): Promise<Array<{text: string, score: number}>>
```

---

### 第 7 步：创建文档上传 API

**提示词**：
```
在 /app/api/document/upload/route.ts 中，实现：
- 接收 multipart/form-data，字段名 file
- 使用 pdf-parse 提取文本
- 调用 chunkDocument 得到块列表
- 对每个块生成 embedding（调用 dense 模型）
- 将文本和向量存入 PostgreSQL（嵌入向量字段）
- 同时将原始文本存入 BM25 的倒排索引（可先存在内存字典中）
- 返回成功/失败
```

---

### 第 8 步：创建 RAG 搜索 API

**提示词**：
```
在 /app/api/rag/search/route.ts 中，实现：
- POST 接口，接收 { query: string }
- 调用 hybridSearch 得到最相关的 top-5 文档块
- 返回 JSON: { results: [{ text, score }] }
```

---

### 第 9 步：验收测试

1. 启动服务器：`npm run dev`
2. 上传一个测试 PDF（或创建假的文本文件）：
   ```bash
   curl -F "file=@test.pdf" http://localhost:3000/api/document/upload
   ```
3. 执行混合检索：
   ```bash
   curl -X POST http://localhost:3000/api/rag/search -H "Content-Type: application/json" -d '{"query":"NVDA 营收"}'
   ```
4. 预期返回相关的文档块，并且排名合理。

---

### 验收标准（Day 3 完成标志）

- [ ] PostgreSQL 已启用 `vector` 扩展
- [ ] 能上传 PDF 并正确切块、存储向量
- [ ] 能分别调用稠密检索和稀疏检索并得到结果
- [ ] 混合检索（RRF）融合后的 Top-5 结果质量高于单一检索方式（手动验证 3 个查询即可）
- [ ] 所有 API 返回正确的 JSON，无报错

---

> 你可以先把这些任务清单保存下来，等 Trae 恢复后，按顺序一个一个输入提示词让 AI 生成代码。如果某个步骤卡住，随时问我。
