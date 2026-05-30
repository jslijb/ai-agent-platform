import {
  calculateTokenBudget,
  formatUserProfileForPrompt,
  type UserProfile,
  type TokenBudget,
  type AssembledContext,
} from "../../src/server/agents/memory";

const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function assert(condition: boolean, name: string, detail: string = ""): void {
  if (!condition) {
    console.error(`[FAIL] ${name}: ${detail}`);
    results.push({ name, pass: false, detail });
    return;
  }
  console.log(`[PASS] ${name}`);
  results.push({ name, pass: true, detail });
}

function testTokenBudget_32K() {
  console.log("\n=== 测试: 32K模型Token预算 ===");
  const budget = calculateTokenBudget(32768);
  assert(budget.inputBudget === 24576, "inputBudget = 75% of 32768", `${budget.inputBudget}`);
  assert(budget.l1Budget > 0, "L1预算 > 0", `${budget.l1Budget}`);
  assert(budget.l2Budget > 0, "L2预算 > 0", `${budget.l2Budget}`);
  assert(budget.l3Budget > 0, "L3预算 > 0", `${budget.l3Budget}`);
  assert(budget.l4DynamicBudget > 0, "L4预算 > 0", `${budget.l4DynamicBudget}`);
  assert(budget.bufferBudget > 0, "Buffer预算 > 0", `${budget.bufferBudget}`);
  const total = budget.l1Budget + budget.l2Budget + budget.l3Budget + budget.l4DynamicBudget + budget.bufferBudget + 1500;
  assert(total <= budget.inputBudget + 100, "总预算不超过inputBudget+overhead", `total: ${total}, inputBudget: ${budget.inputBudget}`);
}

function testTokenBudget_128K() {
  console.log("\n=== 测试: 128K模型Token预算 ===");
  const budget = calculateTokenBudget(131072);
  assert(budget.inputBudget === 98304, "inputBudget = 75% of 131072", `${budget.inputBudget}`);
  assert(budget.l1Budget > budget.l4DynamicBudget, "L1预算 > L4预算(32K模型)", `${budget.l1Budget} vs ${budget.l4DynamicBudget}`);
  assert(budget.l1Budget + budget.l2Budget + budget.l3Budget + budget.l4DynamicBudget + budget.bufferBudget <= budget.inputBudget - 1500, "总分配不超过inputBudget-overhead");
}

function testTokenBudget_1M() {
  console.log("\n=== 测试: 1M模型Token预算 ===");
  const budget = calculateTokenBudget(1048576);
  assert(budget.inputBudget > 700000, "1M模型inputBudget > 700K", `${budget.inputBudget}`);
  assert(budget.l1Budget > 200000, "1M模型L1预算 > 200K", `${budget.l1Budget}`);
}

function testFormatUserProfile_Empty() {
  console.log("\n=== 测试: 空用户画像格式化 ===");
  const profile: UserProfile = {
    id: "test",
    userId: "user1",
    scope: "personal",
    preferences: {},
    frequentStocks: [],
    riskProfile: null,
    investmentStyle: null,
    customNotes: [],
  };
  const result = formatUserProfileForPrompt(profile);
  assert(result === "", "空画像返回空字符串", `结果: "${result}"`);
}

function testFormatUserProfile_Full() {
  console.log("\n=== 测试: 完整用户画像格式化 ===");
  const profile: UserProfile = {
    id: "test",
    userId: "user1",
    scope: "personal",
    preferences: { sectorFocus: "新能源", infoStyle: "简洁" },
    frequentStocks: [
      { code: "000066", name: "中国长城", queryCount: 15, lastQueriedAt: "2026-05-30" },
      { code: "000651", name: "格力电器", queryCount: 8, lastQueriedAt: "2026-05-29" },
      { code: "000858", name: "五粮液", queryCount: 5, lastQueriedAt: "2026-05-28" },
    ],
    riskProfile: "moderate",
    investmentStyle: "value",
    customNotes: [{ key: "stop_loss", value: "止损线5%", updatedAt: "2026-05-01" }],
  };
  const result = formatUserProfileForPrompt(profile);
  assert(result.includes("[用户画像]"), "包含画像标题");
  assert(result.includes("新能源"), "包含关注板块");
  assert(result.includes("稳健型"), "包含风险偏好(中文映射)");
  assert(result.includes("价值投资"), "包含投资风格(中文映射)");
  assert(result.includes("中国长城"), "包含常用股票");
  assert(result.includes("格力电器"), "包含常用股票2");
  assert(result.includes("止损线5%"), "包含注意事项");
}

