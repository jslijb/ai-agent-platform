import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock executeEnhancedSkill
vi.mock("../skills/enhanced-orchestrator", () => ({
  executeEnhancedSkill: vi.fn(),
}));

// Mock EnhancedReActExecutor as a proper class
vi.mock("../enhanced-react-executor", () => {
  return {
    EnhancedReActExecutor: class {
      run = vi.fn(async () => ({
        answer: "ReAct回答",
        steps: [],
        iterations: 2,
        toolCallCount: 1,
      }));
      reset = vi.fn();
    },
  };
});

import { ExecutionFacade } from "../execution-facade";
import { executeEnhancedSkill } from "../skills/enhanced-orchestrator";

const mockExecuteEnhanced = executeEnhancedSkill as ReturnType<typeof vi.fn>;

describe("ExecutionFacade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes skill mode when routeType is skill", async () => {
    mockExecuteEnhanced.mockResolvedValueOnce({
      success: true,
      finalOutput: "Skill执行结果",
      stepResults: [{ step: 0, tool: "t1", success: true, output: "ok" }],
      context: { skillId: "test", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    const facade = new ExecutionFacade();
    const result = await facade.execute(
      {
        routeType: "skill",
        matchedSkill: {
          name: "test-skill",
          description: "测试",
          steps: [{ tool: "t1", params: {} }],
        },
        availableTools: ["t1"],
        enhancedPrompt: "提示",
      },
      "测试查询",
      {
        routeType: "skill",
        availableTools: ["t1"],
        systemPrompt: "系统提示",
      }
    );

    expect(result.success).toBe(true);
    expect(result.executionMode).toBe("skill");
    expect(result.output).toBe("Skill执行结果");
  });

  it("returns failure when skill execution throws", async () => {
    mockExecuteEnhanced.mockRejectedValueOnce(new Error("Skill执行异常"));

    const facade = new ExecutionFacade();
    const result = await facade.execute(
      {
        routeType: "skill",
        matchedSkill: {
          name: "error-skill",
          description: "异常",
          steps: [{ tool: "t1", params: {} }],
        },
        availableTools: ["t1"],
        enhancedPrompt: "提示",
      },
      "异常查询",
      {
        routeType: "skill",
        availableTools: ["t1"],
        systemPrompt: "系统提示",
      }
    );

    expect(result.success).toBe(false);
    expect(result.executionMode).toBe("skill");
    expect(result.output).toContain("Skill执行失败");
  });

  it("falls back to ReAct mode when routeType is group", async () => {
    const facade = new ExecutionFacade();
    const result = await facade.execute(
      {
        routeType: "group",
        availableTools: ["t1"],
        enhancedPrompt: "提示",
      },
      "分组查询",
      {
        routeType: "group",
        availableTools: ["t1"],
        systemPrompt: "系统提示",
      }
    );

    expect(result.executionMode).toBe("react");
    expect(result.output).toBe("ReAct回答");
  });

  it("falls back to ReAct mode when routeType is full_fallback", async () => {
    const facade = new ExecutionFacade();
    const result = await facade.execute(
      {
        routeType: "full_fallback",
        availableTools: ["t1", "t2"],
        enhancedPrompt: "提示",
      },
      "全量降级查询",
      {
        routeType: "full_fallback",
        availableTools: ["t1", "t2"],
        systemPrompt: "系统提示",
      }
    );

    expect(result.executionMode).toBe("react");
  });

  it("records executionTimeMs", async () => {
    mockExecuteEnhanced.mockResolvedValueOnce({
      success: true,
      finalOutput: "结果",
      stepResults: [],
      context: { skillId: "test", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    const facade = new ExecutionFacade();
    const result = await facade.execute(
      {
        routeType: "skill",
        matchedSkill: {
          name: "test",
          description: "测试",
          steps: [{ tool: "t1", params: {} }],
        },
        availableTools: [],
        enhancedPrompt: "",
      },
      "查询",
      {
        routeType: "skill",
        availableTools: [],
        systemPrompt: "",
      }
    );

    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});
