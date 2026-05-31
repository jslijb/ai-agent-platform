export const TOOL_NAME_ALIASES: Record<string, string> = {
  getMA: "calculateMA",
  getMACD: "calculateMACD",
  getRSI: "calculateRSI",
  getBollingerBands: "calculateBollinger",
  getKDJ: "calculateKDJ",
  getFinancialData: "getStockFinancial",
  checkCompliance: "checkTradeCompliance",
  getRestrictedStocks: "checkRestrictedStock",
  getPositionLimits: "checkPositionLimit",
  getMaxDrawdown: "calculateMaxDrawdown",
  getVolatility: "calculateVolatility",
  stressTest: "calculateStressTest",
  getRiskLimits: "checkRiskLimits",
  getMarketData: "fetchMarketData",
};

export function resolveToolName(
  name: string,
  registry: { has: (n: string) => boolean }
): string {
  if (registry.has(name)) {
    return name;
  }
  const alias = TOOL_NAME_ALIASES[name];
  if (alias && registry.has(alias)) {
    console.warn(
      `[NameAliases] 工具名 "${name}" 已废弃，请使用 "${alias}"`
    );
    return alias;
  }
  return name;
}
