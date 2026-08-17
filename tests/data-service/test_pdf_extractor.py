"""
TDD 测试：pdf_extractor 报表定位与字段提取（unittest 版，无需 pytest 依赖）

覆盖场景：
  1. 华海药业 PDF（标题不在前5行，原 _find_statement_pages 漏匹配）
  2. 片仔癀 PDF（回归测试，确保改动不破坏已通案例）

依赖：vendor/pdfplumber，conda agent 环境
运行：python -m unittest tests.data-service.test_pdf_extractor -v
     或：python tests/data-service/test_pdf_extractor.py
"""
import sys
import os
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

from data_service.pdf_extractor import FinancialPDFExtractor

# ===== 测试 PDF 路径 =====
HUAHAI_PDF = PROJECT_ROOT / "data" / "financial_reports" / "华海药业_600521_2025年年度报告.pdf"
PZZ_PDF = PROJECT_ROOT / "data" / "financial_reports" / "2025_annual" / "600436_片仔癀_漳州片仔癀药业股份有限公司2025年年度报告.pdf"


@unittest.skipUnless(HUAHAI_PDF.exists(), "华海药业 PDF 不存在")
class TestHuahaiStatementPages(unittest.TestCase):
    """华海药业 PDF 报表标题位置：
       - 合并资产负债表 → Page 106 Line 9（前5行内）
       - 合并利润表     → Page 110 Line 34（不在前5行，原逻辑漏匹配）
       - 合并现金流量表 → Page 114 Line 13（不在前5行）
    """

    def test_find_income_pages(self):
        """合并利润表应定位到 Page 110（0-based 109）"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            pages = ex._find_statement_pages(
                ["合并利润表", "利润表", "母公司利润表"]
            )
        self.assertTrue(pages, "未找到合并利润表所在页")
        self.assertIn(
            109, pages,
            f"利润表应在 Page 110，实际: {[p+1 for p in pages]}"
        )

    def test_find_balance_pages(self):
        """合并资产负债表应定位到 Page 106（0-based 105）"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            pages = ex._find_statement_pages(
                ["合并资产负债表", "资产负债表", "母公司资产负债表"]
            )
        self.assertTrue(pages, "未找到合并资产负债表所在页")
        self.assertIn(
            105, pages,
            f"资产负债表应在 Page 106，实际: {[p+1 for p in pages]}"
        )

    def test_find_cashflow_pages(self):
        """合并现金流量表应定位到 Page 114（0-based 113）"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            pages = ex._find_statement_pages(
                ["合并现金流量表", "现金流量表", "母公司现金流量表"]
            )
        self.assertTrue(pages, "未找到合并现金流量表所在页")
        self.assertIn(
            113, pages,
            f"现金流量表应在 Page 114，实际: {[p+1 for p in pages]}"
        )


@unittest.skipUnless(HUAHAI_PDF.exists(), "华海药业 PDF 不存在")
class TestHuahaiExtract(unittest.TestCase):
    """华海药业字段提取：标题不在前5行时仍应能提取到核心字段"""

    def test_extract_income_revenue(self):
        """利润表应能提取到 revenue 字段"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            result = ex.extract_all()
        income = result["income_statement"]
        self.assertIn(
            "revenue", income["fields"],
            f"未提取到 revenue，fields: {list(income['fields'].keys())}"
        )
        revenue_vals = income["fields"]["revenue"]
        non_null = [v for v in revenue_vals if v is not None]
        self.assertTrue(non_null, "revenue 全部为 None")
        self.assertGreater(
            non_null[0], 0,
            f"revenue 应为正数，实际: {non_null[0]}"
        )

    def test_extract_balance_total_assets(self):
        """资产负债表应能提取到 total_assets 字段"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            result = ex.extract_all()
        balance = result["balance_sheet"]
        self.assertIn(
            "total_assets", balance["fields"],
            f"未提取到 total_assets，fields: {list(balance['fields'].keys())}"
        )

    def test_extract_cashflow_operating(self):
        """现金流量表应能提取到 operating_cash_flow 字段"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            result = ex.extract_all()
        cashflow = result["cashflow_statement"]
        self.assertIn(
            "operating_cash_flow", cashflow["fields"],
            f"未提取到 operating_cash_flow，fields: {list(cashflow['fields'].keys())}"
        )


