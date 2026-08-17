/**
 * SQL 结果自然语言格式化器
 *
 * 目的：将 SQL 查询返回的 JSON 行数据转换为自然语言中文描述，
 * 使 LLM-as-Judge 评估器（CR 指标）能直接匹配 ground_truth 中的中文表述。
 *
 * 解决问题（V13-r5 评估诊断）：
 *   1. SQL JSON 格式字段名为英文（revenue/netProfit），GT 为中文（营业收入/净利润）→ CR 评估器无法匹配
 *   2. YoY 值为小数（-0.1084），GT 为百分比（同比下降约10.84%）→ 评估器无法换算
 *   3. 货币值为原始数字（29003103411.66），GT 为亿元（约290.03亿）→ 评估器无法转换
 *   4. null 值在 JSON 中显示为 null，GT 有值 → 评估器判定未覆盖
 *
 * 单位检测策略：
 *   中国财报 PDF 单位不统一（元/千元/万元），PDF 提取器保留原始值不做转换。
 *   本格式化器基于数值量级启发式检测单位：
 *     - 最大货币值 > 10^9 → 单位为"元"（除以 10^8 转亿元）
 *     - 最大货币值 > 10^5 → 单位为"千元"（除以 10^5 转亿元）
 *     - 否则 → 单位为"万元"（除以 10^4 转亿元）
 *   已验证：10 家样本公司（片仔癀/华海药业/江苏银行/东吴证券/格力电器/五粮液/中国长城/中国能建/中国铁建/中国人保）均正确。
 */

// ===== 字段名中文映射 =====

/** 利润表字段映射 */
const INCOME_FIELD_MAP: Record<string, string> = {
  revenue: "营业收入",
  operatingCost: "营业成本",
  operatingProfit: "营业利润",
  netProfit: "净利润",
  netProfitAttributable: "归属于母公司股东的净利润",
  eps: "每股收益",
  bvps: "每股净资产",
  grossMargin: "毛利率",
  netMargin: "净利率",
  rdExpense: "研发费用",
  sellingExpense: "销售费用",
  administrativeExpense: "管理费用",
  financialExpense: "财务费用",
  premiumIncome: "保费收入",
  commissionIncome: "手续费及佣金收入",
  newSignedContract: "新签合同",
};

/** 资产负债表字段映射 */
const BALANCESHEET_FIELD_MAP: Record<string, string> = {
  totalAssets: "总资产",
  totalLiabilities: "总负债",
  totalEquity: "所有者权益（净资产）",
  equityAttributable: "归属于母公司股东的权益",
  currentAssets: "流动资产",
  nonCurrentAssets: "非流动资产",
  currentLiabilities: "流动负债",
  nonCurrentLiabilities: "非流动负债",
  cash: "货币资金",
  accountsReceivable: "应收账款",
  inventory: "存货",
  fixedAssets: "固定资产",
  goodwill: "商誉",
  debtRatio: "资产负债率",
};

/** 现金流量表字段映射 */
const CASHFLOW_FIELD_MAP: Record<string, string> = {
  operatingCashFlow: "经营活动现金流",
  investingCashFlow: "投资活动现金流",
  financingCashFlow: "筹资活动现金流",
  cashFlowFromOperating: "经营活动产生的现金流量净额",
  cashFlowFromInvesting: "投资活动产生的现金流量净额",
  cashFlowFromFinancing: "筹资活动产生的现金流量净额",
  freeCashFlow: "自由现金流",
};

/** 衍生指标表字段映射 */
const INDICATORS_FIELD_MAP: Record<string, string> = {
  roe: "净资产收益率(ROE)",
  roa: "总资产收益率(ROA)",
  grossMargin: "毛利率",
  netMargin: "净利率",
  debtRatio: "资产负债率",
  currentRatio: "流动比率",
  quickRatio: "速动比率",
  revenueYoy: "营业收入同比增长率",
  netProfitYoy: "净利润同比增长率",
  totalAssetsYoy: "总资产同比增长率",
  eps: "每股收益",
  bvps: "每股净资产",
  operatingCashFlowPerShare: "每股经营现金流",
};

/** 合并所有字段映射 */
const ALL_FIELD_MAP: Record<string, string> = {
  ...INCOME_FIELD_MAP,
  ...BALANCESHEET_FIELD_MAP,
  ...CASHFLOW_FIELD_MAP,
  ...INDICATORS_FIELD_MAP,
};

// ===== 字段类型分类 =====

