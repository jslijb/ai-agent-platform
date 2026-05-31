import json
import copy

INPUT_FILE = r"d:\Python\ai-agent-platform\scripts\qa-golden.json"

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

# 为每条测试用例定义 expectedFinancialMetrics
# 规则：
# 1. expectedNumbers: 从 expectedAnswer 中提取的关键数值
# 2. complianceRequired: category 为"投资建议合规"或"合规风控"或 query 涉及投资建议时为 true
# 3. riskDisclosureRequired: query 涉及投资分析、交易建议、收益预测时为 true
# 4. timeSensitiveData: query 涉及具体时间的数据时为 true

metrics_map = {
    1: {
        "expectedNumbers": [10, 5],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    2: {
        "expectedNumbers": [20, 5],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    3: {
        "expectedNumbers": [1],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    4: {
        "expectedNumbers": [100],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    5: {
        "expectedNumbers": [1505.6, 18.04, 747.3, 19.16, 1265.9, 206.3],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    6: {
        "expectedNumbers": [5, 10, 30, 100],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    7: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    8: {
        "expectedNumbers": [95, 2],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    9: {
        "expectedNumbers": [30, 20],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    10: {
        "expectedNumbers": [50],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    11: {
        "expectedNumbers": [10, 5, 22, 18, 21, 19],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    12: {
        "expectedNumbers": [20, 16.8, 11.2, 15, 15000],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    13: {
        "expectedNumbers": [70, 30],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    14: {
        "expectedNumbers": [9.15, 9.20, 9.25, 14.57, 15.00],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    15: {
        "expectedNumbers": [15],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    16: {
        "expectedNumbers": [30, 25, 20],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    17: {
        "expectedNumbers": [10, 20, 15],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    18: {
        "expectedNumbers": [100, 50],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    19: {
        "expectedNumbers": [1],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    20: {
        "expectedNumbers": [20, 2],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    21: {
        "expectedNumbers": [1179.6, 821.3, 2.43, 12],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    22: {
        "expectedNumbers": [2, 5, 10, 1.5, 3],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    23: {
        "expectedNumbers": [100, 0],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    24: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    25: {
        "expectedNumbers": [40, 60, 70, 90],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    26: {
        "expectedNumbers": [15.05, 15.30],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    27: {
        "expectedNumbers": [30, 10, 60, 50],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    28: {
        "expectedNumbers": [1, 1000, 5000, 500, 3, 12, 6],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    29: {
        "expectedNumbers": [100, 50, 80, 125],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    30: {
        "expectedNumbers": [50],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    31: {
        "expectedNumbers": [30, 200],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    32: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    33: {
        "expectedNumbers": [1, 1000, 5000, 500],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    34: {
        "expectedNumbers": [20, 30, 60, 15, 10],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    35: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    36: {
        "expectedNumbers": [91.8, 60, 80, 20, 40, 10],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    37: {
        "expectedNumbers": [5, 15, 20],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    38: {
        "expectedNumbers": [4, 8, 10, 365],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    39: {
        "expectedNumbers": [365],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    40: {
        "expectedNumbers": [1],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    41: {
        "expectedNumbers": [10, 1, 9],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    42: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    43: {
        "expectedNumbers": [50, 4],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    44: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    45: {
        "expectedNumbers": [1],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    46: {
        "expectedNumbers": [3, 2, 1],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    47: {
        "expectedNumbers": [23.4, 10, 30],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    48: {
        "expectedNumbers": [80, 20, 100, 0],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    49: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    50: {
        "expectedNumbers": [100, 0.015, 14],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    51: {
        "expectedNumbers": [14, 2],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    52: {
        "expectedNumbers": [10, 50],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    53: {
        "expectedNumbers": [12, 9],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    54: {
        "expectedNumbers": [3, 6, 12, 24],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    55: {
        "expectedNumbers": [0.02, 0.20],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    56: {
        "expectedNumbers": [14, 9],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    57: {
        "expectedNumbers": [12],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    58: {
        "expectedNumbers": [130, 140, 120, 300],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    59: {
        "expectedNumbers": [5, 1, 5, 3, 60, 5, 10],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    60: {
        "expectedNumbers": [1, 10],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    61: {
        "expectedNumbers": [5],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    62: {
        "expectedNumbers": [5, 50, 200, 5, 50, 500],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    63: {
        "expectedNumbers": [100, 1000, 50, 500],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    64: {
        "expectedNumbers": [1, 5, 5, 10],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    65: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    66: {
        "expectedNumbers": [5, 6, 30],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    67: {
        "expectedNumbers": [5, 1, 90, 2, 6, 5, 15, 1, 2, 5, 3],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    68: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    69: {
        "expectedNumbers": [18, 50, 15, 40],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    70: {
        "expectedNumbers": [1505.6, 747.3, 91.8, 832.7, 302.1, 75.8, 1.8, 2.5, 16, 49.6, 36.3, 13],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    71: {
        "expectedNumbers": [10, 12, 5, 6, 8, 12, 40, 80, 5, 10, 20, 50],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    72: {
        "expectedNumbers": [15, 25, 2, 3, 150, 50, 66.7, 33.3],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    73: {
        "expectedNumbers": [20, 3, 15, 25],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    74: {
        "expectedNumbers": [35, 15, 18.75, 100],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    75: {
        "expectedNumbers": [65, 70],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    76: {
        "expectedNumbers": [16.2, 0.95, 438, 11.4, 1.18, 245],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    77: {
        "expectedNumbers": [0.5, 10000],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    78: {
        "expectedNumbers": [1.2, 0.8, 0.84, 10, 8.4],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": False
    },
    79: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    80: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    81: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    82: {
        "expectedNumbers": [40, 66.7],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    83: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    84: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    85: {
        "expectedNumbers": [1, 5],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    86: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    87: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    88: {
        "expectedNumbers": [1, 10],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    89: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    90: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    91: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    92: {
        "expectedNumbers": [],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    93: {
        "expectedNumbers": [10, 100, 5],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    94: {
        "expectedNumbers": [20],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    95: {
        "expectedNumbers": [1, 10, 5, 10],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    96: {
        "expectedNumbers": [1, 10, 10],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    97: {
        "expectedNumbers": [30],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    98: {
        "expectedNumbers": [3, 7],
        "complianceRequired": True,
        "riskDisclosureRequired": True,
        "timeSensitiveData": False
    },
    99: {
        "expectedNumbers": [10, 5],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    100: {
        "expectedNumbers": [736.4, 352.0, 1505.6, 20, 25, 30, 35],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    101: {
        "expectedNumbers": [50, 100, 80],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    102: {
        "expectedNumbers": [50, 24, 10],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    },
    103: {
        "expectedNumbers": [],
        "complianceRequired": False,
        "riskDisclosureRequired": False,
        "timeSensitiveData": True
    }
}

# 为每条测试用例追加 expectedFinancialMetrics 字段
for item in data:
    test_id = item["id"]
    if test_id in metrics_map:
        item["expectedFinancialMetrics"] = metrics_map[test_id]
    else:
        # 兜底处理：按 category 设置默认值
        category = item.get("category", "")
        query = item.get("query", "")
        metrics = {
            "expectedNumbers": [],
            "complianceRequired": False,
            "riskDisclosureRequired": False,
            "timeSensitiveData": False
        }
        if category in ["投资建议合规", "合规风控"]:
            metrics["complianceRequired"] = True
        if category == "投资建议合规":
            metrics["riskDisclosureRequired"] = True
        if category == "对抗性测试":
            metrics["complianceRequired"] = True
            metrics["riskDisclosureRequired"] = True
        if category == "时效性测试":
            metrics["timeSensitiveData"] = True
        item["expectedFinancialMetrics"] = metrics

# 验证：确保原有字段未被修改
required_fields = ["id", "query", "expectedAnswer", "category", "difficulty"]
for item in data:
    for field in required_fields:
        if field not in item:
            print(f"错误：id={item.get('id', '未知')} 缺少字段 {field}")
    if "expectedFinancialMetrics" not in item:
        print(f"错误：id={item['id']} 未添加 expectedFinancialMetrics")

# 写回文件
with open(INPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"处理完成，共处理 {len(data)} 条测试用例")

# 输出统计信息
compliance_count = sum(1 for item in data if item["expectedFinancialMetrics"]["complianceRequired"])
risk_count = sum(1 for item in data if item["expectedFinancialMetrics"]["riskDisclosureRequired"])
time_count = sum(1 for item in data if item["expectedFinancialMetrics"]["timeSensitiveData"])
has_numbers_count = sum(1 for item in data if len(item["expectedFinancialMetrics"]["expectedNumbers"]) > 0)

print(f"complianceRequired=true: {compliance_count} 条")
print(f"riskDisclosureRequired=true: {risk_count} 条")
print(f"timeSensitiveData=true: {time_count} 条")
print(f"包含关键数值: {has_numbers_count} 条")
