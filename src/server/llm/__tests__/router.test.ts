import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock config 模块
vi.mock("@/server/lib/config", () => ({
  getConfigValue: vi.fn(),
  getRawSection: vi.fn(),
}));

// mock circuit-breaker 模块
vi.mock("@/server/lib/circuit-breaker", () => ({
  withCircuitBreaker: vi.fn((name, fn) => fn()),
  isCircuitOpen: vi.fn(() => false),
  forceOpenCircuit: vi.fn(),
}));

// mock provider 模块
vi.mock("@/server/llm/providers/bailian", () => ({
  callBailian: vi.fn(),
}));

vi.mock("@/server/llm/providers/agnes", () => ({
  callAgnes: vi.fn(),
}));

import { getConfigValue, getRawSection } from "@/server/lib/config";
import { isCircuitOpen, forceOpenCircuit } from "@/server/lib/circuit-breaker";
import { callBailian } from "@/server/llm/providers/bailian";
import { callAgnes } from "@/server/llm/providers/agnes";
import { callWithFallback } from "../router";

describe("LLM Router - 多 Provider 支持", () => {
  const defaultMessages = [
    { role: "user" as const, content: "你好" },
  ];

  const successResponse = {
    content: "你好！",
    toolCalls: undefined,
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：熔断器关闭
    (isCircuitOpen as ReturnType<typeof vi.fn>).mockReturnValue(false);
    // 默认 provider 为 agnes
    (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
      (_section: string, key: string, _default: string = "") => {
        if (key === "provider") return "agnes";
        return "";
      }
    );
  });

  // ==================== Provider 选择 ====================
  describe("根据模型 provider 属性选择调用函数", () => {
    it("provider: agnes 时，使用 callAgnes 调用", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(callAgnes).toHaveBeenCalledWith(
        defaultMessages,
        "agnes-2.0-flash",
        undefined,
        undefined
      );
      expect(callBailian).not.toHaveBeenCalled();
      expect(result.model).toBe("agnes-2.0-flash");
    });

    it("provider: dashscope 时，使用 callBailian 调用", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "qwen-plus", provider: "dashscope" },
        ],
      });
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(callBailian).toHaveBeenCalledWith(
        defaultMessages,
        "qwen-plus",
        undefined,
        undefined
      );
      expect(callAgnes).not.toHaveBeenCalled();
      expect(result.model).toBe("qwen-plus");
    });

    it("模型没有 provider 属性时，使用默认 provider（agnes）", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "some-model" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      // 默认 provider 为 agnes，所以应该调用 callAgnes
      expect(callAgnes).toHaveBeenCalledWith(
        defaultMessages,
        "some-model",
        undefined,
        undefined
      );
      expect(callBailian).not.toHaveBeenCalled();
      expect(result.model).toBe("some-model");
    });

    it("模型没有 provider 属性且 config 默认 provider 为 dashscope 时，使用 callBailian", async () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
        (_section: string, key: string, _default: string = "") => {
          if (key === "provider") return "dashscope";
          return "";
        }
      );
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "some-model" },
        ],
      });
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(callBailian).toHaveBeenCalledWith(
        defaultMessages,
        "some-model",
        undefined,
        undefined
      );
      expect(callAgnes).not.toHaveBeenCalled();
    });
  });

  // ==================== 降级链跨 Provider ====================
  describe("降级链跨 provider", () => {
    it("agnes 失败后降级到 dashscope", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes" },
          { id: "qwen-plus", provider: "dashscope" },
        ],
      });

      // agnes 调用失败
      (callAgnes as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("AGNES API 请求失败: 500 Internal Server Error")
      );
      // dashscope 调用成功
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(callAgnes).toHaveBeenCalledTimes(1);
      expect(callBailian).toHaveBeenCalledWith(
        defaultMessages,
        "qwen-plus",
        undefined,
        undefined
      );
      expect(result.content).toBe("你好！");
      expect(result.model).toBe("qwen-plus");
    });

    it("dashscope 失败后降级到 agnes", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "qwen-plus", provider: "dashscope" },
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });

      // dashscope 调用失败
      (callBailian as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("百炼 API 请求失败: 500 Internal Server Error")
      );
      // agnes 调用成功
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(callBailian).toHaveBeenCalledTimes(1);
      expect(callAgnes).toHaveBeenCalledWith(
        defaultMessages,
        "agnes-2.0-flash",
        undefined,
        undefined
      );
      expect(result.content).toBe("你好！");
      expect(result.model).toBe("agnes-2.0-flash");
    });

    it("所有 provider 都失败时抛出错误", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes" },
          { id: "qwen-plus", provider: "dashscope" },
        ],
      });

      (callAgnes as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("AGNES API 请求失败")
      );
      (callBailian as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("百炼 API 请求失败")
      );

      await expect(callWithFallback(defaultMessages)).rejects.toThrow(
        "所有 LLM 模型均不可用"
      );
    });
  });

  // ==================== 熔断器包含 provider 信息 ====================
  describe("熔断器与降级日志包含 provider 信息", () => {
    it("熔断器名称包含 provider 前缀", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      await callWithFallback(defaultMessages);

      // 验证 isCircuitOpen 被调用时使用了包含 provider 的名称
      expect(isCircuitOpen).toHaveBeenCalledWith("llm-agnes-agnes-2.0-flash");
    });

    it("额度耗尽时强制打开熔断器，名称包含 provider", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "qwen-plus", provider: "dashscope" },
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });

      // dashscope 额度耗尽
      (callBailian as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("AllocationQuota exhausted: 模型 qwen-plus 额度耗尽")
      );
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      await callWithFallback(defaultMessages);

      expect(forceOpenCircuit).toHaveBeenCalledWith(
        "llm-dashscope-qwen-plus",
        expect.stringContaining("qwen-plus")
      );
    });
  });

  // ==================== 参数传递 ====================
  describe("参数正确传递", () => {
    it("temperature 和 tools 正确传递给对应 provider", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "get_weather",
            description: "获取天气",
            parameters: { type: "object", properties: {} },
          },
        },
      ];

      await callWithFallback(defaultMessages, 0.7, false, tools);

      expect(callAgnes).toHaveBeenCalledWith(
        defaultMessages,
        "agnes-2.0-flash",
        0.7,
        tools
      );
    });

    it("requireFunctionCalling 过滤不支持 functionCalling 的模型", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes", functionCalling: true },
          { id: "text-model", provider: "agnes" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      await callWithFallback(defaultMessages, undefined, true);

      // 只有 agnes-2.0-flash 支持 functionCalling
      expect(callAgnes).toHaveBeenCalledWith(
        defaultMessages,
        "agnes-2.0-flash",
        undefined,
        undefined
      );
    });
  });

  // ==================== 返回值包含 provider ====================
  describe("返回值包含 provider 信息", () => {
    it("返回结果包含 provider 字段", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(result).toHaveProperty("provider", "agnes");
      expect(result.model).toBe("agnes-2.0-flash");
    });

    it("模型无 provider 属性时，返回结果包含默认 provider", async () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "some-model" },
        ],
      });
      (callAgnes as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await callWithFallback(defaultMessages);

      expect(result).toHaveProperty("provider", "agnes");
    });
  });
});
