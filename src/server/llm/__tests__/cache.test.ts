import { describe, it, expect, vi, beforeEach } from "vitest";

// mock bailian provider
vi.mock("@/server/llm/providers/bailian", () => ({
  callBailian: vi.fn(),
}));

import { callBailian } from "@/server/llm/providers/bailian";
import { callBailianWithCache, clearCache, getCacheStats } from "../cache";

describe("LLM Cache - Provider 支持", () => {
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
    clearCache();
  });

  // ==================== 缓存 key 包含 provider ====================
  describe("缓存 key 包含 provider 信息", () => {
    it("不同 provider 的相同模型名不会缓存混淆", async () => {
      // 第一次用 agnes provider 调用
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...successResponse,
        content: "来自 agnes 的回复",
      });
      const result1 = await callBailianWithCache(defaultMessages, "my-model", 0, "agnes");

      // 第二次用 dashscope provider 调用相同模型名
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...successResponse,
        content: "来自 dashscope 的回复",
      });
      const result2 = await callBailianWithCache(defaultMessages, "my-model", 0, "dashscope");

      // 两次应该都实际调用了 API（没有命中缓存）
      expect(callBailian).toHaveBeenCalledTimes(2);
      expect(result1.content).toBe("来自 agnes 的回复");
      expect(result2.content).toBe("来自 dashscope 的回复");
    });

    it("相同 provider 和模型名会命中缓存", async () => {
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      await callBailianWithCache(defaultMessages, "my-model", 0, "agnes");
      const result2 = await callBailianWithCache(defaultMessages, "my-model", 0, "agnes");

      // 第二次应该命中缓存，只调用一次 API
      expect(callBailian).toHaveBeenCalledTimes(1);
      expect(result2.content).toBe("你好！");
    });

    it("不传 provider 时使用默认值 default", async () => {
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      await callBailianWithCache(defaultMessages, "my-model", 0);
      const result2 = await callBailianWithCache(defaultMessages, "my-model", 0);

      // 不传 provider 两次调用应该命中缓存
      expect(callBailian).toHaveBeenCalledTimes(1);
      expect(result2.content).toBe("你好！");
    });

    it("有 provider 和无 provider 的缓存不会混淆", async () => {
      // 不带 provider
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...successResponse,
        content: "无 provider",
      });
      await callBailianWithCache(defaultMessages, "my-model", 0);

      // 带 provider
      (callBailian as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...successResponse,
        content: "有 provider",
      });
      const result2 = await callBailianWithCache(defaultMessages, "my-model", 0, "agnes");

      // 两次都应实际调用 API
      expect(callBailian).toHaveBeenCalledTimes(2);
      expect(result2.content).toBe("有 provider");
    });
  });
});
