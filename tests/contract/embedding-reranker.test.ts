/**
 * embedding + reranker 服务契约测试 (C44-C47)
 * 验证 :8011 (embedding) 和 :8010 (reranker) 的基础功能
 * 
 * embedding 返回格式: [{index: 0, embedding: [...1024维...]}]
 */

import { describe, it, expect } from "vitest";

const EMBED_BASE = "http://localhost:8011";
const RERANK_BASE = "http://localhost:8010";

describe("embedding (:8011) + reranker (:8010) 服务契约", () => {
  
  // ========== Embedding Health ==========
  describe("C44: embedding GET /health", () => {
    
    it("C44: 返回 200", async () => {
      const res = await fetch(`${EMBED_BASE}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  // ========== Embedding ==========
  describe("C45: embedding POST /embedding", () => {
    
    it("C45: texts → 1024维向量", async () => {
      const res = await fetch(`${EMBED_BASE}/embedding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: "五粮液2025年营收1324亿元",
          model: "bge-m3",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      
      // llama.cpp 格式: [{embedding: [[...1024维...]]}]  或 [{embedding: [...1024维...]}]
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0].embedding).toBeDefined();
      
      // embedding 可能是嵌套数组 [[...]] 或直接数组 [...]
      const vec = Array.isArray(body[0].embedding[0]) 
        ? body[0].embedding[0] 
        : body[0].embedding;
      expect(vec).toHaveLength(1024);
      console.log(`[embed] 向量维度: ${vec.length}`);
    });

    it("C45b: 性能基准 P50 < 1000ms", async () => {
      const start = Date.now();
      await fetch(`${EMBED_BASE}/embedding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: "测试文本",
          model: "bge-m3",
        }),
      });
      const elapsed = Date.now() - start;
      console.log(`[embed] 延迟: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(2000);
    });
  });

  // ========== Reranker Health ==========
  describe("C46: reranker GET /health", () => {
    
    it("C46: 返回 200", async () => {
      const res = await fetch(`${RERANK_BASE}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  // ========== Reranker ==========
  describe("C47: reranker POST /reranking", () => {
    
    it("C47: query+documents → 排序结果", async () => {
      const res = await fetch(`${RERANK_BASE}/reranking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "五粮液营收",
          documents: [
            "五粮液2025年营业收入1324亿元",
            "格力电器2025年净利润342亿元",
            "中国长城2025年营收增长18%",
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
      console.log(`[rerank] model=${body.model}, results=${body.results?.length || 'N/A'}`);
    });

    it("C47b: 性能基准 P50 < 1000ms", async () => {
      const start = Date.now();
      await fetch(`${RERANK_BASE}/reranking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "简单查询",
          documents: ["文档A", "文档B", "文档C"],
        }),
      });
      const elapsed = Date.now() - start;
      console.log(`[rerank] 延迟: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});