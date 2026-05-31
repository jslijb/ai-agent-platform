import {
  evaluateToolSelection,
  evaluateEfficiency,
  evaluateConsistency,
  evaluatePlanning,
  evaluateAgentCompliance,
  runAgentEvaluation,
  type AgentTestCase,
  type AgentRunResult,
} from "@/server/evaluation/agent-evaluator";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[TEST FAILED] ${message}`);
    failed++;
  } else {
    console.log(`[TEST PASSED] ${message}`);
    passed++;
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (实际: ${actual}, 期望: ${expected}, 误差: ${diff})`);
}

function testEvaluateToolSelection() {
  console.log("\n=== 测试 evaluateToolSelection ===");

  const score1 = evaluateToolSelection(
    ["checkTradeCompliance", "calculateVaR"],
    [{ tool: "checkTradeCompliance", round: 1 }, { tool: "calculateVaR", round: 2 }]
  );
  assertApprox(score1, 1.0, 0.001, "完全匹配预期工具，得分应为1.0");

  const score2 = evaluateToolSelection(
    ["checkTradeCompliance", "calculateVaR"],
    [{ tool: "checkTradeCompliance", round: 1 }]
  );
  assertApprox(score2, 0.7 * 0.5 + 1.0 * 0.3, 0.001, "只调用了一半预期工具");

  const score3 = evaluateToolSelection(
    ["checkTradeCompliance"],
    [{ tool: "checkTradeCompliance", round: 1 }, { tool: "calculateVaR", round: 2 }]
  );
  const expectedScore3 = 1.0 * 0.7 + (1 - 0.5) * 0.3;
  assertApprox(score3, expectedScore3, 0.001, "调用了预期工具但多调了不必要工具");

  const score4 = evaluateToolSelection(
    ["checkTradeCompliance"],
    [{ tool: "calculateVaR", round: 1 }]
  );
  assertApprox(score4, 0.0 * 0.7 + (1 - 1.0) * 0.3, 0.001, "完全没调用预期工具");

  const score5 = evaluateToolSelection([], []);
  assertApprox(score5, 1.0, 0.001, "预期和实际均为空，得分应为1.0");

  const score6 = evaluateToolSelection([], [{ tool: "calculateVaR", round: 1 }]);
  assertApprox(score6, 0.0, 0.001, "预期为空但存在实际调用，得分应为0");
}

function testEvaluateEfficiency() {
  console.log("\n=== 测试 evaluateEfficiency ===");

  const score1 = evaluateEfficiency(2, 1500, 3000);
  assertApprox(score1, 1.0 * 0.4 + 1.0 * 0.3 + 1.0 * 0.3, 0.001, "最优效率: 2轮/1500token/3s");

  const score2 = evaluateEfficiency(4, 3000, 10000);
  assertApprox(score2, 0.7 * 0.4 + 0.7 * 0.3 + 0.7 * 0.3, 0.001, "中等效率: 4轮/3000token/10s");

  const score3 = evaluateEfficiency(6, 12000, 35000);
  assertApprox(score3, 0.2 * 0.4 + 0.2 * 0.3 + 0.2 * 0.3, 0.001, "低效率: 6轮/12000token/35s");

  const score4 = evaluateEfficiency(3, null, 4000);
  assertApprox(score4, 1.0 * 0.5 + 1.0 * 0.5, 0.001, "Token为null: 迭代×0.5+响应×0.5");

  const score5 = evaluateEfficiency(3, 0, 4000);
  assertApprox(score5, 1.0 * 0.5 + 1.0 * 0.5, 0.001, "Token为0: 迭代×0.5+响应×0.5");

  const score6 = evaluateEfficiency(5, 8000, 20000);
  assertApprox(score6, 0.4 * 0.4 + 0.4 * 0.3 + 0.4 * 0.3, 0.001, "5轮/8000token/20s");
}

async function testEvaluateConsistency() {
  console.log("\n=== 测试 evaluateConsistency (降级路径) ===");

  const score1 = await evaluateConsistency("当前回答", undefined);
  assertApprox(score1, 1.0, 0.001, "无前一轮回答，得分应为1");

  const score2 = await evaluateConsistency("当前回答", "前一轮回答");
  assert(score2 >= 0 && score2 <= 1, "有前一轮回答时得分在0-1之间");

  const score3 = await evaluateConsistency(
    "五粮液的市盈率为25.3，建议关注",
    "五粮液的市盈率为25.3，建议关注"
  );
  assert(score3 >= 0.5, "完全相同的回答一致性应较高");
}

async function testEvaluatePlanningFallback() {
  console.log("\n=== 测试 evaluatePlanning ===");

  const score1 = await evaluatePlanning("分析五粮液", [
    { action: "查询基本面数据" },
    { action: "计算估值指标" },
  ]);
  assert(score1 >= 0 && score1 <= 1, "2步迭代，得分应在0-1之间");

  const score2 = await evaluatePlanning("分析五粮液", [
    { action: "步骤1" },
    { action: "步骤2" },
    { action: "步骤3" },
  ]);
  assert(score2 >= 0 && score2 <= 1, "3步迭代，得分应在0-1之间");

  const score3 = await evaluatePlanning("分析五粮液", [
    { action: "步骤1" },
    { action: "步骤2" },
    { action: "步骤3" },
    { action: "步骤4" },
  ]);
  assert(score3 >= 0 && score3 <= 1, "4步迭代，得分应在0-1之间");

  const score4 = await evaluatePlanning("分析五粮液", [
    { action: "步骤1" },
    { action: "步骤2" },
    { action: "步骤3" },
    { action: "步骤4" },
    { action: "步骤5" },
  ]);
  assert(score4 >= 0 && score4 <= 1, "5步迭代，得分应在0-1之间");

  const score5 = await evaluatePlanning("分析五粮液", [
    { action: "步骤1" },
    { action: "步骤2" },
    { action: "步骤3" },
    { action: "步骤4" },
    { action: "步骤5" },
    { action: "步骤6" },
  ]);
  assert(score5 >= 0 && score5 <= 1, "6步迭代，得分应在0-1之间");
}

