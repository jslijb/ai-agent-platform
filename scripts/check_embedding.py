import requests
r = requests.get("http://localhost:3000/api/document/list", headers={"x-test-user-id": "69ea0f70-00a0-426b-aa5f-0e198d0f69d3"})
d = r.json()
targets = ["中国人保2025年年度报告.txt", "江苏银行2025年年度报告.txt", "东吴证券2025年年度报告.txt", "华海药业2025年年度报告.txt"]
docs = [x for x in d.get("documents", []) if x.get("fileName", "") in targets]
for x in docs:
    print(f"{x['fileName']}: status={x['status']}, chunks={x.get('chunkCount', '?')}")