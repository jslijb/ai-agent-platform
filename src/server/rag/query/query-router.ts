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
 *   - [x] 3.2 公司名识别 + 指标识别（DB 查 stock_mapping / indicator_aliases）
 *   - [x] 3.3 模板 SQL 查询（drizzle 查 financial_income 等）
 *   - [x] 3.4 接入 RAG API（routeQuery 整合）
 *
 * 详见：docs/spec.md 第五章、docs/adr/011-financial-data-to-postgresql.md
 */

import { db, sql } from "@/server/db/client";
import {
  stockMapping,
  indicatorAliases,
  financialIncome,
  financialBalancesheet,
  financialCashflow,
  financialIndicators,
  financialRawTables,
} from "@/server/db/schema";
import { eq, and, ilike, sql as dsql } from "drizzle-orm";

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
  // 调试信息
  matchedNumericKeywords?: string[];
  matchedNonNumericKeywords?: string[];
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
  // 行业专用指标（建筑类新签合同，覆盖"新签合同额/新签合同/新签订单"）
  "新签合同",
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

// ===== 3.2 公司名识别 + 指标识别（DB 层）=====

/**
 * 公司名识别：从 query 中识别公司名，返回 stock_code
 *
 * 逻辑（spec.md 5.2）：
 *   1. 精确匹配 stock_mapping.stock_name_short（substring 匹配）
 *   2. 未命中 → 模糊匹配 stock_name_alias (jsonb 数组包含)
 *   3. 未命中 → 返回 null（首期不接 LLM 兜底）
 */
export async function identifyCompany(
  query: string,
): Promise<CompanyMatch | null> {
  // 1. 查全部 stock_mapping（10家样本量小，全表扫描即可；5000+公司时可改为 ILIKE 预过滤）
  const allCompanies = await db
    .select({
      stockCode: stockMapping.stockCode,
      stockNameShort: stockMapping.stockNameShort,
      stockNameFull: stockMapping.stockNameFull,
      stockNameAlias: stockMapping.stockNameAlias,
    })
    .from(stockMapping);

  // 2. 精确匹配 stock_name_short（query 包含简称）
  for (const c of allCompanies) {
    if (query.includes(c.stockNameShort)) {
      return {
        stockCode: c.stockCode,
        stockNameShort: c.stockNameShort,
        matchedBy: "exact",
      };
    }
  }

  // 3. 模糊匹配 stock_name_alias（jsonb 数组，逐个检查）
  for (const c of allCompanies) {
    const aliasList = Array.isArray(c.stockNameAlias) ? c.stockNameAlias : [];
    for (const alias of aliasList) {
      if (typeof alias === "string" && query.includes(alias) && alias.length >= 2) {
        return {
          stockCode: c.stockCode,
          stockNameShort: c.stockNameShort,
          matchedBy: "alias",
        };
      }
    }
  }

  // 4. 未命中（首期不接 LLM 兜底）
  return null;
}

/**
 * 指标识别：从 query 中识别标准化指标名
 *
 * 逻辑（spec.md 5.3）：
 *   1. 正则匹配 indicator_aliases.alias_list（query 包含 alias 子串）
 *   2. 未命中 → 返回空数组（首期不接 LLM 改写）
 */
export async function identifyIndicators(
  query: string,
): Promise<IndicatorMatch[]> {
  // 查全部 indicator_aliases（42条，全表扫描）
  const allAliases = await db
    .select({
      standardName: indicatorAliases.standardName,
      standardTable: indicatorAliases.standardTable,
      aliasList: indicatorAliases.aliasList,
    })
    .from(indicatorAliases);

  const matches: IndicatorMatch[] = [];
  const matchedStandardNames = new Set<string>();

  // 按 alias 长度降序排序（长 alias 优先匹配，避免"净利润"误匹配到"归母净利润"）
  const aliasEntries: Array<{
    standardName: string;
    standardTable: string;
    alias: string;
  }> = [];
  for (const a of allAliases) {
    const aliasList = Array.isArray(a.aliasList) ? a.aliasList : [];
    for (const alias of aliasList) {
      if (typeof alias === "string" && alias.length >= 2) {
        aliasEntries.push({
          standardName: a.standardName,
          standardTable: a.standardTable,
          alias,
        });
      }
    }
  }
  aliasEntries.sort((a, b) => b.alias.length - a.alias.length);

  // 逐个匹配
  for (const entry of aliasEntries) {
    if (matchedStandardNames.has(entry.standardName)) continue;
    if (query.includes(entry.alias)) {
      const fullRecord = allAliases.find(
        (a) => a.standardName === entry.standardName,
      );
      matches.push({
        standardName: entry.standardName,
        standardTable: entry.standardTable,
        aliasList: Array.isArray(fullRecord?.aliasList)
          ? (fullRecord!.aliasList as string[])
          : [],
        matchedAlias: entry.alias,
      });
      matchedStandardNames.add(entry.standardName);
    }
  }

  return matches;
}

