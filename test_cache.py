import sqlite3
import json

conn = sqlite3.connect("data/market_cache/market_data.db")
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT cache_key, data, record_count FROM cache_entries WHERE data_type='history'")
rows = cursor.fetchall()

for r in rows:
    key = r[0]
    if "sh.600036" not in key:
        continue
    data = json.loads(r[1])
    print(f"缓存 key: {key}")
    print(f"总记录数: {len(data)}")

    if data:
        dates = [d.get("date") or d.get("tradeDate") or "" for d in data]
        dates.sort()
        print(f"日期范围: {dates[0]} ~ {dates[-1]}")
        print(f"\n最近 10 条:")
        for item in data[-10:]:
            d = item.get("date") or item.get("tradeDate")
            print(f"  {d}: 开={item.get('open')} 高={item.get('high')} 低={item.get('low')} 收={item.get('close')} 量={item.get('volume')}")

conn.close()
