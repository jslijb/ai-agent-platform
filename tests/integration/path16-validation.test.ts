import { describe, it, expect, beforeEach } from "vitest";
import { ToolCallValidator, type ValidationError } from "@/server/validation/tool-call-validator";
import { CallLimiter } from "@/server/validation/call-limiter";
import { ToolRegistry } from "@/server/tools/registry";
import type { RegisteredTool } from "@/server/agents/skills/types";

function makeTool(name: string, description: string = "测试工具", params: Record<string, { type: string; required?: boolean }> = {}): RegisteredTool {
  return {
    name,
    description,
    parameters: params as Record<string, unknown>,
    execute: async () => ({}),
  };
}

describe("路径16: ToolCallValidator/CallLimiter → EnhancedReActExecutor 校验链", () => {
  describe("ToolCallValidator", () => {
    beforeEach(() => {
      const registry = ToolRegistry as unknown as {
        tools: Map<string, RegisteredTool>;
      };
      registry.tools.clear();

      ToolRegistry.register(makeTool("calculateRSI", "计算RSI", { period: { type: "number", required: true } }));
      ToolRegistry.register(makeTool("calculateMA", "计算MA", { period: { type: "number", required: true } }));
      ToolRegistry.register(makeTool("getStockHistory", "获取历史K线", { code: { type: "string", required: true }, startDate: { type: "string", required: false } }));
      ToolRegistry.register(makeTool("hybridSearch", "RAG检索", { query: { type: "string", required: true } }));
    });

    it("I16.1: 已知工具+正确参数通过校验", () => {
      const validator = new ToolCallValidator();
      const result = validator.validate("calculateRSI", { period: 14 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("I16.2: 不存在工具返回错误", () => {
      const validator = new ToolCallValidator();
      const result = validator.validate("getUnknownMetric", {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("unknown_tool");
      expect(result.errors[0].message).toContain("getUnknownMetric");
    });

    it("I16.3: 必填参数缺失返回错误", () => {
      const validator = new ToolCallValidator();
      const result = validator.validate("calculateRSI", {});
      expect(result.valid).toBe(false);
      const hasMissing = result.errors.some((e: ValidationError) => e.type === "missing");
      expect(hasMissing).toBe(true);
      expect(result.suggestion).toBeDefined();
    });

    it("I16.3b: 可选参数省略仍然通过", () => {
      const validator = new ToolCallValidator();
      const result = validator.validate("getStockHistory", { code: "sz.000858" });
      expect(result.valid).toBe(true);
    });

    it("I16.3c: 不存在工具返回suggestion含可用工具列表", () => {
      const validator = new ToolCallValidator();
      const result = validator.validate("badTool", {});
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain("calculate");
    });
  });

  describe("CallLimiter", () => {
    it("I16.4: 工具调用次数限制生效", () => {
      const limiter = new CallLimiter({ maxToolCalls: 3 });
      expect(limiter.canCall()).toBe(true);
      limiter.increment();
      expect(limiter.canCall()).toBe(true);
      limiter.increment();
      expect(limiter.canCall()).toBe(true);
      limiter.increment();
      expect(limiter.getCount()).toBe(3);
      expect(limiter.canCall()).toBe(false);
    });

    it("I16.7: CallLimiter 缓存命中返回缓存值", async () => {
      const limiter = new CallLimiter({ maxToolCalls: 10 });
      let callCount = 0;
      const executor = async () => { callCount++; return "result-" + callCount; };

      const { result: r1, fromCache: c1, limitReached: l1 } =
        await limiter.executeWithLimit("calculateRSI", { period: 14 }, executor);
      expect(r1).toBe("result-1");
      expect(c1).toBe(false);
      expect(l1).toBe(false);

      const { result: r2, fromCache: c2, limitReached: l2 } =
        await limiter.executeWithLimit("calculateRSI", { period: 14 }, executor);
      expect(r2).toBe("result-1");
      expect(c2).toBe(true);
      expect(l2).toBe(false);
      expect(callCount).toBe(1);
    });

    it("I16.4b: limitReached when maxToolCalls exceeded via executeWithLimit", async () => {
      const limiter = new CallLimiter({ maxToolCalls: 2 });
      const executor = async () => "ok";

      await limiter.executeWithLimit("calculateRSI", { period: 14 }, executor);
      await limiter.executeWithLimit("calculateMA", { period: 20 }, executor);

      const { result, fromCache, limitReached } =
        await limiter.executeWithLimit("calculateRSI", { period: 14 }, executor);
      expect(limitReached).toBe(true);
      expect(result).toBeNull();
      expect(fromCache).toBe(false);
    });

    it("I16.4c: reset clears count and cache", () => {
      const limiter = new CallLimiter({ maxToolCalls: 5 });
      limiter.increment();
      limiter.increment();
      expect(limiter.getCount()).toBe(2);

      limiter.reset();
      expect(limiter.getCount()).toBe(0);
      expect(limiter.canCall()).toBe(true);
    });

    it("I16.7b: 不同参数不命中缓存", async () => {
      const limiter = new CallLimiter({ maxToolCalls: 10 });
      let callCount = 0;
      const executor = async () => { callCount++; return "result-" + callCount; };

      const { result: r1 } = await limiter.executeWithLimit("calculateRSI", { period: 14 }, executor);
      const { result: r2 } = await limiter.executeWithLimit("calculateRSI", { period: 20 }, executor);

      expect(r1).toBe("result-1");
      expect(r2).toBe("result-2");
      expect(callCount).toBe(2);
    });
  });

  describe("Validator + Limiter 组合", () => {
    beforeEach(() => {
      const registry = ToolRegistry as unknown as {
        tools: Map<string, RegisteredTool>;
      };
      registry.tools.clear();
      ToolRegistry.register(makeTool("calculateRSI", "计算RSI", { period: { type: "number", required: true } }));
    });

    it("I16.5: 校验失败→修正后成功", () => {
      const validator = new ToolCallValidator();
      const firstResult = validator.validate("calculateRSI", {});
      expect(firstResult.valid).toBe(false);

      const correctedResult = validator.validate("calculateRSI", { period: 14 });
      expect(correctedResult.valid).toBe(true);
    });

    it("I16.6: 3次校验失败→放弃", () => {
      const validator = new ToolCallValidator();
      const maxRetries = 3;
      let failedCount = 0;

      for (let i = 0; i < maxRetries; i++) {
        const result = validator.validate("badTool", {});
        if (!result.valid) failedCount++;
      }

      expect(failedCount).toBe(maxRetries);
    });

    it("I16.x: validator+limiter 组合流程", async () => {
      const validator = new ToolCallValidator();
      const limiter = new CallLimiter({ maxToolCalls: 5 });

      const validation = validator.validate("calculateRSI", { period: 14 });
      expect(validation.valid).toBe(true);

      if (validation.valid && limiter.canCall()) {
        limiter.increment();
        expect(limiter.getCount()).toBe(1);
      }
    });
  });
});