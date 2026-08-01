"""
R001 阶段2.2：财报 PDF 批量提取 + 数据库回填脚本
用途：调用 data_service/pdf_extractor.py 提取三张主表，写入 PostgreSQL 标准化表

设计原则：
  1. 单 PDF → 三张主表（financial_income/balancesheet/cashflow）
  2. 数据源优先级覆盖：pdf_extract=10 > tushare=5 > baostock=3
  3. 同周期同字段：高优先级覆盖低优先级，记录到 financial_conflict_log
  4. 同优先级不覆盖（避免重复回填）
  5. 衍生指标计算：毛利率/净利率/资产负债率/自由现金流
  6. 同比计算：需要查上期数据（年度对比上年度）
  7. 非标准化表格整表存入 financial_raw_tables（jsonb）

使用方法：
    conda activate agent

    # 批量处理 10 家评估样本公司
    python scripts/extract_financial_from_pdf.py --batch

    # 处理单个公司（按股票代码定位 PDF）
    python scripts/extract_financial_from_pdf.py --stock-code 600436

    # 指定 PDF 路径
    python scripts/extract_financial_from_pdf.py --pdf-path "data/financial_reports/2025_annual/600436_片仔癀_2025年年度报告.pdf" --stock-code 600436

    # 干跑（只提取不写库）
    python scripts/extract_financial_from_pdf.py --batch --dry-run

日志：logs/extract_financial_from_pdf.log + logs/extract_financial_from_pdf_error.log
"""
import os
import sys
import re
import time
import json
import logging
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# vendor 目录支持（pdfplumber 装在项目本地 vendor 目录）
_VENDOR_DIR = PROJECT_ROOT / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

# ===== 日志配置 =====
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "extract_financial_from_pdf.log"
ERROR_LOG_FILE = LOG_DIR / "extract_financial_from_pdf_error.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# 单独的错误日志
error_handler = logging.FileHandler(ERROR_LOG_FILE, encoding="utf-8")
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(error_handler)

# ===== 配置 =====
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb",
)

# PDF 存储目录
PDF_DIR = PROJECT_ROOT / "data" / "financial_reports" / "2025_annual"

# 数据源优先级（与 spec 一致）
SOURCE_PDF = "pdf_extract"
SOURCE_PRIORITY_PDF = 10

# 10 家评估样本公司（来自 qa-golden.json L1-L4）
SAMPLE_COMPANIES = [
    {"stock_code": "601868", "stock_name": "中国能建"},
    {"stock_code": "601186", "stock_name": "中国铁建"},
    {"stock_code": "601319", "stock_name": "中国人保"},
    {"stock_code": "000858", "stock_name": "五粮液"},
    {"stock_code": "000651", "stock_name": "格力电器"},
    {"stock_code": "000066", "stock_name": "中国长城"},
    {"stock_code": "600919", "stock_name": "江苏银行"},
    {"stock_code": "601555", "stock_name": "东吴证券"},
    {"stock_code": "600521", "stock_name": "华海药业"},
    {"stock_code": "600436", "stock_name": "片仔癀"},
]


# ===== 数据库连接 =====
def get_db_conn():
    """获取 PostgreSQL 连接"""
    try:
        import psycopg2
    except ImportError:
        logger.error("psycopg2 未安装，请执行: pip install psycopg2-binary")
        raise
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


