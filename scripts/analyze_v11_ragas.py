"""V11 RAGAS 评估结果逐条分析脚本

读取 ragas-report，按失败模式分类统计，输出每个 query 的详细分析。
"""
import json
import os
from collections import defaultdict
from pathlib import Path

REPORT_PATH = Path(
    "D:/Python/ai-agent-platform/tests/reports/evaluation/ragas-report-2026-07-27T21-03-16.json"
)
EVAL_DATA_PATH = Path(
    "D:/Python/ai-agent-platform/tests/reports/evaluation/ragas-eval-data.json"
)
OUTPUT_PATH = Path(
    "D:/Python/ai-agent-platform/docs/v11-ragas-query-analysis.md"
)


def load_report():
    with open(REPORT_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_eval_data():
    """加载原始评估数据（含 query/ground_truth/contexts/answer）"""
    with open(EVAL_DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def classify_failure(detail, item):
    """识别失败模式"""
    cp = detail.get("context_precision", 0)
    cr = detail.get("context_recall", 0)
    f = detail.get("faithfulness", 0)
    ar = detail.get("answer_relevancy", 0)
    reasons = detail.get("reasons", {})
    can_answer = item.get("canAnswer", True)
    answer = item.get("answer", "")
    contexts = item.get("contexts", [])

    failures = []

    # 检索为空
    if not contexts or len(contexts) == 0:
        failures.append("无检索结果")
        return failures

    # 错误拒绝（canAnswer=true 但答案被判为拒绝）
    if can_answer and ("错误拒绝" in str(reasons) or "wrong_refusal" in str(reasons).lower()):
        failures.append("错误拒绝")

    # CP 低（检索排序差）
    if cp < 0.5:
        failures.append(f"CP低({cp:.2f})")

    # CR 低（召回不完整）
    if cr < 0.5 and can_answer:
        failures.append(f"CR低({cr:.2f})")

    # F 低（忠实度低）
    if f < 0.8:
        failures.append(f"F低({f:.2f})")

    # AR 低（相关性低）
    if ar < 0.5:
        failures.append(f"AR低({ar:.2f})")

    # 答案过短
    if len(answer) < 20:
        failures.append(f"答案过短({len(answer)}字)")

    # 检索结果少
    if len(contexts) < 3:
        failures.append(f"检索少({len(contexts)}条)")

    if not failures and cp >= 0.8 and cr >= 0.8 and f >= 0.85 and ar >= 0.8:
        failures.append("全达标")

    return failures


def main():
    report = load_report()
    eval_data = load_eval_data()

    details = report.get("detailed_results", [])
    items = eval_data.get("items", [])

    # 建立 id → item 映射
    item_map = {}
    for item in items:
        item_map[item.get("id", "")] = item

    # 按类别分组
    by_category = defaultdict(list)
    # 按失败模式分组
    by_failure = defaultdict(list)
    # 全部 query 分析
    all_analyses = []

    for detail in details:
        qid = detail.get("id", "")
        category = detail.get("category", "未分类")
        query = detail.get("query", "")
        cp = detail.get("context_precision", 0)
        cr = detail.get("context_recall", 0)
        f = detail.get("faithfulness", 0)
        ar = detail.get("answer_relevancy", 0)
        reasons = detail.get("reasons", {})

        item = item_map.get(qid, {})
        can_answer = item.get("canAnswer", True)
        answer = item.get("answer", "")
        contexts = item.get("contexts", [])
        ground_truth = item.get("ground_truth", "")

        failures = classify_failure(detail, item)

        analysis = {
            "id": qid,
            "category": category,
            "query": query,
            "canAnswer": can_answer,
            "scores": {"CP": cp, "CR": cr, "F": f, "AR": ar},
            "failures": failures,
            "answer_preview": answer[:150] if answer else "",
            "answer_len": len(answer),
            "contexts_count": len(contexts),
            "ground_truth_preview": ground_truth[:100] if ground_truth else "",
            "reasons": reasons,
        }

        all_analyses.append(analysis)
        by_category[category].append(analysis)
        for fail in failures:
            by_failure[fail].append(qid)

    # 输出 Markdown 分析报告
    lines = []
    lines.append("# V11 RAGAS 评估 - 逐条 Query 分析报告\n")
    lines.append(f"报告生成时间: {report.get('timestamp', 'N/A')}")
    lines.append(f"评估条目数: {len(details)}")
    lines.append(f"LLM: {report.get('evaluation_meta', {}).get('llm_active_provider', 'N/A')}\n")

    # 总体统计
    lines.append("## 1. 总体统计\n")
    lines.append("| 指标 | 平均 | 最低 | 最高 |")
    lines.append("|------|------|------|------|")
    for metric in ["CP", "CR", "F", "AR"]:
        key = {"CP": "context_precision", "CR": "context_recall", "F": "faithfulness", "AR": "answer_relevancy"}[metric]
        scores = [d.get(key, 0) for d in details]
        avg = sum(scores) / len(scores) if scores else 0
        lines.append(f"| {metric} | {avg:.4f} | {min(scores):.4f} | {max(scores):.4f} |")
    lines.append("")

    # 失败模式统计
    lines.append("## 2. 失败模式分布\n")
    lines.append("| 失败模式 | 数量 | 占比 | 示例 query |")
    lines.append("|----------|------|------|------------|")
    for fail, qids in sorted(by_failure.items(), key=lambda x: -len(x[1])):
        pct = len(qids) / len(details) * 100
        example = next((a["query"][:40] for a in all_analyses if a["id"] in qids), "")
        lines.append(f"| {fail} | {len(qids)} | {pct:.1f}% | {example} |")
    lines.append("")

    # 按类别分析
    lines.append("## 3. 按类别分析\n")
    for cat in sorted(by_category.keys()):
        analyses = by_category[cat]
        lines.append(f"### {cat} ({len(analyses)} 条)\n")
        lines.append("| ID | Query | CP | CR | F | AR | 失败模式 |")
        lines.append("|----|-------|----|----|----|----|----------|")
        for a in analyses:
            s = a["scores"]
            fail_str = ", ".join(a["failures"]) if a["failures"] else "无"
            q = a["query"][:50].replace("|", "\\|")
            lines.append(
                f"| {a['id']} | {q} | {s['CP']:.2f} | {s['CR']:.2f} | {s['F']:.2f} | {s['AR']:.2f} | {fail_str} |"
            )
        lines.append("")

    # 逐条详细分析
    lines.append("## 4. 逐条详细分析\n")
    for a in all_analyses:
        s = a["scores"]
        lines.append(f"### {a['id']} [{a['category']}]\n")
        lines.append(f"- **Query**: {a['query']}")
        lines.append(f"- **canAnswer**: {a['canAnswer']}")
        lines.append(f"- **得分**: CP={s['CP']:.3f}, CR={s['CR']:.3f}, F={s['F']:.3f}, AR={s['AR']:.3f}")
        lines.append(f"- **失败模式**: {', '.join(a['failures']) if a['failures'] else '无'}")
        lines.append(f"- **检索条数**: {a['contexts_count']}")
        lines.append(f"- **答案长度**: {a['answer_len']} 字")
        lines.append(f"- **期望答案**: {a['ground_truth_preview']}")
        lines.append(f"- **实际答案**: {a['answer_preview']}")
        reasons = a.get("reasons", {})
        if reasons:
            for k, v in reasons.items():
                v_str = str(v)[:200]
                lines.append(f"- **{k}**: {v_str}")
        lines.append("")

    # 根因分析
    lines.append("## 5. 根因分析\n")
    lines.append("### 5.1 检索质量问题（CP/CR 低）\n")
    cp_low = by_failure.get("CP低(0.00)", []) + [qid for fail, qids in by_failure.items() if "CP低" in fail for qid in qids]
    lines.append(f"- CP<0.5 的 query 数: {len(set(cp_low))}")
    lines.append("- 根因: 检索结果排序差，相关文档未排在前面")
    lines.append("")

    lines.append("### 5.2 答案相关性问题（AR 低）\n")
    ar_low = [qid for fail, qids in by_failure.items() if "AR低" in fail for qid in qids]
    lines.append(f"- AR<0.5 的 query 数: {len(set(ar_low))}")
    lines.append("- 根因: 答案冗长、错误拒绝、合规拒绝被误判")
    lines.append("")

    lines.append("### 5.3 错误拒绝问题\n")
    wrong_refusal = by_failure.get("错误拒绝", [])
    lines.append(f"- 错误拒绝 query 数: {len(wrong_refusal)}")
    lines.append("- 根因: isRefusalAnswer 误判，或合规拦截过度")
    lines.append("")

    output = "\n".join(lines)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"分析报告已生成: {OUTPUT_PATH}")
    print(f"\n=== 关键统计 ===")
    print(f"总 query 数: {len(details)}")
    print(f"\n失败模式分布:")
    for fail, qids in sorted(by_failure.items(), key=lambda x: -len(x[1])):
        print(f"  {fail}: {len(qids)} 条 ({len(qids)/len(details)*100:.1f}%)")

    # 输出前 20 条失败最严重的
    print(f"\n=== 得分最低的 20 条 query ===")
    all_analyses.sort(key=lambda a: sum(a["scores"].values()))
    for a in all_analyses[:20]:
        s = a["scores"]
        total = s["CP"] + s["CR"] + s["F"] + s["AR"]
        print(f"  {a['id']} [{a['category']}] 总分={total:.2f} CP={s['CP']:.2f} CR={s['CR']:.2f} F={s['F']:.2f} AR={s['AR']:.2f} | {a['query'][:50]}")


if __name__ == "__main__":
    main()
