"""检查知识库文档覆盖情况"""
import requests
import json

BASE_URL = "http://localhost:3000"
HEADERS = {"x-test-user-id": "test-user"}

queries = [
    "江苏银行2025年营业收入",
    "东吴证券2025年营业收入",
    "华海药业2025年营业收入",
    "片仔癀2025年营业收入",
    "格力电器2025年营业收入",
    "中国长城2025年营业收入",
    "五粮液2025年营业收入",
    "中国人保2025年营业收入",
    "中国能建2025年营业收入",
    "中国铁建2025年营业收入",
]

print("=" * 60)
print("知识库文档覆盖检查")
print("=" * 60)

for q in queries:
    try:
        r = requests.post(
            f"{BASE_URL}/api/rag/search",
            json={"query": q, "topK": 3},
            headers=HEADERS,
            timeout=30,
        )
        data = r.json()
        results = data.get("results", [])
        print(f"\n查询: {q}")
        print(f"  结果数: {len(results)}")
        if results:
            for i, res in enumerate(results[:2]):
                text = res.get("text", "")[:100]
                score = res.get("score", 0)
                print(f"  [{i}] score={score:.4f}: {text}...")
        else:
            print("  无检索结果!")
    except Exception as e:
        print(f"\n查询: {q} -> 错误: {e}")

print("\n" + "=" * 60)
