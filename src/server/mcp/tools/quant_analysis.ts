interface MAResult {
  values: (number | null)[];
  period: number;
}

/**
 * 计算移动平均线（MA）
 * @param data - 输入数据序列（如收盘价数组）
 * @param period - 移动平均周期
 * @returns MA结果，前 period-1 个值为 null
 */
export function calculateMA(data: number[], period: number): MAResult {
  if (period <= 0) {
    console.error("[quant_analysis] calculateMA: period必须大于0");
    return { values: [], period };
  }
  if (data.length < period) {
    console.error(`[quant_analysis] calculateMA: 数据长度${data.length}小于周期${period}`);
    return { values: data.map(() => null), period };
  }

  const values: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      values.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      values.push(Number((sum / period).toFixed(4)));
    }
  }

  console.log(`[quant_analysis] calculateMA: 周期=${period}, 数据长度=${data.length}`);
  return { values, period };
}

interface MACDResult {
  dif: (number | null)[];
  dea: (number | null)[];
  macd: (number | null)[];
  fast: number;
  slow: number;
  signal: number;
}

/**
 * 计算MACD指标
 * @param data - 输入数据序列（如收盘价数组）
 * @param fast - 快线周期（默认12）
 * @param slow - 慢线周期（默认26）
 * @param signal - 信号线周期（默认9）
 * @returns MACD结果，包含DIF、DEA、MACD柱状图
 */
export function calculateMACD(
  data: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): MACDResult {
  if (data.length < slow) {
    console.error(`[quant_analysis] calculateMACD: 数据长度${data.length}不足慢线周期${slow}`);
    return {
      dif: data.map(() => null),
      dea: data.map(() => null),
      macd: data.map(() => null),
      fast,
      slow,
      signal,
    };
  }

  function ema(values: number[], period: number): number[] {
    const result: number[] = [];
    const k = 2 / (period + 1);
    result.push(values[0]);
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  const emaFast = ema(data, fast);
  const emaSlow = ema(data, slow);

  const dif: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dif.push(Number((emaFast[i] - emaSlow[i]).toFixed(4)));
  }

  const deaFull = ema(dif, signal);

  const macd: number[] = [];
  for (let i = 0; i < data.length; i++) {
    macd.push(Number((2 * (dif[i] - deaFull[i])).toFixed(4)));
  }

  const difResult: (number | null)[] = dif.map((v) => v);
  const deaResult: (number | null)[] = deaFull.map((v) => v);
  const macdResult: (number | null)[] = macd.map((v) => v);

  for (let i = 0; i < slow - 1; i++) {
    difResult[i] = null;
    deaResult[i] = null;
    macdResult[i] = null;
  }

  console.log(`[quant_analysis] calculateMACD: fast=${fast}, slow=${slow}, signal=${signal}, 数据长度=${data.length}`);
  return { dif: difResult, dea: deaResult, macd: macdResult, fast, slow, signal };
}

interface RSIResult {
  values: (number | null)[];
  period: number;
}

/**
 * 计算RSI指标（相对强弱指数）
 * @param data - 输入数据序列（如收盘价数组）
 * @param period - RSI周期（默认14）
 * @returns RSI值数组，前 period 个值为 null
 */
export function calculateRSI(data: number[], period: number = 14): RSIResult {
  if (data.length < period + 1) {
    console.error(`[quant_analysis] calculateRSI: 数据长度${data.length}不足，需要至少${period + 1}个数据点`);
    return { values: data.map(() => null), period };
  }

  const values: (number | null)[] = new Array(period).fill(null);

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    values.push(100);
  } else {
    const rs = avgGain / avgLoss;
    values.push(Number((100 - 100 / (1 + rs)).toFixed(4)));
  }

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      values.push(100);
    } else {
      const rs = avgGain / avgLoss;
      values.push(Number((100 - 100 / (1 + rs)).toFixed(4)));
    }
  }

  console.log(`[quant_analysis] calculateRSI: period=${period}, 数据长度=${data.length}`);
  return { values, period };
}

interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  period: number;
  stdDev: number;
}

/**
 * 计算布林带指标
 * @param data - 输入数据序列（如收盘价数组）
 * @param period - 移动平均周期（默认20）
 * @param stdDev - 标准差倍数（默认2）
 * @returns 布林带结果，包含上轨、中轨、下轨
 */
