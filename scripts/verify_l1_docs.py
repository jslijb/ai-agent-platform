import requests, time
BASE_URL = "http://localhost:3000"
USER_ID = "69ea0f70-00a0-426b-aa5f-0e198d0f69d3"
queries = [
    ("中国人保", "中国人保2025年营业收入是多少？"),
    ("江苏银行", "江苏银行2025年营业收入是多少？"),
    ("东吴证券", "东吴证券2025年营业收入是多少？"),
    ("华海药业", "华海药业2025年营业收入是多少？"),
]
for name, q in queries:
    try:
        resp = requests.post(BASE_URL + "/api/rag/search", json={"query": q, "topK": 5, "mode": "hybrid"}, headers={"x-test-user-id": USER_ID, "Content-Type": "application/json"}, timeout=60)
        data = resp.json()
        results = data.get("results", [])
        found = any(name in r.get("text", "") for r in results)
        status = "PASS" if found else "FAIL"
        print(f"{name}: {status} | results={len(results)}")
        if results:
            print(f"  Top1: {results[0].get('text', '')[:100]}...")
    except Exception as e:
        print(f"{name}: ERROR {e}")
    time.sleep(2)