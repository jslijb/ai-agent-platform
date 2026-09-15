# -*- coding: utf-8 -*-
"""V16 统一评测器单元测试（R030-f）：NA解析/延迟分位/成功率判定"""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

import pytest  # noqa: E402

import unified_evaluation as ue  # noqa: E402


# ============================================================================
# extract_numbers 数值提取
# ============================================================================
class TestExtractNumbers:
    def test_basic_number(self):
        assert ue.extract_numbers("营收为123.45") == [{"value": 123.45, "unit": "count"}]

    def test_thousand_separator(self):
        assert ue.extract_numbers("1,766,384千元")[0]["value"] == pytest.approx(1.766384e9)
        assert ue.extract_numbers("1,766,384千元")[0]["unit"] == "count"

    def test_yi_unit(self):
        assert ue.extract_numbers("4529.30亿元")[0]["value"] == pytest.approx(4.5293e11)

    def test_wan_unit(self):
        assert ue.extract_numbers("净利润63,033百万元")[0]["value"] == pytest.approx(6.3033e10)

    def test_percent_is_ratio(self):
        nums = ue.extract_numbers("增长15.3%")
        assert nums == [{"value": 15.3, "unit": "ratio"}]

    def test_negative_percent(self):
        assert ue.extract_numbers("下降-3.2%")[0]["value"] == pytest.approx(-3.2)

    def test_year_excluded(self):
        assert ue.extract_numbers("中国能建2025年营业收入4529.30亿元") == [
            {"value": 4.5293e11, "unit": "count"}
        ]

    def test_date_excluded(self):
        assert ue.extract_numbers("报告期2025-12-31，资产10亿元") == [
            {"value": 1e9, "unit": "count"}
        ]

    def test_empty(self):
        assert ue.extract_numbers("") == []
        assert ue.extract_numbers("无数字文本") == []


# ============================================================================
# numerical_accuracy NA 评分
# ============================================================================
class TestNumericalAccuracy:
    def test_exact_match_full_score(self):
        score, _ = ue.numerical_accuracy("约4529.30亿元", "营业收入约为4529.30亿元")
        assert score == 1.0

    def test_within_0_1_percent(self):
        # 相对误差 0.05% → 1 分
        score, _ = ue.numerical_accuracy("收入100.05亿元", "收入100亿元")
        assert score == 1.0

    def test_within_1_percent_half(self):
        # 相对误差 0.5% → 0.5 分（V16 收紧自 V13 的 5%）
        score, _ = ue.numerical_accuracy("收入100.5亿元", "收入100亿元")
        assert score == 0.5

    def test_over_1_percent_zero(self):
        score, _ = ue.numerical_accuracy("收入105亿元", "收入100亿元")
        assert score == 0.0

    def test_answer_missing_number(self):
        score, reason = ue.numerical_accuracy("收入约为一百亿元", "收入100亿元")
        assert score == 0.0
        assert "未含数值" in reason

    def test_gt_no_number_not_applicable(self):
        score, reason = ue.numerical_accuracy("是的", "公司主营业务为电力")
        assert score is None
        assert "不适用" in reason

    def test_answer_missing_one_of_two_gt(self):
        # GT 两个数值，答案只含一个 → 漏项 0 分
        score, _ = ue.numerical_accuracy("收入100亿元", "收入100亿元，净利润10亿元")
        assert score == 0.5

    def test_ratio_vs_count_not_cross_paired(self):
        # 比率型与计数型不可跨型配对
        score, reason = ue.numerical_accuracy("增长15.3%", "增长15.3亿元")
        assert score == 0.0

    def test_error_margin_boundary(self):
        # 恰好 1% 误差 → 0 分（≥1%）
        score, _ = ue.numerical_accuracy("收入101亿元", "收入100亿元")
        assert score == 0.0


# ============================================================================
# percentile 分位数
# ============================================================================
class TestPercentile:
    def test_median_even_interp(self):
        assert ue.percentile([1, 2, 3, 4], 50) == pytest.approx(2.5)

    def test_p95_single_value(self):
        assert ue.percentile([100], 95) == 100

    def test_p95_interp(self):
        assert ue.percentile(list(range(1, 11)), 95) == pytest.approx(9.55)

    def test_empty(self):
        assert ue.percentile([], 95) == 0.0

    def test_p50_of_sorted_needed(self):
        # 未排序输入也应正确（内部排序）
        assert ue.percentile([10, 1, 5, 3], 50) == pytest.approx(4.0)


