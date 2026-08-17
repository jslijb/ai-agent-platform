SELECT 'MemorySummary' as tbl, COUNT(*) as cnt FROM "MemorySummary"
UNION ALL SELECT 'MemoryFragment', COUNT(*) FROM "MemoryFragment"
UNION ALL SELECT 'Conversation', COUNT(*) FROM "Conversation"
UNION ALL SELECT 'Message', COUNT(*) FROM "Message";