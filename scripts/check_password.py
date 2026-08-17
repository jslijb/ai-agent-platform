import psycopg2
import bcrypt

conn = psycopg2.connect("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
cur = conn.cursor()

cur.execute('SELECT id, email, name, password FROM "User" WHERE email = %s', ("jslijb@163.com",))
user = cur.fetchone()
if user:
    print(f"User: id={user[0]} email={user[1]} name={user[2]}")
    print(f"Password hash: {user[3][:30]}...")
    
    # Try common passwords
    for pwd in ["jslij123", "jslij1234", "jslijb", "123456", "password", "jslijb@163.com"]:
        match = bcrypt.checkpw(pwd.encode(), user[3].encode())
        if match:
            print(f"Password found: {pwd}")
            break
    else:
        print("None of the common passwords match")

conn.close()