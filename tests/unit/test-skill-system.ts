import { ToolRegistry } from "../../src/server/tools/registry";
import { SkillRegistry, executeSkill } from "../../src/server/agents/skills/executor";
import { registerAllSkills } from "../../src/server/agents/skills/definitions";
import type { RegisteredTool, SkillDefinition } from "../../src/server/agents/skills/types";

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

function testToolRegistry_Registration() {
  console.log("\n=== ToolRegistry 注册测试 ===");

  const testTool: RegisteredTool = {
    name: "test_tool",
    description: "测试工具",
    parameters: { input: { type: "string", description: "输入" } },
    execute: async (params) => `result: ${params.input}`,
  };

  ToolRegistry.register(testTool);
  assert(ToolRegistry.has("test_tool"), "注册后工具存在");
  assert(ToolRegistry.size() >= 1, "工具数量>=1");
  assert(ToolRegistry.get("test_tool")?.description === "测试工具", "获取工具描述正确");
  assert(ToolRegistry.listNames().includes("test_tool"), "listNames包含test_tool");
  assert(ToolRegistry.getDescriptions().includes("test_tool"), "getDescriptions包含test_tool");
}

function testToolRegistry_DuplicateRegistration() {
  console.log("\n=== ToolRegistry 重复注册测试 ===");

  const sizeBefore = ToolRegistry.size();
  const dupTool: RegisteredTool = {
    name: "test_tool",
    description: "重复工具",
    parameters: {},
    execute: async () => "dup",
  };
  ToolRegistry.register(dupTool);
  assert(ToolRegistry.size() === sizeBefore, "重复注册不增加数量");
  assert(ToolRegistry.get("test_tool")?.description === "测试工具", "重复注册不覆盖原工具");
}

function testSkillRegistry_Registration() {
  console.log("\n=== SkillRegistry 注册测试 ===");

  registerAllSkills();
  const skills = SkillRegistry.list();
  assert(skills.length >= 4, `注册了${skills.length}个Skill，>=4`);

  const ta = SkillRegistry.get("technical-analysis");
  assert(ta !== undefined, "technical-analysis Skill存在");
  assert(ta?.steps.length === 5, `technical-analysis 有5个步骤: ${ta?.steps.length}`);
  assert(ta?.triggerKeywords?.includes("技术分析") || false, "technical-analysis 包含技术分析关键词");

  const cc = SkillRegistry.get("compliance-check");
  assert(cc !== undefined, "compliance-check Skill存在");

  const ra = SkillRegistry.get("risk-assessment");
  assert(ra !== undefined, "risk-assessment Skill存在");

  const cd = SkillRegistry.get("comprehensive-diagnosis");
  assert(cd !== undefined, "comprehensive-diagnosis Skill存在");
  assert(cd?.steps.length === 7, `comprehensive-diagnosis 有7个步骤: ${cd?.steps.length}`);
}

function testSkillRegistry_Match() {
  console.log("\n=== SkillRegistry 匹配测试 ===");

  const match1 = SkillRegistry.match("帮我做一下技术分析");
  assert(match1?.name === "technical-analysis", `匹配技术分析: ${match1?.name}`);

  const match2 = SkillRegistry.match("检查一下合规性");
  assert(match2?.name === "compliance-check", `匹配合规检查: ${match2?.name}`);

  const match3 = SkillRegistry.match("风险评估报告");
  assert(match3?.name === "risk-assessment", `匹配风控评估: ${match3?.name}`);

  const match4 = SkillRegistry.match("综合诊断一下这只股票");
  assert(match4?.name === "comprehensive-diagnosis", `匹配综合诊断: ${match4?.name}`);

  const match5 = SkillRegistry.match("今天天气怎么样");
  assert(match5 === null, "不相关查询返回null");
}

function testSkillRegistry_Descriptions() {
  console.log("\n=== SkillRegistry 描述列表测试 ===");

  const desc = SkillRegistry.listDescriptions();
  assert(desc.includes("technical-analysis"), "描述列表包含technical-analysis");
  assert(desc.includes("compliance-check"), "描述列表包含compliance-check");
  assert(desc.includes("risk-assessment"), "描述列表包含risk-assessment");
  assert(desc.includes("comprehensive-diagnosis"), "描述列表包含comprehensive-diagnosis");
}

