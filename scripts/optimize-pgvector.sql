-- pgvector 索引优化：ivfflat → hnsw
-- HNSW 在小数据量下性能更优，召回率更高
-- 先删除旧索引，再创建新索引

DROP INDEX IF EXISTS "Embedding_embedding_idx";

-- HNSW 索引参数：
-- m: 连接数（默认16，越大越精确但占内存）
-- ef_construction: 构建时搜索宽度（默认64，越大越精确但构建慢）
CREATE INDEX "Embedding_embedding_idx" ON public."Embedding"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 验证
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Embedding';