SELECT count(*) FROM public."Embedding";
SELECT pg_size_pretty(pg_relation_size('Embedding_embedding_idx')) as index_size;
SELECT indexdef FROM pg_indexes WHERE indexname = 'Embedding_embedding_idx';