export function calculateBollinger(
  data: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerResult {
  if (data.length < period) {
    console.error(`[quant_analysis] calculateBollinger: 数据长度${data.length}小于周期${period}`);
    return {
      upper: data.map(() => null),
      middle: data.map(() => null),
      lower: data.map(() => null),
      period,
      stdDev,
    };
  }

  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      const avg = sum / period;

      let variance = 0;
      for (let j = i - period + 1; j <= i; j++) {
        variance += (data[j] - avg) ** 2;
      }
      const sd = Math.sqrt(variance / period);

      middle.push(Number(avg.toFixed(4)));
      upper.push(Number((avg + stdDev * sd).toFixed(4)));
      lower.push(Number((avg - stdDev * sd).toFixed(4)));
    }
  }

  console.log(`[quant_analysis] calculateBollinger: period=${period}, stdDev=${stdDev}, 数据长度=${data.length}`);
  return { upper, middle, lower, period, stdDev };
}

interface KDJResult {
  k: (number | null)[];
  d: (number | null)[];
  j: (number | null)[];
  period: number;
}

/**
 * 计算KDJ指标
 * @param highs - 最高价数组
 * @param lows - 最低价数组
 * @param closes - 收盘价数组
 * @param period - KDJ周期（默认9）
 * @returns KDJ结果，包含K值、D值、J值
 */
export function calculateKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 9
): KDJResult {
  if (highs.length !== lows.length || lows.length !== closes.length) {
    console.error("[quant_analysis] calculateKDJ: 高低收数组长度不一致");
    return {
      k: [],
      d: [],
      j: [],
      period,
    };
  }

  if (highs.length < period) {
    console.error(`[quant_analysis] calculateKDJ: 数据长度${highs.length}小于周期${period}`);
    return {
      k: highs.map(() => null),
      d: highs.map(() => null),
      j: highs.map(() => null),
      period,
    };
  }

  const kValues: (number | null)[] = [];
  const dValues: (number | null)[] = [];
  const jValues: (number | null)[] = [];

  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      kValues.push(null);
      dValues.push(null);
      jValues.push(null);
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (highs[j] > highestHigh) highestHigh = highs[j];
        if (lows[j] < lowestLow) lowestLow = lows[j];
      }

      const range = highestHigh - lowestLow;
      let rsv: number;
      if (range === 0) {
        rsv = 50;
      } else {
        rsv = ((closes[i] - lowestLow) / range) * 100;
      }

      const k = (2 / 3) * prevK + (1 / 3) * rsv;
      const d = (2 / 3) * prevD + (1 / 3) * k;
      const j = 3 * k - 2 * d;

      kValues.push(Number(k.toFixed(4)));
      dValues.push(Number(d.toFixed(4)));
      jValues.push(Number(j.toFixed(4)));

      prevK = k;
      prevD = d;
    }
  }

  console.log(`[quant_analysis] calculateKDJ: period=${period}, 数据长度=${closes.length}`);
  return { k: kValues, d: dValues, j: jValues, period };
}

/**
 * 计算VWAP（成交量加权平均价）
 * @param closes - 收盘价数组
 * @param volumes - 成交量数组
 * @returns VWAP值
 */
export function calculateVWAP(closes: number[], volumes: number[]): number {
  if (closes.length !== volumes.length) {
    console.error("[quant_analysis] calculateVWAP: 价格和成交量数组长度不一致");
    return 0;
  }

  if (closes.length === 0) {
    console.error("[quant_analysis] calculateVWAP: 数据为空");
    return 0;
  }

  let totalValue = 0;
  let totalVolume = 0;

  for (let i = 0; i < closes.length; i++) {
    totalValue += closes[i] * volumes[i];
    totalVolume += volumes[i];
  }

  if (totalVolume === 0) {
    console.error("[quant_analysis] calculateVWAP: 总成交量为0");
    return 0;
  }

  const vwap = Number((totalValue / totalVolume).toFixed(4));
  console.log(`[quant_analysis] calculateVWAP: 数据长度=${closes.length}, VWAP=${vwap}`);
  return vwap;
}

