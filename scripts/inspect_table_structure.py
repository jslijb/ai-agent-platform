"""
检查中国能建 Page 173 和中国铁建 Page 187 的表格结构
用途：诊断 2025 年数据提取失败原因
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

import pdfplumber

# 检查目标页面
TARGETS = [
    ("601868_中国能建_利润表_Page173", PROJECT_ROOT / "data/financial_reports/2025_annual/中国能建：中国能源建设股份有限公司2025年年度报告.pdf", 173),
    ("601186_中国铁建_利润表_Page187", PROJECT_ROOT / "data/financial_reports/2025_annual/中国铁建：中国铁建2025年年度报告.pdf", 187),
    ("600919_江苏银行_利润表_Page114", PROJECT_ROOT / "data/financial_reports/2025_annual/600919_江苏银行_江苏银行2025年年度报告.pdf", 114),
    ("601319_中国人保_利润表_Page130", PROJECT_ROOT / "data/financial_reports/2025_annual/中国人保：中国人保2025年年度报告.pdf", 130),
]


def inspect_page(name, pdf_path, page_num):
    print(f"\n{'=' * 80}")
    print(f"检查: {name}")
    print(f"{'=' * 80}")

    with pdfplumber.open(str(pdf_path)) as pdf:
        page = pdf.pages[page_num - 1]
        text = page.extract_text() or ""
        print(f"\n--- Page {page_num} 文本前50行 ---")
        for i, line in enumerate(text.split("\n")[:50], 1):
            print(f"  L{i}: {line}")

        tables = page.extract_tables()
        print(f"\n--- Page {page_num} 表格数: {len(tables)} ---")
        for ti, table in enumerate(tables[:3]):
            print(f"\n  表格 {ti + 1}: {len(table)} 行")
            for ri, row in enumerate(table[:20]):
                print(f"    行{ri}: {row}")


def main():
    for name, pdf_path, page_num in TARGETS:
        try:
            inspect_page(name, pdf_path, page_num)
        except Exception as e:
            print(f"检查 {name} 失败: {e}")


if __name__ == "__main__":
    main()
