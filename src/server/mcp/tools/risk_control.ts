interface VaRParams {
  returns: number[];
  confidence: number;
  horizon: number;
}

interface VaRResult {
  success: boolean;
  historicalVaR?: number;
  parametricVaR?: number;
  confidence: number;
  horizon: number;
  error?: string;
}

interface StressScenario {
  name: string;
  priceChange: number;
  volumeChange?: number;
}

interface StressTestParams {
  portfolio: Record<string, { quantity: number; currentPrice: number }>;
  scenarios: StressScenario[];
}

interface StressTestResult {
  success: boolean;
  results: {
    scenario: string;
    portfolioValue: number;
    loss: number;
    lossPercent: number;
  }[];
  worstScenario?: string;
  maxLoss?: number;
  error?: string;
}

interface DrawdownMonitorResult {
  success: boolean;
  currentDrawdown: number;
  threshold: number;
  breached: boolean;
  message: string;
  error?: string;
}

interface RiskLimitCheckResult {
  success: boolean;
  accountId: string;
  checks: {
    rule: string;
    limit: number;
    actual: number;
    passed: boolean;
    message: string;
  }[];
  allPassed: boolean;
  error?: string;
}

interface RiskReport {
  accountId: string;
  generatedAt: string;
  var?: number;
  maxDrawdown?: number;
  riskLimitChecks: RiskLimitCheckResult;
  summary: string;
}

interface AccountSnapshot {
  accountId: string;
  initialValue: number;
  currentValue: number;
  dailyReturns: number[];
  peakValue: number;
  lastUpdated: string;
}

const accountSnapshots = new Map<string, AccountSnapshot>();

function getAccountSnapshot(accountId: string): AccountSnapshot | undefined {
  return accountSnapshots.get(accountId);
}

/**
 * 计算VaR（在险价值）
 * 支持历史模拟法和参数法两种计算方式
 * - 历史模拟法：基于历史收益率的分位数
 * - 参数法：假设收益率正态分布，使用均值和标准差计算
 * @param params - VaR计算参数
 * @param params.returns - 收益率序列
 * @param params.confidence - 置信水平（如0.95、0.99）
 * @param params.horizon - 持有期（天数）
 * @returns VaR计算结果
 */
export function calculateVaR(params: VaRParams): VaRResult {
  const { returns, confidence, horizon } = params;

  console.log(`[risk_control] 计算VaR: 数据长度=${returns.length}, 置信度=${confidence}, 持有期=${horizon}`);

  if (returns.length < 10) {
    console.error("[risk_control] calculateVaR: 至少需要10个收益率数据");
    return { success: false, confidence, horizon, error: "至少需要10个收益率数据" };
  }

  if (confidence <= 0 || confidence >= 1) {
    console.error("[risk_control] calculateVaR: 置信度必须在0和1之间");
    return { success: false, confidence, horizon, error: "置信度必须在0和1之间" };
  }

  if (horizon <= 0) {
    console.error("[risk_control] calculateVaR: 持有期必须大于0");
    return { success: false, confidence, horizon, error: "持有期必须大于0" };
  }

  const sortedReturns = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sortedReturns.length);
  const historicalVaR = Number((-sortedReturns[index] * Math.sqrt(horizon)).toFixed(6));

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  let variance = 0;
  for (const r of returns) {
    variance += (r - mean) ** 2;
  }
  variance /= returns.length - 1;
  const stdDev = Math.sqrt(variance);

  const zScores: Record<number, number> = {
    0.90: 1.2816,
    0.95: 1.6449,
    0.975: 1.96,
    0.99: 2.3263,
    0.999: 3.0902,
  };

  const zScore = zScores[confidence] || 1.6449;
  const parametricVaR = Number((-(mean - zScore * stdDev) * Math.sqrt(horizon)).toFixed(6));

  console.log(`[risk_control] VaR计算完成: 历史法=${historicalVaR}, 参数法=${parametricVaR}`);

  return {
    success: true,
    historicalVaR,
    parametricVaR,
    confidence,
    horizon,
  };
}

/**
 * 压力测试
 * 在不同市场情景下评估投资组合的潜在损失
 * @param params - 压力测试参数
 * @param params.portfolio - 投资组合（股票代码 -> {数量, 当前价格}）
 * @param params.scenarios - 压力情景列表
 * @returns 压力测试结果
 */