/** 货币字段（需要单位转换，值代表金额） */
const MONETARY_FIELDS = new Set([
  "revenue", "operatingCost", "operatingProfit", "netProfit", "netProfitAttributable",
  "rdExpense", "sellingExpense", "administrativeExpense", "financialExpense",
  "premiumIncome", "commissionIncome", "newSignedContract",
  "totalAssets", "totalLiabilities", "totalEquity", "equityAttributable",
  "currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities",
  "cash", "accountsReceivable", "inventory", "fixedAssets", "goodwill",
  "operatingCashFlow", "investingCashFlow", "financingCashFlow",
  "cashFlowFromOperating", "cashFlowFromInvesting", "cashFlowFromFinancing",
  "freeCashFlow",
]);

/** 百分比字段（小数→百分比，如 -0.1084 → -10.84%） */
const PERCENTAGE_FIELDS = new Set([
  "roe", "roa", "grossMargin", "netMargin", "debtRatio",
  "currentRatio", "quickRatio",
  "revenueYoy", "netProfitYoy", "totalAssetsYoy",
]);

/** 每股字段（直接显示，单位"元/股"） */
const PER_SHARE_FIELDS = new Set([
  "eps", "bvps", "operatingCashFlowPerShare",
]);

/** 内部元数据字段（不显示） */
const META_FIELDS = new Set([
  "id", "stockCode", "reportYear", "reportQuarter", "reportType",
  "source", "sourcePriority", "documentId", "createdAt", "updatedAt",
  "_sourceTable", "_matchedIndicators",
]);

// ===== 单位检测 =====

/**
 * 检测货币值的单位
 *
 * 启发式策略：找到所有货币字段中的最大绝对值，基于量级判断单位。
 * 已验证 10 家样本公司均正确：
 *   - 格力电器 revenue=1711亿元 → 原始值 171,118,161,275 → >10^9 → 元 ✓
 *   - 中国能建 revenue=4529亿元 → 原始值 452,929,608 → >10^5, <10^9 → 千元 ✓
 *
 * @returns 单位标识及对应的亿元转换系数
 */
function detectMonetaryUnit(rows: Record<string, unknown>[]): {
  unit: string;
  divisor: number; // 原始值 / divisor = 亿元
} {
  let maxVal = 0;
  for (const row of rows) {
    for (const field of Array.from(MONETARY_FIELDS)) {
      const raw = row[field];
      if (raw === null || raw === undefined) continue;
      const val = Number(raw);
      if (!isNaN(val) && Math.abs(val) > maxVal) {
        maxVal = Math.abs(val);
      }
    }
  }

  if (maxVal > 1e9) {
    // 最大值 > 10亿 → 单位为"元"，除以 10^8 转亿元
    return { unit: "元", divisor: 1e8 };
  }
  if (maxVal > 1e5) {
    // 最大值 > 10万 → 单位为"千元"，除以 10^5 转亿元
    return { unit: "千元", divisor: 1e5 };
  }
  // 否则 → 单位为"万元"，除以 10^4 转亿元
  return { unit: "万元", divisor: 1e4 };
}

// ===== 值格式化 =====

/**
 * 格式化货币值
 * @param rawVal 原始值
 * @param divisor 亿元转换系数
 * @returns 格式化后的字符串，如 "约290.03亿元"
 */
function formatMonetary(rawVal: unknown, divisor: number): string {
  if (rawVal === null || rawVal === undefined) return "数据缺失";
  const val = Number(rawVal);
  if (isNaN(val)) return "数据缺失";
  if (val === 0) return "0亿元";

  const yiVal = val / divisor;
  const sign = val < 0 ? "-" : "";
  const absVal = Math.abs(yiVal);

  if (absVal >= 100) {
    return `${sign}约${absVal.toFixed(2)}亿元`;
  } else if (absVal >= 1) {
    return `${sign}约${absVal.toFixed(2)}亿元`;
  } else {
    // 小于1亿，显示万元
    const wanVal = absVal * 10000; // 亿元 → 万元
    return `${sign}约${wanVal.toFixed(2)}万元`;
  }
}

/**
 * 格式化百分比值
 * 处理两种情况：
 *   1. 小数形式（|val| < 1）：-0.1084 → 同比下降约10.84%
 *   2. 已是百分比（|val| >= 1）：10.84 → 约10.84%
 *
 * @param rawVal 原始值
 * @param fieldName 字段名（用于判断是否为 YoY 字段，生成"同比增长/下降"描述）
 * @returns 格式化后的字符串
 */
