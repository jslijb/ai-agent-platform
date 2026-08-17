"""
检查 4 家问题公司 PDF 中三张主表的真实位置和字段名
用途：定位报表标题所在页，检查字段名映射问题
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

# 4 家问题公司 PDF 路径（文件名包含中文冒号）
PDFS = {
    "601868_中国能建": PROJECT_ROOT / "data/financial_reports/2025_annual/中国能建：中国能源建设股份有限公司2025年年度报告.pdf",
    "601186_中国铁建": PROJECT_ROOT / "data/financial_reports/2025_annual/中国铁建：中国铁建2025年年度报告.pdf",
    "600919_江苏银行": PROJECT_ROOT / "data/financial_reports/2025_annual/600919_江苏银行_江苏银行2025年年度报告.pdf",
    "601319_中国人保": PROJECT_ROOT / "data/financial_reports/2025_annual/中国人保：中国人保2025年年度报告.pdf",
}

# 报表标题关键词
INCOME_TITLES = ["合并利润表", "利润表", "母公司利润表", "合并及母公司利润表", "银行利润表", "合并及银行利润表"]
BALANCE_TITLES = ["合并资产负债表", "资产负债表", "母公司资产负债表", "合并及母公司资产负债表", "银行资产负债表", "合并及银行资产负债表"]
CASHFLOW_TITLES = ["合并现金流量表", "现金流量表", "母公司现金流量表", "合并及母公司现金流量表", "银行现金流量表", "合并及银行现金流量表"]


def find_title_pages(pdf, titles):
    """查找标题所在页（全页扫描，记录所有匹配）"""
    matches = []
    for idx, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        lines = text.split("\n")
        for li, line in enumerate(lines):
            line_compact = line.strip().replace(" ", "")
            for title in titles:
                if title in line_compact and len(line_compact) < 30:
                    matches.append({
                        "page": idx + 1,
                        "line_no": li + 1,
                        "line": line.strip(),
                        "title": title,
                    })
    return matches


def inspect_pdf(name, pdf_path):
    print(f"\n{'=' * 80}")
    print(f"检查: {name}")
    print(f"路径: {pdf_path}")
    print(f"存在: {pdf_path.exists()}")
    if not pdf_path.exists():
        return

    with pdfplumber.open(str(pdf_path)) as pdf:
        print(f"总页数: {len(pdf.pages)}")

        # 查找三张主表标题
        print(f"\n--- 利润表标题匹配 ---")
        income_matches = find_title_pages(pdf, INCOME_TITLES)
        for m in income_matches[:10]:
            print(f"  Page {m['page']} Line {m['line_no']}: '{m['line']}' (匹配: {m['title']})")

        print(f"\n--- 资产负债表标题匹配 ---")
        balance_matches = find_title_pages(pdf, BALANCE_TITLES)
        for m in balance_matches[:10]:
            print(f"  Page {m['page']} Line {m['line_no']}: '{m['line']}' (匹配: {m['title']})")

        print(f"\n--- 现金流量表标题匹配 ---")
        cashflow_matches = find_title_pages(pdf, CASHFLOW_TITLES)
        for m in cashflow_matches[:10]:
            print(f"  Page {m['page']} Line {m['line_no']}: '{m['line']}' (匹配: {m['title']})")

        # 对第一个利润表匹配页，打印前30行内容
        if income_matches:
            first_page = income_matches[0]["page"]
            print(f"\n--- Page {first_page} 前30行内容 ---")
            text = pdf.pages[first_page - 1].extract_text() or ""
            for i, line in enumerate(text.split("\n")[:30], 1):
                print(f"  L{i}: {line}")

            # 同时检查表格
            tables = pdf.pages[first_page - 1].extract_tables()
            print(f"\n--- Page {first_page} 表格数: {len(tables)} ---")
            for ti, table in enumerate(tables[:2]):
                print(f"  表格 {ti + 1}: {len(table)} 行")
                for ri, row in enumerate(table[:5]):
                    print(f"    行{ri}: {row}")


def main():
    for name, pdf_path in PDFS.items():
        try:
            inspect_pdf(name, pdf_path)
        except Exception as e:
            print(f"检查 {name} 失败: {e}")


if __name__ == "__main__":
    main()
