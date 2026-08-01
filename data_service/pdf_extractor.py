"""
R001 阶段2.1/2.2：财报 PDF 表格提取器
用途：从年报 PDF 提取三张主表（利润表/资产负债表/现金流量表）结构化数据

依赖：pdfplumber（已装到 vendor 目录）
设计原则：
  1. 用 pdfplumber.extract_tables() 提取表格，保留行列结构
  2. 字段映射基于 indicator_aliases 别名词典（与数据库同源）
  3. 数值解析处理千分位/括号负数/单位转换
  4. 非标准化表格整表存入 raw_tables（jsonb）

使用方法：
    from data_service.pdf_extractor import FinancialPDFExtractor
    extractor = FinancialPDFExtractor(pdf_path)
    result = extractor.extract_all()
"""
import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# vendor 目录支持（pdfplumber 装在项目本地 vendor 目录）
import sys
import os
_VENDOR_DIR = Path(__file__).resolve().parent.parent / "vendor"
if _VENDOR_DIR.exists():
    sys.path.insert(0, str(_VENDOR_DIR))

import pdfplumber


# ===== 字段映射表（与 indicator_aliases 同源）=====
# key: 中文行标签关键词（用于模糊匹配）
# value: (standard_name, standard_table)
INCOME_FIELD_MAP = {
    "营业收入": "revenue",
    "营业总收入": "revenue",
    "主营业务收入": "revenue",
    # 注："利息净收入"不映射到任何标准字段
    # 银行报表有"营业收入"行（=利息净收入+手续费净收入+投资收益+...），revenue应取"营业收入"
    # 若映射"利息净收入"→revenue，会因key长度(5)>"营业收入"(4)先匹配，导致revenue=利息净收入(非营业收入)
    "营业成本": "operating_cost",
    "营业总成本": "operating_cost",
    "主营业务成本": "operating_cost",
    "营业支出": "operating_cost",  # 银行业：营业支出（负数，计算毛利率时取abs）
    "营业利润": "operating_profit",
    "净利润": "net_profit",
    "归属于母公司股东的净利润": "net_profit_attributable",
    "归属于母公司所有者的净利润": "net_profit_attributable",
    "基本每股收益": "eps",
    "每股收益": "eps",
    "每股净资产": "bvps",
    "研发费用": "rd_expense",
    "研发投入": "rd_expense",
    "销售费用": "selling_expense",
    "管理费用": "administrative_expense",
    "业务及管理费": "administrative_expense",  # 银行业：业务及管理费（负数）
    "财务费用": "financial_expense",
    "保费收入": "premium_income",
    "保险服务收入": "premium_income",  # 保险业：保险服务收入
    "手续费及佣金收入": "commission_income",
    "经纪业务收入": "commission_income",
    "新签合同额": "new_signed_contract",
}

BALANCE_FIELD_MAP = {
    "资产总计": "total_assets",
    "资产总额": "total_assets",
    "总资产": "total_assets",
    "负债合计": "total_liabilities",
    "负债总额": "total_liabilities",
    "所有者权益合计": "total_equity",
    "股东权益合计": "total_equity",
    "归属于母公司股东权益合计": "equity_attributable",
    "归属于母公司所有者权益合计": "equity_attributable",
    "流动资产合计": "current_assets",
    "非流动资产合计": "non_current_assets",
    "流动负债合计": "current_liabilities",
    "非流动负债合计": "non_current_liabilities",
    "货币资金": "cash",
    "应收账款": "accounts_receivable",
    "存货": "inventory",
    "固定资产": "fixed_assets",
    "商誉": "goodwill",
}

CASHFLOW_FIELD_MAP = {
    "经营活动产生的现金流量净额": "operating_cash_flow",
    "经营活动现金流量净额": "operating_cash_flow",
    "投资活动产生的现金流量净额": "investing_cash_flow",
    "投资活动现金流量净额": "investing_cash_flow",
    "筹资活动产生的现金流量净额": "financing_cash_flow",
    "筹资活动现金流量净额": "financing_cash_flow",
    "筹资活动产生的现金流量净额": "financing_cash_flow",
}

# 衍生指标（从主表计算，不直接提取）
DERIVED_FIELDS = {"gross_margin", "net_margin", "debt_ratio", "free_cash_flow"}