// ===== 3.3 模板 SQL 查询（DB 层）=====

/**
 * 模板 SQL 查询：按 standard_table 分组查询
 *
 * 模板（spec.md 5.4）：
 *   SELECT {standard_name} FROM {standard_table}
 *   WHERE stock_code = ? AND report_year = ? AND report_quarter = ?;
 *
 * 实现：按 standard_table 分组，每组查一次，合并结果
 */
export async function executeSqlQuery(
  stockCode: string,
  indicators: IndicatorMatch[],
  reportYear: number = 2025,
  reportQuarter: string = "annual",
): Promise<Record<string, unknown>[]> {
  if (indicators.length === 0) return [];

  // 按 standard_table 分组
  const groupedByTable = new Map<string, IndicatorMatch[]>();
  for (const ind of indicators) {
    const list = groupedByTable.get(ind.standardTable) ?? [];
    list.push(ind);
    groupedByTable.set(ind.standardTable, list);
  }

  // V13-r6 修复：ROE/ROA 查询需要联查 financial_income（净利润）和 financial_balancesheet（净资产）
  // financial_indicators 表的 roe/roa 字段常为 null，LLM 需要原始数据自行计算
  const standardNames = indicators.map((i) => i.standardName);
  const needsRoeData = standardNames.some(
    (name) => name === "roe" || name === "roa" || name === "net_margin" || name === "gross_margin",
  );
  if (needsRoeData) {
    // 补充查询 financial_income（提供净利润、营业收入、营业成本用于计算）
    if (!groupedByTable.has("financial_income")) {
      groupedByTable.set("financial_income", []);
    }
    // 补充查询 financial_balancesheet（提供净资产用于 ROE 计算）
    if (!groupedByTable.has("financial_balancesheet")) {
      groupedByTable.set("financial_balancesheet", []);
    }
  }

  const results: Record<string, unknown>[] = [];

  // 对每张表执行查询
  for (const [tableName, tableIndicators] of Array.from(groupedByTable.entries())) {
    const tableStandardNames = tableIndicators.map((i: IndicatorMatch) => i.standardName);
    const rows = await queryFinancialTable(tableName, stockCode, reportYear, reportQuarter);
    // 给每行标注来源表和命中的指标
    for (const row of rows) {
      results.push({
        ...row,
        _sourceTable: tableName,
        _matchedIndicators: tableStandardNames.length > 0 ? tableStandardNames : ["supplementary"],
      });
    }
  }

  return results;
}

/**
 * 查询单张财务表（drizzle）
 * 只取需要的列（standardName 对应的字段），避免 SELECT *
 */
async function queryFinancialTable(
  tableName: string,
  stockCode: string,
  reportYear: number,
  reportQuarter: string,
): Promise<Record<string, unknown>[]> {
  const whereClause = and(
    eq(financialIncome.stockCode, stockCode),
    eq(financialIncome.reportYear, reportYear),
    eq(financialIncome.reportQuarter, reportQuarter),
  );

  switch (tableName) {
    case "financial_income": {
      return await db
        .select()
        .from(financialIncome)
        .where(
          and(
            eq(financialIncome.stockCode, stockCode),
            eq(financialIncome.reportYear, reportYear),
            eq(financialIncome.reportQuarter, reportQuarter),
          ),
        );
    }
    case "financial_balancesheet": {
      return await db
        .select()
        .from(financialBalancesheet)
        .where(
          and(
            eq(financialBalancesheet.stockCode, stockCode),
            eq(financialBalancesheet.reportYear, reportYear),
            eq(financialBalancesheet.reportQuarter, reportQuarter),
          ),
        );
    }
    case "financial_cashflow": {
      return await db
        .select()
        .from(financialCashflow)
        .where(
          and(
            eq(financialCashflow.stockCode, stockCode),
            eq(financialCashflow.reportYear, reportYear),
            eq(financialCashflow.reportQuarter, reportQuarter),
          ),
        );
    }
    case "financial_indicators": {
      return await db
        .select()
        .from(financialIndicators)
        .where(
          and(
            eq(financialIndicators.stockCode, stockCode),
            eq(financialIndicators.reportYear, reportYear),
            eq(financialIndicators.reportQuarter, reportQuarter),
          ),
        );
    }
    default:
      console.warn(`[query-router] 未知财务表: ${tableName}`);
      return [];
  }
}

/**
 * 查询原始表格（financial_raw_tables）- 模板3：整表查询
 * 用于标准化指标未命中时的 fallback
 */
