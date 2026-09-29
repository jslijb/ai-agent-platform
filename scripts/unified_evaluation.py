#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
V16 统一评测器——自研评测方法论 V1.0（R030）

三维指标体系（spec.md R030）：
  质量维度：CP/CR/F/AR（沿用 RAGAS 语义，复用 ragas_evaluation.py 实现）
           + NA 数值精度（新增：误差<0.1%→1分；<1%→0.5分；≥1%→0分）
  性能维度：E2E/检索/生成三维延迟 P50/P90/P95/均值（纯统计，0 LLM 调用）
  稳定维度：SR 成功率（非空/非超时/非错误文本）

设计约束（design.md 9.9）：
  - 复用 ragas_evaluation.py 模块导入（禁止复制既有函数）
  - judge 模型单轮锁定，降级时报告标记 judge_degraded
  - Goodhart 风险披露（评估器迎合规则清单 + 数据驱动指标）
  - 失败项计 0 分，禁止伪数据；断点续传/并发锁沿用

用法：
  python scripts/unified_evaluation.py --input tests/reports/evaluation/ragas-eval-data-v16.json
  python scripts/unified_evaluation.py --input <旧数据> --limit 5        # 冒烟
  python scripts/unified_evaluation.py --input <数据> --skip-llm         # 仅性能/NA/SR，0 LLM 调用
