"""
检查中国能建/中国铁建/华海药业的营收数据和同比计算
"""
import psycopg2

conn = psycopg2.connect('postgresql://aiagent:aiagent_secret@localhost:5432/agentdb')
cur = conn.cursor()

for stock_code, name in [('601868', '中国能建'), ('601186', '中国铁建'), ('600521', '华海药业')]:
    print(f"\n{'=' * 60}")
    print(f"{name} ({stock_code})")
    print('=' * 60)

    # financial_income 历年数据
    cur.execute("""
        SELECT report_year, revenue, operating_cost, net_profit
        FROM financial_income
        WHERE stock_code = %s AND report_quarter = 'annual'
        ORDER BY report_year
    """, (stock_code,))
    rows = cur.fetchall()
    print("financial_income:")
    for r in rows:
        print(f"  year={r[0]} revenue={r[1]} operating_cost={r[2]} net_profit={r[3]}")

    # financial_indicators 同比数据
    cur.execute("""
        SELECT report_year, revenue_yoy, net_profit_yoy
        FROM financial_indicators
        WHERE stock_code = %s AND report_quarter = 'annual'
        ORDER BY report_year
    """, (stock_code,))
    rows = cur.fetchall()
    print("financial_indicators (yoy):")
    for r in rows:
        print(f"  year={r[0]} revenue_yoy={r[1]} net_profit_yoy={r[2]}")

conn.close()
