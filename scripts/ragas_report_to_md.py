#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""将 RAGAS 评估 JSON 报告转换为 MD 格式（便于人工阅读）"""
import argparse
import json
from pathlib import Path
from datetime import datetime


def fmt_score(score: float) -> str:
    """格式化分数为 4 位小数"""
    return f"{score:.4f}"


def fmt_status(status: str) -> str:
    """格式化达标状态为 emoji 标识"""
    return "✅ PASS" if status == "PASS" else "❌ FAIL"


def generate_md(report: dict, output_path: Path):
    """生成 MD 报告"""
    lines = []

    # 标题
    lines.append(f"# {report.get('version', 'RAGAS')} 评估报告")
    lines.append("")
    lines.append(f"**生成时间**: {report.get('timestamp', 'N/A')}")
    lines.append(f"**评估框架**: {report.get('framework', 'N/A')}")
    lines.append("")

    # 评估元信息
    meta = report.get("evaluation_meta", {})
    lines.append("## 一、评估元信息")
    lines.append("")
    lines.append(f"- **评估耗时**: {meta.get('duration_seconds', 0):.1f} 秒")
    lines.append(f"- **主用 LLM**: {meta.get('llm_active_provider', 'N/A')}")
    lines.append(f"- **测试集大小**: {meta.get('total_items', 0)} 条")
    lines.append(f"- **使用指标**: {', '.join(meta.get('metrics_used', []))}")
    lines.append("")

    # LLM 降级链
    lines.append("### LLM 降级链")
    lines.append("")
    lines.append("| 顺序 | Provider | 模型 | Base URL |")
    lines.append("|------|----------|------|----------|")
    for i, p in enumerate(meta.get("llm_chain", []), 1):
        lines.append(f"| {i} | {p.get('provider')} | {p.get('model')} | {p.get('base_url')} |")
    lines.append("")

    if meta.get("exhausted_providers"):
        lines.append(f"**耗尽的 Provider**: {', '.join(meta['exhausted_providers'])}")
        lines.append("")

    # 总体分数
    lines.append("## 二、总体分数")
    lines.append("")
    overall_scores = report.get("overall_scores", {})
    pass_status = report.get("pass_status", {})
    weights = report.get("weights", {})
    thresholds = report.get("thresholds", {})

    lines.append("| 指标 | 分数 | 权重 | 优秀线 | 状态 |")
    lines.append("|------|------|------|--------|------|")
    metric_names = {
        "context_precision": "Context Precision (上下文精度)",
        "context_recall": "Context Recall (上下文召回)",
        "faithfulness": "Faithfulness (忠实度)",
        "answer_relevancy": "Answer Relevancy (答案相关性)",
    }
    for k in ["context_precision", "context_recall", "faithfulness", "answer_relevancy"]:
        score = overall_scores.get(k, 0)
        weight = weights.get(k, 0)
        threshold = thresholds.get(k, 0)
        status = pass_status.get(k, "FAIL")
        name = metric_names.get(k, k)
        lines.append(
            f"| {name} | {fmt_score(score)} | {weight} | {threshold} | {fmt_status(status)} |"
        )

    overall_score = report.get("overall_score", 0)
    overall_status = pass_status.get("overall", "FAIL")
    overall_threshold = thresholds.get("overall", 0)
    lines.append(
        f"| **综合得分** | **{fmt_score(overall_score)}** | 1.00 | {overall_threshold} | **{fmt_status(overall_status)}** |"
    )
    lines.append("")

    # 分类统计
    lines.append("## 三、分类统计")
    lines.append("")
    category_stats = report.get("category_stats", {})
    lines.append(
        "| 分类 | 样本数 | CP | CR | Faithfulness | AR |"
    )
    lines.append("|------|--------|----|----|--------------|----|")
    for cat, stats in category_stats.items():
        m = stats.get("metrics", {})
        lines.append(
            f"| {cat} | {stats.get('count', 0)} | "
            f"{fmt_score(m.get('context_precision', 0))} | "
            f"{fmt_score(m.get('context_recall', 0))} | "
            f"{fmt_score(m.get('faithfulness', 0))} | "
            f"{fmt_score(m.get('answer_relevancy', 0))} |"
        )
    lines.append("")

    # 详细结果
    lines.append("## 四、详细结果（逐 Query 分析）")
    lines.append("")
    detailed = report.get("detailed_results", [])

    # 按 category 分组
    by_category = {}
    for item in detailed:
        cat = item.get("category", "未分类")
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(item)

    for cat, items in by_category.items():
        lines.append(f"### {cat}（共 {len(items)} 条）")
        lines.append("")

        # 计算分类平均分
        cp_avg = sum(i.get("context_precision", 0) for i in items) / len(items) if items else 0
        cr_avg = sum(i.get("context_recall", 0) for i in items) / len(items) if items else 0
        f_avg = sum(i.get("faithfulness", 0) for i in items) / len(items) if items else 0
        ar_avg = sum(i.get("answer_relevancy", 0) for i in items) / len(items) if items else 0
        lines.append(
            f"**分类平均**: CP={fmt_score(cp_avg)}, CR={fmt_score(cr_avg)}, "
            f"F={fmt_score(f_avg)}, AR={fmt_score(ar_avg)}"
        )
        lines.append("")

        # 表格汇总
        lines.append("| ID | Query | canAnswer | CP | CR | F | AR |")
        lines.append("|----|-------|-----------|----|----|---|----|")
        for item in items:
            q = item.get("query", "").replace("|", "\\|").replace("\n", " ")
            if len(q) > 60:
                q = q[:57] + "..."
            lines.append(
                f"| {item.get('id', '')} | {q} | "
                f"{'是' if item.get('canAnswer') else '否'} | "
                f"{fmt_score(item.get('context_precision', 0))} | "
                f"{fmt_score(item.get('context_recall', 0))} | "
                f"{fmt_score(item.get('faithfulness', 0))} | "
                f"{fmt_score(item.get('answer_relevancy', 0))} |"
            )
        lines.append("")

        # 每个 query 的详细原因
        lines.append("#### 详细原因")
        lines.append("")
        for item in items:
            lines.append(f"**{item.get('id', '')}**: {item.get('query', '')}")
            lines.append("")
            lines.append(f"- canAnswer: {'是' if item.get('canAnswer') else '否'}")
            lines.append(
                f"- CP={fmt_score(item.get('context_precision', 0))}, "
                f"CR={fmt_score(item.get('context_recall', 0))}, "
                f"F={fmt_score(item.get('faithfulness', 0))}, "
                f"AR={fmt_score(item.get('answer_relevancy', 0))}"
            )
            reasons = item.get("reasons", {})
            for metric, reason in reasons.items():
                reason_clean = str(reason).replace("\n", " ")
                lines.append(f"  - **{metric}**: {reason_clean}")
            lines.append("")

        lines.append("---")
        lines.append("")

    # 写入文件
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"MD 报告已生成: {output_path}")
    print(f"  文件大小: {output_path.stat().st_size / 1024:.1f} KB")
    print(f"  总行数: {len(lines)}")


def main():
    parser = argparse.ArgumentParser(description="JSON 报告转 MD")
    parser.add_argument(
        "--input",
        default="tests/reports/evaluation/ragas-report-v12.json",
        help="输入 JSON 报告路径",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="输出 MD 路径（默认同名 .md）",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误: 输入文件不存在: {input_path}")
        return

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix(".md")

    with open(input_path, "r", encoding="utf-8") as f:
        report = json.load(f)

    generate_md(report, output_path)


if __name__ == "__main__":
    main()
