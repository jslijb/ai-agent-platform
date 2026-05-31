import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { PaddleOCRMcpClient } from "../vision/paddleocr-mcp-client";
import { VisionFallbackClient } from "../vision/vision-fallback-client";
import { DualEngineRouter } from "../vision/dual-engine-router";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaddleOCRMcpClient", () => {
  it("isEnabled returns false when env not set", () => {
    const original = process.env.PADDLEOCR_MCP_ENABLED;
    delete process.env.PADDLEOCR_MCP_ENABLED;
    const client = new PaddleOCRMcpClient();
    expect(client.isEnabled()).toBe(false);
    if (original !== undefined) process.env.PADDLEOCR_MCP_ENABLED = original;
  });

  it("analyze returns error when disabled", async () => {
    delete process.env.PADDLEOCR_MCP_ENABLED;
    const client = new PaddleOCRMcpClient();
    const result = await client.analyze("base64data");
    expect(result.success).toBe(false);
    expect(result.error).toContain("未启用");
  });

  it("analyze calls fetch when enabled and returns success", async () => {
    process.env.PADDLEOCR_MCP_ENABLED = "true";
    process.env.PADDLEOCR_MCP_ENDPOINT = "http://localhost:8020";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "OCR结果", structured: { key: "val" } }),
    });
    const client = new PaddleOCRMcpClient();
    const result = await client.analyze("base64data");
    expect(result.success).toBe(true);
    expect(result.text).toBe("OCR结果");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    delete process.env.PADDLEOCR_MCP_ENABLED;
    delete process.env.PADDLEOCR_MCP_ENDPOINT;
  });

  it("analyze handles API error", async () => {
    process.env.PADDLEOCR_MCP_ENABLED = "true";
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    const client = new PaddleOCRMcpClient();
    const result = await client.analyze("base64data");
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
    delete process.env.PADDLEOCR_MCP_ENABLED;
  });
});

describe("VisionFallbackClient", () => {
  it("isAvailable returns false without apiKey", () => {
    delete process.env.DASHSCOPE_API_KEY;
    const client = new VisionFallbackClient();
    expect(client.isAvailable()).toBe(false);
  });

  it("analyze returns error when not available", async () => {
    delete process.env.DASHSCOPE_API_KEY;
    const client = new VisionFallbackClient();
    const result = await client.analyze("img");
    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置");
  });

  it("analyze returns error when fallback disabled", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.VISION_FALLBACK_ENABLED = "false";
    const client = new VisionFallbackClient();
    const result = await client.analyze("img");
    expect(result.success).toBe(false);
    expect(result.error).toContain("未启用");
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.VISION_FALLBACK_ENABLED;
  });

  it("analyze calls fetch and returns success", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.VISION_FALLBACK_ENABLED = "true";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "图片描述" } }],
        usage: { total_tokens: 100 },
      }),
    });
    const client = new VisionFallbackClient();
    const result = await client.analyze("base64img", "描述图片");
    expect(result.success).toBe(true);
    expect(result.description).toBe("图片描述");
    expect(result.tokenUsage).toBe(100);
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.VISION_FALLBACK_ENABLED;
  });
});

describe("DualEngineRouter", () => {
  it("returns error when both engines unavailable", async () => {
    delete process.env.PADDLEOCR_MCP_ENABLED;
    delete process.env.DASHSCOPE_API_KEY;
    process.env.VISION_FALLBACK_ENABLED = "true";
    const router = new DualEngineRouter();
    const result = await router.analyze("img");
    expect(result.success).toBe(false);
    expect(result.degradationReason).toContain("不可用");
    delete process.env.VISION_FALLBACK_ENABLED;
  });
});
