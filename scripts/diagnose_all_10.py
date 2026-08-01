"""
验证 10 家公司的 PostgreSQL 财务数据完整性
"""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

import psycopg2

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb",
)

SAMPLE_COMPANIES = [
    {"stock_code": "601868", "stock_name": "中国能建"},
    {"stock_code": "601186", "stock_name": "中国铁建"},
    {"stock_code": "601319", "stock_name": "中国人保"},
    {"stock_code": "000858", "stock_name": "五粮液"},
    {"stock_code": "000651", "stock_name": "格力电器"},
    {"stock_code": "000066", "stock_name": "中国长城"},
    {"stock_code": "600919", "stock_name": "江苏银行"},
    {"stock_code": "601555", "stock_name": "东吴证券"},
    {"stock_code": "600521", "stock_name": "华海药业"},
    {"stock_code": "600436", "stock_name": "片仔癀"},
]


def diagnose():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 100)
    print("验证 10 家公司的 PostgreSQL 财务数据完整性")
    print("=" * 100)
    print(f"\n{'公司':<12} {'代码':<8} {'income行数':<10} {'balance行数':<12} {'cashflow行数':<12} {'2025 revenue':<20} {'2025 net_profit':<20} {'状态'}")
    print("-" * 120)

    all_ok = True
    for company in SAMPLE_COMPANIES:
        stock_code = company["stock_code"]
        stock_name = company["stock_name"]

        cur.execute("SELECT COUNT(*) FROM financial_income WHERE stock_code = %s", (stock_code,))
        income_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM financial_balancesheet WHERE stock_code = %s", (stock_code,))
        balance_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM financial_cashflow WHERE stock_code = %s", (stock_code,))
        cashflow_count = cur.fetchone()[0]

        cur.execute(
            "SELECT revenue, net_profit FROM financial_income WHERE stock_code = %s AND report_year = 2025 AND report_quarter = 'annual'",
            (stock_code,),
        )
        row = cur.fetchone()
        revenue = row[0] if row else None
        net_profit = row[1] if row else None

        revenue_str = f"{revenue:,.0f}" if revenue else "NULL"
        net_profit_str = f"{net_profit:,.0f}" if net_profit else "NULL"

        # 判断状态
        if income_count == 0:
            status = "❌ 无数据"
            all_ok = False
        elif revenue is None:
            status = "⚠️ revenue=NULL"
            all_ok = False
        else:
            status = "✅"

        print(f"{stock_name:<12} {stock_code:<8} {income_count:<10} {balance_count:<12} {cashflow_count:<12} {revenue_str:<20} {net_profit_str:<20} {status}")

    print("-" * 120)
    if all_ok:
        print("✅ 所有公司数据完整")
    else:
        print("⚠️ 部分公司数据异常，详见上方状态列")

    cur.close()
    conn.close()


if __name__ == "__main__":
    diagnose()
