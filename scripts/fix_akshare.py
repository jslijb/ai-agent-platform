"""
用 akshare 补充缺失的财务原始数据
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

def get_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def fetch_akshare_profit(stock_code, symbol):
    """用 akshare 获取利润表"""
    import akshare as ak
    try:
        df = ak.stock_profit_sheet_by_report_em(symbol=symbol)
        if df is None or df.empty:
            return {}
        print(f"  akshare columns: {list(df.columns)[:10]}")
        print(f"  akshare rows: {len(df)}")
        result = {}
        for _, row in df.iterrows():
            date_str = str(row.get('报告期', ''))
            year = int(date_str[:4]) if date_str[:4].isdigit() else None
            if year and year >= 2018 and year <= 2025:
                result[year] = {
                    'revenue': row.get('营业收入'),
                    'operating_cost': row.get('营业成本'),
                    'net_profit': row.get('净利润'),
                    'net_profit_attr': row.get('归属于母公司所有者的净利润'),
                    'eps': row.get('基本每股收益'),
                }
        return result
    except Exception as e:
        print(f"  akshare error: {e}")
        return {}

def fix_with_akshare():
    conn = get_connection()
    cur = conn.cursor()
    
    import akshare as ak
    
    # 补充五粮液(000858) 2018-2023
    print("=== 用 akshare 获取五粮液利润表 ===")
    data = fetch_akshare_profit('000858', '000858')
    for year in sorted(data.keys()):
        vals = data[year]
        rev = vals.get('revenue')
        np = vals.get('net_profit')
        eps = vals.get('eps')
        if rev is not None:
            try:
                rev_f = float(rev)
                np_f = float(np) if np else None
                eps_f = float(eps) if eps else None
                print(f"  {year}: revenue={rev_f}, net_profit={np_f}, eps={eps_f}")
                if rev_f > 1000000:
                    cur.execute("""
                        UPDATE financial_income
                        SET revenue = %s, net_profit = %s, eps = %s, updated_at = NOW()
                        WHERE stock_code = '000858' AND report_year = %s AND report_quarter = 'annual'
                    """, (rev_f, np_f, eps_f, year))
                    print(f"    更新 {cur.rowcount} 行")
            except (ValueError, TypeError) as e:
                print(f"  {year}: 数据转换错误 - {e}")
    
    conn.commit()
    
    # 补充其他股票的 eps
    print("\n=== 补充其他股票 EPS ===")
    stocks = {
        '000066': '000066', '600436': '600436', '600521': '600521',
        '601186': '601186', '601868': '601868',
    }
    for code, symbol in stocks.items():
        data = fetch_akshare_profit(code, symbol)
        for year in sorted(data.keys()):
            vals = data[year]
            eps = vals.get('eps')
            if eps is not None:
                try:
                    eps_f = float(eps)
                    if abs(eps_f) < 1000:
                        cur.execute("""
                            UPDATE financial_income SET eps = %s, updated_at = NOW()
                            WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual' AND (eps IS NULL OR abs(eps) > 1000)
                        """, (eps_f, code, year))
                        if cur.rowcount > 0:
                            print(f"  {code}/{year}: eps={eps_f}, 更新 {cur.rowcount} 行")
                except (ValueError, TypeError):
                    pass
    
    conn.commit()
    
    # 补充资产负债表
    print("\n=== 补充资产负债表 ===")
    for code, symbol in [('601319', '601319'), ('601555', '601555')]:
        try:
            df = ak.stock_balance_sheet_by_report_em(symbol=symbol)
            if df is not None and not df.empty:
                print(f"  {code} columns: {list(df.columns)[:10]}")
                for _, row in df.iterrows():
                    date_str = str(row.get('报告期', ''))
                    year = int(date_str[:4]) if date_str[:4].isdigit() else None
                    if year and year >= 2023:
                        ta = row.get('资产合计') or row.get('总资产')
                        tl = row.get('负债合计') or row.get('总负债')
                        te = row.get('所有者权益合计') or row.get('净资产')
                        if ta is not None:
                            try:
                                cur.execute("""
                                    UPDATE financial_balancesheet
                                    SET total_assets = COALESCE(%s, total_assets),
                                        total_liabilities = COALESCE(%s, total_liabilities),
                                        total_equity = COALESCE(%s, total_equity),
                                        updated_at = NOW()
                                    WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual'
                                """, (float(ta) if ta else None, float(tl) if tl else None,
                                      float(te) if te else None, code, year))
                                print(f"  {code}/{year}: ta={ta}, tl={tl}, te={te}, 更新 {cur.rowcount} 行")
                            except (ValueError, TypeError):
                                pass
        except Exception as e:
            print(f"  {code} error: {e}")
    
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
    
    cur.execute("SELECT COUNT(*) as cnt FROM financial_income WHERE eps IS NULL AND revenue IS NOT NULL")
    print(f"  缺 eps 的有数据行: {cur.fetchone()['cnt']}")
    
    cur.execute("SELECT COUNT(*) as cnt FROM financial_indicators WHERE roe IS NOT NULL")
    print(f"  financial_indicators 有 roe 的行: {cur.fetchone()['cnt']}/26")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    fix_with_akshare()
    verify()