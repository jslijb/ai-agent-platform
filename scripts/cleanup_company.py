"""
通用清理脚本：按 stock_code 清理指定公司的财务数据
用法：python scripts/cleanup_company.py 600919 601319
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

TABLES = [
    "financial_income",
    "financial_balancesheet",
    "financial_cashflow",
    "financial_indicators",
    "financial_raw_tables",
]


def cleanup(stock_codes: list[str]):
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    print("=" * 60)
    print(f"清理 {len(stock_codes)} 家公司的财务数据")
    print("=" * 60)

    for stock_code in stock_codes:
        print(f"\n[{stock_code}]")
        try:
            cur.execute(
                "DELETE FROM financial_conflict_log WHERE stock_code = %s",
                (stock_code,),
            )
        except Exception:
            pass

        for table in TABLES:
            cur.execute(
                f'DELETE FROM "{table}" WHERE stock_code = %s',
                (stock_code,),
            )
            deleted = cur.rowcount
            print(f"  {table:<25} 删除 {deleted} 行")

    conn.commit()
    print("\n✅ 清理完成")
    cur.close()
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python scripts/cleanup_company.py 600919 601319")
        sys.exit(1)
    cleanup(sys.argv[1:])