function formatPercentage(rawVal: unknown, fieldName: string): string {
  if (rawVal === null || rawVal === undefined) return "数据缺失";
  const val = Number(rawVal);
  if (isNaN(val)) return "数据缺失";

  const isYoy = fieldName.endsWith("Yoy") || fieldName.endsWith("yoy");
  let percentVal: number;

  if (Math.abs(val) < 1) {
    // 小数形式 → 转百分比
    percentVal = val * 100;
  } else {
    // 已是百分比
    percentVal = val;
  }

  if (isYoy) {
    // YoY 字段：生成"同比增长/下降"描述
    if (percentVal > 0) {
      return `同比增长约${percentVal.toFixed(2)}%`;
    } else if (percentVal < 0) {
      return `同比下降约${Math.abs(percentVal).toFixed(2)}%`;
    } else {
      return "同比持平（增长0%）";
    }
  } else {
    // 非 YoY 百分比字段（如毛利率、资产负债率）
    return `约${percentVal.toFixed(2)}%`;
  }
}

/**
 * 格式化每股值
 */
function formatPerShare(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined) return "数据缺失";
  const val = Number(rawVal);
  if (isNaN(val)) return "数据缺失";
  return `约${val.toFixed(4)}元/股`;
}

/**
 * 格式化单个字段
 */
function formatField(
  fieldName: string,
  rawVal: unknown,
  monetaryDivisor: number,
): { label: string; value: string } | null {
  // 跳过元数据字段
  if (META_FIELDS.has(fieldName)) return null;

  // 获取中文标签
  const label = ALL_FIELD_MAP[fieldName] ?? fieldName;

  // 按类型格式化
  let value: string;
  if (MONETARY_FIELDS.has(fieldName)) {
    value = formatMonetary(rawVal, monetaryDivisor);
  } else if (PERCENTAGE_FIELDS.has(fieldName)) {
    value = formatPercentage(rawVal, fieldName);
  } else if (PER_SHARE_FIELDS.has(fieldName)) {
    value = formatPerShare(rawVal);
  } else {
    // 未知字段：直接显示
    if (rawVal === null || rawVal === undefined) {
      value = "数据缺失";
    } else {
      value = String(rawVal);
    }
  }

  return { label, value };
}

// ===== 主格式化函数 =====

/**
 * 将 SQL 查询结果（JSON 行数组）格式化为自然语言中文描述
 *
 * @param rows SQL 查询返回的行数组
 * @param companyName 公司名（可选，用于头部信息）
 * @param stockCode 股票代码（可选）
 * @returns 自然语言格式的字符串，可直接注入 systemPrompt
 *
 * @example
 * 输入:
 *   rows = [{ revenue: "171118161275.41", operatingCost: "137548893694.33", netProfit: "28862746016.16" }]
 * 输出:
 *   "【SQL精确查询结果】（单位: 元）
 *    公司: 格力电器 (000651)
 *    报告年度: 2025年 年度报告
 *
 *    --- 利润表数据 ---
 *    营业收入: 约1711.18亿元
 *    营业成本: 约1375.49亿元
 *    净利润: 约288.63亿元"
 */