/**
 * 计算夏普比率
 * @param returns - 收益率序列
 * @param riskFreeRate - 无风险利率（年化，默认0.03）
 * @returns 夏普比率值
 */
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.03): number {
  if (returns.length < 2) {
    console.error("[quant_analysis] calculateSharpeRatio: 至少需要2个收益率数据");
    return 0;
  }

  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const dailyRiskFree = riskFreeRate / 252;

  const excessReturns = returns.map((r) => r - dailyRiskFree);
  const meanExcess = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;

  let variance = 0;
  for (const r of excessReturns) {
    variance += (r - meanExcess) ** 2;
  }
  variance /= returns.length - 1;

  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    console.error("[quant_analysis] calculateSharpeRatio: 标准差为0");
    return 0;
  }

  const sharpe = Number(((meanExcess / stdDev) * Math.sqrt(252)).toFixed(4));
  console.log(`[quant_analysis] calculateSharpeRatio: 年化夏普=${sharpe}, 无风险利率=${riskFreeRate}`);
  return sharpe;
}

interface MaxDrawdownResult {
  maxDrawdown: number;
  peakIndex: number;
  troughIndex: number;
}

/**
 * 计算最大回撤
 * @param values - 资产净值序列
 * @returns 最大回撤结果，包含最大回撤比例、峰值索引、谷值索引
 */
export function calculateMaxDrawdown(values: number[]): MaxDrawdownResult {
  if (values.length < 2) {
    console.error("[quant_analysis] calculateMaxDrawdown: 至少需要2个数据点");
    return { maxDrawdown: 0, peakIndex: 0, troughIndex: 0 };
  }

  let maxDrawdown = 0;
  let peak = values[0];
  let peakIndex = 0;
  let resultPeakIndex = 0;
  let resultTroughIndex = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIndex = i;
    }

    const drawdown = (peak - values[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      resultPeakIndex = peakIndex;
      resultTroughIndex = i;
    }
  }

  const result = {
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
    peakIndex: resultPeakIndex,
    troughIndex: resultTroughIndex,
  };

  console.log(`[quant_analysis] calculateMaxDrawdown: 最大回撤=${(maxDrawdown * 100).toFixed(2)}%`);
  return result;
}

/**
 * 计算波动率
 * @param returns - 收益率序列
 * @param annualize - 是否年化（默认true）
 * @returns 波动率值
 */
export function calculateVolatility(returns: number[], annualize: boolean = true): number {
  if (returns.length < 2) {
    console.error("[quant_analysis] calculateVolatility: 至少需要2个收益率数据");
    return 0;
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  let variance = 0;
  for (const r of returns) {
    variance += (r - mean) ** 2;
  }
  variance /= returns.length - 1;

  const dailyVol = Math.sqrt(variance);
  const vol = annualize ? dailyVol * Math.sqrt(252) : dailyVol;

  const result = Number(vol.toFixed(4));
  console.log(`[quant_analysis] calculateVolatility: ${annualize ? "年化" : "日"}波动率=${result}`);
  return result;
}

/**
 * 计算两个序列的相关系数
 * @param series1 - 第一组数据序列
 * @param series2 - 第二组数据序列
 * @returns 相关系数值（-1到1之间）
 */
export function calculateCorrelation(series1: number[], series2: number[]): number {
  if (series1.length !== series2.length) {
    console.error("[quant_analysis] calculateCorrelation: 两个序列长度不一致");
    return 0;
  }

  const n = series1.length;
  if (n < 2) {
    console.error("[quant_analysis] calculateCorrelation: 至少需要2个数据点");
    return 0;
  }

  const mean1 = series1.reduce((sum, v) => sum + v, 0) / n;
  const mean2 = series2.reduce((sum, v) => sum + v, 0) / n;

  let covariance = 0;
  let variance1 = 0;
  let variance2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = series1[i] - mean1;
    const diff2 = series2[i] - mean2;
    covariance += diff1 * diff2;
    variance1 += diff1 ** 2;
    variance2 += diff2 ** 2;
  }

  const denominator = Math.sqrt(variance1 * variance2);
  if (denominator === 0) {
    console.error("[quant_analysis] calculateCorrelation: 方差为0，无法计算相关系数");
    return 0;
  }

  const correlation = Number((covariance / denominator).toFixed(4));
  console.log(`[quant_analysis] calculateCorrelation: 相关系数=${correlation}`);
  return correlation;
}