"""

import argparse
import json
import logging
import math
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 同目录模块导入复用（scripts 不在 sys.path 时补齐）
_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from ragas_evaluation import (  # noqa: E402
    Config as V13Config,
    LLMCaller,
    acquire_lock,
    call_llm,
    create_caller,
    create_client,
    eval_answer_relevancy,
    eval_context_precision,
    eval_context_recall,
    eval_faithfulness,
    get_checkpoint_path,
    is_refusal_answer,
    load_checkpoint,
    load_eval_data,
    logger,
    release_lock,
    save_checkpoint,
)

logger.setLevel(logging.INFO)


# ============================================================================
# V16 配置（覆盖 V13 权重与阈值，其余配置沿用）
# ============================================================================
class V16Config:
    """V16 统一评测配置（design.md 9.9）"""

    DEFAULT_INPUT = "tests/reports/evaluation/ragas-eval-data-v16.json"
    DEFAULT_OUTPUT_DIR = "tests/reports/evaluation"

    # 综合分公式：F/AR 各降 0.05 让渡给 NA（金融数值准确性业务优先）
    WEIGHTS = {
        "context_precision": 0.20,
        "context_recall": 0.20,
        "faithfulness": 0.25,
        "answer_relevancy": 0.25,
        "numerical_accuracy": 0.10,
    }

    THRESHOLDS = {
        "context_precision": 0.80,
        "context_recall": 0.80,
        "faithfulness": 0.85,
        "answer_relevancy": 0.80,
        "numerical_accuracy": 0.85,
        "overall": 0.82,
        "e2e_p95_ms": 5000.0,   # 对齐 V3.0 Phase3 性能门禁
        "success_rate": 0.95,
    }

    BASELINE = {
        "version": "V13-r6",
        "overall": 0.9153,
        "cp": 0.9455,
        "cr": 0.7045,
        "f": 1.0000,
        "ar": 0.9509,
    }

    REPORT_VERSION = "V16-unified-selfimpl-r1"


# ============================================================================
# 纯函数：数值提取与 NA 评分（可单测，不依赖 LLM/网络）
# ============================================================================
_UNIT_TABLE = [
    # (后缀关键字, 乘数)；长词优先匹配
    ("万亿", 1e12),
    ("亿万", 1e12),
    ("百万", 1e6),
    ("亿", 1e8),
    ("万", 1e4),
    ("千", 1e3),
]

_NUM_PATTERN = re.compile(
    r"(?<![\d.])"
    r"(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)"
    r"\s*(%|％|万亿|亿万|百万|亿|万|千)?"
)

# 错误回答特征（SR 成功率判定）
_ERROR_PATTERN = re.compile(
    r"HTTP\s?\d{3}|Internal Server Error|Traceback|Exception|"
    r"请求失败|服务暂不可用|系统繁忙|API\s?Error|Error:|评估失败|"
    r"连接失败|Connection\s?Error|timed?\s?out",
    re.IGNORECASE,
)


def extract_numbers(text: str) -> List[Dict[str, Any]]:
    """
    从文本提取数值并换算为统一量纲。

    返回元素：{"value": 绝对值(%) 或原始量（比率型原值）, "unit": "ratio"|"count"}
    - "4529.30亿元" → count 4.5293e11
    - "1,234,567千元" → count 1.234567e9
    - "15.3%" / "增长15.3%" → ratio 15.3（比率型不乘 0.01，保持可比）
    """
    if not text:
        return []
    results: List[Dict[str, Any]] = []
    for match in _NUM_PATTERN.finditer(text):
        raw_num = match.group(1).replace(",", "")
        unit_str = match.group(2) or ""
        rest = text[match.end():match.end() + 2]
        lead = text[max(match.start() - 2, 0):match.start()]
        # 日期尾段排除：数字前紧邻 "数字-"（如 12-31 的 31）
        if not unit_str and re.match(r"\d-$", lead):
            continue
        # 年份排除：1900~2100 整数紧随"年"且无单位
        if not unit_str and rest.startswith("年"):
            try:
                v = float(raw_num)
                if v == int(v) and 1900 <= v <= 2100:
                    continue
            except ValueError:
                pass
        # 日期片段排除：数字后紧跟 "-数字"（如 2025-12-31）
        if not unit_str and re.match(r"-\d", rest):
            continue
        try:
            value = float(raw_num)
        except ValueError:
            continue
        if unit_str in ("%", "％"):
            results.append({"value": value, "unit": "ratio"})
            continue
        multiplier = 1.0
        for key, mult in _UNIT_TABLE:
            if key in unit_str:
                multiplier = mult
                break
        results.append({"value": value * multiplier, "unit": "count"})
    return results


def _pair_score(ans_val: float, gt_val: float) -> float:
    """单对数值的相对误差分级评分：<0.1%→1.0；<1%→0.5；≥1%→0.0"""
    if gt_val == 0:
        rel_err = 0.0 if abs(ans_val - gt_val) < 1e-9 else 1.0
    else:
        rel_err = abs(ans_val - gt_val) / abs(gt_val)
    if rel_err < 0.001:
        return 1.0
    if rel_err < 0.01:
        return 0.5
    return 0.0


def numerical_accuracy(answer: str, ground_truth: str) -> Tuple[Optional[float], str]:
    """
    NA 数值精度评分（贪心最近配对，同类型优先）。

    返回 (score, reason)；GT 无数值 → (None, 不适用)，不计入均值。
    """
    gt_nums = extract_numbers(ground_truth)
    if not gt_nums:
        return None, "GT无数值，NA不适用"

    ans_nums = extract_numbers(answer)
    if not ans_nums:
        return 0.0, "答案未含数值"

    used = [False] * len(ans_nums)
    scores: List[float] = []
    reasons: List[str] = []

    for gt in gt_nums:
        best_idx, best_err = -1, float("inf")
        for i, an in enumerate(ans_nums):
            if used[i] or an["unit"] != gt["unit"]:
                continue
            err = abs(an["value"] - gt["value"]) / (abs(gt["value"]) or 1e-9)
            if err < best_err:
                best_err, best_idx = err, i
        if best_idx < 0:
            scores.append(0.0)
            reasons.append(f"GT数值{gt['value']:.6g}无同类型配对")
            continue
        used[best_idx] = True
        s = _pair_score(ans_nums[best_idx]["value"], gt["value"])
        scores.append(s)
        reasons.append(
            f"{gt['value']:.6g} vs {ans_nums[best_idx]['value']:.6g} → {s}"
        )

    final = sum(scores) / len(scores)
    return final, "; ".join(reasons)


def percentile(values: List[float], p: float) -> float:
    """线性插值分位数（p ∈ [0,100]），不依赖 numpy"""
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    k = (len(s) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(s[int(k)])
    return float(s[f] + (s[c] - s[f]) * (k - f))


def _dist(values: List[float]) -> Dict[str, float]:
    return {
        "mean": round(sum(values) / len(values), 1) if values else 0.0,
        "p50": round(percentile(values, 50), 1),
        "p90": round(percentile(values, 90), 1),
        "p95": round(percentile(values, 95), 1),
        "count": len(values),
    }


def compute_latency_stats(details: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    三维延迟统计：E2E = 检索 + 生成。

    检索延迟为 0 视为"未记录"（旧采集 SQL 路由恒 0），以 coverage 暴露，
    不计入检索均值/P95（避免扭曲），但仍计入 E2E（保持口径一致）。
    """
    e2e_vals: List[float] = []
    ret_vals: List[float] = []
    gen_vals: List[float] = []
    ret_recorded = 0

    for d in details:
        ret = float(d.get("retrievalLatencyMs") or 0)
        gen = float(d.get("generationLatencyMs") or 0)
        e2e_vals.append(ret + gen)
        gen_vals.append(gen)
        if ret > 0:
            ret_vals.append(ret)
            ret_recorded += 1

    total = len(details)
    return {
        "e2e": _dist(e2e_vals),
        "retrieval": _dist(ret_vals),
        "generation": _dist(gen_vals),
        "retrieval_coverage": round(ret_recorded / total, 4) if total else 0.0,
    }


