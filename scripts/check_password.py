import os
import psycopg2
import bcrypt

TEST_EMAIL = os.environ.get("TEST_USER_EMAIL", "test@example.com")

conn = psycopg2.connect(
    os.environ.get(
        "DATABASE_URL",
        "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb",
    )
)
cur = conn.cursor()

cur.execute('SELECT id, email, name, password FROM "User" WHERE email = %s', (TEST_EMAIL,))
user = cur.fetchone()
if user:
    print(f"User: id={user[0]} email={user[1]} name={user[2]}")
    print(f"Password hash: {user[3][:30]}...")

    # 用通用弱口令字典探测（不含任何真实密码）
    weak_list = ["123456", "password", "admin", "qwerty", "letmein"]
    for pwd in weak_list:
        if bcrypt.checkpw(pwd.encode(), user[3].encode()):
            print(f"⚠ 命中弱口令: {pwd}（请立即修改）")
            break
    else:
        print("未命中通用弱口令")

conn.close()
