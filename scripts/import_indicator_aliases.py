"""
R001 阶段1.3：预置 indicator_aliases（指标别名词典）
用途：query 路由时根据指标清单快速判断是否走 SQL

数据覆盖：43 个标准化指标，覆盖利润表/资产负债表/现金流量表/衍生指标
命中规则：query 中包含 alias_list 中任一别名 → 命中标准化指标 → 走 SQL

使用方法：
    conda run -n bigmodel python scripts/import_indicator_aliases.py

日志：logs/import_indicator_aliases.log
"""
import os
import sys
import time
import logging
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "import_indicator_aliases.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")


# 指标清单（standard_name → {table, aliases, description}）
# 命中任一 alias 即判定为标准化指标，走 SQL 精确查询
INDICATOR_DICTIONARY = [
    # ===== financial_income 利润表 =====
    {
        "standard_name": "revenue",
        "standard_table": "financial_income",
        "alias_list": ["营业收入", "营收", "主营收入", "总收入", "营业总收入", "主营业务收入"],
        "description": "营业收入（利润表首行）",
    },
    {
        "standard_name": "operating_cost",
        "standard_table": "financial_income",
        "alias_list": ["营业成本", "主营成本", "营业总成本"],
        "description": "营业成本",
    },
    {
        "standard_name": "operating_profit",
        "standard_table": "financial_income",
        "alias_list": ["营业利润"],
        "description": "营业利润",
    },
    {
        "standard_name": "net_profit",
        "standard_table": "financial_income",
        "alias_list": ["净利润", "净利", "归属前净利润", "净收益"],
        "description": "净利润（含少数股东损益）",
    },
    {
        "standard_name": "net_profit_attributable",
        "standard_table": "financial_income",
        "alias_list": ["归母净利润", "归母净利", "归属于母公司股东的净利润", "归属于母公司净利润", "归属母公司净利润"],
        "description": "归属于母公司股东的净利润",
    },
    {
        "standard_name": "eps",
        "standard_table": "financial_income",
        "alias_list": ["每股收益", "基本每股收益", "EPS", "每股盈利"],
        "description": "基本每股收益（元/股）",
    },
    {
        "standard_name": "bvps",
        "standard_table": "financial_income",
        "alias_list": ["每股净资产", "BPS", "每股权益"],
        "description": "每股净资产（元/股）",
    },
    {
        "standard_name": "gross_margin",
        "standard_table": "financial_income",
        "alias_list": ["毛利率", "销售毛利率", "毛利"],
        "description": "毛利率 = (营收-营业成本)/营收",
    },
    {
        "standard_name": "net_margin",
        "standard_table": "financial_income",
        "alias_list": ["净利率", "销售净利率", "净利润率"],
        "description": "净利率 = 净利润/营收",
    },
    {
        "standard_name": "rd_expense",
        "standard_table": "financial_income",
        "alias_list": ["研发费用", "研发投入", "研发支出"],
        "description": "研发费用",
    },
    {
        "standard_name": "selling_expense",
        "standard_table": "financial_income",
        "alias_list": ["销售费用"],
        "description": "销售费用",
    },
    {
        "standard_name": "administrative_expense",
        "standard_table": "financial_income",
        "alias_list": ["管理费用"],
        "description": "管理费用",
    },
    {
        "standard_name": "financial_expense",
        "standard_table": "financial_income",
        "alias_list": ["财务费用"],
        "description": "财务费用",
    },
    {
        "standard_name": "premium_income",
        "standard_table": "financial_income",
        "alias_list": ["保费收入", "原保险保费收入"],
        "description": "保费收入（保险公司专用）",
    },
    {
        "standard_name": "commission_income",
        "standard_table": "financial_income",
        "alias_list": ["经纪业务收入", "手续费及佣金收入", "佣金收入"],
        "description": "经纪业务收入（证券公司专用）",
    },
    {
        "standard_name": "new_signed_contract",
        "standard_table": "financial_income",
        "alias_list": ["新签合同额", "新签合同", "新签订单"],
        "description": "新签合同额（建筑类公司专用）",
    },

    # ===== financial_balancesheet 资产负债表 =====
    {
        "standard_name": "total_assets",
        "standard_table": "financial_balancesheet",
        "alias_list": ["总资产", "资产总计", "资产总额", "总资产规模"],
        "description": "资产总计",
    },
    {
        "standard_name": "total_liabilities",
        "standard_table": "financial_balancesheet",
        "alias_list": ["总负债", "负债合计", "负债总额"],
        "description": "负债合计",
    },
    {
        "standard_name": "total_equity",
        "standard_table": "financial_balancesheet",
        "alias_list": ["股东权益合计", "所有者权益合计", "净资产", "股东权益", "所有者权益"],
        "description": "股东权益合计",
    },
    {
        "standard_name": "equity_attributable",
        "standard_table": "financial_balancesheet",
        "alias_list": ["归母权益", "归母净资产", "归属于母公司股东权益合计", "归属于母公司所有者权益", "归属母公司股东权益"],
        "description": "归属于母公司股东权益合计",
    },
    {
        "standard_name": "current_assets",
        "standard_table": "financial_balancesheet",
        "alias_list": ["流动资产合计", "流动资产", "流动资产总"],
        "description": "流动资产合计",
    },
    {
        "standard_name": "non_current_assets",
        "standard_table": "financial_balancesheet",
        "alias_list": ["非流动资产合计", "非流动资产"],
        "description": "非流动资产合计",
    },
    {
        "standard_name": "current_liabilities",
        "standard_table": "financial_balancesheet",
        "alias_list": ["流动负债合计", "流动负债"],
        "description": "流动负债合计",
    },
    {
        "standard_name": "non_current_liabilities",
        "standard_table": "financial_balancesheet",
        "alias_list": ["非流动负债合计", "非流动负债"],
        "description": "非流动负债合计",
    },
    {
        "standard_name": "cash",
        "standard_table": "financial_balancesheet",
        "alias_list": ["货币资金", "现金", "现金及现金等价物"],
        "description": "货币资金",
    },
    {
        "standard_name": "accounts_receivable",
        "standard_table": "financial_balancesheet",
        "alias_list": ["应收账款", "应收款"],
        "description": "应收账款",
    },
    {
        "standard_name": "inventory",
        "standard_table": "financial_balancesheet",
        "alias_list": ["存货", "库存"],
        "description": "存货",
    },
    {
        "standard_name": "fixed_assets",
        "standard_table": "financial_balancesheet",
        "alias_list": ["固定资产", "固定资产净额"],
        "description": "固定资产",
    },
    {
        "standard_name": "goodwill",
        "standard_table": "financial_balancesheet",
        "alias_list": ["商誉"],
        "description": "商誉",
    },
    {
        "standard_name": "debt_ratio",
        "standard_table": "financial_balancesheet",
        "alias_list": ["资产负债率", "负债率", "杠杆率"],
        "description": "资产负债率 = 总负债/总资产",
    },

    # ===== financial_cashflow 现金流量表 =====
    {
        "standard_name": "operating_cash_flow",
        "standard_table": "financial_cashflow",
        "alias_list": ["经营活动现金流量净额", "经营现金流", "经营活动现金流净额", "经营性现金流"],
        "description": "经营活动现金流量净额",
    },
    {
        "standard_name": "investing_cash_flow",
        "standard_table": "financial_cashflow",
        "alias_list": ["投资活动现金流量净额", "投资现金流", "投资活动现金流净额"],
        "description": "投资活动现金流量净额",
    },
    {
        "standard_name": "financing_cash_flow",
        "standard_table": "financial_cashflow",
        "alias_list": ["筹资活动现金流量净额", "筹资现金流", "融资现金流", "筹资活动现金流净额"],
        "description": "筹资活动现金流量净额",
    },
    {
        "standard_name": "free_cash_flow",
        "standard_table": "financial_cashflow",
        "alias_list": ["自由现金流", "FCF"],
        "description": "自由现金流 = 经营现金流-资本支出",
    },

    # ===== financial_indicators 衍生指标宽表 =====
    {
        "standard_name": "roe",
        "standard_table": "financial_indicators",
        "alias_list": ["净资产收益率", "ROE", "股东权益回报率", "净资产回报率"],
        "description": "净资产收益率 ROE",
    },
    {
        "standard_name": "roa",
        "standard_table": "financial_indicators",
        "alias_list": ["总资产收益率", "ROA", "总资产回报率", "资产收益率"],
        "description": "总资产收益率 ROA",
    },
    {
        "standard_name": "current_ratio",
        "standard_table": "financial_indicators",
        "alias_list": ["流动比率"],
        "description": "流动比率 = 流动资产/流动负债",
    },
    {
        "standard_name": "quick_ratio",
        "standard_table": "financial_indicators",
        "alias_list": ["速动比率"],
        "description": "速动比率 = (流动资产-存货)/流动负债",
    },
    {
        "standard_name": "revenue_yoy",
        "standard_table": "financial_indicators",
        "alias_list": ["营业收入同比增长率", "营收同比", "营收增长率", "营收增速", "收入同比"],
        "description": "营业收入同比增长率",
    },
    {
        "standard_name": "net_profit_yoy",
        "standard_table": "financial_indicators",
        "alias_list": ["净利润同比增长率", "净利同比", "净利增长率", "净利增速", "利润同比"],
        "description": "净利润同比增长率",
    },
    {
        "standard_name": "total_assets_yoy",
        "standard_table": "financial_indicators",
        "alias_list": ["总资产同比增长率", "总资产同比", "资产增速", "资产增长率"],
        "description": "总资产同比增长率",
    },
    {
        "standard_name": "operating_cash_flow_per_share",
        "standard_table": "financial_indicators",
        "alias_list": ["每股经营现金流", "每股经营性现金流"],
        "description": "每股经营现金流",
    },
]