export async function queryRawTables(
  stockCode: string,
  reportYear: number,
  keyword: string,
): Promise<Record<string, unknown>[]> {
  try {
    const { queryRawTablesEnhanced } = await import("../../routing/raw-table-search");
    return await queryRawTablesEnhanced(stockCode, reportYear, keyword);
  } catch {
    return await db
      .select({
        id: financialRawTables.id,
        stockCode: financialRawTables.stockCode,
        reportYear: financialRawTables.reportYear,
        reportQuarter: financialRawTables.reportQuarter,
        tableName: financialRawTables.tableName,
        tableData: financialRawTables.tableData,
        pageNum: financialRawTables.pageNum,
      })
      .from(financialRawTables)
      .where(
        and(
          eq(financialRawTables.stockCode, stockCode),
          eq(financialRawTables.reportYear, reportYear),
          ilike(financialRawTables.tableName, `%${keyword}%`),
        ),
      )
      .limit(20);
  }
}

// ===== 3.4 路由整合 =====

/**
 * 查询路由入口：整合意图识别 + 公司名 + 指标 + SQL + 向量 fallback
 *
 * 路由逻辑（spec.md 2.2）：
 *   数值类 → 命中标准化指标 → SQL 查 financial_income/...
 *         → 未命中但 raw_tables 有相关表 → SQL 查 financial_raw_tables → 整表返回 LLM 读表
 *         → raw_tables 也查不到 → 向量检索 fallback
 *   非数值类 → 直接向量检索
 *
 * 注意：本函数只返回路由结果，不实际执行向量检索（由调用方按 route 决定）
 */
export async function routeQuery(
  query: string,
  _options: { reportYear?: number; reportQuarter?: string } = {},
): Promise<RouteResult> {
  const options = {
    reportYear: _options.reportYear ?? 2025,
    reportQuarter: _options.reportQuarter ?? "annual",
  };

  // 1. 意图识别
  const intent = classifyIntent(query);

  // 非数值类 → 直接走向量
  if (intent.intent === "non_numeric") {
    return {
      intent: intent.intent,
      indicators: [],
      route: "vector",
      matchedNumericKeywords: intent.matchedNumericKeywords,
      matchedNonNumericKeywords: intent.matchedNonNumericKeywords,
    } as RouteResult;
  }

  // 2. 数值类 → 公司名识别
  const company = await identifyCompany(query);

  // 3. 指标识别
  const indicators = await identifyIndicators(query);

  // 4. 路由决策
  // 4a. 命中公司 + 命中标准化指标 → SQL 精确查询
  if (company && indicators.length > 0) {
    const sqlResult = await executeSqlQuery(
      company.stockCode,
      indicators,
      options.reportYear,
      options.reportQuarter,
    );
    if (sqlResult.length > 0) {
      return {
        intent: intent.intent,
        company,
        indicators,
        route: "sql_standard",
        sqlResult,
        matchedNumericKeywords: intent.matchedNumericKeywords,
        matchedNonNumericKeywords: intent.matchedNonNumericKeywords,
      } as RouteResult;
    }
    // SQL 查不到数据（可能是该公司该年份未入库），继续尝试 raw_tables fallback
  }

  // 4b. 命中公司但指标未命中标准化 → SQL 查 financial_raw_tables（整表查询）
  if (company && indicators.length === 0) {
    // 用 query 关键词查 raw_tables（取 query 中除公司名外的关键词）
    const keyword = extractTableKeyword(query, company.stockNameShort);
    if (keyword) {
      const rawResult = await queryRawTables(
        company.stockCode,
        options.reportYear,
        keyword,
      );
      if (rawResult.length > 0) {
        return {
          intent: intent.intent,
          company,
          indicators,
          route: "sql_raw_tables",
          sqlResult: rawResult,
          matchedNumericKeywords: intent.matchedNumericKeywords,
          matchedNonNumericKeywords: intent.matchedNonNumericKeywords,
        } as RouteResult;
      }
    }
    // raw_tables 也查不到 → 向量 fallback
    return {
      intent: intent.intent,
      company,
      indicators,
      route: "vector",
      matchedNumericKeywords: intent.matchedNumericKeywords,
      matchedNonNumericKeywords: intent.matchedNonNumericKeywords,
    } as RouteResult;
  }

  // 4c. 未命中公司 → 向量检索 fallback（无法走 SQL，因为没有 stock_code）
  return {
    intent: intent.intent,
    company: company ?? undefined,
    indicators,
    route: "vector",
    matchedNumericKeywords: intent.matchedNumericKeywords,
    matchedNonNumericKeywords: intent.matchedNonNumericKeywords,
  } as RouteResult;
}

/**
 * 从 query 中提取用于 raw_tables 模糊匹配的关键词
 * 去掉公司名后，取剩余文本中长度>=2的关键词
 */
function extractTableKeyword(query: string, companyName: string): string {
  let text = query;
  // 去掉公司名
  if (companyName) {
    text = text.replace(companyName, "");
  }
  // 去掉常见非关键词
  text = text.replace(/(多少|是什么|是多少|请问|一下|呢|啊|的|了|吗|？|\?)/g, "");
  // 去掉年份
  text = text.replace(/20\d{2}年?/g, "");
  // 去掉空格
  text = text.trim();
  return text.length >= 2 ? text : "";
}
