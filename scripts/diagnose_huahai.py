"""诊断华海药业数据"""
import os, sys
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

print("=== 华海药业 financial_income ===")
cur.execute("""
    SELECT report_year, report_quarter, report_type,
           revenue, operating_cost, net_profit, net_profit_attributable,
           eps, bvps, rd_expense, selling_expense, administrative_expense
    FROM financial_income
    WHERE stock_code = '600521'
    ORDER BY report_year DESC
""")
rows = cur.fetchall()
cols = [d[0] for d in cur.description]
for row in rows:
    print(dict(zip(cols, row)))

cur.close()
conn.close()
