"""
清理 4 家问题公司的 PostgreSQL 财务数据，便于重新提取

用途：删除中国能建/中国铁建/江苏银行/中国人保的 financial_* 表数据
     让 extract_financial_from_pdf.py 可以重新回填正确数据

删除范围：
  - financial_income
  - financial_balancesheet
  - financial_cashflow
  - financial_indicators
  - financial_raw_tables
  - financial_conflict_log（相关记录）
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

# 4 家问题公司
COMPANIES = [
    {"stock_code": "601868", "stock_name": "中国能建"},
    {"stock_code": "601186", "stock_name": "中国铁建"},
    {"stock_code": "600919", "stock_name": "江苏银行"},
    {"stock_code": "601319", "stock_name": "中国人保"},
]

TABLES = [
    "financial_income",
    "financial_balancesheet",
    "financial_cashflow",
    "financial_indicators",
    "financial_raw_tables",
]


def cleanup():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    print("=" * 80)
    print("清理 4 家问题公司的 PostgreSQL 财务数据")
    print("=" * 80)

    for company in COMPANIES:
        stock_code = company["stock_code"]
        stock_name = company["stock_name"]
        print(f"\n[{stock_code}] {stock_name}")

        # 删除 conflict_log
        try:
            cur.execute(
                "DELETE FROM financial_conflict_log WHERE stock_code = %s",
                (stock_code,),
            )
            conflict_deleted = cur.rowcount
        except Exception as e:
            print(f"  ⚠️ 删除 financial_conflict_log 失败（可能表不存在）: {e}")
            conflict_deleted = 0

        # 删除各表数据
        for table in TABLES:
            cur.execute(
                f'DELETE FROM "{table}" WHERE stock_code = %s',
                (stock_code,),
            )
            deleted = cur.rowcount
            print(f"  {table:<25} 删除 {deleted} 行")

        print(f"  financial_conflict_log     删除 {conflict_deleted} 行")

    conn.commit()
    print("\n✅ 清理完成")
    cur.close()
    conn.close()


if __name__ == "__main__":
    cleanup()