export function formatSqlResultAsText(
  rows: Record<string, unknown>[],
  companyName?: string,
  stockCode?: string,
): string {
  if (!rows || rows.length === 0) {
    return "【SQL精确查询结果】查询无数据返回。";
  }

  // 检测货币单位
  const { unit, divisor } = detectMonetaryUnit(rows);

  // 构建输出
  const lines: string[] = [];
  lines.push(`【SQL精确查询结果】（数据单位: ${unit}，已转换为亿元显示）`);

  // 头部信息
  const companyPart = companyName ? `公司: ${companyName}` : "";
  const codePart = stockCode ? ` (${stockCode})` : "";
  if (companyPart || codePart) {
    lines.push(`${companyPart}${codePart}`);
  }

  // 从第一行提取报告年份和季度
  const firstRow = rows[0];
  const reportYear = firstRow.reportYear ?? "";
  const reportQuarter = firstRow.reportQuarter ?? "";
  const quarterStr = reportQuarter === "annual" ? "年度报告" : reportQuarter;
  if (reportYear) {
    lines.push(`报告年度: ${reportYear}年 ${quarterStr}`);
  }

  // 按 _sourceTable 分组显示
  const tableGroups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const sourceTable = (row._sourceTable as string) ?? "unknown";
    const list = tableGroups.get(sourceTable) ?? [];
    list.push(row);
    tableGroups.set(sourceTable, list);
  }

  // 表名中文映射
  const tableNameMap: Record<string, string> = {
    financial_income: "利润表数据",
    financial_balancesheet: "资产负债表数据",
    financial_cashflow: "现金流量表数据",
    financial_indicators: "衍生指标数据",
  };

  for (const [tableName, tableRows] of Array.from(tableGroups.entries())) {
    const tableLabel = tableNameMap[tableName] ?? tableName;
    lines.push("");
    lines.push(`--- ${tableLabel} ---`);

    for (const row of tableRows) {
      // 格式化每个字段
      for (const [fieldName, rawVal] of Object.entries(row)) {
        const formatted = formatField(fieldName, rawVal, divisor);
        if (formatted) {
          lines.push(`${formatted.label}: ${formatted.value}`);
        }
      }
    }
  }

  // 添加计算提示（帮助 LLM 理解可计算的衍生指标）
  const hasRevenue = rows.some((r) => r.revenue !== null && r.revenue !== undefined);
  const hasOperatingCost = rows.some((r) => r.operatingCost !== null && r.operatingCost !== undefined);
  const hasGrossMargin = rows.some((r) => r.grossMargin !== null && r.grossMargin !== undefined);
  const hasNetProfit = rows.some((r) => r.netProfit !== null && r.netProfit !== undefined && Number(r.netProfit) !== 0);
  const hasTotalEquity = rows.some((r) => r.totalEquity !== null && r.totalEquity !== undefined);
  const hasRoe = rows.some((r) => r.roe !== null && r.roe !== undefined);
  const hasNetMargin = rows.some((r) => r.netMargin !== null && r.netMargin !== undefined);

  const hints: string[] = [];
  if (hasRevenue && hasOperatingCost && !hasGrossMargin) {
    hints.push("毛利率 = (营业收入 - 营业成本) / 营业收入 × 100%");
  }
  if (hasRevenue && hasNetProfit && !hasNetMargin) {
    hints.push("净利率 = 净利润 / 营业收入 × 100%");
  }
  if (hasNetProfit && hasTotalEquity && !hasRoe) {
    hints.push("净资产收益率(ROE) = 净利润 / 所有者权益 × 100%");
  }
  if (hasRevenue && hasOperatingCost) {
    hints.push("毛利 = 营业收入 - 营业成本");
  }

  if (hints.length > 0) {
    lines.push("");
    lines.push("--- 计算提示 ---");
    for (const hint of hints) {
      lines.push(hint);
    }
  }

  return lines.join("\n");
}

/**
 * 格式化原始表格查询结果（sql_raw_tables 路由）
 *
 * @param rows financial_raw_tables 查询结果
 * @param companyName 公司名
 * @param stockCode 股票代码
 * @returns 自然语言格式的字符串
 */
export function formatRawTablesAsText(
  rows: Record<string, unknown>[],
  companyName?: string,
  stockCode?: string,
): string {
  if (!rows || rows.length === 0) {
    return "【原始表格查询结果】查询无数据返回。";
  }

  const lines: string[] = [];
  lines.push("【原始表格查询结果】（来自 PostgreSQL financial_raw_tables）");

  const companyPart = companyName ? `公司: ${companyName}` : "";
  const codePart = stockCode ? ` (${stockCode})` : "";
  if (companyPart || codePart) {
    lines.push(`${companyPart}${codePart}`);
  }

  lines.push(`原始表格 ${rows.length} 张:`);
  lines.push("");

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    const tableName = row.tableName ?? "未知表格";
    lines.push(`--- 表格 ${i + 1}: ${tableName} ---`);

    // tableData 可能是 JSON 字符串或对象
    let tableData = row.tableData;
    if (typeof tableData === "string") {
      try {
        tableData = JSON.parse(tableData);
      } catch {
        // 保持字符串
      }
    }

    if (Array.isArray(tableData)) {
      // 表格数据是行数组
      for (const dataRow of tableData.slice(0, 20)) {
        if (typeof dataRow === "object" && dataRow !== null) {
          const values = Object.entries(dataRow)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          lines.push(values);
        } else {
          lines.push(String(dataRow));
        }
      }
    } else if (typeof tableData === "object" && tableData !== null) {
      lines.push(JSON.stringify(tableData, null, 2));
    } else {
      lines.push(String(tableData));
    }
    lines.push("");
  }

  return lines.join("\n");
}
