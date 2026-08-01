"""
针对性诊断江苏银行 Page 114 和中国人保 Page 130 的 PDF 结构

江苏银行问题：文本解析 fallback 列对齐错误（revenue=33.0, operating_cost=-46759959 负数）
中国人保问题：extract_tables 0 行 + 文本解析 0 行
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

import pdfplumber

# 目标页面
TARGETS = [
    ("江苏银行_利润表_Page114", PROJECT_ROOT / "data/financial_reports/2025_annual/600919_江苏银行_江苏银行2025年年度报告.pdf", 114),
    ("江苏银行_利润表_Page115", PROJECT_ROOT / "data/financial_reports/2025_annual/600919_江苏银行_江苏银行2025年年度报告.pdf", 115),
    ("中国人保_利润表_Page130", PROJECT_ROOT / "data/financial_reports/2025_annual/中国人保：中国人保2025年年度报告.pdf", 130),
    ("中国人保_利润表_Page131", PROJECT_ROOT / "data/financial_reports/2025_annual/中国人保：中国人保2025年年度报告.pdf", 131),
]


def inspect_page(name, pdf_path, page_num):
    print(f"\n{'=' * 80}")
    print(f"检查: {name}")
    print(f"路径: {pdf_path.name}, Page {page_num}")
    print(f"存在: {pdf_path.exists()}")
    if not pdf_path.exists():
        return

    with pdfplumber.open(str(pdf_path)) as pdf:
        if page_num > len(pdf.pages):
            print(f"页码超出范围（总页数 {len(pdf.pages)}）")
            return

        page = pdf.pages[page_num - 1]
        text = page.extract_text() or ""
        print(f"\n--- Page {page_num} 文本前50行 ---")
        for i, line in enumerate(text.split("\n")[:50], 1):
            print(f"  L{i:2d}: {line}")

        tables = page.extract_tables()
        print(f"\n--- Page {page_num} 表格数: {len(tables)} ---")
        for ti, table in enumerate(tables[:3]):
            print(f"\n  表格 {ti + 1}: {len(table)} 行")
            for ri, row in enumerate(table[:25]):
                print(f"    行{ri:2d}: {row}")


def main():
    for name, pdf_path, page_num in TARGETS:
        try:
            inspect_page(name, pdf_path, page_num)
        except Exception as e:
            print(f"检查 {name} 失败: {e}")


if __name__ == "__main__":
    main()
