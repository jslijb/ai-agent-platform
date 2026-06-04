import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock callWithFallback
vi.mock("@/server/llm/router", () => ({
  callWithFallback: vi.fn(),
}));

// Mock ToolCallValidator as a proper class
vi.mock("@/server/validation/tool-call-validator", () => {
  return {
    ToolCallValidator: class {
      validate = vi.fn(() => ({ valid: true, errors: [], suggestion: undefined }));
    },
  };
});

// Mock CallLimiter as a proper class
vi.mock("@/server/validation/call-limiter", () => {
  return {
    CallLimiter: class {
      canCall = vi.fn(() => true);
      increment = vi.fn();
      getCount = vi.fn(() => 0);
      reset = vi.fn();
      executeWithLimit = vi.fn(async (_name: string, _params: unknown, executor: () => Promise<unknown>) => {
        const result = await executor();
        return { result, limitReached: false, fromCache: false };
      });
      setCached = vi.fn();
      getCached = vi.fn(() => undefined);
    },
  };
});

// Mock ToolRegistry
vi.mock("@/server/tools/registry", () => ({
  ToolRegistry: {
    get: vi.fn(),
    list: vi.fn(() => []),
    listNames: vi.fn(() => []),
    has: vi.fn(() => false),
  },
}));

import { EnhancedReActExecutor } from "../enhanced-react-executor";
import { callWithFallback } from "@/server/llm/router";
import { ToolRegistry } from "@/server/tools/registry";

const mockCallWithFallback = callWithFallback as ReturnType<typeof vi.fn>;

describe("EnhancedReActExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns answer when LLM responds without tool calls", async () => {
    mockCallWithFallback.mockResolvedValueOnce({
      content: "这是最终回答",
      toolCalls: undefined,
    });

    const executor = new EnhancedReActExecutor({ maxIterations: 3 });
    const result = await executor.run(
      "测试查询",
      [],
      "系统提示",
      [{ role: "user", content: "测试查询" }]
    );

    expect(result.answer).toBe("这是最终回答");
    expect(result.iterations).toBe(1);
  });

  it("executes tool calls and continues ReAct loop", async () => {
    // 第一次调用: LLM 返回工具调用
    mockCallWithFallback.mockResolvedValueOnce({
      content: "",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "getStockHistory", arguments: '{"code":"000858"}' },
        },
      ],
    });

    // 第二次调用: LLM 返回最终答案
    mockCallWithFallback.mockResolvedValueOnce({
      content: "五粮液历史数据已获取",
      toolCalls: undefined,
    });

    (ToolRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue({
      name: "getStockHistory",
      description: "获取历史数据",
      parameters: {},
      execute: vi.fn(async () => "历史数据结果"),
    });

    const executor = new EnhancedReActExecutor({ maxIterations: 5 });
    const result = await executor.run(
      "获取五粮液历史数据",
      ["getStockHistory"],
      "系统提示",
      [{ role: "user", content: "获取五粮液历史数据" }]
    );

    expect(result.answer).toBe("五粮液历史数据已获取");
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("handles LLM call failure gracefully", async () => {
    mockCallWithFallback.mockRejectedValueOnce(new Error("LLM服务不可用"));
    // 第二次调用返回答案
    mockCallWithFallback.mockResolvedValueOnce({
      content: "基于已有信息回答",
      toolCalls: undefined,
    });

    const executor = new EnhancedReActExecutor({ maxIterations: 3 });
    const result = await executor.run(
      "测试",
      [],
      "系统提示",
      [{ role: "user", content: "测试" }]
    );

    expect(result.steps.some(s => s.type === "error")).toBe(true);
  });

  it("respects maxIterations limit", async () => {
    // 每次都返回工具调用，永远不给最终答案
    mockCallWithFallback.mockResolvedValue({
      content: "",
      toolCalls: [
        {
          id: "call-loop",
          type: "function",
          function: { name: "getStockHistory", arguments: '{"code":"000858"}' },
        },
      ],
    });

    (ToolRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue({
      name: "getStockHistory",
      description: "获取历史数据",
      parameters: {},
      execute: vi.fn(async () => "数据"),
    });

    const executor = new EnhancedReActExecutor({ maxIterations: 2 });
    const result = await executor.run(
      "循环测试",
      ["getStockHistory"],
      "系统提示",
      [{ role: "user", content: "循环测试" }]
    );

    expect(result.iterations).toBeLessThanOrEqual(2);
  });

  it("constructor merges config with defaults", () => {
    const executor = new EnhancedReActExecutor({ maxIterations: 10 });
    expect(executor).toBeDefined();
  });
});
