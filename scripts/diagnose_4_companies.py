"""
诊断 4 家问题公司的 PostgreSQL 财务数据状态
用途：检查中国能建/中国铁建/江苏银行/中国人保的 financial_income 数据
"""
import os
import sys
import json
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


def diagnose():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 80)
    print("诊断 4 家问题公司的 PostgreSQL 财务数据状态")
    print("=" * 80)

    for company in COMPANIES:
        stock_code = company["stock_code"]
        stock_name = company["stock_name"]
        print(f"\n{'=' * 60}")
        print(f"公司: {stock_name} ({stock_code})")
        print(f"{'=' * 60}")

        # 1. financial_income
        cur.execute(
            """
            SELECT report_year, report_quarter, report_type,
                   revenue, operating_cost, net_profit, net_profit_attributable,
                   eps, bvps, rd_expense, selling_expense, administrative_expense,
                   financial_expense, premium_income, commission_income, new_signed_contract,
                   source, source_priority, document_id
            FROM financial_income
            WHERE stock_code = %s
            ORDER BY report_year DESC, report_quarter
            """,
            (stock_code,),
        )
        rows = cur.fetchall()
        colnames = [desc[0] for desc in cur.description]
        print(f"\n[financial_income] {len(rows)} 行")
        for row in rows:
            record = dict(zip(colnames, row))
            print(f"  year={record['report_year']} quarter={record['report_quarter']} type={record['report_type']}")
            print(f"    revenue={record['revenue']}, operating_cost={record['operating_cost']}, net_profit={record['net_profit']}")
            print(f"    net_profit_attributable={record['net_profit_attributable']}, eps={record['eps']}, bvps={record['bvps']}")
            print(f"    rd={record['rd_expense']}, selling={record['selling_expense']}, admin={record['administrative_expense']}")
            print(f"    financial={record['financial_expense']}, premium={record['premium_income']}, commission={record['commission_income']}")
            print(f"    new_contract={record['new_signed_contract']}, source={record['source']}, doc={record['document_id']}")

        # 2. financial_balancesheet
        cur.execute(
            """
            SELECT report_year, report_quarter, report_type,
                   total_assets, total_liabilities, total_equity, equity_attributable,
                   current_assets, non_current_assets, current_liabilities, non_current_liabilities,
                   cash, accounts_receivable, inventory, fixed_assets, goodwill,
                   source, document_id
            FROM financial_balancesheet
            WHERE stock_code = %s
            ORDER BY report_year DESC, report_quarter
            """,
            (stock_code,),
        )
        rows = cur.fetchall()
        colnames = [desc[0] for desc in cur.description]
        print(f"\n[financial_balancesheet] {len(rows)} 行")
        for row in rows:
            record = dict(zip(colnames, row))
            print(f"  year={record['report_year']} quarter={record['report_quarter']} type={record['report_type']}")
            print(f"    total_assets={record['total_assets']}, total_liabilities={record['total_liabilities']}, total_equity={record['total_equity']}")
            print(f"    cash={record['cash']}, inventory={record['inventory']}, source={record['source']}")

        # 3. financial_cashflow
        cur.execute(
            """
            SELECT report_year, report_quarter, report_type,
                   operating_cash_flow, investing_cash_flow, financing_cash_flow,
                   free_cash_flow, source, document_id
            FROM financial_cashflow
            WHERE stock_code = %s
            ORDER BY report_year DESC, report_quarter
            """,
            (stock_code,),
        )
        rows = cur.fetchall()
        colnames = [desc[0] for desc in cur.description]
        print(f"\n[financial_cashflow] {len(rows)} 行")
        for row in rows:
            record = dict(zip(colnames, row))
            print(f"  year={record['report_year']} quarter={record['report_quarter']}: ocf={record['operating_cash_flow']}, icf={record['investing_cash_flow']}, fcf={record['financing_cash_flow']}")

        # 4. financial_indicators
        cur.execute(
            """
            SELECT report_year, report_quarter, report_type,
                   gross_margin, net_margin, debt_ratio, eps, bvps,
                   revenue_yoy, net_profit_yoy, total_assets_yoy,
                   source
            FROM financial_indicators
            WHERE stock_code = %s
            ORDER BY report_year DESC, report_quarter
            """,
            (stock_code,),
        )
        rows = cur.fetchall()
        colnames = [desc[0] for desc in cur.description]
        print(f"\n[financial_indicators] {len(rows)} 行")
        for row in rows:
            record = dict(zip(colnames, row))
            print(f"  year={record['report_year']} quarter={record['report_quarter']}: gross_margin={record['gross_margin']}, net_margin={record['net_margin']}, debt_ratio={record['debt_ratio']}, revenue_yoy={record['revenue_yoy']}")

        # 5. financial_raw_tables
        cur.execute(
            """
            SELECT report_year, report_quarter, table_name, page_num,
                   length(table_data::text) as data_len
            FROM financial_raw_tables
            WHERE stock_code = %s
            ORDER BY report_year DESC, page_num
            LIMIT 10
            """,
            (stock_code,),
        )
        rows = cur.fetchall()
        colnames = [desc[0] for desc in cur.description]
        print(f"\n[financial_raw_tables] {len(rows)} 行（最多显示10行）")
        for row in rows:
            record = dict(zip(colnames, row))
            print(f"  year={record['report_year']} page={record['page_num']}: {record['table_name'][:50]} (data_len={record['data_len']})")

    cur.close()
    conn.close()
    print("\n" + "=" * 80)
    print("诊断完成")
    print("=" * 80)


if __name__ == "__main__":
    diagnose()
