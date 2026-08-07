import {
  checkTradeCompliance,
  checkPositionLimit,
  checkRestrictedStock,
  getComplianceReport,
} from "@/server/mcp/tools/compliance";
import { calculateStressTest, checkRiskLimits, generateRiskReport } from "@/server/mcp/tools/risk_control";
import type { ToolDefinition } from "../simpleAgent";

export const complianceCheckTool: ToolDefinition = {
  name: "complianceCheck",
  category: "risk-compliance",
  description:
    "合规与风控检查。支持trade(交易合规)、position(持仓限制)、restricted(受限股票)、riskLimits(风险限额)、stressTest(压力测试)、complianceReport(合规报告)、riskReport(风险报告)。",
  parameters: {
    checkType: {
      type: "string",
      description: "检查类型：trade/position/restricted/riskLimits/stressTest/complianceReport/riskReport",
      required: true,
    },
    code: { type: "string", description: "股票代码（trade/restricted需要）" },
    direction: { type: "string", description: "交易方向 buy/sell（trade需要）" },
    quantity: { type: "number", description: "数量（trade/position需要）" },
    price: { type: "number", description: "价格（trade需要）" },
    prevClose: { type: "number", description: "前收盘价（trade需要）" },
    accountId: { type: "string", description: "账户ID（position/riskLimits/complianceReport/riskReport需要）" },
    totalAssets: { type: "number", description: "总资产（position需要）" },
    portfolio: { type: "object", description: "投资组合（stressTest需要）" },
    scenarios: { type: "array", description: "压力情景（stressTest需要）" },
  },
  execute: (params) => {
    const checkType = String(params.checkType || "").toLowerCase();

    switch (checkType) {
      case "trade": {
        const { code, direction, quantity, price, prevClose } = params;
        if (!code || !direction || !quantity || !price || !prevClose) {
          return JSON.stringify({ error: "trade检查需要: code, direction, quantity, price, prevClose" });
        }
        const result = checkTradeCompliance({
          code: String(code), direction: String(direction),
          quantity: Number(quantity), price: Number(price), prevClose: Number(prevClose),
          isST: params.isST as boolean, boardType: (params.boardType as "main" | "gem" | "star") || "main",
        });
        return JSON.stringify({ checkType: "trade", ...result });
      }
      case "position": {
        const { accountId, code, quantity, totalAssets } = params;
        if (!accountId || !code || !quantity || !totalAssets) {
          return JSON.stringify({ error: "position检查需要: accountId, code, quantity, totalAssets" });
        }
        const result = checkPositionLimit({
          accountId: String(accountId), code: String(code),
          quantity: Number(quantity), totalAssets: Number(totalAssets),
        });
        return JSON.stringify({ checkType: "position", ...result });
      }
      case "restricted": {
        const code = String(params.code || "");
        if (!code) return JSON.stringify({ error: "restricted检查需要code参数" });
        const result = checkRestrictedStock(code);
        return JSON.stringify({ checkType: "restricted", ...result });
      }
      case "risklimits": {
        const accountId = String(params.accountId || "");
        if (!accountId) return JSON.stringify({ error: "riskLimits检查需要accountId参数" });
        const result = checkRiskLimits({ accountId });
        return JSON.stringify({ checkType: "riskLimits", ...result });
      }
      case "stresstest": {
        const { portfolio, scenarios } = params;
        if (!portfolio || !scenarios) {
          return JSON.stringify({ error: "stressTest需要portfolio和scenarios参数" });
        }
        const result = calculateStressTest({
          portfolio: portfolio as Record<string, { quantity: number; currentPrice: number }>,
          scenarios: scenarios as { name: string; priceChange: number }[],
        });
        return JSON.stringify({ checkType: "stressTest", ...result });
      }
      case "compliancereport": {
        const accountId = String(params.accountId || "default");
        const result = getComplianceReport(accountId);
        return JSON.stringify({ checkType: "complianceReport", ...result });
      }
      case "riskreport": {
        const accountId = String(params.accountId || "default");
        const result = generateRiskReport(accountId);
        return JSON.stringify({ checkType: "riskReport", ...result });
      }
      default:
        return JSON.stringify({ error: `不支持的检查类型: ${checkType}。支持: trade/position/restricted/riskLimits/stressTest/complianceReport/riskReport` });
    }
  },
};
