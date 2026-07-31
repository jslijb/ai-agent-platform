/**
 * R001 阶段3：查询路由（指标清单驱动路由）
 *
 * 核心原则（spec.md 1.3）：
 *   - 命中标准化指标 → 走 SQL 精确查询（financial_income/balancesheet/cashflow/indicators）
 *   - 未命中标准化指标 → 优先走 SQL 查 financial_raw_tables，仍查不到时走向量检索 fallback
 *   - 非数值类查询 → 直接走向量检索（现有链路不变）
 *
 * 实施进度：
 *   - [x] 3.1 意图识别（classifyIntent 纯函数，规则匹配，不调 LLM）
 *   - [ ] 3.2 公司名识别 + 指标识别（DB 查 stock_mapping / indicator_aliases）
 *   - [ ] 3.3 模板 SQL 查询（drizzle 查 financial_income 等）
 *   - [ ] 3.4 接入 RAG API（routeQuery 整合）
 *
 * 详见：docs/spec.md 第五章、docs/adr/011-financial-data-to-postgresql.md
 */

// ===== 类型定义 =====

export type QueryIntent = "numeric" | "non_numeric";

export interface IntentResult {
  intent: QueryIntent;
  matchedNumericKeywords: string[];
  matchedNonNumericKeywords: string[];
}

export interface CompanyMatch {
  stockCode: string;
  stockNameShort: string;
  matchedBy: "exact" | "alias" | "fuzzy";
}

export interface IndicatorMatch {
  standardName: string;
  standardTable: string;
  aliasList: string[];
  matchedAlias: string;
}

export type QueryRoute = "sql_standard" | "sql_raw_tables" | "vector";

export interface RouteResult {
  intent: QueryIntent;
  company?: CompanyMatch;
  indicators: IndicatorMatch[];
  route: QueryRoute;
  sqlResult?: Record<string, unknown>[];
  vectorResult?: Array<{ text: string; documentId: string; score: number }>;
}

// ===== 3.1 意图识别（纯函数，不调 LLM）=====
//
// 关键词清单来源：spec.md 5.1 + indicator_aliases 常见指标
// 规则：
//   - 有数值关键词 + 没有非数值关键词 → numeric
//   - 有数值关键词 + 有非数值关键词 → numeric（数值优先，避免漏判）
//   - 没有数值关键词 → non_numeric
//
// 注意：公司名识别是独立步骤（3.2），不进入意图判定

const NUMERIC_KEYWORDS = [
  // 利润表指标
  "营收", "营业收入", "营业总收入", "主营业务收入", "收入",
  "净利润", "归母净利润", "归属于上市公司股东的净利润", "利润总额", "营业利润",
  "营业成本", "主营业务成本",
  "每股收益", "EPS", "每股净资产", "BVPS",
  "研发费用", "研发投入", "销售费用", "管理费用", "财务费用",
  "毛利率", "净利率", "利润率",
  // 资产负债表指标
  "总资产", "资产总计", "资产总额", "净资产",
  "总负债", "负债合计", "负债总额", "负债率", "资产负债率",
  "所有者权益", "股东权益", "归属于母公司股东权益",
  "流动资产", "非流动资产", "流动负债", "非流动负债",
  "货币资金", "应收账款", "存货", "固定资产", "商誉",
  "流动比率", "速动比率",
  // 现金流量表指标
  "经营活动现金流", "经营现金流", "经营活动产生的现金流量",
  "投资活动现金流", "投资现金流", "筹资活动现金流", "筹资现金流",
  "自由现金流", "现金流量净额",
  // 衍生指标
  "ROE", "ROA", "净资产收益率", "总资产收益率",
  "同比", "环比", "增长率", "增速", "增长", "下降",
  // 单位/数值相关（"亿"覆盖"亿元/多少亿"，"万"覆盖"万元/多少万"）
  "亿元", "万元", "亿", "占比", "比率", "倍数",
  // 估值指标（数值类）
  "PE", "PB", "市盈率", "市净率", "估值",
  // 分红（数值类）
  "分红", "股息率", "每股股息",
] as const;

const NON_NUMERIC_KEYWORDS = [
  // 交易规则类
  "交易规则", "涨跌幅限制", "涨停", "跌停", "停牌", "复牌", "退市",
  "T+1", "T+0", "融资融券", "标的证券",
  // 技术指标类
  "技术指标", "K线", "均线", "MACD", "RSI", "KDJ", "布林带", "布林线",
  "支撑位", "压力位", "趋势线", "形态", "突破", "回踩", "颈线",
  "金叉", "死叉", "顶背离", "底背离",
  // 合规风控类
  "合规", "违规", "警示", "风险警示", "ST", "*ST",
  "投资者适当性", "禁入", "禁止",
  // 政策类
  "政策", "法规", "法律", "监管", "证监会",
  // 资金流向（非财报数值）
  "主力资金", "北向资金", "资金流入", "资金流出", "主力净流入",
  // 行业/概念（非个股数值）
  "行业分析", "概念股", "龙头股", "板块",
] as const;

