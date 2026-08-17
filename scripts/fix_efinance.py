"""
用 efinance 补充缺失的财务原始数据
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

def get_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def fetch_efinance_profit(stock_code):
    """用 efinance 获取利润表"""
    import efinance as ef
    df = ef.financial.get_profit_data(stock_code)
    if df is None or df.empty:
        return {}
    print(f"  efinance columns: {list(df.columns)}")
    print(f"  efinance rows: {len(df)}")
    result = {}
    for _, row in df.iterrows():
        year = int(str(row.get('报告期', ''))[:4]) if row.get('报告期') else None
        if year and year >= 2018:
            result[year] = {
                'revenue': row.get('营业收入'),
                'operating_cost': row.get('营业成本'),
                'net_profit': row.get('净利润'),
                'net_profit_attributable': row.get('归母净利润'),
                'eps': row.get('每股收益'),
            }
    return result

def fix_with_efinance():
    conn = get_connection()
    cur = conn.cursor()
    
    # 尝试用 efinance 获取五粮液数据
    print("=== 用 efinance 获取五粮液利润表 ===")
    try:
        import efinance
    except ImportError:
        print("安装 efinance...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "efinance", "-q"])
        import efinance
    
    data = fetch_efinance_profit('000858')
    for year, vals in sorted(data.items()):
        if vals.get('revenue') and float(vals['revenue']) > 0:
            print(f"  {year}: revenue={vals['revenue']}, net_profit={vals.get('net_profit')}, eps={vals.get('eps')}")
    
    conn.commit()
    cur.close()
    conn.close()

if __name__ == "__main__":
    fix_with_efinance()