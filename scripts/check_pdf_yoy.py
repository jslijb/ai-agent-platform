"""
检查财报PDF中是否有同比值（在"主要财务数据"表格中）
检查3家公司：中国能建、中国铁建、华海药业
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

import pdfplumber
import re

PDFS = {
    "中国能建": PROJECT_ROOT / "data/financial_reports/2025_annual/中国能建：中国能源建设股份有限公司2025年年度报告.pdf",
    "中国铁建": PROJECT_ROOT / "data/financial_reports/2025_annual/中国铁建：中国铁建2025年年度报告.pdf",
    "华海药业": PROJECT_ROOT / "data/financial_reports/2025_annual/600521_华海药业_浙江华海药业股份有限公司2025年年度报告.pdf",
}


def check_pdf(name, pdf_path):
    print(f"\n{'=' * 70}")
    print(f"{name}: {pdf_path.name}")
    print('=' * 70)
    if not pdf_path.exists():
        print(f"  文件不存在")
        return

    with pdfplumber.open(str(pdf_path)) as pdf:
        # 搜索"主要财务数据"或"本年比上年"或"同比"所在页
        yoy_pages = []
        for idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            # 找"主要财务数据"表格标题
            if ("主要财务数据" in text or "主要会计数据" in text or "本年比上年" in text):
                yoy_pages.append(idx + 1)

        print(f"  含'主要财务数据/本年比上年'的页: {yoy_pages[:5]}")

        if not yoy_pages:
            # fallback: 搜索"同比"
            for idx, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if "同比" in text and ("营业收入" in text or "净利润" in text):
                    yoy_pages.append(idx + 1)
            print(f"  含'同比+营业收入/净利润'的页(fallback): {yoy_pages[:5]}")

        if not yoy_pages:
            print("  未找到同比数据页")
            return

        # 查看第一个匹配页的内容
        page_idx = yoy_pages[0] - 1
        text = pdf.pages[page_idx].extract_text() or ""
        lines = text.split("\n")
        print(f"\n  --- Page {yoy_pages[0]} 前40行 ---")
        for i, line in enumerate(lines[:40], 1):
            print(f"  L{i}: {line}")

        # 尝试提取表格
        tables = pdf.pages[page_idx].extract_tables()
        print(f"\n  表格数: {len(tables)}")
        for ti, table in enumerate(tables[:2]):
            print(f"\n  表格 {ti+1}: {len(table)} 行")
            for ri, row in enumerate(table[:15]):
                print(f"    行{ri}: {row}")


def main():
    for name, pdf_path in PDFS.items():
        try:
            check_pdf(name, pdf_path)
        except Exception as e:
            print(f"  检查 {name} 失败: {e}")


if __name__ == "__main__":
    main()