def import_via_psycopg2():
    """通过 psycopg2 直接导入 indicator_aliases"""
    try:
        import psycopg2
        from psycopg2.extras import Json
    except ImportError:
        logger.error("psycopg2 未安装，请执行: pip install psycopg2-binary")
        return False

    logger.info(f"准备导入 {len(INDICATOR_DICTIONARY)} 条指标别名词典")

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 清空旧数据（全量覆盖）
        cur.execute("TRUNCATE TABLE indicator_aliases CASCADE;")
        logger.info("已清空 indicator_aliases 旧数据")

        # 批量插入
        insert_sql = """
            INSERT INTO indicator_aliases
                (standard_name, standard_table, alias_list, description)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (standard_name) DO UPDATE SET
                standard_table = EXCLUDED.standard_table,
                alias_list = EXCLUDED.alias_list,
                description = EXCLUDED.description
        """

        args = [
            (
                item["standard_name"],
                item["standard_table"],
                Json(item["alias_list"]),
                item["description"],
            )
            for item in INDICATOR_DICTIONARY
        ]
        cur.executemany(insert_sql, args)
        conn.commit()
        logger.info(f"✅ 导入完成，共 {len(args)} 条指标别名词典")

        # 验证：按表统计
        cur.execute("""
            SELECT standard_table, COUNT(*) as cnt, SUM(jsonb_array_length(alias_list)) as alias_cnt
            FROM indicator_aliases
            GROUP BY standard_table
            ORDER BY standard_table
        """)
        logger.info("按表分布验证：")
        for row in cur.fetchall():
            logger.info(f"  {row[0]}: {row[1]} 个指标, {row[2]} 个别名")

        # 抽查样本指标
        cur.execute("""
            SELECT standard_name, standard_table, alias_list, description
            FROM indicator_aliases
            WHERE standard_name IN ('revenue', 'net_profit', 'roe', 'operating_cash_flow')
            ORDER BY standard_name
        """)
        logger.info("样本指标验证：")
        for row in cur.fetchall():
            logger.info(f"  {row[0]} ({row[1]}): {row[2]} — {row[3]}")

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
    logger.info(f"R001 阶段1.3 预置 indicator_aliases 开始 {datetime.now()}")
    logger.info("=" * 60)

    start_time = time.time()
    success = import_via_psycopg2()
    elapsed = time.time() - start_time

    if success:
        logger.info(f"✅ 导入成功，耗时 {elapsed:.1f}s")
        sys.exit(0)
    else:
        logger.error(f"❌ 导入失败，耗时 {elapsed:.1f}s")
        sys.exit(1)


if __name__ == "__main__":
    main()