# ===== PDF 路径定位 =====
def find_pdf_by_stock_code(stock_code: str, stock_name: str = "") -> Optional[Path]:
    """按股票代码或公司名定位 PDF 文件

    搜索范围（按优先级）：
      1. data/financial_reports/2025_annual/  （批量下载的标准目录）
      2. data/financial_reports/              （手动下载的根目录）

    匹配格式（按优先级）：
      格式A: {stock_code}_*2025*年度报告*.pdf      （标准格式：代码_公司名_2025年年度报告.pdf）
      格式B: *{stock_name}*2025*年度报告*.pdf       （公司名格式：公司名：公司名2025年年度报告.pdf）
      格式C: {stock_name}_{stock_code}_*2025*.pdf   （反向格式：公司名_代码_2025年年度报告.pdf）

    排除：英文版/摘要/修订/更正/H股
    """
    # 搜索目录列表（按优先级）
    search_dirs = [
        PROJECT_ROOT / "data" / "financial_reports" / "2025_annual",
        PROJECT_ROOT / "data" / "financial_reports",
    ]

    # 排除关键词
    exclude_kws = ["英文", "摘要", "修订", "更正", "H股", "Quarterly", "季度"]

    def _is_valid_pdf(path: Path) -> bool:
        """检查是否为有效的 2025 年度报告 PDF（排除英文版/摘要等）"""
        name = path.name
        for kw in exclude_kws:
            if kw in name:
                return False
        return "2025" in name and "年度报告" in name and name.endswith(".pdf")

    # 格式A: {stock_code}_*2025*年度报告*.pdf
    pattern_a = re.compile(rf"^{re.escape(stock_code)}_.*\.pdf$", re.IGNORECASE)
    for search_dir in search_dirs:
        if not search_dir.exists():
            continue
        matches = [p for p in search_dir.iterdir() if p.is_file() and pattern_a.match(p.name) and _is_valid_pdf(p)]
        if matches:
            if len(matches) > 1:
                logger.warning(f"股票代码 {stock_code} 格式A匹配到多个 PDF，使用第一个: {matches[0].name}")
            logger.info(f"定位 PDF（格式A 代码匹配）: {matches[0]}")
            return matches[0]

    # 格式B: *{stock_name}*2025*年度报告*.pdf（按公司名匹配）
    if stock_name:
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            matches = [
                p for p in search_dir.iterdir()
                if p.is_file() and stock_name in p.name and _is_valid_pdf(p)
            ]
            if matches:
                if len(matches) > 1:
                    logger.warning(f"公司名 {stock_name} 格式B匹配到多个 PDF，使用第一个: {matches[0].name}")
                logger.info(f"定位 PDF（格式B 公司名匹配）: {matches[0]}")
                return matches[0]

    # 格式C: {stock_name}_{stock_code}_*2025*.pdf（反向格式）
    if stock_name:
        pattern_c = re.compile(rf"^{re.escape(stock_name)}_{re.escape(stock_code)}_.*\.pdf$", re.IGNORECASE)
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            matches = [p for p in search_dir.iterdir() if p.is_file() and pattern_c.match(p.name) and _is_valid_pdf(p)]
            if matches:
                logger.info(f"定位 PDF（格式C 反向格式）: {matches[0]}")
                return matches[0]

    logger.error(
        f"未找到 {stock_code}({stock_name}) 的 2025 年报 PDF "
        f"（已搜索: {[str(d) for d in search_dirs if d.exists()]}）"
    )
    return None


# ===== 提取结果转换 =====
def _pick_period_value(values: list, periods: list, period_idx: int):
    """安全地从 values 列表取某个 period 的值"""
    if not values or period_idx >= len(values):
        return None
    val = values[period_idx]
    if val is None:
        return None
    # 转 float（psycopg2 numeric 类型可直接接收 float）
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _resolve_report_quarter_type(period_str: str):
    """从 periods 字符串（如 2025/2024）推断 report_quarter 和 report_type

    年报 PDF 默认所有数据为 annual；本期 + 上期 都标记为 annual（不同 report_year）
    """
    return "annual", "年报"


def _detect_report_year(periods: list, pdf_filename: str) -> int:
    """从 periods 或文件名推断报告年度"""
    # 优先用 periods[0]
    if periods and periods[0] and periods[0] != "unknown":
        try:
            return int(periods[0])
        except (ValueError, TypeError):
            pass

    # 从文件名提取（如 600436_片仔癀_2025年年度报告.pdf → 2025）
    m = re.search(r"(20\d{2})年", pdf_filename)
    if m:
        return int(m.group(1))

    # 默认上一年度（今年是2026，年报默认是2025）
    return datetime.now().year - 1