# ===== 报表标题关键词 =====
# 注意：标题匹配时会去掉空格，所以"合 并 利 润 表"会被转成"合并利润表"匹配
# 排除"(续)"页：起始页不匹配含"(续)"的标题
INCOME_TITLES = [
    "合并利润表", "利润表", "母公司利润表",
    "合并及母公司利润表", "银行利润表", "合并及银行利润表",
    "合并及公司利润表",  # 中国人保用
]
BALANCE_TITLES = [
    "合并资产负债表", "资产负债表", "母公司资产负债表",
    "合并及母公司资产负债表", "银行资产负债表", "合并及银行资产负债表",
    "合并及公司资产负债表",  # 中国人保用
]
CASHFLOW_TITLES = [
    "合并现金流量表", "现金流量表", "母公司现金流量表",
    "合并及母公司现金流量表", "银行现金流量表", "合并及银行现金流量表",
    "合并及公司现金流量表",  # 中国人保用
]

# 报表结束标志（遇到这些标题说明当前报表已结束）
STATEMENT_END_TITLES = ["合并所有者权益变动表", "所有者权益变动表", "母公司所有者权益变动表", "股东权益变动表"]

# 正文行排除关键词（标题匹配时排除含这些词的行，避免误匹配正文章节）
STATEMENT_TITLE_EXCLUDE_KWS = [
    "项目", "变动分析", "附注", "日后事项", "补充资料",
    "包括在", "中的", "日存在", "日可获取",
]


