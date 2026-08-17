"""
修复五粮液(000858) 2018-2023 年数据
baostock query_profit_data 返回列: 
code,year,quarter,pubDate,statDate,revenue,operCost,sellExp,adminExp,finExp,
totalProfit,incomeTax,netProfit,nrProfit,netProfitAttr,eps,bps,grossProfitRate,netProfitMargin
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

def get_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def fetch_income_correct(stock_code, year):
    """使用正确的列索引获取利润表"""
    import baostock as bs
    lg = bs.login()
    bs_code = f"sh.{stock_code}" if stock_code.startswith('6') else f"sz.{stock_code}"
    
    rs = bs.query_profit_data(code=bs_code, year=year, quarter=4)
    
    data = None
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        print(f"  raw columns ({len(row)}): {row[:6]}...")
        
        def sf(idx):
            try:
                val = row[idx] if idx < len(row) else None
                return float(val) if val and val != '' else None
            except:
                return None
        
        # 正确索引: revenue=5, operCost=6, totalProfit=10, netProfit=12, netProfitAttr=14, eps=15, bps=16, grossProfitRate=17, netProfitMargin=18
        data = {
            'revenue': sf(5),
            'operating_cost': sf(6),
            'net_profit': sf(12),
            'net_profit_attributable': sf(14),
            'eps': sf(15),
            'bvps': sf(16),
            'gross_margin': sf(17),
            'net_margin': sf(18),
        }
        break
    
    bs.logout()
    return data

def fix_data():
    conn = get_connection()
    cur = conn.cursor()
    
    print("=== 修复五粮液(000858) 2018-2023 ===")
    for year in range(2018, 2024):
        income = fetch_income_correct('000858', year)
        if income and income.get('revenue') and income['revenue'] > 1000000:
            print(f"  {year}: revenue={income['revenue']}, net_profit={income.get('net_profit')}, eps={income.get('eps')}")
            cur.execute("""
                UPDATE financial_income
                SET revenue = %s, operating_cost = %s, net_profit = %s, eps = %s, bvps = %s,
                    gross_margin = %s, net_margin = %s, updated_at = NOW()
                WHERE stock_code = '000858' AND report_year = %s AND report_quarter = 'annual'
            """, (income['revenue'], income.get('operating_cost'), income.get('net_profit'),
                  income.get('eps'), income.get('bvps'), income.get('gross_margin'),
                  income.get('net_margin'), year))
            print(f"  更新 {cur.rowcount} 行")
        else:
            print(f"  {year}: 数据异常或未获取到")
    
    conn.commit()
    
    # 修复 eps（之前写入的 eps 值不对）
    print("\n=== 修复 EPS ===")
    for stock_code, year in [('000066', 2024), ('000066', 2025), ('600436', 2024), ('600436', 2025),
                              ('600521', 2024), ('600521', 2025), ('601186', 2024), ('601186', 2025),
                              ('601868', 2024), ('601868', 2025)]:
        income = fetch_income_correct(stock_code, year)
        if income and income.get('eps') and income['eps'] < 1000:
            cur.execute("""
                UPDATE financial_income SET eps = %s, updated_at = NOW()
                WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual'
            """, (income['eps'], stock_code, year))
            print(f"  {stock_code}/{year}: eps={income['eps']}, 更新 {cur.rowcount} 行")
        else:
            print(f"  {stock_code}/{year}: eps值异常({income.get('eps') if income else 'N/A'})，跳过")
    
    conn.commit()
    
    # 重新计算衍生指标
    print("\n=== 重新计算衍生指标 ===")
    cur.execute("""
        UPDATE financial_indicators fi
        SET roe = calc.roe, roa = calc.roa, gross_margin = calc.gm,
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
        ) calc WHERE fi.id = calc.fi_id
    """)
    print(f"  更新 {cur.rowcount} 行")
    conn.commit()
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    fix_data()