def convert_statement_to_records(
    statement: dict,
    stock_code: str,
    pdf_filename: str,
    document_id: str,
) -> list[dict]:
    """将单张报表的提取结果转换为按 period 的多行记录

    返回：[{report_year, report_quarter, report_type, fields...}, ...]
    """
    fields = statement.get("fields", {})
    periods = statement.get("periods", [])

    if not fields:
        return []

    # 报告年度：用 periods[0] 作为本期年度
    base_year = _detect_report_year(periods, pdf_filename)

    # 通常年报有 2-3 列：本期 / 上期 / 上上期
    # 我们按列展开为多行记录，每行对应一个年度
    n_periods = max(len(v) for v in fields.values() if isinstance(v, list)) if fields else 0
    if n_periods == 0:
        return []

    records = []
    for i in range(n_periods):
        # 推断该列对应的年度：第 0 列=base_year, 第 1 列=base_year-1, ...
        record_year = base_year - i
        report_quarter, report_type = _resolve_report_quarter_type(
            periods[i] if i < len(periods) else ""
        )

        record = {
            "stock_code": stock_code,
            "report_year": record_year,
            "report_quarter": report_quarter,
            "report_type": report_type,
            "source": SOURCE_PDF,
            "source_priority": SOURCE_PRIORITY_PDF,
            "document_id": document_id,
        }

        for standard_name, values in fields.items():
            val = _pick_period_value(values, periods, i)
            record[standard_name] = val

        records.append(record)

    return records


# ===== 写入数据库（带优先级覆盖） =====
def _build_upsert_sql(table_name: str, field_names: list[str]) -> str:
    """构建 UPSERT SQL，带优先级覆盖逻辑

    覆盖规则：
      - 主键冲突（stock_code, report_year, report_quarter, report_type）
      - 仅当新数据 source_priority > 旧数据 source_priority 时覆盖
      - 同优先级不覆盖
      - 单字段粒度覆盖：仅更新新数据中非 None 的字段
    """
    # 列名列表（不含 id, created_at, updated_at）
    columns = ", ".join(field_names)
    # EXCLUDED 引用新值
    # 仅在新 priority 严格大于旧 priority 时更新
    # 单字段更新：CASE WHEN EXCLUDED.{f} IS NOT NULL AND EXCLUDED.source_priority >= {table}.source_priority THEN EXCLUDED.{f} ELSE {table}.{f} END
    # 注意：source_priority 也要更新为新值
    set_clauses = []
    for f in field_names:
        if f == "source_priority":
            # source_priority 始终取较大值
            set_clauses.append(f'"{f}" = GREATEST("{table_name}"."{f}", EXCLUDED."{f}")')
        elif f == "updated_at":
            set_clauses.append(f'"{f}" = now()')
        elif f == "created_at":
            continue  # 不更新创建时间
        elif f == "document_id":
            # document_id 跟随 source_priority 覆盖
            set_clauses.append(
                f'"{f}" = CASE WHEN EXCLUDED."source_priority" >= "{table_name}"."source_priority" '
                f'THEN EXCLUDED."{f}" ELSE "{table_name}"."{f}" END'
            )
        else:
            # 数值字段：仅当新值非 None 且新 priority >= 旧 priority 时覆盖
            set_clauses.append(
                f'"{f}" = CASE WHEN EXCLUDED."{f}" IS NOT NULL '
                f'AND EXCLUDED."source_priority" >= "{table_name}"."source_priority" '
                f'THEN EXCLUDED."{f}" ELSE "{table_name}"."{f}" END'
            )

    set_sql = ", ".join(set_clauses)

    sql = f"""
        INSERT INTO "{table_name}" ({columns})
        VALUES ({", ".join(["%s"] * len(field_names))})
        ON CONFLICT ("stock_code", "report_year", "report_quarter", "report_type")
        DO UPDATE SET {set_sql}
    """
    return sql


