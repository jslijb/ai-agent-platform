"""检查测试账号密码是否为指定值，不一致则重置（凭据全部从环境变量读取）"""
import os
import bcrypt
import psycopg2

TEST_EMAIL = os.environ.get("TEST_USER_EMAIL", "test@example.com")
TARGET_PWD = os.environ.get("TEST_USER_NEW_PASSWORD")

if not TARGET_PWD:
    raise SystemExit("请先设置环境变量 TEST_USER_NEW_PASSWORD 再运行本脚本")

conn = psycopg2.connect(
    os.environ.get(
        "DATABASE_URL",
        "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb",
    )
)
cur = conn.cursor()
cur.execute('SELECT password FROM "User" WHERE email = %s', (TEST_EMAIL,))
row = cur.fetchone()
if not row:
    raise SystemExit(f"未找到用户 {TEST_EMAIL}")

h = row[0]
if not bcrypt.checkpw(TARGET_PWD.encode(), h.encode()):
    new_hash = bcrypt.hashpw(TARGET_PWD.encode(), bcrypt.gensalt()).decode()
    cur.execute('UPDATE "User" SET password = %s WHERE email = %s', (new_hash, TEST_EMAIL))
    conn.commit()
    print("Password reset done")
else:
    print("Password already correct")

conn.close()