/**
 * 意图识别：判断 query 是数值类还是非数值类
 *
 * @param query 用户原始查询
 * @returns IntentResult，包含意图和命中的关键词列表（便于调试）
 */
export function classifyIntent(query: string): IntentResult {
  const matchedNumericKeywords: string[] = [];
  const matchedNonNumericKeywords: string[] = [];

  for (const kw of NUMERIC_KEYWORDS) {
    if (query.includes(kw)) {
      matchedNumericKeywords.push(kw);
    }
  }

  for (const kw of NON_NUMERIC_KEYWORDS) {
    if (query.includes(kw)) {
      matchedNonNumericKeywords.push(kw);
    }
  }

  // 规则：有数值关键词 → numeric（数值优先，即使混有非数值关键词）
  // 没有数值关键词 → non_numeric
  const intent: QueryIntent =
    matchedNumericKeywords.length > 0 ? "numeric" : "non_numeric";

  return {
    intent,
    matchedNumericKeywords,
    matchedNonNumericKeywords,
  };
}

// ===== 3.2 公司名识别 + 指标识别（DB 层，下一轮实现）=====

/**
 * 公司名识别：从 query 中识别公司名，返回 stock_code
 *
 * 逻辑（spec.md 5.2）：
 *   1. 精确匹配 stock_mapping.stock_name_short
 *   2. 未命中 → 模糊匹配 stock_name_alias (pg_trgm, similarity > 0.6)
 *   3. 未命中 → LLM 兜底（首期不接，返回 null）
 */
export async function identifyCompany(
  _query: string,
): Promise<CompanyMatch | null> {
  // TODO: 阶段3.2 实现 - 查 stock_mapping 表
  throw new Error("Not implemented: 阶段3.2 identifyCompany（待查 stock_mapping 表）");
}

/**
 * 指标识别：从 query 中识别标准化指标名
 *
 * 逻辑（spec.md 5.3）：
 *   1. 正则匹配 indicator_aliases.alias_list
 *   2. 未命中 → LLM 改写（首期不接，返回空数组）
 */
export async function identifyIndicators(
  _query: string,
): Promise<IndicatorMatch[]> {
  // TODO: 阶段3.2 实现 - 查 indicator_aliases 表
  throw new Error("Not implemented: 阶段3.2 identifyIndicators（待查 indicator_aliases 表）");
}

// ===== 3.3 模板 SQL 查询（DB 层，下一轮实现）=====

/**
 * 模板 SQL 查询：按 standard_table 分组查询
 *
 * 模板（spec.md 5.4）：
 *   SELECT {standard_name} FROM {standard_table}
 *   WHERE stock_code = ? AND report_year = ? AND report_quarter = ?;
 */
export async function executeSqlQuery(
  _stockCode: string,
  _indicators: IndicatorMatch[],
  _reportYear: number = 2025,
  _reportQuarter: string = "annual",
): Promise<Record<string, unknown>[]> {
  // TODO: 阶段3.3 实现 - drizzle 查 financial_income/balancesheet/cashflow/indicators
  throw new Error("Not implemented: 阶段3.3 executeSqlQuery（待用 drizzle 查 financial 表）");
}

// ===== 3.4 路由整合（下一轮实现）=====

/**
 * 查询路由入口：整合意图识别 + 公司名 + 指标 + SQL + 向量 fallback
 *
 * 路由逻辑（spec.md 2.2）：
 *   数值类 → 命中标准化指标 → SQL 查 financial_income/...
 *         → 未命中但 raw_tables 有相关表 → SQL 查 financial_raw_tables → 整表返回 LLM 读表
 *         → raw_tables 也查不到 → 向量检索 fallback
 *   非数值类 → 直接向量检索
 */
export async function routeQuery(
  _query: string,
  _options: { reportYear?: number; reportQuarter?: string } = {},
): Promise<RouteResult> {
  // TODO: 阶段3.4 实现 - 整合 classifyIntent + identifyCompany + identifyIndicators + executeSqlQuery + hybridSearch
  throw new Error("Not implemented: 阶段3.4 routeQuery（待整合路由）");
}
