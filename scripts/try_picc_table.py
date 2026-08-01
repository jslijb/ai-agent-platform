"""
尝试用 lines 策略提取中国人保 Page 130 的表格
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

import pdfplumber

PDF_PATH = PROJECT_ROOT / "data/financial_reports/2025_annual/中国人保：中国人保2025年年度报告.pdf"
PAGE_NUM = 130


def try_extract():
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        page = pdf.pages[PAGE_NUM - 1]

        # 方法1：默认 extract_tables
        tables_default = page.extract_tables()
        print(f"方法1（默认）: {len(tables_default)} 张表格")

        # 方法2：lines 策略
        table_settings_lines = {
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines",
        }
        tables_lines = page.extract_tables(table_settings_lines)
        print(f"方法2（lines策略）: {len(tables_lines)} 张表格")
        if tables_lines:
            for ti, table in enumerate(tables_lines[:2]):
                print(f"\n  表格 {ti+1}: {len(table)} 行")
                for ri, row in enumerate(table[:15]):
                    print(f"    行{ri}: {row}")

        # 方法3：text 策略
        table_settings_text = {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
        }
        tables_text = page.extract_tables(table_settings_text)
        print(f"\n方法3（text策略）: {len(tables_text)} 张表格")
        if tables_text:
            for ti, table in enumerate(tables_text[:1]):
                print(f"\n  表格 {ti+1}: {len(table)} 行")
                for ri, row in enumerate(table[:10]):
                    print(f"    行{ri}: {row}")

        # 方法4：explicit 设置列位置（根据线条位置）
        # 线条在 x=71-298, 298-340, 340-439, 439-539
        # 列边界: 71, 298, 340, 439, 539
        table_settings_explicit = {
            "vertical_strategy": "explicit",
            "horizontal_strategy": "lines",
            "explicit_vertical_lines": [71, 298, 340, 439, 539],
        }
        tables_explicit = page.extract_tables(table_settings_explicit)
        print(f"\n方法4（explicit列位置）: {len(tables_explicit)} 张表格")
        if tables_explicit:
            for ti, table in enumerate(tables_explicit[:1]):
                print(f"\n  表格 {ti+1}: {len(table)} 行")
                for ri, row in enumerate(table[:20]):
                    print(f"    行{ri}: {row}")

        # 方法5：检查 PyMuPDF (fitz) 是否可用
        try:
            import fitz
            print(f"\n方法5（PyMuPDF）: 可用")
            doc = fitz.open(str(PDF_PATH))
            page_fitz = doc[PAGE_NUM - 1]
            text_fitz = page_fitz.get_text()
            print(f"  PyMuPDF 文本长度: {len(text_fitz)}")
            print(f"  前500字符:")
            print(text_fitz[:500])
            doc.close()
        except ImportError:
            print(f"\n方法5（PyMuPDF）: 未安装")


if __name__ == "__main__":
    try_extract()
