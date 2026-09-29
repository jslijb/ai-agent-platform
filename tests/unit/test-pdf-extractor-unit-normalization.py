# -*- coding: utf-8 -*-
"""P0 财务指标单位错配修复（方案A）单测：抽取器单位归一化

覆盖 docs/1-requirements-bugs/financial-metric-unit-mismatch.md 方案A的抽取侧改动：
  1. detect_unit_factor：从「单位：xxx」声明检测换算系数（元/千元/万元/百万元/亿元）
  2. apply_unit_to_fields：货币字段按系数换算，比率/每股字段排除，None 保留
  3. 回归锚点：中国铁建 1,029,784,460（千元）→ 1,029,784,460,000（元）
     展示层（sql-result-formatter.ts 固定 ÷1e8）→ 约10297.84亿元，与 GT 一致

运行：python -m pytest tests/unit/test-pdf-extractor-unit-normalization.py -v
"""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest  # noqa: E402

from data_service.pdf_extractor import (  # noqa: E402
    apply_unit_to_fields,
    detect_unit_factor,
)


# ============================================================================
# detect_unit_factor
# ============================================================================
class TestDetectUnitFactor:
    def test_yuan(self):
        assert detect_unit_factor(["合并利润表", "单位:元"]) == 1.0

    def test_qianyuan(self):
        assert detect_unit_factor(["合并利润表", "单位：千元  2025年度"]) == 1e3

    def test_wanyuan(self):
        assert detect_unit_factor(["单位:万元"]) == 1e4

    def test_baiwan(self):
        # 中国人保 OCR 口径
        assert detect_unit_factor(["单位:百万元"]) == 1e6

    def test_yiyuan(self):
        assert detect_unit_factor(["单位：亿元"]) == 1e8

    def test_missing_defaults_to_yuan(self):
        assert detect_unit_factor(["营业收入 1,029,784,460"]) == 1.0
        assert detect_unit_factor([]) == 1.0
        assert detect_unit_factor(None) == 1.0

    def test_multiple_pages_first_wins(self):
        # 多页声明一致 → 取首个
        assert detect_unit_factor(["单位：千元", "单位：千元"]) == 1e3

    def test_conflict_takes_first_with_warning(self):
        # 冲突场景（不应出现）：取首个并告警，不抛异常
        assert detect_unit_factor(["单位：千元", "单位:元"]) == 1e3

    def test_fullwidth_colon_and_spaces(self):
        assert detect_unit_factor(["单 位 ： 千 元"]) == 1e3


# ============================================================================
# apply_unit_to_fields
# ============================================================================
class TestApplyUnitToFields:
    def test_qianyuan_to_yuan(self):
        fields = {"revenue": [1029784460.0], "net_profit": [18362618.0]}
        result = apply_unit_to_fields(fields, 1e3)
        assert result["revenue"] == [1029784460000.0]
        assert result["net_profit"] == [18362618000.0]  # 183.63亿，与 VERIFIED_METRICS 一致

    def test_baiwan_to_yuan(self):
        fields = {"revenue": [669044.0]}
        assert apply_unit_to_fields(fields, 1e6)["revenue"] == [669044000000.0]

    def test_non_monetary_excluded(self):
        # 比率/每股字段量纲不随报表单位变化，禁止换算
        fields = {
            "revenue": [1029784460.0],
            "eps": [12.34],
            "bvps": [9.87],
            "gross_margin": [0.122],
            "roe": [0.08],
            "debt_ratio": [0.4964],
            "revenue_yoy": [-0.035],
        }
        result = apply_unit_to_fields(fields, 1e3)
        assert result["revenue"] == [1029784460000.0]
        assert result["eps"] == [12.34]
        assert result["bvps"] == [9.87]
        assert result["gross_margin"] == [0.122]
        assert result["roe"] == [0.08]
        assert result["debt_ratio"] == [0.4964]
        assert result["revenue_yoy"] == [-0.035]

    def test_none_preserved(self):
        fields = {"revenue": [None, 5.0], "operating_cost": [None]}
        result = apply_unit_to_fields(fields, 1e3)
        assert result["revenue"] == [None, 5000.0]
        assert result["operating_cost"] == [None]

    def test_factor_one_is_noop(self):
        fields = {"revenue": [171118161275.41]}
        assert apply_unit_to_fields(fields, 1.0) is fields


# ============================================================================
# 与展示层的端到端口径对齐（sql-result-formatter.ts 固定 ÷1e8）
# ============================================================================
class TestEndToEndAlignment:
    def test_tiejian_matches_gt(self):
        """中国铁建营收：GT=10,297.84 亿元"""
        fields = {"revenue": [1029784460.0]}  # 抽取到的千元原值
        yuan = apply_unit_to_fields(fields, 1e3)["revenue"][0]
        yi = yuan / 1e8  # 展示层固定 ÷1e8
        assert round(yi, 2) == 10297.84

    def test_geli_unchanged(self):
        """格力电器原口径即元，迁移与展示均不变"""
        fields = {"revenue": [171118161275.41]}
        yuan = apply_unit_to_fields(fields, 1.0)["revenue"][0]
        assert round(yuan / 1e8, 2) == 1711.18


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
