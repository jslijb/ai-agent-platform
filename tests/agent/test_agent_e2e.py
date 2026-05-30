import requests
import json
import time
import os
import sys

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

AGENT_URL = "http://localhost:3001"
REPORT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(REPORT_DIR, exist_ok=True)

AGENT_QUERY = (
    "获取招商银行(600036)最近30天的日K线数据，"
    "计算20日移动均线MA20和14日RSI指标，"
    "同时获取实时行情，"
    "并进行交易合规检查（单只股票仓位不超过20%），"
    "最后给出完整的技术分析和合规结论"
)

print("=" * 60)
print(f"Agent 端到端测试 (3001 → 8001)")
print(f"Query: {AGENT_QUERY}")
print("=" * 60)

t0 = time.time()
resp = requests.post(
    f"{AGENT_URL}/api/agent/run",
    json={"query": AGENT_QUERY, "maxIterations": 10, "userId": "test-e2e-final"},
    headers={"Content-Type": "application/json"},
    timeout=360,
)
elapsed = time.time() - t0
data = resp.json()
steps = data.get("steps", [])

print(f"\nHTTP: {resp.status_code} | 耗时: {elapsed:.0f}s | 迭代: {data.get('iterations', 0)} | 步骤: {len(steps)}")

current_round = -1
tool_names = []

print(f"\n{'='*50}")
print("分轮详细执行流程")
print(f"{'='*50}")

for s in steps:
    rnd = s.get("round", "?")
    typ = s.get("type", "?")
    title = s.get("title", "")
    detail = s.get("detail", {})
    tool = detail.get("toolName", "")
    content = s.get("content", "") or ""

    if rnd != current_round:
        current_round = rnd
        print(f"\n┌─ 第 {rnd} 轮 ─────────────────────────────")

    if typ == "thinking":
        print(f"│  [LLM 推理]")
    elif typ == "tool_call":
        if tool and tool not in tool_names:
            tool_names.append(tool)
        prefix = f"│  [工具调用] {tool}"
        if content and "参数:" in content:
            params_preview = content.split("参数:", 1)[1].strip()[:200]
            print(prefix)
            print(f"│             参数: {params_preview}")
        else:
            print(prefix)
    elif typ == "tool_result":
        preview = content[:200].replace("\n", " ")
        print(f"│  [工具结果] {tool}: {preview}...")
    elif typ == "reflection":
        msg = content[:250].replace("\n", " ") if content else title
        print(f"│  [反思评估] {msg}")
    elif typ == "answer":
        print(f"│  [最终答案]")
    elif typ == "retrieval":
        print(f"│  [补充检索] {title}")
    else:
        print(f"│  [{typ}] {title}")

print(f"└──────────────────────────────────────")

tool_chain_str = " → ".join(tool_names) if tool_names else "(无)"
print(f"\n工具调用链: {tool_chain_str}")

answer = data.get("answer", "")
if answer:
    print(f"\n最终答案 (共 {len(answer)} 字符):")
    for line in answer.split("\n")[:60]:
        print(f"  | {line}")
    if answer.count("\n") > 60:
        print(f"  ... (共 {answer.count(chr(10)) + 1} 行)")

ts = time.strftime("%Y%m%d_%H%M%S")
report_path = os.path.join(REPORT_DIR, f"agent_e2e_report_{ts}.json")

report = {
    "test_time": time.strftime("%Y-%m-%d %H:%M:%S"),
    "query": AGENT_QUERY,
    "http_status": resp.status_code,
    "elapsed_seconds": round(elapsed, 1),
    "success": data.get("success"),
    "iterations": data.get("iterations"),
    "conversation_id": data.get("conversationId"),
    "tool_chain": tool_names,
    "step_count": len(steps),
    "answer": answer,
    "steps": [{
        "round": s.get("round"),
        "type": s.get("type"),
        "title": s.get("title"),
        "tool": s.get("detail", {}).get("toolName", ""),
        "content_preview": (s.get("content", "") or "")[:400],
    } for s in steps],
}

with open(report_path, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print(f"\n{'='*60}")
print(f"报告已保存: {report_path}")
print(f"{'='*60}")