def determine_success(answer: str) -> Tuple[bool, str]:
    """SR 成功率判定：非空 且 不含错误特征"""
    text = (answer or "").strip()
    if not text:
        return False, "空回答"
    hit = _ERROR_PATTERN.search(text)
    if hit:
        return False, f"错误特征: {hit.group(0)}"
    return True, "有效回答"


# ============================================================================
# 评估执行层
# ============================================================================
def evaluate_item_v16(
    client: Optional[Any], item: Dict[str, Any], idx: int, skip_llm: bool = False
) -> Dict[str, Any]:
    """评估单条数据：四 RAGAS 指标（复用）+ NA + SR + 延迟透传"""
    query = item.get("question", "")
    answer = item.get("answer", "")
    contexts = item.get("contexts", [])
    ground_truth = item.get("ground_truth", "")
    can_answer = item.get("canAnswer", True)
    item_id = item.get("id", str(idx))
    category = item.get("category", "未分类")

    logger.info(f"[{idx+1}] 评估 id={item_id}, category={category}, query={query[:40]}...")

    result: Dict[str, Any] = {
        "id": item_id,
        "category": category,
        "query": query,
        "canAnswer": can_answer,
        "retrievalLatencyMs": item.get("retrievalLatencyMs", 0),
        "generationLatencyMs": item.get("generationLatencyMs", 0),
        "context_precision": 0.0,
        "context_recall": 0.0,
        "faithfulness": 0.0,
        "answer_relevancy": 0.0,
        "numerical_accuracy": None,
        "success": False,
        "reasons": {},
    }
    result["success"], result["reasons"]["success"] = determine_success(answer)

    na, na_reason = numerical_accuracy(answer, ground_truth)
    result["numerical_accuracy"] = na
    result["reasons"]["numerical_accuracy"] = na_reason

    if skip_llm:
        result["reasons"]["quality"] = "skip-llm 模式：质量指标未评估"
        return result

    # 拒绝回答场景（沿用 V13 口径：正确拒绝四指标满分；风险披露中声明）
    if not can_answer and is_refusal_answer(answer):
        logger.info(f"[{idx+1}] 正确拒绝(canAnswer=false) → 4 指标统一满分")
        result["context_precision"] = 1.0
        result["context_recall"] = 1.0
        result["faithfulness"] = 1.0
        result["answer_relevancy"] = 1.0
        result["reasons"]["quality"] = "正确拒绝，四指标满分（V13 口径沿用，见风险披露）"
        return result

    if can_answer and is_refusal_answer(answer):
        logger.warning(f"[{idx+1}] 错误拒绝(canAnswer=true) → AR=0, CR=0")
        result["faithfulness"] = 1.0
        result["answer_relevancy"] = 0.0
        result["context_recall"] = 0.0
        result["reasons"]["faithfulness"] = "拒绝答案未编造"
        result["reasons"]["answer_relevancy"] = "错误拒绝，未回答问题"
        result["reasons"]["context_recall"] = "未覆盖期望答案"
        cp, cp_r = eval_context_precision(client, query, contexts)
        result["context_precision"] = cp
        result["reasons"]["context_precision"] = cp_r
        return result

    # 正常回答场景：四指标全量评估（复用 ragas_evaluation 实现）
    try:
        cp, cp_r = eval_context_precision(client, query, contexts)
        result["context_precision"] = cp
        result["reasons"]["context_precision"] = cp_r
    except Exception as e:
        logger.error(f"[{idx+1}] CP 评估失败: {e}", exc_info=True)
        result["reasons"]["context_precision"] = f"评估失败: {e}"

    try:
        cr, cr_r = eval_context_recall(client, query, contexts, ground_truth)
        result["context_recall"] = cr
        result["reasons"]["context_recall"] = cr_r
    except Exception as e:
        logger.error(f"[{idx+1}] CR 评估失败: {e}", exc_info=True)
        result["reasons"]["context_recall"] = f"评估失败: {e}"

    try:
        f, f_r = eval_faithfulness(client, query, answer, contexts)
        result["faithfulness"] = f
        result["reasons"]["faithfulness"] = f_r
    except Exception as e:
        logger.error(f"[{idx+1}] F 评估失败: {e}", exc_info=True)
        result["reasons"]["faithfulness"] = f"评估失败: {e}"

    try:
        ar, ar_r = eval_answer_relevancy(client, query, answer)
        result["answer_relevancy"] = ar
        result["reasons"]["answer_relevancy"] = ar_r
    except Exception as e:
        logger.error(f"[{idx+1}] AR 评估失败: {e}", exc_info=True)
        result["reasons"]["answer_relevancy"] = f"评估失败: {e}"

    return result