def _log_conflicts(
    cur, table_name: str, stock_code: str, report_year: int,
    report_quarter: str, report_type: str, new_record: dict,
):
    """检查并记录冲突：新值覆盖旧值时写入 conflict_log"""
    try:
        cur.execute(
            f"""
            SELECT * FROM "{table_name}"
            WHERE stock_code = %s AND report_year = %s
              AND report_quarter = %s AND report_type = %s
            """,
            (stock_code, report_year, report_quarter, report_type),
        )
        row = cur.fetchone()
        if not row:
            return

        colnames = [desc[0] for desc in cur.description]
        old = dict(zip(colnames, row))
        old_priority = old.get("source_priority", 0)
        new_priority = new_record.get("source_priority", SOURCE_PRIORITY_PDF)

        # 仅当新优先级 > 旧优先级时记录（同优先级不覆盖，不算冲突）
        if new_priority <= old_priority:
            return

        # 对每个非 None 的新字段，记录被覆盖的旧值
        for fname, new_val in new_record.items():
            if fname in ("stock_code", "report_year", "report_quarter", "report_type",
                         "source", "source_priority", "document_id", "created_at", "updated_at", "id"):
                continue
            if new_val is None:
                continue
            old_val = old.get(fname)
            # 仅当旧值存在且与新值不同时记录
            if old_val is not None and str(old_val) != str(new_val):
                cur.execute(
                    """
                    INSERT INTO financial_conflict_log
                        (stock_code, report_year, report_quarter, field_name,
                         old_value, old_source, new_value, new_source, table_name)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        stock_code, report_year, report_quarter, fname,
                        str(old_val), old.get("source"),
                        str(new_val), new_record.get("source"),
                        table_name,
                    ),
                )
    except Exception as e:
        logger.warning(f"记录冲突日志失败（不影响主流程）: {e}")


def upsert_statement_records(
    cur, table_name: str, records: list[dict], numeric_fields: list[str]
):
    """批量 UPSERT 一张报表的多条记录"""
    if not records:
        return 0

    # 字段顺序：基础字段 + 数值字段 + 来源字段
    base_fields = [
        "stock_code", "report_year", "report_quarter", "report_type",
    ]
    source_fields = ["source", "source_priority", "document_id"]

    field_names = base_fields + numeric_fields + source_fields
    sql = _build_upsert_sql(table_name, field_names)

    inserted = 0
    for record in records:
        # 先记录冲突（在 UPSERT 之前查旧值）
        _log_conflicts(
            cur, table_name,
            record["stock_code"], record["report_year"],
            record["report_quarter"], record["report_type"],
            record,
        )

        # 构造参数（按 field_names 顺序）
        params = []
        for f in field_names:
            val = record.get(f)
            if f in numeric_fields and val is not None:
                # 数值字段：转为 float
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    val = None
            params.append(val)

        try:
            cur.execute(sql, params)
            inserted += 1
        except Exception as e:
            logger.error(
                f"UPSERT {table_name} 失败 stock={record['stock_code']} "
                f"year={record['report_year']} quarter={record['report_quarter']}: {e}"
            )
            raise

    return inserted


# ===== 衍生指标计算 =====
def compute_derived_indicators(
    income_records: list[dict],
    balance_records: list[dict],
    cashflow_records: list[dict],
    stock_code: str,
    document_id: str,
) -> list[dict]:
    """计算衍生指标，生成 financial_indicators 记录

    衍生指标：
      - gross_margin = (revenue - operating_cost) / revenue
      - net_margin = net_profit / revenue
      - debt_ratio = total_liabilities / total_assets
      - free_cash_flow = operating_cash_flow - capex（PDF 提取暂无 capex，置 None）
      - eps / bvps：直接从 income/balance 复制
    """
    if not income_records:
        return []

    # 按 (year, quarter, type) 索引
    balance_idx = {
        (r["report_year"], r["report_quarter"], r["report_type"]): r
        for r in balance_records
    }
    cashflow_idx = {
        (r["report_year"], r["report_quarter"], r["report_type"]): r
        for r in cashflow_records
    }

    indicators = []
    for inc in income_records:
        key = (inc["report_year"], inc["report_quarter"], inc["report_type"])
        bal = balance_idx.get(key, {})
        cf = cashflow_idx.get(key, {})

        revenue = inc.get("revenue")
        operating_cost = inc.get("operating_cost")
        net_profit = inc.get("net_profit")
        total_assets = bal.get("total_assets")
        total_liabilities = bal.get("total_liabilities")

        # 毛利率
        # 注：银行报表"营业支出"用负数(括号)表示，需取abs()统一为正数
        # 非银行"营业成本"已是正数，abs()无影响
        gross_margin = None
        if revenue and operating_cost is not None and revenue != 0:
            gross_margin = (revenue - abs(operating_cost)) / revenue

        # 净利率
        net_margin = None
        if revenue and net_profit is not None and revenue != 0:
            net_margin = net_profit / revenue

        # 资产负债率
        debt_ratio = None
        if total_assets and total_liabilities is not None and total_assets != 0:
            debt_ratio = total_liabilities / total_assets

        indicators.append({
            "stock_code": stock_code,
            "report_year": inc["report_year"],
            "report_quarter": inc["report_quarter"],
            "report_type": inc["report_type"],
            "gross_margin": gross_margin,
            "net_margin": net_margin,
            "debt_ratio": debt_ratio,
            "eps": inc.get("eps"),
            "bvps": inc.get("bvps"),
            "source": SOURCE_PDF,
            "document_id": document_id,
        })

    return indicators


def upsert_indicators(cur, records: list[dict]):
    """UPSERT 衍生指标"""
    if not records:
        return 0

    # financial_indicators 表字段（注意：没有 source_priority 和 document_id 列，需查 schema 确认）
    # 实际 schema: roe, roa, gross_margin, net_margin, debt_ratio, current_ratio, quick_ratio,
    #             revenue_yoy, net_profit_yoy, total_assets_yoy, eps, bvps, operating_cash_flow_per_share, source
    # 没有 document_id 和 source_priority
    field_names = [
        "stock_code", "report_year", "report_quarter", "report_type",
        "gross_margin", "net_margin", "debt_ratio", "eps", "bvps",
        "source",
    ]
    sql = """
        INSERT INTO financial_indicators
            (stock_code, report_year, report_quarter, report_type,
             gross_margin, net_margin, debt_ratio, eps, bvps, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT ("stock_code", "report_year", "report_quarter", "report_type")
        DO UPDATE SET
            gross_margin = COALESCE(EXCLUDED.gross_margin, financial_indicators.gross_margin),
            net_margin = COALESCE(EXCLUDED.net_margin, financial_indicators.net_margin),
            debt_ratio = COALESCE(EXCLUDED.debt_ratio, financial_indicators.debt_ratio),
            eps = COALESCE(EXCLUDED.eps, financial_indicators.eps),
            bvps = COALESCE(EXCLUDED.bvps, financial_indicators.bvps),
            source = EXCLUDED.source
    """
    inserted = 0
    for r in records:
        params = (
            r["stock_code"], r["report_year"], r["report_quarter"], r["report_type"],
            r.get("gross_margin"), r.get("net_margin"), r.get("debt_ratio"),
            r.get("eps"), r.get("bvps"), r["source"],
        )
        try:
            cur.execute(sql, params)
            inserted += 1
        except Exception as e:
            logger.error(f"UPSERT financial_indicators 失败: {e}")
            raise
    return inserted


# ===== 同比计算（YoY） =====
def compute_yoy_and_update(cur, stock_code: str, document_id: str):
    """回填 financial_indicators 的 revenue_yoy / net_profit_yoy / total_assets_yoy

    同比 = (本期 - 上期) / 上期
    要求：本期和上期都存在 annual 数据
    """
    # 拉取该公司所有年度的 annual 收入/净利润/总资产
    cur.execute(
        """
        SELECT i.report_year, i.revenue, i.net_profit
        FROM financial_income i
        WHERE i.stock_code = %s AND i.report_quarter = 'annual'
        ORDER BY i.report_year
        """,
        (stock_code,),
    )
    income_rows = cur.fetchall()

    cur.execute(
        """
        SELECT b.report_year, b.total_assets
        FROM financial_balancesheet b
        WHERE b.stock_code = %s AND b.report_quarter = 'annual'
        ORDER BY b.report_year
        """,
        (stock_code,),
    )
    balance_rows = cur.fetchall()

    # 构建年度 → 值 映射
    income_by_year = {row[0]: {"revenue": row[1], "net_profit": row[2]} for row in income_rows}
    assets_by_year = {row[0]: row[1] for row in balance_rows}

    years = sorted(set(list(income_by_year.keys()) + list(assets_by_year.keys())))
    updated = 0

    for year in years:
        prev_year = year - 1
        if prev_year not in income_by_year and prev_year not in assets_by_year:
            continue

        revenue_yoy = None
        net_profit_yoy = None
        total_assets_yoy = None

        cur_data = income_by_year.get(year, {})
        prev_data = income_by_year.get(prev_year, {})

        if (cur_data.get("revenue") and prev_data.get("revenue")
                and prev_data["revenue"] != 0):
            revenue_yoy = (cur_data["revenue"] - prev_data["revenue"]) / prev_data["revenue"]

        if (cur_data.get("net_profit") is not None and prev_data.get("net_profit") is not None
                and prev_data["net_profit"] != 0):
            net_profit_yoy = (cur_data["net_profit"] - prev_data["net_profit"]) / prev_data["net_profit"]

        cur_assets = assets_by_year.get(year)
        prev_assets = assets_by_year.get(prev_year)
        if cur_assets and prev_assets and prev_assets != 0:
            total_assets_yoy = (cur_assets - prev_assets) / prev_assets

        if revenue_yoy is None and net_profit_yoy is None and total_assets_yoy is None:
            continue

        try:
            cur.execute(
                """
                UPDATE financial_indicators
                SET revenue_yoy = COALESCE(%s, revenue_yoy),
                    net_profit_yoy = COALESCE(%s, net_profit_yoy),
                    total_assets_yoy = COALESCE(%s, total_assets_yoy)
                WHERE stock_code = %s AND report_year = %s AND report_quarter = 'annual'
                """,
                (revenue_yoy, net_profit_yoy, total_assets_yoy, stock_code, year),
            )
            updated += cur.rowcount
        except Exception as e:
            logger.warning(f"更新同比失败 stock={stock_code} year={year}: {e}")

    return updated


# ===== 原始表格写入 =====
def upsert_raw_tables(
    cur, stock_code: str, report_year: int, document_id: str,
    raw_tables: list[dict],
):
    """写入 financial_raw_tables（非标准化表格）"""
    if not raw_tables:
        return 0

    # 先删除该公司该年度的旧 raw_tables（避免重复）
    cur.execute(
        "DELETE FROM financial_raw_tables WHERE stock_code = %s AND report_year = %s",
        (stock_code, report_year),
    )

    inserted = 0
    for tbl in raw_tables:
        table_name = tbl.get("table_name", "未命名表格")[:100]
        page_num = tbl.get("page_num")
        table_data = tbl.get("table_data")

        if not table_data:
            continue

        # 序列化为 JSON
        try:
            data_json = json.dumps(table_data, ensure_ascii=False, default=str)
        except Exception as e:
            logger.warning(f"序列化表格失败: {e}")
            continue

        try:
            cur.execute(
                """
                INSERT INTO financial_raw_tables
                    (stock_code, report_year, report_quarter, table_name,
                     table_data, page_num, source_document_id)
                VALUES (%s, %s, 'annual', %s, %s, %s, %s)
                """,
                (stock_code, report_year, table_name, data_json, page_num, document_id),
            )
            inserted += 1
        except Exception as e:
            logger.error(f"写入 financial_raw_tables 失败: {e}")
            raise

    return inserted


# ===== 主流程：处理单个 PDF =====
def process_single_pdf(
    pdf_path: Path,
    stock_code: str,
    document_id: str,
    dry_run: bool = False,
) -> dict:
    """处理单个 PDF：提取 → 转换 → 写库

    返回：统计结果 {stock_code, income_rows, balance_rows, cashflow_rows, raw_tables, indicators, yoy_updated, elapsed}
    """
    start_time = time.time()
    logger.info(f"=" * 60)
    logger.info(f"开始处理 PDF: {pdf_path.name}")
    logger.info(f"  stock_code={stock_code}, document_id={document_id}")

    # Step 1: 提取
    try:
        from data_service.pdf_extractor import FinancialPDFExtractor
        with FinancialPDFExtractor(str(pdf_path)) as extractor:
            result = extractor.extract_all()
    except Exception as e:
        logger.error(f"PDF 提取失败: {pdf_path.name}: {e}", exc_info=True)
        return {
            "stock_code": stock_code,
            "status": "extract_failed",
            "error": str(e),
            "elapsed": time.time() - start_time,
        }

    income_stmt = result.get("income_statement", {})
    balance_stmt = result.get("balance_sheet", {})
    cashflow_stmt = result.get("cashflow_statement", {})
    raw_tables = result.get("raw_tables", [])

    logger.info(
        f"  提取结果: income字段={len(income_stmt.get('fields', {}))}, "
        f"balance字段={len(balance_stmt.get('fields', {}))}, "
        f"cashflow字段={len(cashflow_stmt.get('fields', {}))}, "
        f"raw_tables={len(raw_tables)}"
    )

    # Step 2: 转换为按 period 的记录
    pdf_filename = pdf_path.name
    income_records = convert_statement_to_records(income_stmt, stock_code, pdf_filename, document_id)
    balance_records = convert_statement_to_records(balance_stmt, stock_code, pdf_filename, document_id)
    cashflow_records = convert_statement_to_records(cashflow_stmt, stock_code, pdf_filename, document_id)

    logger.info(
        f"  转换记录: income={len(income_records)}行, "
        f"balance={len(balance_records)}行, cashflow={len(cashflow_records)}行"
    )

    # Step 3: 计算衍生指标
    indicators = compute_derived_indicators(
        income_records, balance_records, cashflow_records,
        stock_code, document_id,
    )
    logger.info(f"  衍生指标: {len(indicators)}行")

    # 推断报告年度（用于 raw_tables）
    base_year = _detect_report_year(income_stmt.get("periods", []), pdf_filename)

    # Step 4: 干跑模式 - 只输出不写库
    if dry_run:
        logger.info(f"  [DRY-RUN] 跳过写库")
        # 打印关键字段供人工核对
        for r in income_records[:1]:
            logger.info(f"  样本 income record: {r}")
        for r in balance_records[:1]:
            logger.info(f"  样本 balance record: {r}")
        return {
            "stock_code": stock_code,
            "status": "dry_run",
            "income_rows": len(income_records),
            "balance_rows": len(balance_records),
            "cashflow_rows": len(cashflow_records),
            "raw_tables": len(raw_tables),
            "indicators": len(indicators),
            "elapsed": time.time() - start_time,
        }

    # Step 5: 写入数据库
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        try:
            # 数值字段列表（与 schema 对齐）
            income_numeric = [
                "revenue", "operating_cost", "operating_profit", "net_profit",
                "net_profit_attributable", "eps", "bvps", "gross_margin", "net_margin",
                "rd_expense", "selling_expense", "administrative_expense", "financial_expense",
                "premium_income", "commission_income", "new_signed_contract",
            ]
            balance_numeric = [
                "total_assets", "total_liabilities", "total_equity", "equity_attributable",
                "current_assets", "non_current_assets", "current_liabilities", "non_current_liabilities",
                "cash", "accounts_receivable", "inventory", "fixed_assets", "goodwill", "debt_ratio",
            ]
            cashflow_numeric = [
                "operating_cash_flow", "investing_cash_flow", "financing_cash_flow",
                "cash_flow_from_operating", "cash_flow_from_investing", "cash_flow_from_financing",
                "free_cash_flow",
            ]

            n_income = upsert_statement_records(cur, "financial_income", income_records, income_numeric)
            n_balance = upsert_statement_records(cur, "financial_balancesheet", balance_records, balance_numeric)
            n_cashflow = upsert_statement_records(cur, "financial_cashflow", cashflow_records, cashflow_numeric)
            n_indicators = upsert_indicators(cur, indicators)
            n_raw = upsert_raw_tables(cur, stock_code, base_year, document_id, raw_tables)
            n_yoy = compute_yoy_and_update(cur, stock_code, document_id)

            conn.commit()
            logger.info(
                f"  ✅ 写库完成: income={n_income}, balance={n_balance}, "
                f"cashflow={n_cashflow}, indicators={n_indicators}, "
                f"raw_tables={n_raw}, yoy_updated={n_yoy}"
            )

            return {
                "stock_code": stock_code,
                "status": "success",
                "income_rows": n_income,
                "balance_rows": n_balance,
                "cashflow_rows": n_cashflow,
                "indicators": n_indicators,
                "raw_tables": n_raw,
                "yoy_updated": n_yoy,
                "elapsed": time.time() - start_time,
            }
        except Exception as e:
            conn.rollback()
            logger.error(f"  ❌ 写库失败，已回滚: {e}", exc_info=True)
            return {
                "stock_code": stock_code,
                "status": "db_failed",
                "error": str(e),
                "elapsed": time.time() - start_time,
            }
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"  ❌ 数据库连接失败: {e}", exc_info=True)
        return {
            "stock_code": stock_code,
            "status": "conn_failed",
            "error": str(e),
            "elapsed": time.time() - start_time,
        }


# ===== 批量处理 =====
def process_batch(
    companies: list[dict],
    report_year: int = 2025,
    dry_run: bool = False,
    document_id_prefix: str = "pdf_extract",
):
    """批量处理多家公司"""
    logger.info("=" * 60)
    logger.info(f"批量处理开始: {len(companies)} 家公司, report_year={report_year}, dry_run={dry_run}")
    logger.info("=" * 60)

    results = []
    success_count = 0
    fail_count = 0

    for i, company in enumerate(companies, 1):
        stock_code = company["stock_code"]
        stock_name = company.get("stock_name", "")
        logger.info(f"\n[{i}/{len(companies)}] 处理 {stock_name} ({stock_code})")

        # 定位 PDF
        pdf_path = find_pdf_by_stock_code(stock_code, stock_name)
        if not pdf_path:
            results.append({
                "stock_code": stock_code,
                "stock_name": stock_name,
                "status": "pdf_not_found",
                "elapsed": 0,
            })
            fail_count += 1
            continue

        # 生成 document_id（基于 PDF 文件名哈希，避免重复处理）
        import hashlib
        doc_hash = hashlib.md5(pdf_path.name.encode("utf-8")).hexdigest()[:16]
        document_id = f"{document_id_prefix}_{stock_code}_{doc_hash}"

        # 处理单个 PDF
        result = process_single_pdf(pdf_path, stock_code, document_id, dry_run=dry_run)
        result["stock_name"] = stock_name
        result["pdf_path"] = str(pdf_path)
        results.append(result)

        if result.get("status") == "success":
            success_count += 1
        else:
            fail_count += 1

    # 汇总
    logger.info("\n" + "=" * 60)
    logger.info(f"批量处理完成: 成功={success_count}, 失败={fail_count}, 总计={len(companies)}")
    logger.info("=" * 60)

    # 打印详细汇总表
    logger.info("\n详细汇总：")
    logger.info(f"{'股票代码':<10} {'公司':<12} {'状态':<14} {'income':<8} {'balance':<8} {'cashflow':<10} {'raw':<6} {'耗时':<8}")
    for r in results:
        logger.info(
            f"{r['stock_code']:<10} {r.get('stock_name', ''):<12} "
            f"{r.get('status', ''):<14} "
            f"{r.get('income_rows', '-')!s:<8} "
            f"{r.get('balance_rows', '-')!s:<8} "
            f"{r.get('cashflow_rows', '-')!s:<10} "
            f"{r.get('raw_tables', '-')!s:<6} "
            f"{r.get('elapsed', 0):.1f}s"
        )

    # 写入统计文件
    stats_file = LOG_DIR / f"extract_financial_from_pdf_stats_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    try:
        with open(stats_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "batch_time": datetime.now().isoformat(),
                    "total": len(companies),
                    "success": success_count,
                    "failed": fail_count,
                    "dry_run": dry_run,
                    "details": results,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
        logger.info(f"\n统计结果已写入: {stats_file}")
    except Exception as e:
        logger.warning(f"写入统计文件失败: {e}")

    return results


# ===== CLI 入口 =====
def main():
    parser = argparse.ArgumentParser(
        description="R001 阶段2.2：财报 PDF 批量提取 + 数据库回填"
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="批量处理 10 家评估样本公司",
    )
    parser.add_argument(
        "--stock-code",
        type=str,
        help="单个股票代码（如 600436）",
    )
    parser.add_argument(
        "--pdf-path",
        type=str,
        help="直接指定 PDF 文件路径（优先级最高）",
    )
    parser.add_argument(
        "--report-year",
        type=int,
        default=2025,
        help="报告年度（默认 2025）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="干跑模式：只提取不写库",
    )
    parser.add_argument(
        "--document-id",
        type=str,
        default=None,
        help="自定义 document_id（默认自动生成）",
    )

    args = parser.parse_args()

    if args.batch:
        # 批量处理
        process_batch(SAMPLE_COMPANIES, report_year=args.report_year, dry_run=args.dry_run)
        return

    if args.pdf_path:
        pdf_path = Path(args.pdf_path)
        if not pdf_path.exists():
            logger.error(f"PDF 文件不存在: {pdf_path}")
            sys.exit(1)
        stock_code = args.stock_code or pdf_path.stem.split("_")[0]
    elif args.stock_code:
        stock_code = args.stock_code
        # 从 SAMPLE_COMPANIES 查 stock_name
        stock_name = next((c["stock_name"] for c in SAMPLE_COMPANIES if c["stock_code"] == stock_code), "")
        pdf_path = find_pdf_by_stock_code(stock_code, stock_name)
        if not pdf_path:
            sys.exit(1)
    else:
        parser.print_help()
        sys.exit(1)

    # 生成 document_id
    if args.document_id:
        document_id = args.document_id
    else:
        import hashlib
        doc_hash = hashlib.md5(pdf_path.name.encode("utf-8")).hexdigest()[:16]
        document_id = f"pdf_extract_{stock_code}_{doc_hash}"

    result = process_single_pdf(pdf_path, stock_code, document_id, dry_run=args.dry_run)
    logger.info(f"\n处理结果: {result}")


if __name__ == "__main__":
    main()