function testFormatUserProfile_Partial() {
  console.log("\n=== 测试: 部分用户画像格式化 ===");
  const profile: UserProfile = {
    id: "test",
    userId: "user1",
    scope: "personal",
    preferences: {},
    frequentStocks: [
      { code: "000066", name: "中国长城", queryCount: 3, lastQueriedAt: "2026-05-30" },
    ],
    riskProfile: "aggressive",
    investmentStyle: null,
    customNotes: [],
  };
  const result = formatUserProfileForPrompt(profile);
  assert(result.includes("激进型"), "包含风险偏好");
  assert(!result.includes("投资风格"), "无投资风格时不显示");
  assert(result.includes("中国长城"), "包含常用股票");
}

function testTokenBudget_Ratios() {
  console.log("\n=== 测试: Token预算比例 ===");
  const budget = calculateTokenBudget(32768);
  const remaining = budget.inputBudget - 1500;
  const l1Ratio = budget.l1Budget / remaining;
  const l2Ratio = budget.l2Budget / remaining;
  const l3Ratio = budget.l3Budget / remaining;
  const l4Ratio = budget.l4DynamicBudget / remaining;
  const bufferRatio = budget.bufferBudget / remaining;

  assert(Math.abs(l1Ratio - 0.30) < 0.02, "L1比例约30%", `${(l1Ratio * 100).toFixed(1)}%`);
  assert(Math.abs(l2Ratio - 0.25) < 0.02, "L2比例约25%", `${(l2Ratio * 100).toFixed(1)}%`);
  assert(Math.abs(l3Ratio - 0.25) < 0.02, "L3比例约25%", `${(l3Ratio * 100).toFixed(1)}%`);
  assert(Math.abs(l4Ratio - 0.10) < 0.02, "L4比例约10%", `${(l4Ratio * 100).toFixed(1)}%`);
  assert(Math.abs(bufferRatio - 0.10) < 0.02, "Buffer比例约10%", `${(bufferRatio * 100).toFixed(1)}%`);
}

function testUserProfile_Top5Stocks() {
  console.log("\n=== 测试: 常用股票Top5限制 ===");
  const profile: UserProfile = {
    id: "test",
    userId: "user1",
    scope: "personal",
    preferences: {},
    frequentStocks: Array.from({ length: 10 }, (_, i) => ({
      code: `00000${i}`,
      name: `股票${i}`,
      queryCount: 10 - i,
      lastQueriedAt: "2026-05-30",
    })),
    riskProfile: null,
    investmentStyle: null,
    customNotes: [],
  };
  const result = formatUserProfileForPrompt(profile);
  const stockCount = (result.match(/查询\d+次/g) || []).length;
  assert(stockCount <= 5, "最多显示5只股票", `显示${stockCount}只`);
}

async function runAll() {
  console.log("=".repeat(60));
  console.log("Agent 记忆系统 - 单元测试");
  console.log("=".repeat(60));

  testTokenBudget_32K();
  testTokenBudget_128K();
  testTokenBudget_1M();
  testTokenBudget_Ratios();
  testFormatUserProfile_Empty();
  testFormatUserProfile_Full();
  testFormatUserProfile_Partial();
  testUserProfile_Top5Stocks();

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  console.log("\n" + "=".repeat(60));
  console.log(`记忆系统测试结果: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60));

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r.name}${r.detail ? " - " + r.detail : ""}`);
  }

  const fs = await import("fs");
  const path = await import("path");
  const reportDir = path.resolve(process.cwd(), "tests/reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `memory_test_report_${ts}.json`);
  const report = {
    test_time: new Date().toISOString(),
    total,
    passed,
    failed,
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n报告已保存: ${reportPath}`);

  if (failed > 0) process.exit(1);
}

runAll();
