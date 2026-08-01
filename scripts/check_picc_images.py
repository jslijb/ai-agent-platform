"""
检查中国人保 Page 130 的图片对象和字符
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


def inspect():
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        page = pdf.pages[PAGE_NUM - 1]

        # 检查图片
        images = page.images
        print(f"图片数: {len(images)}")
        for img in images[:5]:
            print(f"  图片: x={img['x0']:.0f}-{img['x1']:.0f} y={img['top']:.0f}-{img['bottom']:.0f} stream={img.get('stream', 'N/A')}")

        # 检查字符（底层字符）
        chars = page.chars
        print(f"\n字符数: {len(chars)}")
        if chars:
            # 按x坐标分组，看数值在哪个位置
            # 统计 x > 200 的字符（数值通常在右侧）
            right_chars = [c for c in chars if c['x0'] > 200]
            print(f"右侧字符(x>200): {len(right_chars)}")
            if right_chars:
                # 按y分组
                right_chars_sorted = sorted(right_chars, key=lambda c: (-c['top'], c['x0']))
                current_y = None
                current_line = []
                lines = []
                for c in right_chars_sorted:
                    if current_y is None or abs(c['top'] - current_y) < 3:
                        current_line.append(c['text'])
                        current_y = c['top'] if current_y is None else current_y
                    else:
                        lines.append((current_y, ''.join(current_line)))
                        current_line = [c['text']]
                        current_y = c['top']
                if current_line:
                    lines.append((current_y, ''.join(current_line)))

                print(f"右侧行数: {len(lines)}")
                for y, text in lines[:20]:
                    print(f"  y={y:.0f}: '{text}'")

        # 检查线条
        lines = page.lines
        print(f"\n线条数: {len(lines)}")
        for ln in lines[:10]:
            print(f"  线: x={ln['x0']:.0f}-{ln['x1']:.0f} y={ln['top']:.0f}-{ln['bottom']:.0f}")

        # 尝试用curve和edge提取表格
        edges = page.edges
        print(f"\n边数: {len(edges)}")


if __name__ == "__main__":
    inspect()
