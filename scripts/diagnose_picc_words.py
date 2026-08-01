"""
诊断中国人保 Page 130 的 word 坐标布局
用途：检查行标签和数值的坐标位置，确定数值是否在文本中
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
PAGE_NUM = 130  # 合并利润表


def inspect_words():
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        page = pdf.pages[PAGE_NUM - 1]
        print(f"Page {PAGE_NUM} 尺寸: {page.width} x {page.height}")

        # 获取所有 word（带坐标）
        words = page.extract_words()
        print(f"\n总 word 数: {len(words)}")

        # 按行分组（y0 坐标相近的归为一行）
        if not words:
            print("无 word 数据")
            return

        # 按 y0 排序（从上到下）
        words_sorted = sorted(words, key=lambda w: (-w['top'], w['x0']))

        # 分组：y0 差距 < 3 的归为同一行
        rows = []
        current_row = [words_sorted[0]]
        for w in words_sorted[1:]:
            if abs(w['top'] - current_row[-1]['top']) < 3:
                current_row.append(w)
            else:
                rows.append(current_row)
                current_row = [w]
        rows.append(current_row)

        print(f"总行数: {len(rows)}")
        print(f"\n--- 前30行 word 坐标 ---")
        for ri, row in enumerate(rows[:30]):
            # 按 x0 排序（从左到右）
            row_sorted = sorted(row, key=lambda w: w['x0'])
            parts = []
            for w in row_sorted:
                parts.append(f"[x={w['x0']:.0f} '{w['text']}']")
            print(f"  行{ri:2d} (y={row[0]['top']:.0f}): {' '.join(parts)}")

        # 检查是否有线条/矩形
        rects = page.rects
        lines = page.lines
        print(f"\n线条数: {len(lines)}, 矩形数: {len(rects)}")
        if rects:
            print(f"前5个矩形:")
            for r in rects[:5]:
                print(f"  x={r['x0']:.0f}-{r['x1']:.0f} y={r['top']:.0f}-{r['bottom']:.0f}")


if __name__ == "__main__":
    inspect_words()
