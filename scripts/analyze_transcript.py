#!/usr/bin/env python3
"""
Agent Transcript 分析工具
分析 AgentLog 记录，输出每步耗时、工具调用统计、瓶颈识别

用法:
  python scripts/analyze_transcript.py --conversation-id <conv_id>
  python scripts/analyze_transcript.py --user-id <user_id> --limit 5
  python scripts/analyze_transcript.py --latest
"""

import argparse
import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime


def format_ms(ms: int) -> str:
    if ms >= 1000:
        return f"{ms / 1000:.2f}s"
    return f"{ms}ms"


def analyze_steps(steps: list) -> dict:
    llm_total = 0
    tool_total = 0
    tool_calls = {}
    step_timings = []

    for step in steps:
        detail = step.get("detail", {}) or {}
        step_type = step.get("type", "")
        round_num = step.get("round", 0)
        title = step.get("title", "")

        llm_ms = detail.get("llmMs", 0) or 0
        tool_ms = detail.get("toolMs", 0) or 0
        round_ms = detail.get("roundMs", 0) or 0
        exec_ms = detail.get("executionTimeMs", 0) or 0

        llm_total += llm_ms
        tool_total += tool_ms

        timing_entry = {
            "round": round_num,
            "type": step_type,
            "title": title,
            "llmMs": llm_ms,
            "toolMs": tool_ms,
            "roundMs": round_ms,
        }
        step_timings.append(timing_entry)

        if step_type == "tool_call":
            tool_name = detail.get("toolName", "unknown")
            if tool_name not in tool_calls:
                tool_calls[tool_name] = {"count": 0, "totalMs": 0}
            tool_calls[tool_name]["count"] += 1
            tool_calls[tool_name]["totalMs"] += tool_ms

    return {
        "llmTotalMs": llm_total,
        "toolTotalMs": tool_total,
        "toolCalls": tool_calls,
        "stepTimings": step_timings,
    }


def print_report(log: dict, analysis: dict):
    query = log.get("query", "")
    answer = log.get("answer", "")[:200]
    iterations = log.get("iterations", 0)
    total_tokens = log.get("totalTokens", 0)
    latency_ms = log.get("latencyMs", 0)
    status = log.get("status", "")
    model = log.get("model", "")

    print(f"\n{'='*60}")
    print(f"Query: {query}")
    print(f"Model: {model} | Status: {status} | Iterations: {iterations}")
    print(f"Total: {format_ms(latency_ms)} | Tokens: {total_tokens}")
    print(f"LLM: {format_ms(analysis['llmTotalMs'])} | Tools: {format_ms(analysis['toolTotalMs'])}")
    print(f"{'='*60}")

    print(f"\n--- Step Timeline ---")
    for s in analysis["stepTimings"]:
        timing_parts = []
        if s["llmMs"]:
            timing_parts.append(f"LLM:{format_ms(s['llmMs'])}")
        if s["toolMs"]:
            timing_parts.append(f"Tool:{format_ms(s['toolMs'])}")
        timing_str = " | ".join(timing_parts) if timing_parts else ""
        print(f"  R{s['round']:2d} [{s['type']:12s}] {s['title'][:50]:50s} {timing_str}")

    if analysis["toolCalls"]:
        print(f"\n--- Tool Call Statistics ---")
        sorted_tools = sorted(analysis["toolCalls"].items(), key=lambda x: x[1]["totalMs"], reverse=True)
        for name, stats in sorted_tools:
            avg_ms = stats["totalMs"] // max(stats["count"], 1)
            print(f"  {name:30s} ×{stats['count']:2d}  total={format_ms(stats['totalMs']):>10s}  avg={format_ms(avg_ms)}")

    bottlenecks = [s for s in analysis["stepTimings"] if s.get("roundMs", 0) > 5000]
    if bottlenecks:
        print(f"\n--- Bottlenecks (>5s) ---")
        for b in bottlenecks:
            print(f"  R{b['round']:2d} [{b['type']}] {b['title'][:50]} — {format_ms(b['roundMs'])}")

    print(f"\nAnswer: {answer}...")
    print()


def main():
    parser = argparse.ArgumentParser(description="Agent Transcript Analyzer")
    parser.add_argument("--conversation-id", help="Analyze specific conversation")
    parser.add_argument("--user-id", default="default-user", help="User ID")
    parser.add_argument("--limit", type=int, default=5, help="Number of recent logs")
    parser.add_argument("--latest", action="store_true", help="Analyze latest log")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    try:
        from server.db.client import db
        from server.db.schema import agentLogs
        from sqlalchemy import desc
    except ImportError:
        print("Error: Cannot import database modules. Run from project root.")
        sys.exit(1)

    import asyncio

    async def fetch_logs():
        async with db.acquire() as conn:
            if args.conversation_id:
                rows = await conn.execute(
                    agentLogs.select()
                    .where(agentLogs.c.conversationId == args.conversation_id)
                    .order_by(desc(agentLogs.c.createdAt))
                )
            elif args.latest:
                rows = await conn.execute(
                    agentLogs.select()
                    .order_by(desc(agentLogs.c.createdAt))
                    .limit(1)
                )
            else:
                rows = await conn.execute(
                    agentLogs.select()
                    .where(agentLogs.c.userId == args.user_id)
                    .order_by(desc(agentLogs.c.createdAt))
                    .limit(args.limit)
                )
            return rows.fetchall()

    logs = asyncio.run(fetch_logs())

    if not logs:
        print("No agent logs found.")
        return

    results = []
    for log in logs:
        log_dict = dict(log._mapping) if hasattr(log, '_mapping') else dict(log)
        steps = log_dict.get("steps", []) or []
        if isinstance(steps, str):
            try:
                steps = json.loads(steps)
            except:
                steps = []

        analysis = analyze_steps(steps)
        results.append({"log": log_dict, "analysis": analysis})

        if not args.json:
            print_report(log_dict, analysis)

    if args.json:
        print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()