export function calculateStressTest(params: StressTestParams): StressTestResult {
  const { portfolio, scenarios } = params;

  console.log(`[risk_control] 压力测试: 持仓数=${Object.keys(portfolio).length}, 情景数=${scenarios.length}`);

  if (Object.keys(portfolio).length === 0) {
    console.error("[risk_control] calculateStressTest: 投资组合为空");
    return { success: false, results: [], error: "投资组合为空" };
  }

  if (scenarios.length === 0) {
    console.error("[risk_control] calculateStressTest: 未提供压力情景");
    return { success: false, results: [], error: "未提供压力情景" };
  }

  let basePortfolioValue = 0;
  for (const holding of Object.values(portfolio)) {
    basePortfolioValue += holding.quantity * holding.currentPrice;
  }

  if (basePortfolioValue === 0) {
    console.error("[risk_control] calculateStressTest: 组合价值为零");
    return { success: false, results: [], error: "组合价值为零" };
  }

  const results = scenarios.map((scenario) => {
    let scenarioValue = 0;
    for (const holding of Object.values(portfolio)) {
      const stressedPrice = holding.currentPrice * (1 + scenario.priceChange);
      scenarioValue += holding.quantity * Math.max(stressedPrice, 0);
    }

    const loss = basePortfolioValue - scenarioValue;
    const lossPercent = Number(((loss / basePortfolioValue) * 100).toFixed(4));

    return {
      scenario: scenario.name,
      portfolioValue: Number(scenarioValue.toFixed(2)),
      loss: Number(loss.toFixed(2)),
      lossPercent,
    };
  });

  let worstScenario = "";
  let maxLoss = -Infinity;
  for (const r of results) {
    if (r.loss > maxLoss) {
      maxLoss = r.loss;
      worstScenario = r.scenario;
    }
  }

  console.log(`[risk_control] 压力测试完成: 最差情景=${worstScenario}, 最大损失=${maxLoss}`);

  return {
    success: true,
    results,
    worstScenario,
    maxLoss: Number(maxLoss.toFixed(2)),
  };
}

/**
 * 回撤监控
 * 监控账户回撤是否超过阈值，超过则触发预警
 * @param params - 回撤监控参数
 * @param params.accountId - 账户ID
 * @param params.threshold - 回撤阈值（如0.1表示10%）
 * @returns 回撤监控结果
 */
export function monitorDrawdown(params: { accountId: string; threshold: number }): DrawdownMonitorResult {
  const { accountId, threshold } = params;

  console.log(`[risk_control] 回撤监控: 账户=${accountId}, 阈值=${(threshold * 100).toFixed(1)}%`);

  const snapshot = getAccountSnapshot(accountId);
  if (!snapshot) {
    console.error(`[risk_control] monitorDrawdown: 账户快照不存在: ${accountId}`);
    return {
      success: false,
      currentDrawdown: 0,
      threshold,
      breached: false,
      message: `账户快照不存在: ${accountId}`,
      error: "账户快照不存在",
    };
  }

  const currentDrawdown = snapshot.peakValue > 0
    ? (snapshot.peakValue - snapshot.currentValue) / snapshot.peakValue
    : 0;

  const breached = currentDrawdown >= threshold;
  const message = breached
    ? `回撤预警！当前回撤 ${(currentDrawdown * 100).toFixed(2)}% 已超过阈值 ${(threshold * 100).toFixed(2)}%`
    : `回撤正常: 当前回撤 ${(currentDrawdown * 100).toFixed(2)}%, 阈值 ${(threshold * 100).toFixed(2)}%`;

  if (breached) {
    console.error(`[risk_control] ${message}`);
  } else {
    console.log(`[risk_control] ${message}`);
  }

  return {
    success: true,
    currentDrawdown: Number(currentDrawdown.toFixed(6)),
    threshold,
    breached,
    message,
  };
}

/**
 * 风险限额检查
 * A股风控规则：
 * - 单日亏损不超过2%
 * - 单周亏损不超过5%
 * - 单月亏损不超过10%
 * @param params - 风险限额检查参数
 * @param params.accountId - 账户ID
 * @returns 风险限额检查结果
 */
