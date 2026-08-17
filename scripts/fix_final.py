"""
用 baostock 正确字段名修复五粮液数据
Fields: code, pubDate, statDate, roeAvg, npMargin, gpMargin, netProfit, epsTTM, MBRevenue, totalShare, liqaShare
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor
import baostock as bs

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

def get_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def fetch_profit(stock_code, year):
    """获取利润表 - 使用正确的字段名"""
    lg = bs.login()
    bs_code = f"sh.{stock_code}" if stock_code.startswith('6') else f"sz.{stock_code}"
    
    rs = bs.query_profit_data(code=bs_code, year=year, quarter=4)
    
    fields = rs.fields if isinstance(rs.fields, list) else rs.fields.split(',')
    
    data = None
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        row_dict = dict(zip(fields, row))
        
        def sf(key):
            val = row_dict.get(key, '')
            try:
                return float(val) if val and val != '' else None
            except:
                return None
        
        data = {
            'revenue': sf('MBRevenue'),
            'net_profit': sf('netProfit'),
            'eps': sf('epsTTM'),
            'roe': sf('roeAvg'),
            'gross_margin': sf('gpMargin'),
            'net_margin': sf('npMargin'),
        }
        break
    
    bs.logout()
    return data

def fix_data():
    conn = get_connection()
    cur = conn.cursor()
    
    print("=== 修复五粮液(000858) 2018-2023 ===")
    for year in range(2018, 2024):
        income = fetch_profit('000858', year)
        if income and income.get('revenue') and income['revenue'] > 1000000:
            np_str = f"{income.get('net_profit'):.2f}" if income.get('net_profit') else 'N/A'
            print(f"  {year}: revenue={income['revenue']:.2f}, net_profit={np_str}, eps={income.get('eps')}")
            cur.execute("""
                UPDATE financial_income
                SET revenue = %s, net_profit = %s, eps = %s,
                    gross_margin = %s, net_margin = %s, updated_at = NOW()
                WHERE stock_code = '000858' AND report_year = %s AND report_quarter = 'annual'
            """, (income['revenue'], income.get('net_profit'), income.get('eps'),
                  income.get('gross_margin'), income.get('net_margin'), year))
            print(f"    更新 {cur.rowcount} 行")
        else:
            print(f"  {year}: 数据异常 revenue={income.get('revenue') if income else 'N/A'}")
    
    conn.commit()
    
    # 修复其他股票的 eps
    print("\n=== 修复其他股票 EPS ===")
    for code in ['000066', '600436', '600521', '601186', '601868']:
        for year in [2024, 2025]:
            income = fetch_profit(code, year)
            if income and income.get('eps') and abs(income['eps']) < 1000:
                cur.execute("""
                    UPDATE financial_income SET eps = %s, updated_at = NOW()
                    WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual'
                """, (income['eps'], code, year))
                print(f"  {code}/{year}: eps={income['eps']}, 更新 {cur.rowcount} 行")
    
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

def verify():
    conn = get_connection()
    cur = conn.cursor()
    
    print("\n=== 最终验证 ===")
    cur.execute("SELECT stock_code, report_year, revenue, net_profit, eps FROM financial_income WHERE stock_code = '000858' ORDER BY report_year")
    for row in cur.fetchall():
        print(f"  000858/{row['report_year']}: rev={row['revenue']}, np={row['net_profit']}, eps={row['eps']}")
    
    cur.execute("SELECT COUNT(*) as cnt FROM financial_indicators WHERE roe IS NOT NULL")
    print(f"  financial_indicators 有 roe: {cur.fetchone()['cnt']}/26")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    fix_data()
    verify()