def _item_complete(d: Dict[str, Any]) -> bool:
    """
    checkpoint 完整性判定：区分"真实 0 分"与"LLM 失败 0 分"。

    - reasons.error 存在 → LLM 异常，不完整
    - 任一指标 reason 以 "评估失败" 开头 → LLM 解析失败，不完整
    - 否则四指标有值（含真实 0 分）即完整，NA 可为 None（拒答/GT无数值）
    """
    if "numerical_accuracy" not in d:
        return False
    reasons = d.get("reasons", {})
    if reasons.get("error"):
        return False
    for m in ("context_precision", "context_recall", "faithfulness", "answer_relevancy"):
        r = reasons.get(m, "")
        if isinstance(r, str) and r.startswith("评估失败"):
            return False
    return all(
        d.get(m) is not None
        for m in ("context_precision", "context_recall", "faithfulness", "answer_relevancy")
    )


def _is_sql_formatted(item: Dict[str, Any]) -> bool:
    ctx = item.get("contexts")
    text = " ".join(ctx) if isinstance(ctx, list) else str(ctx or "")
    return "【SQL精确查询结果】" in text or "【附注表查询结果】" in text


# ============================================================================
# 报告生成
# ============================================================================
def generate_v16_report(
    details: List[Dict[str, Any]],
    items: List[Dict[str, Any]],
    duration: float,
    caller: Optional[LLMCaller] = None,
    judge_degraded: bool = False,
    skip_llm: bool = False,
    input_path: str = "",
    initial_judge: Optional[str] = None,
) -> Dict[str, Any]:
    """生成 V16 三维统一评测报告（JSON 结构）"""
    quality_metrics = ["context_precision", "context_recall", "faithfulness", "answer_relevancy"]

    overall_scores: Dict[str, Any] = {}
    for m in quality_metrics:
        values = [d[m] for d in details if isinstance(d.get(m), (int, float))]
        overall_scores[m] = round(sum(values) / len(values), 4) if values else 0.0

    na_values = [d["numerical_accuracy"] for d in details if d.get("numerical_accuracy") is not None]
    overall_scores["numerical_accuracy"] = (
        round(sum(na_values) / len(na_values), 4) if na_values else None
    )

    overall_score = round(
        sum(
            (overall_scores[m] or 0.0) * w
            for m, w in V16Config.WEIGHTS.items()
        ),
        4,
    )
    if skip_llm:
        overall_score = None  # 质量层未评估，综合分不可计算

    # 达标判断
    pass_status: Dict[str, str] = {}
    for m in quality_metrics:
        pass_status[m] = (
            "PASS" if overall_scores[m] >= V16Config.THRESHOLDS[m] else "FAIL"
        )
    if overall_scores["numerical_accuracy"] is None:
        pass_status["numerical_accuracy"] = "N/A"
    else:
        pass_status["numerical_accuracy"] = (
            "PASS"
            if overall_scores["numerical_accuracy"] >= V16Config.THRESHOLDS["numerical_accuracy"]
            else "FAIL"
        )
    if skip_llm:
        for m in quality_metrics:
            pass_status[m] = "SKIPPED"
        pass_status["overall"] = "SKIPPED"
    else:
        pass_status["overall"] = (
            "PASS" if overall_score >= V16Config.THRESHOLDS["overall"] else "FAIL"
        )

    # 性能与稳定性
    latency = compute_latency_stats(details)
    pass_status["e2e_p95"] = (
        "PASS" if latency["e2e"]["p95"] <= V16Config.THRESHOLDS["e2e_p95_ms"] else "FAIL"
    )
    success_count = sum(1 for d in details if d.get("success"))
    success_rate = round(success_count / len(details), 4) if details else 0.0
    pass_status["success_rate"] = (
        "PASS" if success_rate >= V16Config.THRESHOLDS["success_rate"] else "FAIL"
    )

    # 分类明细
    category_stats: Dict[str, Dict[str, Any]] = {}
    for d in details:
        cat = d.get("category", "未分类")
        st = category_stats.setdefault(
            cat,
            {
                "count": 0,
                "metrics": {m: [] for m in quality_metrics},
                "na": [],
                "e2e": [],
                "success": 0,
            },
        )
        st["count"] += 1
        for m in quality_metrics:
            if isinstance(d.get(m), (int, float)):
                st["metrics"][m].append(d[m])
        if d.get("numerical_accuracy") is not None:
            st["na"].append(d["numerical_accuracy"])
        st["e2e"].append(
            float(d.get("retrievalLatencyMs") or 0) + float(d.get("generationLatencyMs") or 0)
        )
        if d.get("success"):
            st["success"] += 1

    for cat, st in category_stats.items():
        summary: Dict[str, Any] = {"count": st["count"]}
        for m in quality_metrics:
            vals = st["metrics"][m]
            summary[m] = round(sum(vals) / len(vals), 4) if vals else 0.0
        summary["numerical_accuracy"] = (
            round(sum(st["na"]) / len(st["na"]), 4) if st["na"] else None
        )
        summary["e2e_p95_ms"] = round(percentile(st["e2e"], 95), 1)
        summary["success_rate"] = round(st["success"] / st["count"], 4)
        category_stats[cat] = summary

    # judge 信息
    # 修正（2026-09-19）：原实现 judge_model 取「首次锁定」而 judge_base_url 取「当前（可能已降级）」，
    # 导致报告出现 model=商汤 / base_url=百炼 的互相矛盾记录。现在：
    #   - judge_model / judge_base_url 一律取自同一个 provider 快照（按实际成功调用数最多的那个）
    #   - 同时记录 judge_initial / judge_final / judge_calls（每个判分模型各判了多少条）
    llm_chain_info = []
    judge_model = "N/A(skip-llm)" if skip_llm else "N/A"
    judge_base_url = "N/A"
    judge_initial = "N/A"
    judge_final = "N/A"
    judge_calls: Dict[str, int] = {}
    if caller is not None:
        llm_chain_info = [
            {"provider": p.name, "model": p.model, "base_url": p.base_url}
            for p in caller.chain
        ]
        judge_calls = dict(getattr(caller, "calls", {}) or {})
        judge_initial = initial_judge or "N/A"
        judge_final = (
            f"{caller.current.name}/{caller.current.model}" if caller.current else "N/A"
        )
        # 主导 judge = 实际成功调用最多的 provider；无调用统计时退回首次锁定项
        dominant = None
        if judge_calls:
            top_key = max(judge_calls, key=lambda k: judge_calls[k])
            dominant = next(
                (p for p in caller.chain if f"{p.name}/{p.model}" == top_key), None
            )
        if dominant is None and initial_judge:
            dominant = next(
                (p for p in caller.chain if f"{p.name}/{p.model}" == initial_judge), None
            )
        if dominant is None:
            dominant = caller.current
        if dominant is not None:
            judge_model = f"{dominant.name}/{dominant.model}"
            judge_base_url = dominant.base_url

    # Goodhart 风险披露（固定清单 + 数据驱动）
    sql_formatted_count = sum(1 for it in items if _is_sql_formatted(it))
    refusal_full_count = sum(1 for d in details if d.get("canAnswer") is False and d.get("context_precision") == 1.0)
    goodhart = {
        "disclosure": [
            "1. LLM-as-Judge 与生产同源模型系：存在自我肯定倾向（官方 RAGAS 0.3205 vs 自实现 0.9153 差距为证）",
            "2. SQL 结果自然语言格式化器提升 CP/CR 可判定性：分数提升部分来自'让评估器看懂'，不全是系统真实能力",
            "3. 正确拒绝(canAnswer=false)四指标直接满分（V13 口径沿用）：直接抬高 L9 类得分",
            "4. NA 数值精度较 V13 口径收紧（5%→1%/0.1%）：NA 与 V13 分数不可直接比较",
            f"5. 样本量 {len(items)} 条，95% 置信区间约 ±{round(1.96 * math.sqrt(max((overall_score if overall_score is not None else 0.5) * (1 - (overall_score if overall_score is not None else 0.5)), 0.01) / max(len(items), 1)) * 100, 1)}%",
        ],
        "data_driven": {
            "sql_formatted_ratio": round(sql_formatted_count / len(items), 4) if items else 0.0,
            "refusal_full_score_count": refusal_full_count,
            "judge_degraded": judge_degraded,
            "skip_llm": skip_llm,
        },
    }

    baseline = V16Config.BASELINE
    delta = (
        round(overall_score - baseline["overall"], 4)
        if overall_score is not None
        else None
    )
    comparison = {
        "baseline_version": baseline["version"],
        "baseline_overall": baseline["overall"],
        "v16_overall": overall_score,
        "delta": delta,
        "judge_comparable": (not judge_degraded) and (not skip_llm),
        "note": (
            "judge 与 V13-r6(agnes-2.5-flash) 不同或未评估质量层，评分尺度不可比，delta 仅作参考"
            if not (not judge_degraded and not skip_llm)
            else "同口径质量层可对比；NA 为新增指标不影响 overall 可比性（权重已重分配）"
        ),
    }

    return {
        "version": V16Config.REPORT_VERSION,
        "framework": "自研评测方法论 V1.0（RAGAS 沿用 + 项目微调，R030）",
        "timestamp": datetime.now().isoformat(),
        "evaluation_meta": {
            "duration_seconds": round(duration, 2),
            "item_count": len(details),
            "input_path": input_path,
            "judge_model": judge_model,
            "judge_base_url": judge_base_url,
            "judge_initial": judge_initial,
            "judge_final": judge_final,
            "judge_calls": judge_calls,
            "judge_unique": len(judge_calls) <= 1,
            "judge_degraded": judge_degraded,
            "llm_chain": llm_chain_info,
            "skip_llm": skip_llm,
        },
        "weights": V16Config.WEIGHTS,
        "thresholds": V16Config.THRESHOLDS,
        "quality_metrics": {**overall_scores, "overall_score": overall_score, "pass_status": pass_status},
        "performance_metrics": {**latency, "pass_status": pass_status["e2e_p95"]},
        "stability_metrics": {
            "success_rate": success_rate,
            "success_count": success_count,
            "fail_list": [
                {"id": d["id"], "reason": d.get("reasons", {}).get("success", "")}
                for d in details if not d.get("success")
            ],
            "pass_status": pass_status["success_rate"],
        },
        "category_stats": category_stats,
        "baseline_comparison": comparison,
        "goodhart_risk_disclosure": goodhart,
        "details": details,
    }


