import psycopg2
import bcrypt

conn = psycopg2.connect("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
cur = conn.cursor()

new_hash = bcrypt.hashpw("jslij123".encode(), bcrypt.gensalt()).decode()
cur.execute('UPDATE "User" SET password = %s WHERE email = %s', (new_hash, "jslijb@163.com"))
conn.commit()
print(f"Password reset, rows: {cur.rowcount}")

cur.execute('SELECT password FROM "User" WHERE email = %s', ("jslijb@163.com",))
h = cur.fetchone()[0]
print(f"Verify: {bcrypt.checkpw('jslij123'.encode(), h.encode())}")
conn.close()