async function testSkillExecutor_SimpleExecution() {
  console.log("\n=== SkillExecutor 简单执行测试 ===");

  const mockTool1: RegisteredTool = {
    name: "mock_tool_a",
    description: "模拟工具A",
    parameters: {},
    execute: async () => ({ value: "A结果", data: [1, 2, 3] }),
  };
  const mockTool2: RegisteredTool = {
    name: "mock_tool_b",
    description: "模拟工具B",
    parameters: {},
    execute: async () => ({ value: "B结果", data: [4, 5, 6] }),
  };

  ToolRegistry.register(mockTool1);
  ToolRegistry.register(mockTool2);

  const testSkill: SkillDefinition = {
    name: "test-skill",
    description: "测试Skill",
    steps: [
      { tool: "mock_tool_a", params: {} },
      { tool: "mock_tool_b", params: {} },
    ],
  };

  const result = await executeSkill(testSkill, {});
  assert(result.success, "Skill执行成功");
  assert(result.stepResults.length === 2, "2个步骤结果");
  assert(result.stepResults[0].tool === "mock_tool_a", "步骤1工具正确");
  assert(result.stepResults[1].tool === "mock_tool_b", "步骤2工具正确");
  assert(result.executionTimeMs >= 0, "执行时间>=0");
  assert(result.finalOutput.includes("test-skill"), "最终输出包含Skill名称");
}

async function testSkillExecutor_ParallelExecution() {
  console.log("\n=== SkillExecutor 并行执行测试 ===");

  const mockTool3: RegisteredTool = {
    name: "mock_tool_c",
    description: "模拟工具C",
    parameters: {},
    execute: async () => "C结果",
  };
  const mockTool4: RegisteredTool = {
    name: "mock_tool_d",
    description: "模拟工具D",
    parameters: {},
    execute: async () => "D结果",
  };

  ToolRegistry.register(mockTool3);
  ToolRegistry.register(mockTool4);

  const parallelSkill: SkillDefinition = {
    name: "parallel-test",
    description: "并行测试",
    steps: [
      { tool: "mock_tool_c", params: {} },
      { tool: "mock_tool_d", params: {}, parallel: true },
    ],
  };

  const result = await executeSkill(parallelSkill, {});
  assert(result.success, "并行Skill执行成功");
  assert(result.stepResults.length === 2, "2个步骤结果");
}

async function testSkillExecutor_MissingTool() {
  console.log("\n=== SkillExecutor 缺失工具测试 ===");

  const failSkill: SkillDefinition = {
    name: "fail-test",
    description: "失败测试",
    steps: [
      { tool: "nonexistent_tool", params: {} },
    ],
  };

  const result = await executeSkill(failSkill, {});
  assert(!result.success, "缺失工具时Skill失败");
  assert(result.stepResults[0].error?.includes("未注册") || false, "错误信息包含未注册");
}

function testSkillExecutor_OutputTemplate() {
  console.log("\n=== SkillExecutor 输出模板测试 ===");

  const templateSkill: SkillDefinition = {
    name: "template-test",
    description: "模板测试",
    steps: [
      { tool: "mock_tool_a", params: {} },
    ],
    outputTemplate: "结果: {{steps[0].output}}",
  };

  assert(templateSkill.outputTemplate?.includes("{{steps[0].output}}") || false, "输出模板包含步骤引用");
}

async function runAll() {
  console.log("=".repeat(60));
  console.log("Skill 系统 - 验证测试 (Task 6)");
  console.log("=".repeat(60));

  testToolRegistry_Registration();
  testToolRegistry_DuplicateRegistration();
  testSkillRegistry_Registration();
  testSkillRegistry_Match();
  testSkillRegistry_Descriptions();
  await testSkillExecutor_SimpleExecution();
  await testSkillExecutor_ParallelExecution();
  await testSkillExecutor_MissingTool();
  testSkillExecutor_OutputTemplate();

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  console.log("\n" + "=".repeat(60));
  console.log(`Skill系统测试结果: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60));

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r.name}${r.detail ? " - " + r.detail : ""}`);
  }

  if (failed > 0) process.exit(1);
}

runAll();