def render_markdown(report: Dict[str, Any]) -> str:
    """渲染人读 Markdown 报告"""
    q = report["quality_metrics"]
    p = report["performance_metrics"]
    s = report["stability_metrics"]
    meta = report["evaluation_meta"]
    cmp_ = report["baseline_comparison"]
    g = report["goodhart_risk_disclosure"]

    lines: List[str] = []
    lines.append(f"# V16 统一评测报告（{report['version']}）")
    lines.append("")
    lines.append(f"- 生成时间：{report['timestamp']}")
    lines.append(f"- 方法论：{report['framework']}")
    lines.append(f"- 样本：{meta['item_count']} 条（{meta['input_path']}）")
    lines.append(f"- Judge：{meta['judge_model']}（degraded={meta['judge_degraded']}）")
    _jc = meta.get("judge_calls") or {}
    if _jc:
        _jtxt = "、".join(f"{k} × {v}" for k, v in sorted(_jc.items(), key=lambda x: -x[1]))
        lines.append(
            f"- Judge 实际判分分布：{_jtxt}（唯一判分模型={meta.get('judge_unique')}）"
        )
    elif not meta.get("skip_llm"):
        lines.append("- Judge 实际判分分布：无调用统计")
    lines.append(f"- 耗时：{meta['duration_seconds']}s")
    lines.append("")

    lines.append("## 一、质量维度")
    lines.append("")
    lines.append("| 指标 | 得分 | 阈值 | 状态 |")
    lines.append("|------|------|------|------|")
    for m, label in [
        ("context_precision", "CP 上下文精度"),
        ("context_recall", "CR 上下文召回"),
        ("faithfulness", "F 忠实度"),
        ("answer_relevancy", "AR 答案相关性"),
        ("numerical_accuracy", "NA 数值精度(V16新增)"),
    ]:
        v = q.get(m)
        v_str = "N/A" if v is None else f"{v}"
        ps = q["pass_status"].get(m, "N/A")
        th = report["thresholds"].get(m, "-")
        lines.append(f"| {label} | {v_str} | {th} | {ps} |")
    lines.append(f"| **综合分** | **{q['overall_score']}** | {report['thresholds']['overall']} | {q['pass_status']['overall']} |")
    lines.append("")

    lines.append("## 二、性能维度（延迟 ms）")
    lines.append("")
    lines.append("| 维度 | mean | P50 | P90 | P95 | count |")
    lines.append("|------|------|-----|-----|-----|-------|")
    for dim, label in [("e2e", "端到端"), ("retrieval", "检索"), ("generation", "生成")]:
        d = p[dim]
        lines.append(
            f"| {label} | {d['mean']} | {d['p50']} | {d['p90']} | {d['p95']} | {d['count']} |"
        )
    lines.append("")
    lines.append(
        f"- E2E P95 门禁（≤{report['thresholds']['e2e_p95_ms']}ms）：**{p['pass_status']}**"
    )
    lines.append(f"- 检索延迟记录覆盖率：{p['retrieval_coverage'] * 100:.1f}%（低覆盖率说明采集端延迟缺失，参考 R030-a）")
    lines.append("")

    lines.append("## 三、稳定维度")
    lines.append("")
    lines.append(f"- 成功率：{s['success_rate']}（{s['success_count']}/{meta['item_count']}），门禁 {report['thresholds']['success_rate']} → **{s['pass_status']}**")
    if s["fail_list"]:
        lines.append(f"- 失败项：{json.dumps(s['fail_list'][:10], ensure_ascii=False)}")
    lines.append("")

    lines.append("## 四、分类明细")
    lines.append("")
    lines.append("| 分类 | 样本 | CP | CR | F | AR | NA | E2E-P95(ms) | SR |")
    lines.append("|------|------|----|----|---|----|----|------------|-----|")
    for cat, st in sorted(report["category_stats"].items()):
        na_v = "N/A" if st["numerical_accuracy"] is None else st["numerical_accuracy"]
        lines.append(
            f"| {cat} | {st['count']} | {st['context_precision']} | {st['context_recall']} "
            f"| {st['faithfulness']} | {st['answer_relevancy']} | {na_v} "
            f"| {st['e2e_p95_ms']} | {st['success_rate']} |"
        )
    lines.append("")

    lines.append("## 五、与 V13-r6 基线对比")
    lines.append("")
    lines.append(f"- 基线综合分：{cmp_['baseline_overall']}（{cmp_['baseline_version']}）")
    lines.append(f"- V16 综合分：{cmp_['v16_overall']}（Δ={cmp_['delta']}）")
    lines.append(f"- 评分尺度可比：{cmp_['judge_comparable']}")
    lines.append(f"- 说明：{cmp_['note']}")
    lines.append("")

    lines.append("## 六、评估器迎合风险披露（Goodhart）")
    lines.append("")
    for item in g["disclosure"]:
        lines.append(f"- {item}")
    lines.append("")
    lines.append(f"- SQL 格式化命中占比：{g['data_driven']['sql_formatted_ratio'] * 100:.1f}%")
    lines.append(f"- 拒答满分条数：{g['data_driven']['refusal_full_score_count']}")
    lines.append("")

    lines.append("## 七、明细数据")
    lines.append("")
    lines.append("> 完整明细见同名 JSON 报告 details 字段。")
    return "\n".join(lines)


