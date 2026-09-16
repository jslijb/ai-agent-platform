"""重置测试账号密码（邮箱与目标密码均从环境变量读取，不在代码中硬编码）"""
import os
import bcrypt
import psycopg2

TEST_EMAIL = os.environ.get("TEST_USER_EMAIL", "test@example.com")
NEW_PWD = os.environ.get("TEST_USER_NEW_PASSWORD")

if not NEW_PWD:
    raise SystemExit("请先设置环境变量 TEST_USER_NEW_PASSWORD 再运行本脚本")

conn = psycopg2.connect(
    os.environ.get(
        "DATABASE_URL",
        "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb",
    )
)
cur = conn.cursor()

new_hash = bcrypt.hashpw(NEW_PWD.encode(), bcrypt.gensalt()).decode()
cur.execute('UPDATE "User" SET password = %s WHERE email = %s', (new_hash, TEST_EMAIL))
conn.commit()
print(f"Password reset, rows: {cur.rowcount}")

cur.execute('SELECT password FROM "User" WHERE email = %s', (TEST_EMAIL,))
row = cur.fetchone()
if row:
    print(f"Verify: {bcrypt.checkpw(NEW_PWD.encode(), row[0].encode())}")
conn.close()
