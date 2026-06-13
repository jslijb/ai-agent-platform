/**
 * 服务适配器单元测试 (U11)
 * SDD + TDD: 测试 main-service 与微服务间的通信
 * 
 * 测试范围:
 * - searchRAG: mock fetch 验证返回格式和错误处理 (6 个测试)
 * - isMicroserviceMode: 验证配置驱动逻辑 (2 个测试)
 * - callLLM/pushEvaluationTask: 需要真实 LLM API 或模块级 vi.mock
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("U11: 服务适配器 ServiceAdapter", () => {
  
  beforeEach(() => {
    process.env.USE_MICROSERVICE = "true";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // ============ searchRAG 测试 ============
  describe("searchRAG — 返回格式与错误处理", () => {
    
    it("U11.1: 微服务正常 → 返回 {success, results, latencyMs}", async () => {
      const mockResponse = {
        success: true,
        results: [{ id: "1", chunkText: "五粮液2025年营收1324亿元", score: 0.95 }],
        latencyMs: 45
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      }) as any;

      const { searchRAG } = await import("@/server/lib/service-adapter");
      const result = await searchRAG("五粮液营收", 10, "trace-001");
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].chunkText).toContain("五粮液");
      expect(result.latencyMs).toBe(45);
      
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toBe("http://localhost:3001/api/retrieve");
      expect(fetchCall[1].headers["X-Trace-Id"]).toBe("trace-001");
      expect(fetchCall[1].headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(fetchCall[1].body)).toEqual({ query: "五粮液营收", topK: 10 });
    });

    it("U11.2: 微服务返回 success=false → 抛出错误", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, error: "No results found" })
      }) as any;

      const { searchRAG } = await import("@/server/lib/service-adapter");
      await expect(searchRAG("xyz不存在的查询", 5)).rejects.toThrow("RAG_SEARCH_FAILED");
    });

    it("U11.3: 微服务 HTTP 500 → 抛出错误", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal Error" })
      }) as any;

      const { searchRAG } = await import("@/server/lib/service-adapter");
      await expect(searchRAG("格力电器")).rejects.toThrow("RAG_SERVICE_UNAVAILABLE");
    });

    it("U11.4: 微服务超时/不可达 → 抛出错误", async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new Error("connect ECONNREFUSED")
      ) as any;

      const { searchRAG } = await import("@/server/lib/service-adapter");
      await expect(searchRAG("五粮液")).rejects.toThrow("RAG_SERVICE_UNAVAILABLE");
    });

    it("U11.5: USE_MICROSERVICE=false → 直接进程内调用", async () => {
      process.env.USE_MICROSERVICE = "false";

      // Mock hybridSearch 避免真实服务调用（CI 中无 embedding/DB 服务）
      vi.doMock("@/server/rag/retrieval/hybrid-retriever", () => ({
        hybridSearch: vi.fn().mockResolvedValue([
          { id: "1", chunkText: "五粮液2025年营收1324亿元", score: 0.95 },
        ]),
      }));

      vi.resetModules();
      const { searchRAG } = await import("@/server/lib/service-adapter");

      const result = await searchRAG("五粮液", 10);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
    });

    it("U11.6: Trace-Id 不传时不应设置 header", async () => {
      const mockResponse = {
        success: true,
        results: [],
        latencyMs: 10
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      }) as any;

      const { searchRAG } = await import("@/server/lib/service-adapter");
      await searchRAG("中国长城");
      
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers["X-Trace-Id"]).toBeUndefined();
      expect(fetchCall[1].headers["Content-Type"]).toBe("application/json");
    });
  });

  // ============ isMicroserviceMode 测试 ============
  describe("isMicroserviceMode — 配置驱动", () => {

    it("U11.7: USE_MICROSERVICE=true 时返回 true", async () => {
      process.env.USE_MICROSERVICE = "true";
      vi.resetModules();
      const { isMicroserviceMode } = await import("@/server/lib/service-adapter");
      expect(isMicroserviceMode()).toBe(true);
    });

    it("U11.8: USE_MICROSERVICE=false 时返回 false", async () => {
      process.env.USE_MICROSERVICE = "false";
      vi.resetModules();
      const { isMicroserviceMode } = await import("@/server/lib/service-adapter");
      expect(isMicroserviceMode()).toBe(false);
    });
  });
});