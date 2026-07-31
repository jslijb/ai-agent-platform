"""
R001 阶段1.2：导入 stock_mapping（公司映射表）
数据来源：Tushare stock_basic 接口
用途：解决 SQL 精确查询的公司名匹配问题

使用方法：
    conda activate agent
    python scripts/import_stock_mapping.py

日志：logs/import_stock_mapping.log
"""
import os
import sys
import time
import logging
from datetime import datetime
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# 日志配置
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "import_stock_mapping.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# 数据库配置
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN", "")


def import_via_tushare():
    """通过 Tushare stock_basic 接口导入公司映射"""
    if not TUSHARE_TOKEN:
        logger.error("TUSHARE_TOKEN 未配置，请检查 .env.local")
        return False

    try:
        import tushare as ts
        import pandas as pd
    except ImportError:
        logger.error("tushare 或 pandas 未安装，请执行: pip install tushare pandas")
        return False

    logger.info(f"开始从 Tushare 导入公司映射，token={TUSHARE_TOKEN[:8]}***")

    # 设置 token
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()

    # 拉取全部 A 股基础信息
    try:
        df = pro.stock_basic(
            exchange="",
            list_status="L",  # 上市
            fields="ts_code,symbol,name,area,industry,market,list_date",
        )
        logger.info(f"Tushare 返回 {len(df)} 条记录")
    except Exception as e:
        logger.error(f"Tushare stock_basic 接口调用失败: {e}")
        return False

    if df.empty:
        logger.error("Tushare 返回空数据")
        return False

    # 转换为入库格式
    records = []
    for _, row in df.iterrows():
        ts_code = str(row["ts_code"])  # 如 000001.SZ
        symbol = str(row["symbol"])  # 如 000001
        name = str(row["name"])  # 如 平安银行

        # 从 ts_code 解析交易所
        # 600/601/603/605/688 开头是 SH，其他是 SZ，8/4 开头是 BJ
        if symbol.startswith(("60", "68", "9")):
            exchange = "SH"
        elif symbol.startswith(("8", "4")):
            exchange = "BJ"
        else:
            exchange = "SZ"

        # 构建别名列表（常见简称变体）
        alias_list = []

        records.append({
            "stock_code": symbol,
            "stock_name_full": name,  # Tushare 返回的是简称，后续可从其他接口补全名
            "stock_name_short": name,
            "stock_name_alias": alias_list,
            "exchange": exchange,
            "industry": str(row["industry"]) if pd.notna(row["industry"]) else None,
        })

    logger.info(f"准备导入 {len(records)} 条记录到 stock_mapping 表")

    # 写入数据库
    try:
        import psycopg2
        from psycopg2.extras import Json
    except ImportError:
        logger.error("psycopg2 未安装，请执行: pip install psycopg2-binary")
        return False

    # 解析 DATABASE_URL
    # postgresql://aiagent:aiagent_secret@localhost:5432/agentdb
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 先清空旧数据（全量覆盖）
        cur.execute("TRUNCATE TABLE stock_mapping CASCADE;")
        logger.info("已清空 stock_mapping 旧数据")

        # 批量插入
        insert_sql = """
            INSERT INTO stock_mapping
                (stock_code, stock_name_full, stock_name_short, stock_name_alias, exchange, industry)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (stock_code) DO UPDATE SET
                stock_name_full = EXCLUDED.stock_name_full,
                stock_name_short = EXCLUDED.stock_name_short,
                stock_name_alias = EXCLUDED.stock_name_alias,
                exchange = EXCLUDED.exchange,
                industry = EXCLUDED.industry
        """

        batch_size = 500
        total_inserted = 0
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            args = [
                (
                    r["stock_code"],
                    r["stock_name_full"],
                    r["stock_name_short"],
                    Json(r["stock_name_alias"]),
                    r["exchange"],
                    r["industry"],
                )
                for r in batch
            ]
            cur.executemany(insert_sql, args)
            total_inserted += len(batch)
            logger.info(f"已插入 {total_inserted}/{len(records)} 条")

        conn.commit()
        logger.info(f"✅ 导入完成，共 {total_inserted} 条公司映射记录")

        # 验证
        cur.execute("SELECT COUNT(*) FROM stock_mapping;")
        count = cur.fetchone()[0]
        logger.info(f"数据库验证：stock_mapping 表共 {count} 条记录")

        # 抽查样本公司
        sample_codes = ["601868", "601186", "000651", "600519", "002304"]
        cur.execute(
            "SELECT stock_code, stock_name_short, exchange, industry FROM stock_mapping WHERE stock_code = ANY(%s)",
            (sample_codes,),
        )
        for row in cur.fetchall():
            logger.info(f"  样本: {row[0]} {row[1]} {row[2]} {row[3]}")

        return True

    except Exception as e:
        conn.rollback()
        logger.error(f"导入失败，已回滚: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def main():
    logger.info("=" * 60)
    logger.info(f"R001 阶段1.2 导入 stock_mapping 开始 {datetime.now()}")
    logger.info("=" * 60)

    start_time = time.time()
    success = import_via_tushare()
    elapsed = time.time() - start_time

    if success:
        logger.info(f"✅ 导入成功，耗时 {elapsed:.1f}s")
        sys.exit(0)
    else:
        logger.error(f"❌ 导入失败，耗时 {elapsed:.1f}s")
        sys.exit(1)


if __name__ == "__main__":
    main()
