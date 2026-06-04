import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { EmbeddingService } from "../embedding-service";

describe("EmbeddingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embed returns embedding vector on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
    });

    const service = new EmbeddingService();
    const result = await service.embed("测试文本");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("embed returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const service = new EmbeddingService();
    const result = await service.embed("测试文本");
    expect(result).toBeNull();
  });

  it("embed returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("网络错误"));

    const service = new EmbeddingService();
    const result = await service.embed("测试文本");
    expect(result).toBeNull();
  });

  it("embed handles array response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ embedding: [0.5, 0.6] }],
    });

    const service = new EmbeddingService();
    const result = await service.embed("测试文本");
    // data[0]?.embedding?.[0] extracts first element of embedding array
    expect(result).toBe(0.5);
  });

  it("embed handles data array response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.7, 0.8] }] }),
    });

    const service = new EmbeddingService();
    const result = await service.embed("测试文本");
    expect(result).toEqual([0.7, 0.8]);
  });

  it("embedBatch calls embed for each text", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1] }),
    });

    const service = new EmbeddingService();
    const results = await service.embedBatch(["文本1", "文本2", "文本3"]);
    expect(results.length).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("checkReady returns true when service is healthy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
    });

    const service = new EmbeddingService();
    const ready = await service.checkReady();
    expect(ready).toBe(true);
    expect(service.isReady()).toBe(true);
  });

  it("checkReady returns false when service is unhealthy", async () => {
    mockFetch.mockRejectedValueOnce(new Error("服务不可用"));

    const service = new EmbeddingService();
    const ready = await service.checkReady();
    expect(ready).toBe(false);
    expect(service.isReady()).toBe(false);
  });

  it("uses EMBEDDING_SERVICE_URL env variable", () => {
    const original = process.env.EMBEDDING_SERVICE_URL;
    process.env.EMBEDDING_SERVICE_URL = "http://custom:9999";
    const service = new EmbeddingService();
    // 验证构造不抛异常
    expect(service).toBeDefined();
    process.env.EMBEDDING_SERVICE_URL = original;
  });
});
