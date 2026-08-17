import psycopg2, bcrypt

conn = psycopg2.connect("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
cur = conn.cursor()
cur.execute('SELECT password FROM "User" WHERE email = %s', ("jslijb@163.com",))
h = cur.fetchone()[0]
print(f"jslij123 match: {bcrypt.checkpw('jslij123'.encode(), h.encode())}")

if not bcrypt.checkpw("jslij123".encode(), h.encode()):
    new_hash = bcrypt.hashpw("jslij123".encode(), bcrypt.gensalt()).decode()
    cur.execute('UPDATE "User" SET password = %s WHERE email = %s', (new_hash, "jslijb@163.com"))
    conn.commit()
    print("Password reset to jslij123")
else:
    print("Password already correct")

conn.close()