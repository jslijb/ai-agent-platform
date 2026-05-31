import { describe, it, expect } from "vitest";
import { ToolDescriptionEnhancer } from "../description/tool-description-enhancer";
import { FewShotInjector } from "../description/fewshot-injector";
import type { EnhancedToolDescription } from "../description/types";

describe("ToolDescriptionEnhancer", () => {
  it("load and get descriptions", () => {
    const enhancer = new ToolDescriptionEnhancer();
    const descs: EnhancedToolDescription[] = [
      {
        name: "calculateMA",
        description: "计算移动平均线",
        whenToUse: "需要计算MA时使用",
        whenNotToUse: "不需要均线时",
        parameters: { period: { type: "number" } },
        exampleCalls: [
          { description: "MA20", parameters: { period: 20 } },
        ],
        groupId: "technical-analysis",
      },
    ];
    enhancer.load(descs);
    expect(enhancer.get("calculateMA")).toBeDefined();
    expect(enhancer.get("unknown")).toBeUndefined();
  });

  it("formatForPrompt returns formatted string", () => {
    const enhancer = new ToolDescriptionEnhancer();
    const descs: EnhancedToolDescription[] = [
      {
        name: "calculateMA",
        description: "计算移动平均线",
        whenToUse: "需要计算MA时使用",
        whenNotToUse: "不需要均线时",
        parameters: { period: { type: "number" } },
        exampleCalls: [
          { description: "MA20", parameters: { period: 20 } },
        ],
        groupId: "technical-analysis",
      },
    ];
    enhancer.load(descs);
    const prompt = enhancer.formatForPrompt();
    expect(prompt).toContain("calculateMA");
    expect(prompt).toContain("计算移动平均线");
    expect(prompt).toContain("何时使用");
    expect(prompt).toContain("何时不使用");
  });

  it("formatForPrompt filters by toolNames", () => {
    const enhancer = new ToolDescriptionEnhancer();
    const descs: EnhancedToolDescription[] = [
      {
        name: "toolA",
        description: "A",
        whenToUse: "use A",
        whenNotToUse: "not A",
        parameters: {},
        exampleCalls: [],
        groupId: "g1",
      },
      {
        name: "toolB",
        description: "B",
        whenToUse: "use B",
        whenNotToUse: "not B",
        parameters: {},
        exampleCalls: [],
        groupId: "g2",
      },
    ];
    enhancer.load(descs);
    const prompt = enhancer.formatForPrompt(["toolA"]);
    expect(prompt).toContain("toolA");
    expect(prompt).not.toContain("toolB");
  });
});

describe("FewShotInjector", () => {
  it("inject appends examples to system prompt", () => {
    const injector = new FewShotInjector();
    const result = injector.inject("你是一个助手", []);
    expect(result).toContain("你是一个助手");
    expect(result).toContain("Few-Shot 示例");
  });

  it("inject with custom examples", () => {
    const injector = new FewShotInjector();
    const result = injector.inject("系统提示", [
      {
        userQuery: "测试查询",
        toolCalls: [
          { tool: "testTool", parameters: { x: 1 }, reasoning: "测试原因" },
        ],
      },
    ]);
    expect(result).toContain("测试查询");
    expect(result).toContain("testTool");
    expect(result).toContain("测试原因");
  });

  it("inject with default examples", () => {
    const injector = new FewShotInjector();
    const result = injector.inject("系统提示");
    expect(result).toContain("Few-Shot 示例");
    expect(result).toContain("五粮液");
  });
});
