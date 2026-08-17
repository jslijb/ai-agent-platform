SELECT 'Conversation' as tbl, COUNT(*) as cnt FROM "Conversation"
UNION ALL SELECT 'Message', COUNT(*) FROM "Message"
UNION ALL SELECT 'User', COUNT(*) FROM "User"
UNION ALL SELECT 'Document', COUNT(*) FROM "Document"
UNION ALL SELECT 'Embedding', COUNT(*) FROM "Embedding"
UNION ALL SELECT 'MemorySummary', COUNT(*) FROM "MemorySummary"
UNION ALL SELECT 'MemoryFragment', COUNT(*) FROM "MemoryFragment"
UNION ALL SELECT 'MemoryProfile', COUNT(*) FROM "MemoryProfile"
UNION ALL SELECT 'stock_mapping', COUNT(*) FROM stock_mapping
UNION ALL SELECT 'financial_income', COUNT(*) FROM financial_income
UNION ALL SELECT 'financial_balancesheet', COUNT(*) FROM financial_balancesheet
UNION ALL SELECT 'financial_cashflow', COUNT(*) FROM financial_cashflow
UNION ALL SELECT 'financial_indicators', COUNT(*) FROM financial_indicators
UNION ALL SELECT 'market_cache_entries', COUNT(*) FROM market_cache_entries
UNION ALL SELECT 'evaluation_pool', COUNT(*) FROM evaluation_pool
UNION ALL SELECT 'compliance_logs', COUNT(*) FROM compliance_logs
UNION ALL SELECT 'WrongAnswer', COUNT(*) FROM "WrongAnswer"
UNION ALL SELECT 'Team', COUNT(*) FROM "Team"
UNION ALL SELECT 'TeamMember', COUNT(*) FROM "TeamMember"
UNION ALL SELECT 'evaluation_versions', COUNT(*) FROM evaluation_versions
UNION ALL SELECT 'financial_raw_tables', COUNT(*) FROM financial_raw_tables
UNION ALL SELECT 'financial_conflict_log', COUNT(*) FROM financial_conflict_log
UNION ALL SELECT 'indicator_aliases', COUNT(*) FROM indicator_aliases
ORDER BY 1;