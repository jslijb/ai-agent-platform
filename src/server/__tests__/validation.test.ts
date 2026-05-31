import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolCallValidator } from "../validation/tool-call-validator";
import { CallLimiter } from "../validation/call-limiter";

vi.mock("../tools/registry", () => {
  const tools: Record<string, { name: string; description: string; parameters: Record<string, unknown>; category?: string }> = {
    getStockHistory: {
      name: "getStockHistory",
      description: "获取股票历史数据",
      parameters: {
        code: { type: "string", description: "股票代码", required: true },
        period: { type: "string", description: "周期" },
      },
      category: "market-data",
    },
    calculateMA: {
      name: "calculateMA",
      description: "计算均线",
      parameters: {
        period: { type: "number", description: "周期", required: true },
      },
      category: "technical-analysis",
    },
  };

  return {
    ToolRegistry: {
      get: (name: string) => tools[name] || undefined,
      list: () => Object.values(tools),
      listNames: () => Object.keys(tools),
      has: (name: string) => name in tools,
    },
  };
});

describe("ToolCallValidator", () => {
  it("validates a valid tool call with required params", () => {
    const validator = new ToolCallValidator();
    const result = validator.validate("getStockHistory", { code: "000858" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns error for unknown tool", () => {
    const validator = new ToolCallValidator();
    const result = validator.validate("unknownTool", {});
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("unknown_tool");
    expect(result.suggestion).toBeDefined();
  });

  it("returns error for missing required param", () => {
    const validator = new ToolCallValidator();
    const result = validator.validate("getStockHistory", {});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "missing")).toBe(true);
    expect(result.errors.some((e) => e.field === "code")).toBe(true);
  });

  it("validates with optional params omitted", () => {
    const validator = new ToolCallValidator();
    const result = validator.validate("getStockHistory", { code: "000858" });
    expect(result.valid).toBe(true);
  });
});

describe("CallLimiter", () => {
  it("canCall returns true when under limit", () => {
    const limiter = new CallLimiter({ maxToolCalls: 3 });
    expect(limiter.canCall()).toBe(true);
  });

  it("canCall returns false when limit reached", () => {
    const limiter = new CallLimiter({ maxToolCalls: 2 });
    limiter.increment();
    limiter.increment();
    expect(limiter.canCall()).toBe(false);
  });

  it("getCount tracks increments", () => {
    const limiter = new CallLimiter();
    limiter.increment();
    limiter.increment();
    expect(limiter.getCount()).toBe(2);
  });

  it("reset clears count and cache", () => {
    const limiter = new CallLimiter();
    limiter.increment();
    limiter.setCached("tool", { a: 1 }, "result");
    limiter.reset();
    expect(limiter.getCount()).toBe(0);
    expect(limiter.getCached("tool", { a: 1 })).toBeUndefined();
  });

  it("cache works correctly", () => {
    const limiter = new CallLimiter();
    limiter.setCached("tool", { x: 1 }, "cached_result");
    expect(limiter.getCached("tool", { x: 1 })).toBe("cached_result");
    expect(limiter.getCached("tool", { x: 2 })).toBeUndefined();
  });

  it("executeWithLimit returns cached result", async () => {
    const limiter = new CallLimiter({ maxToolCalls: 5 });
    limiter.setCached("tool", {}, "cached");
    const result = await limiter.executeWithLimit("tool", {}, async () => "new");
    expect(result.fromCache).toBe(true);
    expect(result.result).toBe("cached");
  });

  it("executeWithLimit executes when not cached", async () => {
    const limiter = new CallLimiter({ maxToolCalls: 5 });
    const result = await limiter.executeWithLimit("tool", {}, async () => "fresh");
    expect(result.fromCache).toBe(false);
    expect(result.result).toBe("fresh");
  });

  it("executeWithLimit returns limitReached when limit hit", async () => {
    const limiter = new CallLimiter({ maxToolCalls: 0 });
    const result = await limiter.executeWithLimit("tool", {}, async () => "x");
    expect(result.limitReached).toBe(true);
  });

  it("getConfig returns merged config", () => {
    const limiter = new CallLimiter({ maxToolCalls: 10 });
    expect(limiter.getConfig().maxToolCalls).toBe(10);
    expect(limiter.getConfig().validationRetryLimit).toBe(3);
  });
});
