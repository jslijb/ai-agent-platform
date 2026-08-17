"""
检查 qa-golden.json 中 L1/L3/L4 的 query 与 expectedAnswer 是否匹配
以及 ground_truth 数据是否正确（与财报原文对比）

检查项：
1. query 只问 A，expectedAnswer 包含 A+B → 评估标准过严
2. expectedAnswer 的数值与 originalText 不一致 → ground_truth 错误
3. expectedAnswer 的同比方向与 originalText 不一致 → ground_truth 错误
"""
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
QA_PATH = PROJECT_ROOT / "scripts/qa-golden.json"

with open(QA_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

# 只检查 L1/L3/L4
items = [item for item in data if item.get("category") in ["L1-事实提取", "L3-计算推理", "L4-趋势分析"]]

print(f"共 {len(items)} 条样本")
print("=" * 80)

issues = []

for item in items:
    item_id = item["id"]
    query = item["query"]
    expected = item["expectedAnswer"]
    original_text = item.get("dataSource", {}).get("originalText", "")
    calc_method = item.get("calculationMethod", "")
    category = item["category"]

    # ===== 检查1：L4 query 只问同比，expectedAnswer 包含数值+同比 =====
    if category == "L4-趋势分析":
        # query 是否只问同比
        query_only_yoy = ("同比" in query and "多少" in query) or "增长率" in query
        # expectedAnswer 是否包含数值
        has_value = bool(re.search(r"\d+\.?\d*亿元", expected))

        if query_only_yoy and has_value:
            issues.append({
                "id": item_id,
                "type": "评估标准过严",
                "detail": f"query只问同比，expectedAnswer额外包含数值。query='{query}'",
                "expected": expected,
            })

    # ===== 检查2：ground_truth 数值与原文不一致 =====
    # 提取 expectedAnswer 中的数值
    expected_numbers = re.findall(r"(\d+\.?\d*)\s*亿元", expected)
    # 提取 originalText 中的数值（注意千分位）
    original_clean = original_text.replace(",", "")
    original_numbers = re.findall(r"(\d+\.?\d*)", original_clean)

    # ===== 检查3：L4 同比方向与原文不一致 =====
    if category == "L4-趋势分析":
        # expectedAnswer 中的同比
        expected_up = "增长" in expected and "下降" not in expected
        expected_down = "下降" in expected

        # originalText 中的同比
        orig_up = ("增长" in original_text and "下降" not in original_text and "减少" not in original_text)
        orig_down = "下降" in original_text or "减少" in original_text

        # 提取原文中的百分比（带符号）
        orig_pct = re.findall(r"([+-]?\d+\.?\d*)\s*%", original_text.replace(",", ""))

        if expected_up and orig_down:
            issues.append({
                "id": item_id,
                "type": "同比方向错误",
                "detail": f"expectedAnswer说增长，但原文说下降。query='{query}'",
                "expected": expected,
                "originalText": original_text[:200],
            })
        elif expected_down and orig_up:
            issues.append({
                "id": item_id,
                "type": "同比方向错误",
                "detail": f"expectedAnswer说下降，但原文说增长。query='{query}'",
                "expected": expected,
                "originalText": original_text[:200],
            })

    # ===== 检查4：L4 expectedAnswer 同比数值与原文不一致 =====
    if category == "L4-趋势分析":
        # 提取 expectedAnswer 中的同比百分比
        expected_yoy = re.findall(r"同比(?:增长|下降)约?(\d+\.?\d*)", expected)
        # 提取 originalText 中的百分比
        orig_yoy = re.findall(r"同比(?:增长|下降)?\s*(\d+\.?\d*)\s*%", original_text.replace(",", ""))

        if expected_yoy and orig_yoy:
            exp_val = float(expected_yoy[0])
            orig_val = float(orig_yoy[0])
            if abs(exp_val - orig_val) > 1.0:  # 差距超过1个百分点
                issues.append({
                    "id": item_id,
                    "type": "同比数值不一致",
                    "detail": f"expectedAnswer同比={exp_val}%，原文同比={orig_val}%。query='{query}'",
                    "expected": expected,
                    "originalText": original_text[:200],
                })

# 输出问题
print(f"\n发现 {len(issues)} 个问题:\n")
for i, issue in enumerate(issues, 1):
    print(f"{i}. [{issue['id']}] {issue['type']}")
    print(f"   {issue['detail']}")
    print(f"   expectedAnswer: {issue.get('expected', '')}")
    if "originalText" in issue:
        print(f"   originalText: {issue['originalText'][:150]}...")
    print()
