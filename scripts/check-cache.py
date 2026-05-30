import sqlite3

conn = sqlite3.connect(r"data\market_cache\market_data.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT cache_key, data_type, record_count, source FROM cache_entries ORDER BY data_type, cache_key")
for r in cur.fetchall():
    print(f'{r["data_type"]:20s} | records={r["record_count"]:6d} | source={str(r["source"]):10s} | key={r["cache_key"]}')

print("\n--- 缺失项检查 ---")

expected = {
    "history": ["000858", "sz.000858", "000066", "sz.000066", "000651", "sz.000651"],
    "realtime": ["000858", "000066", "000651"],
    "financial": ["000858", "sz.000858", "000066", "sz.000066", "000651", "sz.000651"],
    "financial_report": ["000858", "000066", "000651"],
    "index": ["sh.000001", "sz.399001", "sz.399006"],
    "basic": ["efinance", "mootdx", "baostock"],
}

for dtype, codes in expected.items():
    cur.execute("SELECT cache_key, record_count FROM cache_entries WHERE data_type = ?", (dtype,))
    rows = cur.fetchall()
    existing_keys = [r["cache_key"] for r in rows]
    zero_records = [r["cache_key"] for r in rows if r["record_count"] == 0]
    print(f"\n{dtype}: {len(rows)} entries, {len(zero_records)} with 0 records")
    if zero_records:
        print(f"  ⚠️ 空记录: {zero_records}")

conn.close()
