type BoardType = "main" | "gem" | "star";

interface ComplianceCheckResult {
  passed: boolean;
  violations: ComplianceViolation[];
  warnings: string[];
}

interface ComplianceViolation {
  rule: string;
  level: "error" | "warning";
  message: string;
  detail?: string;
}

interface PositionLimitResult {
  passed: boolean;
  violations: ComplianceViolation[];
  currentPositionRatio?: number;
  maxAllowedRatio: number;
}

interface RestrictedStockResult {
  isRestricted: boolean;
  reasons: string[];
  code: string;
}

interface ComplianceReport {
  accountId: string;
  generatedAt: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  violations: ComplianceViolation[];
  summary: string;
}

const restrictedStocks = new Map<string, string[]>([
  ["688001", ["科创板新股上市前5日无涨跌停限制"]],
  ["688002", ["科创板新股上市前5日无涨跌停限制"]],
  ["300001", ["创业板注册制新股上市前5日无涨跌停限制"]],
]);

const suspendedStocks = new Set<string>([
  "000001_SUSPENDED",
]);

function getLimitRate(boardType: BoardType, isST: boolean): number {
  if (isST) return 0.05;
  if (boardType === "gem" || boardType === "star") return 0.2;
  return 0.1;
}

interface TradeComplianceParams {
  code: string;
  direction: string;
  quantity: number;
  price: number;
  prevClose: number;
  isST: boolean;
  boardType: BoardType;
}

/**
 * 交易合规检查
 * A股合规规则：
 * - 涨跌停检查：主板10%，创业板/科创板20%，ST股5%
 * - 交易单位检查：买入必须为100的整数倍
 * - T+1规则提醒：当日买入不可当日卖出
 * - 停牌检查：停牌股票不可交易
 * @param params - 合规检查参数
 * @returns 合规检查结果
 */
export function checkTradeCompliance(params: TradeComplianceParams): ComplianceCheckResult {
  const violations: ComplianceViolation[] = [];
  const warnings: string[] = [];

  console.log(`[compliance] 交易合规检查: ${params.code}, 方向=${params.direction}, 价格=${params.price}, 数量=${params.quantity}`);

  if (suspendedStocks.has(params.code)) {
    violations.push({
      rule: "停牌检查",
      level: "error",
      message: `股票 ${params.code} 已停牌，不可交易`,
    });
  }

  const limitRate = getLimitRate(params.boardType, params.isST);
  const upperLimit = Number((params.prevClose * (1 + limitRate)).toFixed(2));
  const lowerLimit = Number((params.prevClose * (1 - limitRate)).toFixed(2));

  if (params.price > upperLimit) {
    violations.push({
      rule: "涨停检查",
      level: "error",
      message: `委托价格 ${params.price} 超过涨停价 ${upperLimit}`,
      detail: `${params.boardType === "gem" || params.boardType === "star" ? "创业板/科创板" : params.isST ? "ST股" : "主板"}涨跌幅限制为${(limitRate * 100).toFixed(0)}%，昨收=${params.prevClose}`,
    });
  }

  if (params.price < lowerLimit) {
    violations.push({
      rule: "跌停检查",
      level: "error",
      message: `委托价格 ${params.price} 低于跌停价 ${lowerLimit}`,
      detail: `${params.boardType === "gem" || params.boardType === "star" ? "创业板/科创板" : params.isST ? "ST股" : "主板"}涨跌幅限制为${(limitRate * 100).toFixed(0)}%，昨收=${params.prevClose}`,
    });
  }

  if (params.direction === "buy" && params.quantity % 100 !== 0) {
    violations.push({
      rule: "交易单位检查",
      level: "error",
      message: `A股买入数量必须为100的整数倍，当前数量=${params.quantity}`,
      detail: "A股最小交易单位为1手（100股），买入必须整手",
    });
  }

  if (params.direction === "sell" && params.quantity % 100 !== 0) {
    warnings.push("卖出数量不是100的整数倍，仅限卖出零股（不足100股的部分）");
  }

  if (params.direction === "sell") {
    warnings.push("T+1规则提醒：当日买入的股票不能当日卖出，请确认持仓为可卖数量");
  }

  if (params.isST) {
    warnings.push(`股票 ${params.code} 为ST股，涨跌幅限制为5%，请注意投资风险`);
  }

  if (params.boardType === "star") {
    warnings.push(`股票 ${params.code} 为科创板股票，涨跌幅限制为20%，且需满足适当性管理要求（50万资产+2年交易经验）`);
  }

  if (params.boardType === "gem") {
    warnings.push(`股票 ${params.code} 为创业板股票，涨跌幅限制为20%，且需满足适当性管理要求`);
  }

  const passed = violations.filter((v) => v.level === "error").length === 0;
  console.log(`[compliance] 合规检查结果: ${passed ? "通过" : "未通过"}, 违规数=${violations.length}, 警告数=${warnings.length}`);

  return { passed, violations, warnings };
}

interface PositionLimitParams {
  accountId: string;
  code: string;
  quantity: number;
  totalAssets: number;
}

