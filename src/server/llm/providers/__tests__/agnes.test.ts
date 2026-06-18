import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock config 模块
vi.mock("@/server/lib/config", () => ({
  getConfigValue: vi.fn(),
  getRawSection: vi.fn(),
}));

// mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getConfigValue, getRawSection } from "@/server/lib/config";
import { callAgnes, getAgnesApiKey, resolveAgnesModel } from "../agnes";

describe("AGNES AI Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认设置环境变量
    process.env.AGNES_KEY = "test-agnes-key";
  });

  afterEach(() => {
    delete process.env.AGNES_KEY;
    delete process.env.AGNES_BASE_URL;
  });

  // ==================== API Key 读取 ====================
  describe("getAgnesApiKey - API Key 读取", () => {
    it("优先从 config 读取 llm.AGNES_KEY", () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockReturnValue("config-agnes-key");
      process.env.AGNES_KEY = "env-agnes-key";

      const key = getAgnesApiKey();
      expect(key).toBe("config-agnes-key");
      expect(getConfigValue).toHaveBeenCalledWith("llm", "AGNES_KEY", "");
    });

    it("config 无值时从环境变量 AGNES_KEY 读取", () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockReturnValue("");

      const key = getAgnesApiKey();
      expect(key).toBe("test-agnes-key");
    });

    it("config 和环境变量都无值时抛出错误", () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockReturnValue("");
      delete process.env.AGNES_KEY;

      expect(() => getAgnesApiKey()).toThrow("AGNES_KEY 环境变量未设置");
    });
  });

  // ==================== 模型名解析 ====================
  describe("resolveAgnesModel - 模型名解析", () => {
    it("从 config 的 llm.models 中找 provider=agnes 的模型", () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "qwen-plus", provider: "bailian" },
          { id: "agnes-2.0-flash", provider: "agnes" },
        ],
      });

      const model = resolveAgnesModel();
      expect(model).toBe("agnes-2.0-flash");
    });

    it("没有 provider=agnes 的模型时抛出错误", () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [
          { id: "qwen-plus", provider: "bailian" },
        ],
      });

      expect(() => resolveAgnesModel()).toThrow("未找到 provider=agnes 的模型");
    });

    it("models 列表为空时抛出错误", () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [],
      });

      expect(() => resolveAgnesModel()).toThrow("未找到 provider=agnes 的模型");
    });

    it("llm section 不存在时抛出错误", () => {
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({});

      expect(() => resolveAgnesModel()).toThrow("未找到 provider=agnes 的模型");
    });
  });

  // ==================== callAgnes 函数 ====================
  describe("callAgnes - 调用函数", () => {
    const defaultMessages = [
      { role: "user" as const, content: "你好" },
    ];

    function mockSuccessResponse(content: string, toolCalls?: any[], usage?: any) {
      const choice: any = {
        message: { content },
      };
      if (toolCalls) {
        choice.message.tool_calls = toolCalls;
      }
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [choice],
          usage: usage || { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: vi.fn().mockResolvedValue(""),
      };
    }

    it("发送正确的请求格式", async () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
        (_section: string, key: string, _default: string = "") => {
          if (key === "AGNES_KEY") return "test-key";
          if (key === "AGNES_BASE_URL") return "";
          return "";
        }
      );
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [{ id: "agnes-2.0-flash", provider: "agnes" }],
      });

      mockFetch.mockResolvedValue(mockSuccessResponse("你好！"));

      const result = await callAgnes(defaultMessages);

      expect(result.content).toBe("你好！");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 验证请求格式
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://apihub.agnes-ai.com/v1/chat/completions");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      });

      const body = JSON.parse(options.body);
      expect(body.model).toBe("agnes-2.0-flash");
      expect(body.messages).toEqual(defaultMessages);
      expect(body.temperature).toBe(0);
    });

    it("使用自定义 base_url", async () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
        (_section: string, key: string, _default: string = "") => {
          if (key === "AGNES_KEY") return "test-key";
          if (key === "AGNES_BASE_URL") return "https://custom-api.example.com/v1";
          return "";
        }
      );
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [{ id: "agnes-2.0-flash", provider: "agnes" }],
      });

      mockFetch.mockResolvedValue(mockSuccessResponse("OK"));

      await callAgnes(defaultMessages);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://custom-api.example.com/v1/chat/completions");
    });

    it("支持 tool_calls", async () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
        (_section: string, key: string, _default: string = "") => {
          if (key === "AGNES_KEY") return "test-key";
          if (key === "AGNES_BASE_URL") return "";
          return "";
        }
      );
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [{ id: "agnes-2.0-flash", provider: "agnes" }],
      });

      const toolCalls = [
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"北京"}' },
        },
      ];
      mockFetch.mockResolvedValue(mockSuccessResponse(null, toolCalls));

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "get_weather",
            description: "获取天气",
            parameters: { type: "object", properties: { city: { type: "string" } } },
          },
        },
      ];

      const result = await callAgnes(defaultMessages, undefined, undefined, tools);

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls!.length).toBe(1);
      expect(result.toolCalls![0].function.name).toBe("get_weather");

      // 验证请求体包含 tools
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe("auto");
    });

    it("返回 usage 信息", async () => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
        (_section: string, key: string, _default: string = "") => {
          if (key === "AGNES_KEY") return "test-key";
          if (key === "AGNES_BASE_URL") return "";
          return "";
        }
      );
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [{ id: "agnes-2.0-flash", provider: "agnes" }],
      });

      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      mockFetch.mockResolvedValue(mockSuccessResponse("OK", undefined, usage));

      const result = await callAgnes(defaultMessages);

      expect(result.usage).toEqual(usage);
    });
  });

  // ==================== 重试机制 ====================
  describe("callAgnes - 重试机制", () => {
    const defaultMessages = [
      { role: "user" as const, content: "你好" },
    ];

    beforeEach(() => {
      (getConfigValue as ReturnType<typeof vi.fn>).mockImplementation(
        (_section: string, key: string, _default: string = "") => {
          if (key === "AGNES_KEY") return "test-key";
          if (key === "AGNES_BASE_URL") return "";
          return "";
        }
      );
      (getRawSection as ReturnType<typeof vi.fn>).mockReturnValue({
        models: [{ id: "agnes-2.0-flash", provider: "agnes" }],
      });
    });

    it("500 错误可重试，最终成功", async () => {
      const failResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "成功了" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: vi.fn().mockResolvedValue(""),
      };

      mockFetch
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await callAgnes(defaultMessages);

      expect(result.content).toBe("成功了");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("401 错误不可重试，立即抛出", async () => {
      const failResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue("Unauthorized"),
      };

      mockFetch.mockResolvedValue(failResponse);

      await expect(callAgnes(defaultMessages)).rejects.toThrow("不可重试");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("403 错误不可重试，立即抛出", async () => {
      const failResponse = {
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue("Forbidden"),
      };

      mockFetch.mockResolvedValue(failResponse);

      await expect(callAgnes(defaultMessages)).rejects.toThrow("不可重试");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("400 错误不可重试，立即抛出", async () => {
      const failResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("Bad Request"),
      };

      mockFetch.mockResolvedValue(failResponse);

      await expect(callAgnes(defaultMessages)).rejects.toThrow("不可重试");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("连续 500 错误超过最大重试次数后抛出", async () => {
      const failResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      };

      mockFetch.mockResolvedValue(failResponse);

      await expect(callAgnes(defaultMessages)).rejects.toThrow("AGNES API 请求失败");
      expect(mockFetch).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
    });

    it("超时后重试", async () => {
      // 第一次超时（AbortError），第二次成功
      const abortError = new DOMException("The operation was aborted", "AbortError");
      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "超时后重试成功" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: vi.fn().mockResolvedValue(""),
      };

      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(successResponse);

      const result = await callAgnes(defaultMessages);

      expect(result.content).toBe("超时后重试成功");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("连续超时超过2次后抛出错误", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");

      mockFetch.mockRejectedValue(abortError);

      await expect(callAgnes(defaultMessages)).rejects.toThrow("请求超时");
      // 超时重试逻辑：attempt >= 2 时抛出，所以最多2次
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("返回内容为空且无 tool_calls 时重试", async () => {
      const emptyResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: null } }],
          usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        }),
        text: vi.fn().mockResolvedValue(""),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "重试后有内容了" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: vi.fn().mockResolvedValue(""),
      };

      mockFetch
        .mockResolvedValueOnce(emptyResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await callAgnes(defaultMessages);

      expect(result.content).toBe("重试后有内容了");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== 类型导出 ====================
  describe("类型导出", () => {
    it("应导出 AgnesMessage, AgnesTool, AgnesToolCall, AgnesResponse 类型", async () => {
      // 验证模块导出了这些类型（编译时检查，运行时只要不报错即可）
      const mod = await import("../agnes");
      // 类型别名在运行时不存在，但我们可以验证函数和接口的使用
      expect(typeof mod.callAgnes).toBe("function");
      expect(typeof mod.getAgnesApiKey).toBe("function");
      expect(typeof mod.resolveAgnesModel).toBe("function");
    });
  });
});
