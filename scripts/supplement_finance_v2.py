"""
补充缺失财务数据脚本 v2
使用 baostock 获取缺失的财务原始数据
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

def get_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def fetch_income_data(stock_code, year):
    """从 baostock 获取利润表数据"""
    import baostock as bs
    lg = bs.login()
    if lg.error_code != '0':
        print(f"  baostock login failed: {lg.error_msg}")
        return None
    
    bs_code = f"sh.{stock_code}" if stock_code.startswith('6') else f"sz.{stock_code}"
    
    rs = bs.query_profit_data(code=bs_code, year=year, quarter=4)
    
    data = None
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        def safe_float(idx):
            try:
                val = row[idx] if idx < len(row) else None
                return float(val) if val and val != '' else None
            except:
                return None
        
        data = {
            'revenue': safe_float(3),
            'operating_cost': safe_float(4),
            'operating_profit': safe_float(5),
            'net_profit': safe_float(7),
            'net_profit_attributable': safe_float(8),
            'eps': safe_float(9),
            'bvps': safe_float(10),
            'gross_margin': safe_float(11),
            'net_margin': safe_float(12),
        }
        break
    
    bs.logout()
    return data

def fetch_balance_data(stock_code, year):
    """从 baostock 获取资产负债表数据"""
    import baostock as bs
    lg = bs.login()
    if lg.error_code != '0':
        return None
    
    bs_code = f"sh.{stock_code}" if stock_code.startswith('6') else f"sz.{stock_code}"
    
    rs = bs.query_balance_data(code=bs_code, year=year, quarter=4)
    
    data = None
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        def safe_float(idx):
            try:
                val = row[idx] if idx < len(row) else None
                return float(val) if val and val != '' else None
            except:
                return None
        
        data = {
            'total_assets': safe_float(3),
            'total_liabilities': safe_float(4),
            'total_equity': safe_float(5),
            'current_assets': safe_float(6),
            'current_liabilities': safe_float(8),
        }
        break
    
    bs.logout()
    return data

def supplement_data():
    """补充缺失数据"""
    conn = get_connection()
    cur = conn.cursor()
    
    # 1. 补充五粮液(000858) 2018-2023 年数据
    print("=== 补充五粮液(000858) 2018-2023 年利润表 ===")
    for year in range(2018, 2024):
        income = fetch_income_data('000858', year)
        if income and income.get('revenue'):
            print(f"  {year}: revenue={income['revenue']}, net_profit={income.get('net_profit')}, eps={income.get('eps')}")
            cur.execute("""
                UPDATE financial_income
                SET revenue = %s, operating_cost = %s, operating_profit = %s,
                    net_profit = %s, eps = %s, bvps = %s,
                    gross_margin = %s, net_margin = %s, updated_at = NOW()
                WHERE stock_code = '000858' AND report_year = %s AND report_quarter = 'annual'
            """, (income['revenue'], income.get('operating_cost'), income.get('operating_profit'),
                  income.get('net_profit'), income.get('eps'), income.get('bvps'),
                  income.get('gross_margin'), income.get('net_margin'), year))
            updated = cur.rowcount
            if updated == 0:
                cur.execute("""
                    INSERT INTO financial_income (stock_code, report_year, report_quarter, report_type,
                        revenue, operating_cost, operating_profit, net_profit, eps, bvps, gross_margin, net_margin, source, created_at, updated_at)
                    VALUES ('000858', %s, 'annual', 'annual', %s, %s, %s, %s, %s, %s, %s, %s, 'baostock', NOW(), NOW())
                """, (year, income['revenue'], income.get('operating_cost'), income.get('operating_profit'),
                      income.get('net_profit'), income.get('eps'), income.get('bvps'),
                      income.get('gross_margin'), income.get('net_margin')))
                print(f"  插入新行")
            else:
                print(f"  更新 {updated} 行")
        else:
            print(f"  {year}: 未获取到数据")
    
    conn.commit()
    
    # 2. 补充 balancesheet 缺失数据
    print("\n=== 补充资产负债表缺失数据 ===")
    missing_bs = [('601319', 2024), ('601319', 2025), ('601555', 2023)]
    for stock_code, year in missing_bs:
        bs_data = fetch_balance_data(stock_code, year)
        if bs_data:
            print(f"  {stock_code}/{year}: total_assets={bs_data.get('total_assets')}, total_liab={bs_data.get('total_liabilities')}")
            cur.execute("""
                UPDATE financial_balancesheet
                SET total_assets = COALESCE(%s, total_assets),
                    total_liabilities = COALESCE(%s, total_liabilities),
                    total_equity = COALESCE(%s, total_equity),
                    current_assets = COALESCE(%s, current_assets),
                    current_liabilities = COALESCE(%s, current_liabilities),
                    updated_at = NOW()
                WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual'
            """, (bs_data.get('total_assets'), bs_data.get('total_liabilities'),
                  bs_data.get('total_equity'), bs_data.get('current_assets'),
                  bs_data.get('current_liabilities'), stock_code, year))
            print(f"  更新 {cur.rowcount} 行")
        else:
            print(f"  {stock_code}/{year}: 未获取到数据")
    
    conn.commit()
    
    # 3. 补充 eps 缺失数据
    print("\n=== 补充 EPS 缺失数据 ===")
    cur.execute("""
        SELECT stock_code, report_year FROM financial_income
        WHERE eps IS NULL AND revenue IS NOT NULL
        ORDER BY stock_code, report_year
    """)
    missing_eps = cur.fetchall()
    for row in missing_eps:
        income = fetch_income_data(row['stock_code'], row['report_year'])
        if income and income.get('eps'):
            cur.execute("""
                UPDATE financial_income SET eps = %s, updated_at = NOW()
                WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual'
            """, (income['eps'], row['stock_code'], row['report_year']))
            print(f"  {row['stock_code']}/{row['report_year']}: eps={income['eps']}")
    
    conn.commit()
    
    # 4. 重新计算衍生指标
    print("\n=== 重新计算衍生指标 ===")
    cur.execute("""
        UPDATE financial_indicators fi
        SET
          roe = calc.roe, roa = calc.roa, gross_margin = calc.gm,
          net_margin = calc.nm, debt_ratio = calc.dr, eps = calc.eps, bvps = calc.bvps
        FROM (
          SELECT fi2.id as fi_id,
            CASE WHEN bs.total_equity IS NOT NULL AND bs.total_equity != 0 AND inc.net_profit IS NOT NULL
              THEN ROUND(inc.net_profit / bs.total_equity, 6) ELSE fi2.roe END as roe,
            CASE WHEN bs.total_assets IS NOT NULL AND bs.total_assets != 0 AND inc.net_profit IS NOT NULL
              THEN ROUND(inc.net_profit / bs.total_assets, 6) ELSE fi2.roa END as roa,
            CASE WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.operating_cost IS NOT NULL
              THEN ROUND((inc.revenue - inc.operating_cost) / inc.revenue, 6) ELSE fi2.gross_margin END as gm,
            CASE WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.net_profit IS NOT NULL
              THEN ROUND(inc.net_profit / inc.revenue, 6) ELSE fi2.net_margin END as nm,
            CASE WHEN bs.total_assets IS NOT NULL AND bs.total_assets != 0 AND bs.total_liabilities IS NOT NULL
              THEN ROUND(bs.total_liabilities / bs.total_assets, 6) ELSE fi2.debt_ratio END as dr,
            COALESCE(inc.eps, fi2.eps) as eps,
            COALESCE(inc.bvps, fi2.bvps) as bvps
          FROM financial_indicators fi2
          JOIN financial_income inc ON inc.stock_code = fi2.stock_code AND inc.report_year = fi2.report_year
            AND COALESCE(inc.report_quarter, 'annual') = COALESCE(fi2.report_quarter, 'annual')
          JOIN financial_balancesheet bs ON bs.stock_code = fi2.stock_code AND bs.report_year = fi2.report_year
            AND COALESCE(bs.report_quarter, 'annual') = COALESCE(fi2.report_quarter, 'annual')
        ) calc
        WHERE fi.id = calc.fi_id
    """)
    print(f"  financial_indicators 更新 {cur.rowcount} 行")
    conn.commit()
    
    cur.close()
    conn.close()

def verify():
    """验证结果"""
    conn = get_connection()
    cur = conn.cursor()
    
    for tbl, query in [
        ('financial_income', "SELECT COUNT(*) as total, COUNT(CASE WHEN revenue IS NULL THEN 1 END) as null_rev, COUNT(CASE WHEN eps IS NULL THEN 1 END) as null_eps FROM financial_income"),
        ('financial_balancesheet', "SELECT COUNT(*) as total, COUNT(CASE WHEN total_assets IS NULL THEN 1 END) as null_ta, COUNT(CASE WHEN total_equity IS NULL THEN 1 END) as null_te FROM financial_balancesheet"),
        ('financial_indicators', "SELECT COUNT(*) as total, COUNT(CASE WHEN roe IS NULL THEN 1 END) as null_roe, COUNT(CASE WHEN roa IS NULL THEN 1 END) as null_roa FROM financial_indicators"),
        ('MemorySummary', "SELECT COUNT(*) as total, 0 as null1, 0 as null2 FROM \"MemorySummary\""),
        ('MemoryFragment', "SELECT COUNT(*) as total, 0 as null1, 0 as null2 FROM \"MemoryFragment\""),
    ]:
        cur.execute(query)
        row = cur.fetchone()
        print(f"  {tbl}: total={row['total']}")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    try:
        import baostock
    except ImportError:
        print("安装 baostock...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "baostock", "-q"])
    
    print("=== 补充缺失财务数据 ===")
    supplement_data()
    print("\n=== 最终验证 ===")
    verify()