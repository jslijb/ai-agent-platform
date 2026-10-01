# -*- coding: utf-8 -*-
"""R013 NA 口径修订单测：GT 第一个数值=结论值参与判分，其余=依据值不参与

背景（bug 报告 §六）：L3 计算推理的 GT 写法把"计算依据"也当必答值
（如"毛利率约83.75%，根据营业收入约1711.18亿元和营业成本约1375.49亿元计算得出"），
答案只报结论 83.75% 也会因依据值无配对被拉到 0 分，14 条结构性不可能满分。
修订：仅 GT 第一个数值参与配对打分；单数值 GT 行为完全不变。

运行：python -m pytest tests/unit/test-na-conclusion-scoring.py -v
"""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

import pytest  # noqa: E402

from unified_evaluation import numerical_accuracy  # noqa: E402


class TestConclusionScoring:
    def test_l3_gt_with_basis_answer_conclusion_only(self):
        """L3 典型：GT 含结论+两个依据值，答案只报结论 → 1.0（旧口径 0.33）"""
        gt = "毛利率约83.75%，根据营业收入约1711.18亿元和营业成本约1375.49亿元计算得出"
        score, reason = numerical_accuracy("格力电器2025年毛利率约为83.75%。", gt)
        assert score == 1.0
        assert "依据值" in reason

    def test_l3_answer_wrong_conclusion_still_zero(self):
        """结论值答错依旧 0 分（口径修订不放过真错）"""
        gt = "毛利率约83.75%，根据营业收入约1711.18亿元和营业成本约1375.49亿元计算得出"
        score, _ = numerical_accuracy("毛利率约为29.3%。", gt)
        assert score == 0.0

    def test_single_number_gt_unchanged(self):
        """单数值 GT：行为与修订前完全一致"""
        score, _ = numerical_accuracy("营业收入约为1711.18亿元", "营业收入约为1711.18亿元")
        assert score == 1.0
        score, _ = numerical_accuracy("营业收入约为1711.18亿元", "营业收入约为10297.84亿元")
        assert score == 0.0

    def test_gt_without_numbers_not_applicable(self):
        score, reason = numerical_accuracy("答不上来", "该问题无数值答案")
        assert score is None
        assert "不适用" in reason

    def test_answer_without_numbers_zero(self):
        score, reason = numerical_accuracy("不知道", "营业收入约为1711.18亿元")
        assert score == 0.0
        assert "未含数值" in reason

    def test_picc_margin_l3_009_after_gt_fix(self):
        """R035 人保 GT 修正后：净利率结论 9.42% 应得满分"""
        gt = "中国人保2025年净利率约为9.42%，根据净利润约630.33亿元和营业收入约6690.44亿元计算得出"
        score, _ = numerical_accuracy("中国人保2025年净利率约为9.42%。", gt)
        assert score == 1.0


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