# ============================================================================
# compute_latency_stats 延迟统计
# ============================================================================
class TestLatencyStats:
    def _detail(self, ret, gen):
        return {"retrievalLatencyMs": ret, "generationLatencyMs": gen}

    def test_e2e_sum(self):
        stats = ue.compute_latency_stats([self._detail(100, 400), self._detail(200, 600)])
        assert stats["e2e"]["mean"] == pytest.approx(650)
        assert stats["e2e"]["count"] == 2

    def test_retrieval_zero_excluded_from_dist(self):
        stats = ue.compute_latency_stats([self._detail(0, 500), self._detail(300, 500)])
        # 0 值不计入检索分布，只进 coverage
        assert stats["retrieval"]["count"] == 1
        assert stats["retrieval"]["mean"] == 300
        assert stats["retrieval_coverage"] == pytest.approx(0.5)

    def test_p95_threshold_ready(self):
        # 离群值占比 10%（≥5%）时 P95 必须反映尾部延迟
        vals = [self._detail(0, 1000)] * 18 + [self._detail(0, 9000)] * 2
        stats = ue.compute_latency_stats(vals)
        assert stats["e2e"]["p95"] > 5000

    def test_empty(self):
        stats = ue.compute_latency_stats([])
        assert stats["e2e"]["count"] == 0
        assert stats["retrieval_coverage"] == 0.0


# ============================================================================
# determine_success 成功率判定
# ============================================================================
class TestDetermineSuccess:
    def test_valid_answer(self):
        ok, _ = ue.determine_success("中国能建2025年营收4529.30亿元")
        assert ok is True

    def test_empty_answer(self):
        ok, reason = ue.determine_success("")
        assert ok is False
        assert "空" in reason

    def test_http_error(self):
        ok, reason = ue.determine_success("HTTP 500 Internal Server Error")
        assert ok is False

    def test_timeout(self):
        ok, _ = ue.determine_success("请求超时（timed out）")
        assert ok is False

    def test_exception_text(self):
        ok, _ = ue.determine_success("Traceback (most recent call last): ...")
        assert ok is False

    def test_normal_text_with_percent(self):
        ok, _ = ue.determine_success("ROE为11.5%，高于行业均值")
        assert ok is True


# ============================================================================
# checkpoint 完整性判定
# ============================================================================
class TestItemComplete:
    def test_rejection_full_score_complete(self):
        d = {
            "canAnswer": False,
            "context_precision": 1.0,
            "context_recall": 1.0,
            "faithfulness": 1.0,
            "answer_relevancy": 1.0,
            "numerical_accuracy": None,
        }
        assert ue._item_complete(d) is True

    def test_normal_complete(self):
        d = {
            "canAnswer": True,
            "context_precision": 0.9,
            "context_recall": 0.9,
            "faithfulness": 0.9,
            "answer_relevancy": 0.9,
            "numerical_accuracy": 1.0,
        }
        assert ue._item_complete(d) is True

    def test_missing_na_key_incomplete(self):
        d = {
            "canAnswer": True,
            "context_precision": 0.9,
            "context_recall": 0.9,
            "faithfulness": 0.9,
            "answer_relevancy": 0.9,
        }
        assert ue._item_complete(d) is False

    def test_zero_metric_complete(self):
        # 真实 0 分（无 "评估失败" reason）→ 完整，不需重评
        d = {
            "canAnswer": True,
            "context_precision": 0.0,
            "context_recall": 0.9,
            "faithfulness": 0.9,
            "answer_relevancy": 0.9,
            "numerical_accuracy": 1.0,
            "reasons": {"context_precision": "片段1: 不相关"},
        }
        assert ue._item_complete(d) is True

    def test_llm_failure_incomplete(self):
        # LLM 解析失败（reason 以 "评估失败" 开头）→ 不完整，需重评
        d = {
            "canAnswer": True,
            "context_precision": 0.0,
            "context_recall": 0.9,
            "faithfulness": 0.9,
            "answer_relevancy": 0.9,
            "numerical_accuracy": 1.0,
            "reasons": {"context_precision": "评估失败: timeout"},
        }
        assert ue._item_complete(d) is False

    def test_error_reason_incomplete(self):
        # reasons.error 存在 → LLM 异常，不完整
        d = {
            "canAnswer": True,
            "context_precision": 0.0,
            "context_recall": 0.0,
            "faithfulness": 0.0,
            "answer_relevancy": 0.0,
            "numerical_accuracy": 0.0,
            "reasons": {"error": "RuntimeError"},
        }
        assert ue._item_complete(d) is False


# ============================================================================
# Goodhart 披露与权重配置
# ============================================================================
class TestConfig:
    def test_weights_sum_to_one(self):
        assert pytest.approx(sum(ue.V16Config.WEIGHTS.values())) == 1.0

    def test_na_weight_transferred(self):
        # F/AR 各 0.25，NA 0.10（让渡自 F/AR 各 0.05）
        assert ue.V16Config.WEIGHTS["numerical_accuracy"] == 0.10
        assert ue.V16Config.WEIGHTS["faithfulness"] == 0.25

    def test_baseline_recorded(self):
        assert ue.V16Config.BASELINE["version"] == "V13-r6"
        assert ue.V16Config.BASELINE["overall"] == 0.9153