export function checkRiskLimits(params: { accountId: string }): RiskLimitCheckResult {
  const { accountId } = params;

  console.log(`[risk_control] 风险限额检查: 账户=${accountId}`);

  const snapshot = getAccountSnapshot(accountId);
  if (!snapshot) {
    console.error(`[risk_control] checkRiskLimits: 账户快照不存在: ${accountId}`);
    return {
      success: false,
      accountId,
      checks: [],
      allPassed: false,
      error: "账户快照不存在",
    };
  }

  const checks: {
    rule: string;
    limit: number;
    actual: number;
    passed: boolean;
    message: string;
  }[] = [];

  if (snapshot.dailyReturns.length >= 1) {
    const lastDayReturn = snapshot.dailyReturns[snapshot.dailyReturns.length - 1];
    const dailyLoss = Math.abs(Math.min(lastDayReturn, 0));
    checks.push({
      rule: "单日亏损限制",
      limit: 0.02,
      actual: Number(dailyLoss.toFixed(6)),
      passed: dailyLoss <= 0.02,
      message: dailyLoss <= 0.02
        ? `单日亏损 ${(dailyLoss * 100).toFixed(2)}% 在限额 2% 内`
        : `单日亏损 ${(dailyLoss * 100).toFixed(2)}% 超过限额 2%`,
    });
  }

  if (snapshot.dailyReturns.length >= 5) {
    const last5Returns = snapshot.dailyReturns.slice(-5);
    const weeklyReturn = last5Returns.reduce((sum, r) => sum + r, 0);
    const weeklyLoss = Math.abs(Math.min(weeklyReturn, 0));
    checks.push({
      rule: "单周亏损限制",
      limit: 0.05,
      actual: Number(weeklyLoss.toFixed(6)),
      passed: weeklyLoss <= 0.05,
      message: weeklyLoss <= 0.05
        ? `单周亏损 ${(weeklyLoss * 100).toFixed(2)}% 在限额 5% 内`
        : `单周亏损 ${(weeklyLoss * 100).toFixed(2)}% 超过限额 5%`,
    });
  }

  if (snapshot.dailyReturns.length >= 22) {
    const last22Returns = snapshot.dailyReturns.slice(-22);
    const monthlyReturn = last22Returns.reduce((sum, r) => sum + r, 0);
    const monthlyLoss = Math.abs(Math.min(monthlyReturn, 0));
    checks.push({
      rule: "单月亏损限制",
      limit: 0.10,
      actual: Number(monthlyLoss.toFixed(6)),
      passed: monthlyLoss <= 0.10,
      message: monthlyLoss <= 0.10
        ? `单月亏损 ${(monthlyLoss * 100).toFixed(2)}% 在限额 10% 内`
        : `单月亏损 ${(monthlyLoss * 100).toFixed(2)}% 超过限额 10%`,
    });
  }

  const allPassed = checks.every((c) => c.passed);
  console.log(`[risk_control] 风险限额检查完成: ${allPassed ? "全部通过" : "存在违规"}, 检查项=${checks.length}`);

  return {
    success: true,
    accountId,
    checks,
    allPassed,
  };
}

/**
 * 生成风控报告
 * 综合VaR、回撤、风险限额等信息，生成完整的风控报告
 * @param accountId - 账户ID
 * @returns 风控报告
 */
export function generateRiskReport(accountId: string): RiskReport {
  console.log(`[risk_control] 生成风控报告: ${accountId}`);

  const snapshot = getAccountSnapshot(accountId);

  let varValue: number | undefined;
  if (snapshot && snapshot.dailyReturns.length >= 10) {
    const varResult = calculateVaR({
      returns: snapshot.dailyReturns,
      confidence: 0.95,
      horizon: 1,
    });
    if (varResult.success) {
      varValue = varResult.parametricVaR;
    }
  }

  let maxDrawdown: number | undefined;
  if (snapshot) {
    const peak = snapshot.peakValue;
    const current = snapshot.currentValue;
    if (peak > 0) {
      maxDrawdown = Number(((peak - current) / peak).toFixed(6));
    }
  }

  const riskLimitChecks = checkRiskLimits({ accountId });

  const summaryParts: string[] = [];
  if (varValue !== undefined) {
    summaryParts.push(`VaR(95%,1日)=${(varValue * 100).toFixed(2)}%`);
  }
  if (maxDrawdown !== undefined) {
    summaryParts.push(`最大回撤=${(maxDrawdown * 100).toFixed(2)}%`);
  }
  summaryParts.push(`风险限额检查=${riskLimitChecks.allPassed ? "全部通过" : "存在违规"}`);

  const summary = `风控报告摘要: ${summaryParts.join("；")}`;

  console.log(`[risk_control] 风控报告生成完成: ${summary}`);

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    var: varValue,
    maxDrawdown,
    riskLimitChecks,
    summary,
  };
}

/**
 * 更新账户快照（用于风控监控）
 * @param accountId - 账户ID
 * @param currentValue - 当前资产价值
 */
export function updateAccountSnapshot(accountId: string, currentValue: number): void {
  const existing = accountSnapshots.get(accountId);
  const now = new Date().toISOString();

  if (existing) {
    const dailyReturn = existing.currentValue > 0
      ? (currentValue - existing.currentValue) / existing.currentValue
      : 0;

    existing.dailyReturns.push(dailyReturn);
    existing.currentValue = currentValue;
    existing.peakValue = Math.max(existing.peakValue, currentValue);
    existing.lastUpdated = now;
  } else {
    accountSnapshots.set(accountId, {
      accountId,
      initialValue: currentValue,
      currentValue,
      dailyReturns: [],
      peakValue: currentValue,
      lastUpdated: now,
    });
  }

  console.log(`[risk_control] 更新账户快照: ${accountId}, 当前价值=${currentValue}`);
}

export type {
  VaRParams,
  VaRResult,
  StressScenario,
  StressTestParams,
  StressTestResult,
  DrawdownMonitorResult,
  RiskLimitCheckResult,
  RiskReport,
  AccountSnapshot,
};
