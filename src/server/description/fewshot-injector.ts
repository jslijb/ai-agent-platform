export interface FewShotExample {
  userQuery: string;
  toolCalls: Array<{
    tool: string;
    parameters: Record<string, unknown>;
    reasoning: string;
  }>;
}

export const FINANCE_FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    userQuery: "五粮液MA20是多少？",
    toolCalls: [
      { tool: "getStockHistory", parameters: { code: "000858" }, reasoning: "先获取历史数据" },
      { tool: "calculateMA", parameters: { period: 20 }, reasoning: "用缓存数据计算MA20" },
    ],
  },
  {
    userQuery: "五粮液2025年资产负债率是多少？",
    toolCalls: [
      { tool: "getStockFinancial", parameters: { code: "000858" }, reasoning: "获取财务报表数据" },
    ],
  },
  {
    userQuery: "帮我分析五粮液的偿债能力",
    toolCalls: [
      { tool: "debt-solvency-analysis", parameters: {}, reasoning: "匹配偿债能力分析Skill" },
    ],
  },
];

export class FewShotInjector {
  inject(systemPrompt: string, examples?: FewShotExample[]): string {
    const ex = examples || FINANCE_FEW_SHOT_EXAMPLES;
    const block = ex
      .map(
        (e, i) =>
          `示例${i + 1}:\n用户: ${e.userQuery}\n助手: ${e.toolCalls.map((tc) => `${tc.tool}(${JSON.stringify(tc.parameters)})  // ${tc.reasoning}`).join(" → ")}`
      )
      .join("\n\n");

    return `${systemPrompt}\n\n--- Few-Shot 示例 ---\n${block}`;
  }
}

export const fewShotInjector = new FewShotInjector();