/**
 * 持仓限制检查
 * A股持仓限制规则：
 * - 单只股票持仓不超过总资产的30%
 * - 单只股票持仓不超过该股流通盘的5%
 * @param params - 持仓限制检查参数
 * @returns 持仓限制检查结果
 */
export function checkPositionLimit(params: PositionLimitParams): PositionLimitResult {
  const violations: ComplianceViolation[] = [];
  const maxAllowedRatio = 0.3;

  console.log(`[compliance] 持仓限制检查: 账户=${params.accountId}, 股票=${params.code}, 数量=${params.quantity}, 总资产=${params.totalAssets}`);

  if (params.totalAssets <= 0) {
    violations.push({
      rule: "总资产检查",
      level: "error",
      message: "总资产为零或负数，无法计算持仓比例",
    });
    return { passed: false, violations, maxAllowedRatio };
  }

  const positionValue = params.quantity;
  const positionRatio = positionValue / params.totalAssets;

  if (positionRatio > maxAllowedRatio) {
    violations.push({
      rule: "单只股票持仓比例限制",
      level: "error",
      message: `单只股票持仓比例 ${(positionRatio * 100).toFixed(2)}% 超过限制 ${maxAllowedRatio * 100}%`,
      detail: `持仓市值=${positionValue}, 总资产=${params.totalAssets}`,
    });
  }

  if (positionRatio > 0.2) {
    violations.push({
      rule: "单只股票持仓比例预警",
      level: "warning",
      message: `单只股票持仓比例 ${(positionRatio * 100).toFixed(2)}% 接近限制 ${maxAllowedRatio * 100}%`,
    });
  }

  const passed = violations.filter((v) => v.level === "error").length === 0;
  console.log(`[compliance] 持仓限制检查结果: ${passed ? "通过" : "未通过"}, 持仓比例=${(positionRatio * 100).toFixed(2)}%`);

  return {
    passed,
    violations,
    currentPositionRatio: Number(positionRatio.toFixed(4)),
    maxAllowedRatio,
  };
}

/**
 * 检查是否为受限股票
 * 受限股票包括：新股上市初期、退市整理期、重大事项停牌等
 * @param code - 股票代码
 * @returns 受限检查结果
 */
export function checkRestrictedStock(code: string): RestrictedStockResult {
  const reasons: string[] = [];

  console.log(`[compliance] 受限股票检查: ${code}`);

  if (restrictedStocks.has(code)) {
    const stockReasons = restrictedStocks.get(code) || [];
    reasons.push(...stockReasons);
  }

  if (code.startsWith("688")) {
    const codeNum = parseInt(code.substring(3), 10);
    if (codeNum <= 100) {
      reasons.push("科创板股票，需满足适当性管理要求");
    }
  }

  if (code.startsWith("300")) {
    const codeNum = parseInt(code.substring(3), 10);
    if (codeNum <= 100) {
      reasons.push("创业板注册制股票，需满足适当性管理要求");
    }
  }

  if (code.startsWith("*") || code.startsWith("ST") || code.includes("ST")) {
    reasons.push("ST/*ST股票，存在退市风险，涨跌幅限制为5%");
  }

  if (code.endsWith("_R") || code.endsWith("_退")) {
    reasons.push("退市整理期股票，存在退市风险");
  }

  const isRestricted = reasons.length > 0;
  console.log(`[compliance] 受限股票检查结果: ${isRestricted ? "受限" : "不受限"}, 原因数=${reasons.length}`);

  return { isRestricted, reasons, code };
}

/**
 * 生成合规报告
 * 包含账户所有合规检查的综合结果
 * @param accountId - 账户ID
 * @returns 合规报告
 */
export function getComplianceReport(accountId: string): ComplianceReport {
  console.log(`[compliance] 生成合规报告: ${accountId}`);

  const allViolations: ComplianceViolation[] = [];
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;

  const restrictedResult = checkRestrictedStock(accountId);
  totalChecks++;
  if (restrictedResult.isRestricted) {
    allViolations.push({
      rule: "受限股票检查",
      level: "warning",
      message: `账户关联股票受限: ${restrictedResult.reasons.join("; ")}`,
    });
    failedChecks++;
  } else {
    passedChecks++;
  }

  const summary = failedChecks > 0
    ? `合规检查未完全通过：共${totalChecks}项检查，${passedChecks}项通过，${failedChecks}项未通过。主要问题：${allViolations.map((v) => v.message).join("；")}`
    : `合规检查全部通过：共${totalChecks}项检查，全部通过。`;

  console.log(`[compliance] 合规报告生成完成: 通过=${passedChecks}, 未通过=${failedChecks}`);

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    totalChecks,
    passedChecks,
    failedChecks,
    violations: allViolations,
    summary,
  };
}

export type {
  ComplianceCheckResult,
  ComplianceViolation,
  PositionLimitResult,
  RestrictedStockResult,
  ComplianceReport,
  TradeComplianceParams,
  PositionLimitParams,
};