async function testEvaluateAgentComplianceFallback() {
  console.log("\n=== 测试 evaluateAgentCompliance (降级路径) ===");

  const score1 = await evaluateAgentCompliance(
    "五粮液当前市盈率为25.3，仅供参考，投资有风险。",
    [{ tool: "getStockData", round: 1 }]
  );
  assert(score1 >= 0.5, "合规回答得分应较高");

  const score2 = await evaluateAgentCompliance(
    "保证收益，稳赚不赔，现在买入！",
    [{ tool: "getStockData", round: 1 }]
  );
  assert(score2 < 0.5, "承诺收益+推荐时点违规，得分应较低");

  const score3 = await evaluateAgentCompliance(
    "建议买入五粮液",
    [{ tool: "execute_trade", round: 1 }]
  );
  assert(score3 < 0.5, "使用了不合规工具(execute_trade)，得分应较低");

  const score4 = await evaluateAgentCompliance(
    "今天天气不错",
    []
  );
  assert(score4 >= 0.75, "不涉及投资的回答合规得分应较高");
}

async function testRunAgentEvaluation() {
  console.log("\n=== 测试 runAgentEvaluation (降级路径) ===");

  const testCases: AgentTestCase[] = [
    {
      id: "test-001",
      query: "五粮液基本面分析",
      expectedToolTypes: ["getStockData", "calculateVaR"],
      requiredAspects: ["基本面", "估值"],
    },
    {
      id: "test-002",
      query: "检查五粮液合规性",
      expectedToolTypes: ["checkTradeCompliance"],
      requiredAspects: ["合规"],
      previousAnswer: "五粮液的市盈率为25.3",
    },
  ];

  const mockAgentRunFn = async (testCase: AgentTestCase): Promise<AgentRunResult> => {
    if (testCase.id === "test-001") {
      return {
        answer: "五粮液基本面良好，市盈率25.3，仅供参考，投资有风险。",
        toolCalls: [
          { tool: "getStockData", round: 1 },
          { tool: "calculateVaR", round: 2 },
        ],
        iterations: 2,
        durationMs: 3000,
        totalTokens: 1500,
        steps: [
          { action: "getStockData", result: "获取股票数据" },
          { action: "calculateVaR", result: "计算VaR" },
        ],
      };
    }
    return {
      answer: "五粮液合规检查通过，市盈率为25.3，仅供参考，投资有风险。",
      toolCalls: [{ tool: "checkTradeCompliance", round: 1 }],
      iterations: 1,
      durationMs: 2000,
      totalTokens: 800,
      steps: [{ action: "checkTradeCompliance", result: "合规检查通过" }],
    };
  };

  const report = await runAgentEvaluation(testCases, mockAgentRunFn, {
    evaluationLevel: "standard",
    triggerMode: "manual",
    dataSource: "golden",
  });

  assert(report.version === 1, "报告版本应为1");
  assert(report.totalTests === 2, "测试总数应为2");
  assert(report.evaluationLevel === "standard", "评估级别应为standard");
  assert(report.triggerMode === "manual", "触发模式应为manual");
  assert(report.dataSource === "golden", "数据来源应为golden");
  assert(report.results.length === 2, "结果数量应为2");
  assert(report.agentOverallScore >= 0 && report.agentOverallScore <= 1, "综合评分应在0-1之间");
  assert(report.avgToolSelectionScore >= 0, "平均工具选择得分应>=0");
  assert(report.avgPlanningScore >= 0, "平均规划得分应>=0");
  assert(report.avgComplianceScore >= 0, "平均合规得分应>=0");
  assert(report.avgConsistencyScore >= 0, "平均一致性得分应>=0");
  assert(report.avgEfficiencyScore >= 0, "平均效率得分应>=0");

  console.log(`\n综合评分: ${report.agentOverallScore}`);
  console.log(`工具选择: ${report.avgToolSelectionScore}`);
  console.log(`规划: ${report.avgPlanningScore}`);
  console.log(`合规: ${report.avgComplianceScore}`);
  console.log(`一致性: ${report.avgConsistencyScore}`);
  console.log(`效率: ${report.avgEfficiencyScore}`);
}

console.log("========================================");
console.log("开始测试 agent-evaluator 模块");
console.log("========================================");

testEvaluateToolSelection();
testEvaluateEfficiency();

testEvaluateConsistency()
  .then(() => testEvaluatePlanningFallback())
  .then(() => testEvaluateAgentComplianceFallback())
  .then(() => testRunAgentEvaluation())
  .then(() => {
    console.log("\n========================================");
    console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
    console.log("========================================");
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("[TEST ERROR]", error);
    process.exit(1);
  });