def save_v16_report(report: Dict[str, Any], output_path: str) -> Tuple[str, str]:
    """JSON + Markdown 双产出，返回两个文件路径"""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    json_path = output_path
    md_path = os.path.splitext(output_path)[0] + ".md"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(render_markdown(report))
    return json_path, md_path


def print_v16_summary(report: Dict[str, Any]) -> None:
    """控制台摘要（ASCII 安全输出）"""
    q = report["quality_metrics"]
    p = report["performance_metrics"]
    s = report["stability_metrics"]
    logger.info("========== V16 统一评测摘要 ==========")
    logger.info(
        f"[质量] CP={q['context_precision']} CR={q['context_recall']} "
        f"F={q['faithfulness']} AR={q['answer_relevancy']} "
        f"NA={q['numerical_accuracy']} 综合={q['overall_score']} ({q['pass_status']['overall']})"
    )
    logger.info(
        f"[性能] E2E mean={p['e2e']['mean']}ms p95={p['e2e']['p95']}ms "
        f"| 检索覆盖率={p['retrieval_coverage']} ({p['pass_status']})"
    )
    logger.info(f"[稳定] 成功率={s['success_rate']} ({s['pass_status']})")
    cmp_ = report["baseline_comparison"]
    logger.info(
        f"[对比] V13-r6 基线={cmp_['baseline_overall']} V16={cmp_['v16_overall']} "
        f"Δ={cmp_['delta']} 可比={cmp_['judge_comparable']}"
    )


