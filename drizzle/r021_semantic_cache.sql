-- R021: semantic_cache 表 + pgvector HNSW 索引
-- 用于 LLM 语义缓存，支持按 promptTemplate 分组 + 向量相似度匹配

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS semantic_cache (
  id SERIAL PRIMARY KEY,
  prompt_template VARCHAR(100) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  input_text TEXT NOT NULL,
  embedding vector(1024),
  response TEXT NOT NULL,
  model VARCHAR(50),
  provider VARCHAR(50),
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS semantic_cache_template_idx ON semantic_cache (prompt_template);
CREATE INDEX IF NOT EXISTS semantic_cache_input_hash_idx ON semantic_cache (input_hash);
CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx ON semantic_cache USING hnsw (embedding vector_cosine_ops);

-- 清理过期缓存（可由定时任务调用）
-- DELETE FROM semantic_cache WHERE expires_at < NOW();