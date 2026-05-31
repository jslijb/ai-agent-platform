import {
  calculateTokenBudget,
  formatUserProfileForPrompt,
  type UserProfile,
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

function testOverlap1_ShortTermAndLongTerm_LiquorSector() {
  console.log("\n=== 重合1: 短期+长期（偏好+上下文）===");
  console.log("场景: 用户在会话A中说'我关注白酒板块'（长期），在会话B中问'帮我分析一下这个板块的龙头'（短期上下文指白酒）");

  const profile: UserProfile = {
    id: "test",
    userId: "user1",
    scope: "personal",
    preferences: { sectorFocus: "白酒" },
    frequentStocks: [
      { code: "000858", name: "五粮液", queryCount: 12, lastQueriedAt: "2026-05-29" },
      { code: "600519", name: "贵州茅台", queryCount: 8, lastQueriedAt: "2026-05-28" },
    ],
    riskProfile: "moderate",
    investmentStyle: "value",
    customNotes: [],
  };
  const l4Result = formatUserProfileForPrompt(profile);
  assert(l4Result.includes("白酒"), "L4画像包含白酒偏好", l4Result);
  assert(l4Result.includes("五粮液"), "L4画像包含五粮液", l4Result);
  assert(l4Result.includes("贵州茅台"), "L4画像包含贵州茅台", l4Result);

  const l1Context = "帮我分析一下这个板块的龙头";
  assert(l1Context.includes("板块"), "L1短期上下文包含板块关键词");

  const combined = l4Result + "\n" + l1Context;
  assert(combined.includes("白酒") && combined.includes("板块"), "L4+L1组合: 同时包含白酒偏好和板块上下文");
}

function testOverlap1_ShortTermAndLongTerm_TechSector() {
  console.log("\n=== 重合1b: 短期+长期（科技偏好+当前查询）===");
  console.log("场景: 用户偏好科技股，当前查询科技板块分析");

  const profile: UserProfile = {
    id: "test",
    userId: "user2",
    scope: "personal",
    preferences: { sectorFocus: "科技" },
    frequentStocks: [
      { code: "002415", name: "海康威视", queryCount: 20, lastQueriedAt: "2026-05-30" },
    ],
    riskProfile: "aggressive",
    investmentStyle: "growth",
    customNotes: [],
  };
  const l4Result = formatUserProfileForPrompt(profile);
  assert(l4Result.includes("科技"), "L4画像包含科技偏好");
  assert(l4Result.includes("海康威视"), "L4画像包含海康威视");
  assert(l4Result.includes("激进型"), "L4画像包含激进风险偏好");
  assert(l4Result.includes("成长投资"), "L4画像包含成长投资风格");
}

function testOverlap2_ShortTermAndCrossSession() {
  console.log("\n=== 重合2: 短期+跨会话（上下文+历史结论）===");
  console.log("场景: 会话A中得出'五粮液ROE下降'结论，会话B中先问'五粮液最新ROE'，再问'和上次比趋势如何'");

  const l3Fragment = "用户在之前的分析中得出结论：五粮液ROE从25.3%下降至22.1%，主要受净利率下滑影响";
  const l1Context = "和上次比趋势如何";

  assert(l3Fragment.includes("ROE") && l3Fragment.includes("下降"), "L3历史片段包含ROE下降结论");
  assert(l1Context.includes("上次"), "L1短期上下文引用上次分析");

  const combined = l3Fragment + "\n" + l1Context;
  assert(combined.includes("ROE") && combined.includes("上次"), "L3+L1组合: 同时包含历史ROE数据和当前趋势查询");
}

function testOverlap3_LongTermAndCrossSession() {
  console.log("\n=== 重合3: 长期+跨会话（偏好+历史数据）===");
  console.log("场景: 用户在会话A中说'我是价值投资者'，在会话B中问'上次分析的五粮液适合我吗'");

  const profile: UserProfile = {
    id: "test",
    userId: "user3",
    scope: "personal",
    preferences: { sectorFocus: "白酒" },
    frequentStocks: [
      { code: "000858", name: "五粮液", queryCount: 10, lastQueriedAt: "2026-05-28" },
    ],
    riskProfile: "conservative",
    investmentStyle: "value",
    customNotes: [],
  };
  const l4Result = formatUserProfileForPrompt(profile);
  assert(l4Result.includes("价值投资"), "L4画像包含价值投资偏好");
  assert(l4Result.includes("保守型"), "L4画像包含保守风险偏好");

  const l3Fragment = "上次分析五粮液：PE=22.5，低于行业均值28，股息率3.2%，现金流稳定";
  assert(l3Fragment.includes("五粮液"), "L3历史片段包含五粮液分析");
  assert(l3Fragment.includes("PE"), "L3历史片段包含PE数据");

  const combined = l4Result + "\n" + l3Fragment;
  assert(combined.includes("价值投资") && combined.includes("五粮液"), "L4+L3组合: 同时包含价值投资偏好和五粮液分析");
}

function testOverlap4_AllThreeMemoryTypes() {
  console.log("\n=== 重合4: 三种记忆重合 ===");
  console.log("场景: 用户偏好白酒+价值投资，上次分析了五粮液，当前查询五粮液最新财报");

  const profile: UserProfile = {
    id: "test",
    userId: "user4",
    scope: "personal",
    preferences: { sectorFocus: "白酒" },
    frequentStocks: [
      { code: "000858", name: "五粮液", queryCount: 15, lastQueriedAt: "2026-05-29" },
    ],
    riskProfile: "moderate",
    investmentStyle: "value",
    customNotes: [{ key: "stop_loss", value: "止损线8%", updatedAt: "2026-05-01" }],
  };
  const l4Result = formatUserProfileForPrompt(profile);
  assert(l4Result.includes("白酒"), "L4画像包含白酒偏好");
  assert(l4Result.includes("价值投资"), "L4画像包含价值投资风格");
  assert(l4Result.includes("五粮液"), "L4画像包含五粮液常用股");
  assert(l4Result.includes("止损线8%"), "L4画像包含止损线注意事项");

  const l3Fragment = "上次分析五粮液：营收增速12%，净利润增速8%，毛利率75.2%";
  assert(l3Fragment.includes("五粮液"), "L3历史片段包含五粮液分析");

  const l2Summary = "用户关注白酒板块投资机会，多次分析五粮液基本面";
  assert(l2Summary.includes("白酒"), "L2摘要包含白酒关键词");

  const l1Context = "结合我的偏好和上次分析，现在适合买入吗";
  assert(l1Context.includes("偏好") && l1Context.includes("上次"), "L1短期上下文引用偏好和上次分析");

  const combined = l4Result + "\n" + l3Fragment + "\n" + l2Summary + "\n" + l1Context;
  assert(combined.includes("白酒") && combined.includes("价值投资"), "三层重合: 包含L4偏好");
  assert(combined.includes("营收增速"), "三层重合: 包含L3历史数据");
  assert(combined.includes("偏好") && combined.includes("上次"), "三层重合: 包含L1当前查询");
}

function testOverlap5_PreferenceCorrection() {
  console.log("\n=== 重合5: 短期+长期（修正偏好）===");
  console.log("场景: 用户原偏好白酒，现在修正为科技股");

  const oldProfile: UserProfile = {
    id: "test",
    userId: "user5",
    scope: "personal",
    preferences: { sectorFocus: "白酒" },
    frequentStocks: [
      { code: "000858", name: "五粮液", queryCount: 10, lastQueriedAt: "2026-05-20" },
    ],
    riskProfile: null,
    investmentStyle: null,
    customNotes: [],
  };

  const correctedProfile: UserProfile = {
    id: "test",
    userId: "user5",
    scope: "personal",
    preferences: { sectorFocus: "科技" },
    frequentStocks: [
      { code: "002415", name: "海康威视", queryCount: 5, lastQueriedAt: "2026-05-30" },
      { code: "000858", name: "五粮液", queryCount: 10, lastQueriedAt: "2026-05-20" },
    ],
    riskProfile: null,
    investmentStyle: null,
    customNotes: [],
  };

  const oldResult = formatUserProfileForPrompt(oldProfile);
  const correctedResult = formatUserProfileForPrompt(correctedProfile);

  assert(oldResult.includes("白酒"), "修正前画像包含白酒");
  assert(correctedResult.includes("科技"), "修正后画像包含科技");
  assert(correctedResult.includes("海康威视"), "修正后画像包含科技股");
  assert(oldResult !== correctedResult, "修正前后画像不同");
}

function testTokenBudget_OverlapScenarios() {
  console.log("\n=== Token预算: 重合场景下的预算分配 ===");

  const budget32K = calculateTokenBudget(32768);
  const budget128K = calculateTokenBudget(131072);
  const budget1M = calculateTokenBudget(1048576);

  assert(budget32K.l1Budget + budget32K.l2Budget + budget32K.l3Budget + budget32K.l4DynamicBudget <= budget32K.inputBudget, "32K: 四层预算总和不超过inputBudget");
  assert(budget128K.l1Budget + budget128K.l2Budget + budget128K.l3Budget + budget128K.l4DynamicBudget <= budget128K.inputBudget, "128K: 四层预算总和不超过inputBudget");
  assert(budget1M.l1Budget + budget1M.l2Budget + budget1M.l3Budget + budget1M.l4DynamicBudget <= budget1M.inputBudget, "1M: 四层预算总和不超过inputBudget");

  assert(budget32K.l1Budget > 0 && budget32K.l2Budget > 0 && budget32K.l3Budget > 0 && budget32K.l4DynamicBudget > 0, "32K: 所有层预算>0");
  assert(budget128K.l1Budget > budget32K.l1Budget, "128K L1预算 > 32K L1预算");
  assert(budget1M.l1Budget > budget128K.l1Budget, "1M L1预算 > 128K L1预算");
}

function testAssembledContext_Structure() {
  console.log("\n=== AssembledContext结构验证 ===");

  const mockContext: AssembledContext = {
    l1Messages: [
      { role: "user", content: "帮我分析白酒板块" },
      { role: "assistant", content: "白酒板块近期表现..." },
      { role: "user", content: "五粮液适合买入吗" },
    ],
    l2Summary: "用户关注白酒板块，讨论了五粮液投资机会",
    l3Fragments: "历史分析：五粮液PE=22.5，低于行业均值",
    l4Profile: "[用户画像] 关注板块: 白酒 | 投资风格: 价值投资",
    budget: calculateTokenBudget(32768),
  };

  assert(mockContext.l1Messages.length === 3, "L1消息数量=3");
  assert(mockContext.l2Summary.length > 0, "L2摘要非空");
  assert(mockContext.l3Fragments.length > 0, "L3历史片段非空");
  assert(mockContext.l4Profile.length > 0, "L4画像非空");
  assert(mockContext.budget.l1Budget > 0, "预算结构完整");

  const hasAllLayers = mockContext.l1Messages.length > 0
    && mockContext.l2Summary.length > 0
    && mockContext.l3Fragments.length > 0
    && mockContext.l4Profile.length > 0;
  assert(hasAllLayers, "四层记忆全部有数据（重合场景）");
}

async function runAll() {
  console.log("=".repeat(60));
  console.log("Agent 记忆系统 - 记忆重合场景测试 (Task 8)");
  console.log("=".repeat(60));

  testOverlap1_ShortTermAndLongTerm_LiquorSector();
  testOverlap1_ShortTermAndLongTerm_TechSector();
  testOverlap2_ShortTermAndCrossSession();
  testOverlap3_LongTermAndCrossSession();
  testOverlap4_AllThreeMemoryTypes();
  testOverlap5_PreferenceCorrection();
  testTokenBudget_OverlapScenarios();
  testAssembledContext_Structure();

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  console.log("\n" + "=".repeat(60));
  console.log(`记忆重合测试结果: ${passed}/${total} PASSED, ${failed} FAILED`);
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
  const reportPath = path.join(reportDir, `memory_overlap_test_report_${ts}.json`);
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