# ============================================================================
# 主流程
# ============================================================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="V16 统一评测器（质量+性能+延迟）")
    parser.add_argument("--input", default=V16Config.DEFAULT_INPUT, help="采集数据路径")
    parser.add_argument("--output", default=None, help="输出 JSON 报告路径（自动派生 .md）")
    parser.add_argument("--limit", type=int, default=None, help="限制评估条数（冒烟）")
    parser.add_argument("--resume", default=None, help="断点续传 checkpoint 路径")
    parser.add_argument("--skip-llm", action="store_true", help="跳过质量层 LLM 评估（仅性能/NA/SR）")
    return parser.parse_args()


def main() -> None:
    logger.info("=== V16 统一评测器启动（自研评测方法论 V1.0 / R030） ===")
    args = parse_args()

    if not os.path.exists(args.input):
        logger.error(f"输入文件不存在: {args.input}")
        logger.error(
            "请先运行采集: npx tsx scripts/collect-rag-data.ts，"
            "或用 --input 指向已有数据（如 tests/reports/evaluation/ragas-eval-data-v13-r6.json）"
        )
        sys.exit(1)

    items = load_eval_data(args.input, args.limit)
    if not items:
        logger.error("无评估数据，退出")
        sys.exit(1)

    if args.output:
        output_path = args.output
    else:
        ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        output_path = os.path.join(
            V16Config.DEFAULT_OUTPUT_DIR, f"ragas-report-v16-{ts}.json"
        )
    checkpoint_path = get_checkpoint_path(output_path)
    lock_path = acquire_lock(output_path)

    # 断点续传（V16 完整性判定）
    completed_details = load_checkpoint(checkpoint_path) if args.resume else load_checkpoint(checkpoint_path)
    completed_ids = set()
    valid_completed = [d for d in completed_details if _item_complete(d)]
    completed_ids = {d.get("id") for d in valid_completed}
    logger.info(f"断点续传：已完成 {len(completed_ids)} 条，待评估 {len(items) - len(completed_ids)} 条")

    caller: Optional[LLMCaller] = None
    client: Optional[Any] = None
    judge_degraded = False
    if not args.skip_llm:
        caller = create_caller()
        client = caller  # LLMCaller 兼容旧 client 接口

    details: List[Dict[str, Any]] = list(valid_completed)
    start_time = time.time()
    initial_judge: Optional[str] = None
    try:
        for i, item in enumerate(items):
            item_id = item.get("id", str(i))
            if item_id in completed_ids:
                logger.info(f"[{i+1}] 跳过已完成项: id={item_id}")
                continue
            try:
                detail = evaluate_item_v16(client, item, i, skip_llm=args.skip_llm)
                details.append(detail)
            except Exception as e:
                logger.error(f"[{i+1}] 评估异常，计 0 分: {e}", exc_info=True)
                details.append(
                    {
                        "id": item_id,
                        "category": item.get("category", "未分类"),
                        "query": item.get("question", ""),
                        "canAnswer": item.get("canAnswer", True),
                        "retrievalLatencyMs": item.get("retrievalLatencyMs", 0),
                        "generationLatencyMs": item.get("generationLatencyMs", 0),
                        "context_precision": 0.0,
                        "context_recall": 0.0,
                        "faithfulness": 0.0,
                        "answer_relevancy": 0.0,
                        "numerical_accuracy": 0.0,
                        "success": False,
                        "reasons": {"error": str(e)},
                    }
                )
            save_checkpoint(checkpoint_path, details)

            # judge 降级检测：首次激活时锁定，之后变化即标记
            if caller is not None and caller.current is not None:
                current_judge = f"{caller.current.name}/{caller.current.model}"
                if initial_judge is None:
                    initial_judge = current_judge
                    logger.info(f"Judge 已锁定: {current_judge}")
                elif current_judge != initial_judge:
                    judge_degraded = True
                    logger.warning(f"Judge 降级: {initial_judge} → {current_judge}")
    finally:
        duration = time.time() - start_time
        report = generate_v16_report(
            details,
            items,
            duration,
            caller=caller,
            judge_degraded=judge_degraded,
            skip_llm=args.skip_llm,
            input_path=args.input,
            initial_judge=initial_judge,
        )
        json_path, md_path = save_v16_report(report, output_path)
        print_v16_summary(report)
        logger.info(f"报告(JSON): {json_path}")
        logger.info(f"报告(MD)  : {md_path}")

        # checkpoint 清理：失败项为 0 时清理
        if not args.skip_llm:
            failed_count = sum(
                1 for d in details
                if not _item_complete(d)
            )
            if failed_count > 0:
                logger.warning(f"{failed_count} 条不完整，保留 checkpoint: {checkpoint_path}")
            elif os.path.exists(checkpoint_path):
                os.remove(checkpoint_path)
                logger.info("Checkpoint 已清理")
        release_lock(lock_path)


if __name__ == "__main__":
    main()