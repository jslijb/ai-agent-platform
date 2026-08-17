import psycopg2

conn = psycopg2.connect("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
cur = conn.cursor()

# 检查是否有 nextauth 相关的 session/cookie 表
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%session%'")
session_tables = cur.fetchall()
print(f"Session tables: {[t[0] for t in session_tables]}")

# 检查 User 表中 jslijb 的完整信息
cur.execute('SELECT id, email, name, role, "createdAt" FROM "User" WHERE email = %s', ("jslijb@163.com",))
user = cur.fetchone()
if user:
    print(f"\nUser jslijb@163.com:")
    print(f"  id: {user[0]}")
    print(f"  email: {user[1]}")
    print(f"  name: {user[2]}")
    print(f"  role: {user[3]}")
    print(f"  created: {user[4]}")

# 检查最近的对话
cur.execute("""
    SELECT c.id, c.title, c."updatedAt", COUNT(m.id) as msg_count
    FROM "Conversation" c
    LEFT JOIN "Message" m ON m."conversationId" = c.id
    WHERE c."userId" = %s
    GROUP BY c.id, c.title, c."updatedAt"
    ORDER BY c."updatedAt" DESC
    LIMIT 5
""", (user[0],))
convs = cur.fetchall()
print(f"\nRecent conversations with message counts:")
for c in convs:
    print(f"  id={c[0][:8]} title={c[1][:40] or 'empty'} updated={c[2]} msgs={c[3]}")

conn.close()
