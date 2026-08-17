import requests
r = requests.get("http://localhost:3000/api/document/list", headers={"x-test-user-id": "69ea0f70-00a0-426b-aa5f-0e198d0f69d3"})
d = r.json()
docs = [x for x in d.get("documents", []) if "2025" in x.get("fileName", "") and "年度报告" in x.get("fileName", "")]
for x in docs:
    print(f"{x['fileName']}: status={x['status']}")