@unittest.skipUnless(PZZ_PDF.exists(), "片仔癀 PDF 不存在")
class TestPzzRegression(unittest.TestCase):
    """片仔癀 PDF 提取回归：原已通案例，改动后应保持正确
       基线值：2025 营收 90.01 亿（即 9_001_000_000 左右，单位元）
    """

    def test_extract_income_revenue_pzz(self):
        with FinancialPDFExtractor(str(PZZ_PDF)) as ex:
            result = ex.extract_all()
        income = result["income_statement"]
        self.assertIn("revenue", income["fields"], "片仔癀 revenue 字段缺失（回归失败）")
        revenue_vals = income["fields"]["revenue"]
        non_null = [v for v in revenue_vals if v is not None]
        self.assertTrue(non_null, "片仔癀 revenue 全部为 None（回归失败）")
        # 片仔癀 2025 营收约 90.01 亿，PDF 提取的数值单位通常是元
        # 允许 80亿~100亿 范围（10% 浮动）
        self.assertTrue(
            8e9 < non_null[0] < 1e10,
            f"片仔癀 revenue 应在 80-100 亿范围，实际: {non_null[0]}"
        )

    def test_extract_income_net_profit_pzz(self):
        with FinancialPDFExtractor(str(PZZ_PDF)) as ex:
            result = ex.extract_all()
        income = result["income_statement"]
        self.assertIn("net_profit", income["fields"], "片仔癀 net_profit 字段缺失")
        np_vals = income["fields"]["net_profit"]
        non_null = [v for v in np_vals if v is not None]
        self.assertTrue(non_null, "片仔癀 net_profit 全部为 None")
        # 片仔癀 2025 净利润约 20+亿
        self.assertGreater(
            non_null[0], 1e9,
            f"片仔癀 net_profit 应 >10亿，实际: {non_null[0]}"
        )


@unittest.skipUnless(HUAHAI_PDF.exists(), "华海药业 PDF 不存在")
class TestCombineOcrLines(unittest.TestCase):
    """R014: _combine_ocr_lines 单元测试

    PaddleOCR 返回每个文本元素为独立行，需合并为表格行格式。
    """

    def test_combine_simple_label_value(self):
        """文本行+数值行应合并为一行"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            lines = ["营业总收入", "669,044", "621,972"]
            result = ex._combine_ocr_lines(lines)
        self.assertEqual(len(result), 1)
        self.assertIn("营业总收入", result[0])
        self.assertIn("669,044", result[0])
        self.assertIn("621,972", result[0])

    def test_combine_multi_label_lines(self):
        """多行文本标签应合并为一个 label"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            lines = ["二、", "营业总支出", "551,328", "594,107"]
            result = ex._combine_ocr_lines(lines)
        self.assertEqual(len(result), 1)
        self.assertIn("营业总支出", result[0])
        self.assertIn("551,328", result[0])

    def test_combine_skip_headers(self):
        """页眉/标题行应被跳过"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            lines = [
                "合并利润表", "2025年度", "单位：百万元",
                "营业收入", "100,000", "90,000",
            ]
            result = ex._combine_ocr_lines(lines)
        self.assertEqual(len(result), 1)
        self.assertIn("营业收入", result[0])

    def test_combine_multiple_rows(self):
        """多行数据应正确分割为多行"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            lines = [
                "营业收入", "100,000", "90,000",
                "营业成本", "60,000", "55,000",
                "净利润", "10,000", "8,000",
            ]
            result = ex._combine_ocr_lines(lines)
        self.assertEqual(len(result), 3)
        self.assertIn("营业收入", result[0])
        self.assertIn("营业成本", result[1])
        self.assertIn("净利润", result[2])

    def test_combine_negative_parentheses(self):
        """括号负数应正确识别为数值"""
        with FinancialPDFExtractor(str(HUAHAI_PDF)) as ex:
            lines = ["汇兑损益", "(308)", "64"]
            result = ex._combine_ocr_lines(lines)
        self.assertEqual(len(result), 1)
        self.assertIn("(308)", result[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