class FinancialPDFExtractor:
    """财报 PDF 表格提取器"""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.pdf = pdfplumber.open(pdf_path)
        self._page_texts = []  # 缓存每页文本
        logger.info(f"打开 PDF: {pdf_path}, 共 {len(self.pdf.pages)} 页")

    def close(self):
        if self.pdf:
            self.pdf.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def extract_all(self) -> dict:
        """提取全部财务数据"""
        try:
            income = self._extract_statement(INCOME_TITLES, INCOME_FIELD_MAP, "financial_income")
            balance = self._extract_statement(BALANCE_TITLES, BALANCE_FIELD_MAP, "financial_balancesheet")
            cashflow = self._extract_statement(CASHFLOW_TITLES, CASHFLOW_FIELD_MAP, "financial_cashflow")
            raw_tables = self._extract_raw_tables()

            result = {
                "income_statement": income,
                "balance_sheet": balance,
                "cashflow_statement": cashflow,
                "raw_tables": raw_tables,
                "page_count": len(self.pdf.pages),
            }
            logger.info(
                f"提取完成: income={len(income['fields'])}字段, "
                f"balance={len(balance['fields'])}字段, "
                f"cashflow={len(cashflow['fields'])}字段, "
                f"raw_tables={len(raw_tables)}张"
            )
            return result
        finally:
            self.close()

    def _get_page_text(self, page_idx: int) -> str:
        """获取并缓存页面文本"""
        if page_idx >= len(self._page_texts):
            self._page_texts.extend([None] * (page_idx + 1 - len(self._page_texts)))
        if self._page_texts[page_idx] is None:
            self._page_texts[page_idx] = self.pdf.pages[page_idx].extract_text() or ""
        return self._page_texts[page_idx]

    def _is_valid_statement_title(self, line_compact: str, title: str) -> bool:
        """判断行是否是有效的报表标题（排除正文行和续页）

        排除规则：
        1. 行包含正文排除关键词（项目/变动分析/附注等）
        2. 行包含"(续)"或"（续）"标记（续页不是起始页）
        3. 行长度<30（标题行通常很短）
        """
        if len(line_compact) >= 30:
            return False
        # 排除续页
        if "（续）" in line_compact or "(续)" in line_compact:
            return False
        # 排除正文行
        for kw in STATEMENT_TITLE_EXCLUDE_KWS:
            if kw in line_compact:
                return False
        return title in line_compact

    def _find_statement_pages(self, titles: list[str], end_titles: list[str] = None) -> list[int]:
        """查找报表所在页码范围

        逻辑：
        1. 遍历所有页，先检查页面前5行是否有标题行（快速路径，避免正文误匹配）
        2. 若未命中，全页扫描（任意行），仍要求行长度<30（防止匹配段落正文）
        3. 找到起始页后，向后扫描直到遇到其他主表标题或结束标题

        修复历史：
        - 2026-07-31：华海药业利润表标题在 Page 110 Line 34（不在前5行），
          原逻辑漏匹配，新增全页扫描 fallback。同样修复资产负债表（Line 9）、
          现金流量表（Line 13）的标题位置偏离问题。
        - 2026-07-31：中国人保 Page 23 "利润表项目 年 年 变动幅度" 被误匹配为
          利润表起始页（正文表格标题），新增 _is_valid_statement_title 排除正文行。
        - 2026-07-31：江苏银行 Page 115 "合并及母公司利润表 (续)" 被误匹配为
          起始页（应为 Page 114），新增"(续)"排除。
        """
        end_titles = end_titles or STATEMENT_END_TITLES
        start_page = -1

        # 第一步：前5行扫描（快速路径，性能好且避免正文误匹配）
        for idx in range(len(self.pdf.pages)):
            text = self._get_page_text(idx)
            if not text:
                continue
            lines = text.split("\n")
            for line in lines[:5]:  # 检查前5行
                line_compact = line.strip().replace(" ", "")
                for title in titles:
                    if self._is_valid_statement_title(line_compact, title):
                        start_page = idx
                        logger.info(
                            f"找到报表 '{titles[0]}' 起始页: {idx + 1} "
                            f"(前5行匹配, 行: '{line.strip()}')"
                        )
                        break
                if start_page >= 0:
                    break
            if start_page >= 0:
                break

        # 第二步：前5行未命中，全页扫描 fallback（标题在页面中间的情况）
        # 典型场景：华海药业利润表标题在 Page 110 Line 34
        # 中国人保 "合 并 利 润 表" 在 Page 130 Line 1
        if start_page < 0:
            for idx in range(len(self.pdf.pages)):
                text = self._get_page_text(idx)
                if not text:
                    continue
                lines = text.split("\n")
                for li, line in enumerate(lines):
                    line_compact = line.strip().replace(" ", "")
                    for title in titles:
                        if self._is_valid_statement_title(line_compact, title):
                            start_page = idx
                            logger.info(
                                f"找到报表 '{titles[0]}' 起始页: {idx + 1} "
                                f"(全页扫描 fallback, 行号 {li + 1}, 行: '{line.strip()}')"
                            )
                            break
                    if start_page >= 0:
                        break
                if start_page >= 0:
                    break

        if start_page < 0:
            logger.warning(f"未找到报表 '{titles[0]}'")
            return []

        # 第三步：向后扫描，遇到其他主表标题或结束标题时停止
        # 结束判定仍用前5行（其他报表标题通常在前5行，且避免误判正文）
        all_other_titles = INCOME_TITLES + BALANCE_TITLES + CASHFLOW_TITLES + end_titles
        # 去掉当前 titles
        other_titles = [t for t in all_other_titles if t not in titles]

        pages = [start_page]
        for idx in range(start_page + 1, min(start_page + 8, len(self.pdf.pages))):
            text = self._get_page_text(idx)
            if not text:
                continue
            lines = text.split("\n")
            should_stop = False
            for line in lines[:5]:
                line_compact = line.strip().replace(" ", "")
                for other_title in other_titles:
                    if other_title in line_compact and len(line_compact) < 30:
                        # 续页不算结束标志
                        if "（续）" in line_compact or "(续)" in line_compact:
                            continue
                        should_stop = True
                        break
                if should_stop:
                    break
            if should_stop:
                break
            pages.append(idx)

        return pages

    def _identify_skip_columns(self, rows: list[list]) -> set[int]:
        """识别需要跳过的非数据列（如"附注"列）

        年报表格常见结构：[项目, 附注, 2025年度, 2024年度]
        "附注"列通常是文本（如"七、61"或"49"），不是数值，会干扰数据列对齐。

        扫描全部行找表头行，识别"附注"列位置。
        返回：需要跳过的列绝对索引集合（0-based，对应 row 中的位置）

        修复历史：
        - 2026-07-31：中国能建 Page 173 表格前5行是资产负债表尾部（无附注表头），
          利润表表头在第8行，原逻辑漏识别附注列，导致附注值"七、51"被当成数值。
          扫描范围从5行扩大到20行。
        - 2026-07-31：中国铁建附注列值是"49"（数字），表头是"附注五"（非精确"附注"），
          原逻辑不匹配。新增"附注"前缀匹配（如"附注五"、"附注七"）。
        - 2026-08-01：华海药业 Page 110 有2个表格（资产负债表尾部27行+利润表起始13行），
          合并后前20行全是资产负债表行（无"附注"表头），利润表表头在第28行。
          扫描范围从20行扩大到全部行，找到"附注"表头即停止。
        """
        skip_cols = set()
        # 扫描全部行找"附注"表头（找到即停止）
        for row in rows:
            if not row:
                continue
            for ci, cell in enumerate(row):
                if not cell:
                    continue
                cell_str = str(cell).strip()
                # 精确匹配
                if cell_str in ("附注", "附注 /", "注释", "注"):
                    skip_cols.add(ci)
                    break
                # 前缀匹配：附注五、附注七、附注八等
                if cell_str.startswith("附注") and len(cell_str) <= 5:
                    skip_cols.add(ci)
                    break
            if skip_cols:
                break

        # 补充：如果表头行没有"附注"字样，但某列值是附注编号（如"49"、"七、51"），
        # 通过数值列对齐检测：真正的数值列应该有千分位逗号或大数值
        if not skip_cols and len(rows) >= 3:
            # 检查每列：如果某列值都是小的整数（<1000）且其他列有大数值，可能是附注列
            for ci in range(1, min(5, len(rows[0])) if rows[0] else 1):
                small_int_count = 0
                large_num_count = 0
                total_count = 0
                for row in rows[:20]:
                    if not row or ci >= len(row) or not row[ci]:
                        continue
                    try:
                        val = float(str(row[ci]).replace(",", "").replace("(", "-").replace(")", ""))
                        total_count += 1
                        if abs(val) < 1000 and val == int(val):
                            small_int_count += 1
                        else:
                            large_num_count += 1
                    except (ValueError, TypeError):
                        pass
                # 如果某列全是小整数（>=3个）且其他列有大数值，判定为附注列
                if small_int_count >= 3 and large_num_count == 0:
                    skip_cols.add(ci)
                    logger.info(f"附注列检测（小整数列）: 列{ci}, 小整数={small_int_count}")
                    break

        return skip_cols

    def _extract_statement(self, titles: list[str], field_map: dict, table_name: str) -> dict:
        """提取单张报表"""
        pages = self._find_statement_pages(titles)
        if not pages:
            return {"fields": {}, "periods": [], "table_name": table_name, "pages": []}

        # 提取所有相关页的表格
        all_rows = []
        for page_idx in pages:
            page = self.pdf.pages[page_idx]
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row and any(cell and str(cell).strip() for cell in row):
                        all_rows.append(row)

        # 识别需要跳过的列（如"附注"列），避免数据列错位
        skip_cols = self._identify_skip_columns(all_rows)

        # 识别报告期（从表头行）
        periods = self._identify_periods(all_rows)

        # 字段映射：遍历每一行，匹配 field_map
        # 注意：按 key 长度降序排序，长 key 优先匹配，避免 "净利润" 误匹配到 "归属于母公司股东的净利润"
        sorted_field_map = sorted(field_map.items(), key=lambda x: len(x[0]), reverse=True)
        fields = self._match_fields(all_rows, sorted_field_map, skip_cols)

        # Fallback: 如果 extract_tables() 返回行数过少（<5）或字段映射全部失败（0字段/全None值），
        # 改用 extract_text() 解析文本行（格力/五粮液/东吴等 PDF 会出现此问题）
        fields_has_value = any(
            vals and any(v is not None for v in vals)
            for vals in fields.values()
        )
        if len(all_rows) < 5 or not fields_has_value:
            if len(all_rows) < 5:
                reason = f"extract_tables 仅 {len(all_rows)} 行"
            elif len(fields) == 0:
                reason = f"extract_tables {len(all_rows)} 行但字段映射 0 个"
            else:
                reason = f"extract_tables {len(all_rows)} 行但字段值全 None"
            logger.info(f"{table_name}: {reason}，启用文本解析 fallback")
            text_rows, text_skip_cols = self._extract_rows_from_text(pages)
            if text_rows:
                all_rows = text_rows
                skip_cols = text_skip_cols
                periods = self._identify_periods(all_rows)
                fields = self._match_fields(all_rows, sorted_field_map, skip_cols)

        return {
            "fields": fields,
            "periods": periods,
            "table_name": table_name,
            "pages": [p + 1 for p in pages],  # 转为 1-based 页码
        }

    def _match_fields(self, all_rows: list[list], sorted_field_map: list, skip_cols: set) -> dict:
        """字段映射：遍历每一行，匹配 field_map"""
        fields = {}
        for row in all_rows:
            if not row or not row[0]:
                continue
            row_label = str(row[0]).strip().replace(" ", "").replace("\n", "")
            # 清理行标签：去掉括号内容、前缀序号
            clean_label = re.sub(r'[（(].*?[）)]', '', row_label)
            clean_label = re.sub(r'^[一二三四五六七八九十\d]+\.[\s]*', '', clean_label)
            clean_label = re.sub(r'^[一二三四五六七八九十]+、', '', clean_label)
            clean_label = clean_label.strip()
            # 模糊匹配：只检查 cn_key 是否是 clean_label 的子串
            for cn_key, standard_name in sorted_field_map:
                if cn_key in clean_label:
                    if standard_name in fields:
                        continue  # 已匹配过，跳过（取第一个匹配值）
                    # 提取数值（跳过行标签列和附注列）
                    values = []
                    for ci, cell in enumerate(row):
                        if ci == 0 or ci in skip_cols:
                            continue  # 跳过行标签列和附注列
                        if cell is None or str(cell).strip() == "":
                            values.append(None)
                        else:
                            parsed = self._parse_value(str(cell))
                            values.append(parsed)
                    fields[standard_name] = values
                    break
        return fields

    def _extract_rows_from_text(self, pages: list[int]) -> tuple[list[list], set]:
        """从页面文本提取表格行（extract_tables 失败时的 fallback）

        当 pdfplumber.extract_tables() 返回行数过少时使用。
        从 extract_text() 的文本行中解析行标签和数值列。

        返回 (all_rows, skip_cols)
        - all_rows: 每行第一列是行标签，后续列是数值（附注列已删除）
        - skip_cols: 空集合（附注已删除，无需跳过）
        """
        all_rows = []
        skip_cols = set()  # 文本解析模式下附注已删除，返回空集合

        # 跳过的行（页眉/页脚/标题/表头）
        skip_line_prefixes = (
            "编制单位", "项 目", "项目 ", "项目附注",
            "法定代表人", "主管会计工作", "会计机构负责人",
        )
        skip_exact_lines = {
            "合并利润表", "合并资产负债表", "合并现金流量表",
            "合并及母公司利润表", "合并及银行资产负债表", "合并及银行现金流量表",
            "合并及母公司现金流量表", "合并及母公司资产负债表",
            "银行资产负债表", "银行现金流量表", "母公司利润表",
        }

        # 附注列正则：
        #   "五、54" / "五、54(1)" / "注1" 格式
        #   纯整数 1-3 位（银行/保险报表附注编号，如"33"、"37"、"40"）
        # 修复历史：
        #   2026-07-31：江苏银行"利息净收入 33 67,517,837"中"33"是附注编号，
        #   原逻辑未识别纯整数附注，导致revenue=33.0。新增 ^\d{1,3}$ 匹配。
        note_re = re.compile(r'^[一二三四五六七八九十]+、\d+(?:\(\d+\))?$|^\d{1,3}$')
        # 数值正则：数字开头，可带逗号/小数点/括号/负号
        value_re = re.compile(r'^-?\(?\d[\d,]*\.?\d*\)?$|^-?$|^--$|^－$|^—$')

        for page_idx in pages:
            text = self._get_page_text(page_idx)
            if not text:
                continue
            lines = text.split("\n")
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # 跳过页眉（公司名+年度报告）
                if "年度报告" in line and ("公司" in line or "银行" in line):
                    continue
                # 跳过页码
                if line.isdigit():
                    continue
                # 跳过标题/表头
                if line in skip_exact_lines:
                    continue
                if any(line.startswith(p) for p in skip_line_prefixes):
                    continue
                if "1-12月" in line or line.startswith("单位："):
                    continue

                # 解析行：用空格分割
                parts = line.split()
                if len(parts) < 2:
                    continue  # 只有行标签没有数值

                # 从右向左识别数值和附注 token
                values = []  # 只保留数值（附注跳过）
                label_end = len(parts)
                for i in range(len(parts) - 1, 0, -1):
                    p = parts[i]
                    # 检查是否是附注（"五、54"或纯整数"33"格式）→ 跳过
                    if note_re.match(p):
                        label_end = i
                        continue
                    # 检查是否是数值
                    if value_re.match(p):
                        cleaned = p.replace(",", "").replace("(", "-").replace(")", "")
                        if cleaned in ("-", "--", "---", "－", "—"):
                            values.insert(0, None)
                        else:
                            try:
                                float(cleaned)
                                values.insert(0, p)
                            except ValueError:
                                break  # 非数值，停止
                        label_end = i
                        continue
                    # 非数值非附注，停止
                    break

                if not values:
                    continue

                # 限制每行最多保留 2 个数值列（本期+上期）
                # 修复历史：
                #   2026-07-31：银行报表有4列（本集团2025/2024 + 本行2025/2024），
                #   原逻辑取全部4列导致生成5行错误记录（2025/2024/2023/2022/2021）。
                #   年报标准格式为2列（本期+上期），限制为2列可正确处理银行报表。
                if len(values) > 2:
                    values = values[:2]

                label = " ".join(parts[:label_end])
                row = [label] + values
                all_rows.append(row)

        logger.info(f"文本解析 fallback: 提取 {len(all_rows)} 行（附注列已删除）")
        return all_rows, skip_cols

    def _identify_periods(self, rows: list[list]) -> list[str]:
        """从表格行中识别报告期（年份/季度）

        年报表格通常有 2-3 列：本期/上期/上上期
        表头行可能包含 "2025年" / "2024年" 等
        """
        periods = []
        # 扫描前 5 行找表头
        for row in rows[:5]:
            if not row:
                continue
            for cell in row:
                if not cell:
                    continue
                text = str(cell)
                # 匹配 "2025年" / "2025年度" / "2025年12月31日"
                matches = re.findall(r"(20\d{2})\s*年", text)
                if matches:
                    periods.extend(matches)
                    break
            if periods:
                break

        # 如果没找到年份，用默认占位
        if not periods:
            periods = ["unknown"]

        return periods

    def _parse_value(self, text: str) -> Optional[float]:
        """解析数值文本

        处理：
        - 单引号前缀：'3.58 → 3.58（pdfplumber 提取的文本前缀）
        - 千分位逗号：1,234,567.89 → 1234567.89
        - 括号负数：(1,234.56) → -1234.56
        - 单位：暂不转换（保留原始数值，单位由调用方处理）
        - 空值：- / -- / N/A → None
        """
        if not text:
            return None

        text = text.strip()

        # 去除 Excel/PDF 文本前缀单引号
        if text.startswith("'"):
            text = text[1:].strip()

        # 空值标记
        if text in ("-", "--", "---", "N/A", "n/a", "NA", "－", "—", ""):
            return None

        # 括号负数：(1,234.56) → -1234.56
        is_negative = False
        if text.startswith("(") and text.endswith(")"):
            is_negative = True
            text = text[1:-1]
        elif text.startswith("-"):
            is_negative = True
            text = text[1:]
        elif text.startswith("－"):
            is_negative = True
            text = text[1:]

        # 去除千分位逗号和空格
        text = text.replace(",", "").replace(" ", "").replace("，", "")

        # 去除百分号（毛利率等百分比）
        is_percent = False
        if text.endswith("%"):
            is_percent = True
            text = text[:-1]

        # 尝试转为 float
        try:
            value = float(text)
        except ValueError:
            # 无法解析，返回 None
            logger.debug(f"无法解析数值: '{text}'")
            return None

        if is_negative:
            value = -value
        if is_percent:
            value = value / 100.0  # 百分比转小数

        return value

    def _extract_raw_tables(self) -> list[dict]:
        """提取非标准化表格（附注表等），整表存为 JSON

        策略：扫描所有页面，排除三张主表所在页，提取其他表格
        """
        # 先确定三张主表的页码范围
        main_statement_pages = set()
        for titles in [INCOME_TITLES, BALANCE_TITLES, CASHFLOW_TITLES]:
            pages = self._find_statement_pages(titles)
            main_statement_pages.update(pages)

        raw_tables = []
        for idx in range(len(self.pdf.pages)):
            if idx in main_statement_pages:
                continue
            page = self.pdf.pages[idx]
            tables = page.extract_tables()
            for table_idx, table in enumerate(tables):
                if not table or len(table) < 2:  # 跳过空表和单行表
                    continue
                # 提取表格名称（通常是表格上方最近的文本行）
                table_name = self._guess_table_name(page, table)

                raw_tables.append({
                    "table_name": table_name,
                    "page_num": idx + 1,
                    "table_data": table,  # 原始行列结构
                })

        return raw_tables

    def _guess_table_name(self, page, table: list[list]) -> str:
        """猜测表格名称（从表格第一行或页面上方文本）"""
        # 优先用表格第一行作为名称
        if table and table[0] and table[0][0]:
            first_cell = str(table[0][0]).strip()
            if first_cell and len(first_cell) < 50:
                return first_cell

        # 退而求其次，用页面文本的前几行
        text = page.extract_text() or ""
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if lines:
            return lines[0][:50]

        return "未命名表格"


def extract_pdf(pdf_path: str) -> dict:
    """便捷函数：提取 PDF 财务数据"""
    with FinancialPDFExtractor(pdf_path) as extractor:
        return extractor.extract_all()
