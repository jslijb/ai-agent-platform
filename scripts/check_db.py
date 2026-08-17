import psycopg2

conn = psycopg2.connect('postgresql://aiagent:aiagent_secret@localhost:5432/agentdb')
cur = conn.cursor()

cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")
tables = cur.fetchall()
print('=== 数据库表列表 ===')
for t in tables:
    print(t[0])

print()
print('=== 各表行数统计 ===')
for t in tables:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{t[0]}"')
        count = cur.fetchone()[0]
        print(f'{t[0]}: {count} 行')
    except Exception as e:
        print(f'{t[0]}: ERROR - {e}')

print()
print('=== Conversation 表详情 ===')
try:
    cur.execute("SELECT id, \"userId\", title, \"createdAt\", \"updatedAt\" FROM \"Conversation\" ORDER BY \"createdAt\" DESC LIMIT 20;")
    rows = cur.fetchall()
    cols = [desc[0] for desc in cur.description]
    print(f'列: {cols}')
    for r in rows:
        print(r)
    if not rows:
        print('(无数据)')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== Message 表详情 ===')
try:
    cur.execute("SELECT id, \"conversationId\", role, LEFT(content, 100), \"createdAt\" FROM \"Message\" ORDER BY \"createdAt\" DESC LIMIT 20;")
    rows = cur.fetchall()
    cols = [desc[0] for desc in cur.description]
    print(f'列: {cols}')
    for r in rows:
        print(r)
    if not rows:
        print('(无数据)')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== AgentLog 表详情 ===')
try:
    cur.execute("SELECT id, \"conversationId\", \"userId\", LEFT(query, 80), LEFT(answer, 80), model, status FROM \"AgentLog\" ORDER BY id DESC LIMIT 10;")
    rows = cur.fetchall()
    cols = [desc[0] for desc in cur.description]
    print(f'列: {cols}')
    for r in rows:
        print(r)
    if not rows:
        print('(无数据)')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== MemorySummary 表 ===')
try:
    cur.execute("SELECT COUNT(*) FROM \"MemorySummary\";")
    print(f'MemorySummary: {cur.fetchone()[0]} 行')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== MemoryFragment 表 ===')
try:
    cur.execute("SELECT COUNT(*) FROM \"MemoryFragment\";")
    print(f'MemoryFragment: {cur.fetchone()[0]} 行')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== MemoryProfile 表 ===')
try:
    cur.execute("SELECT COUNT(*) FROM \"MemoryProfile\";")
    print(f'MemoryProfile: {cur.fetchone()[0]} 行')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== User 表 ===')
try:
    cur.execute("SELECT id, email, name, role FROM \"User\";")
    rows = cur.fetchall()
    for r in rows:
        print(r)
    if not rows:
        print('(无数据)')
except Exception as e:
    print(f'ERROR: {e}')

print()
print('=== 财务数据表检查 ===')
for tbl in ['stock_mapping', 'indicator_aliases', 'financial_income', 'financial_balancesheet', 'financial_cashflow', 'financial_indicators', 'financial_raw_tables', 'financial_conflict_log']:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{tbl}"')
        count = cur.fetchone()[0]
        print(f'{tbl}: {count} 行')
    except Exception as e:
        print(f'{tbl}: ERROR - {e}')

print()
print('=== 评估/合规表检查 ===')
for tbl in ['evaluation_pool', 'evaluation_versions', 'compliance_logs', 'WrongAnswer']:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{tbl}"')
        count = cur.fetchone()[0]
        print(f'{tbl}: {count} 行')
    except Exception as e:
        print(f'{tbl}: ERROR - {e}')

print()
print('=== Document/Embedding 表检查 ===')
for tbl in ['Document', 'Embedding']:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{tbl}"')
        count = cur.fetchone()[0]
        print(f'{tbl}: {count} 行')
    except Exception as e:
        print(f'{tbl}: ERROR - {e}')

print()
print('=== market_cache_entries 表检查 ===')
try:
    cur.execute('SELECT COUNT(*) FROM "market_cache_entries"')
    print(f'market_cache_entries: {cur.fetchone()[0]} 行')
except Exception as e:
    print(f'ERROR: {e}')

conn.close()