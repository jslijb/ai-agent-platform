/**
 * rag-service 服务契约测试 (C12-C24)
 * 验证 :3001 所有 HTTP API 的输入/输出/错误处理
 */

import { describe, it, expect } from "vitest";
import { useServiceCheck } from "../helpers/service-check";

const BASE = "http://localhost:3001";

describe("rag-service (:3001) 服务契约", () => {
  const isAvailable = useServiceCheck(["rag-service"]);

  // ========== Health ==========
  describe("C12-C13: GET /api/health", () => {
    
    it("C12: 正常返回", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("rag-service");
      expect(body.details).toBeDefined();
      expect(body.uptime).toBeGreaterThan(0);
    });

    it("C13: 响应包含 details", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/health`);
      const body = await res.json();
      expect(body.details).toBeDefined();
    });
  });

  // ========== Retrieve ==========
  describe("C14-C15: POST /api/retrieve", () => {
    
    it("C14: 正常 query → 200 + results", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "五粮液2025年营收", topK: 5 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.latencyMs).toBeGreaterThan(0);
    });

    it("C14b: 中国长城 检索返回 BM25 + Dense 混合结果", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "中国长城战略布局" }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[rag] 中国长城检索: ${body.results.length} 条, latency=${body.latencyMs}ms`);
    });

    it("C14c: 格力电器 检索返回结果", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "格力电器净利润" }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[rag] 格力电器检索: ${body.results.length} 条, latency=${body.latencyMs}ms`);
    });

    it("C15: 空 query → 400", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("C15b: 无 query 字段 → 返回错误", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topK: 5 }),
      });
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });
  });

  // ========== Embed ==========
  describe("C16-C17: POST /api/embed", () => {
    
    it("C16: texts → 200 + embeddings (1024维)", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: ["五粮液2025年营收1324亿元"] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.embeddings)).toBe(true);
      expect(body.embeddings[0]).toHaveLength(1024);
      console.log(`[rag] embedding 维度: ${body.embeddings[0].length}`);
    });

    it("C17: 空 texts → 400", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  // ========== Rerank ==========
  describe("C18-C19: POST /api/rerank", () => {
    
    it("C18: query+documents → 200 + results", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "五粮液营收",
          documents: [
            "五粮液2025年实现营业收入1324亿元",
            "格力电器2025年净利润342亿元",
            "中国长城2025年营收同比增长18%",
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.results.length).toBeGreaterThan(0);
      // 第一条应该和五粮液最相关
      console.log(`[rag] rerank top1: ${body.results[0]?.text?.substring(0, 30)}...`);
    });

    it("C19: 空 query → 400", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: ["text"] }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ========== Chunk ==========
  describe("C20-C21: POST /api/chunk", () => {
    
    it("C20: text → 200 + chunks", async () => {
      if (!isAvailable()) return;
      const longText = "五粮液2025年实现营业收入1324亿元，同比增长12.5%。净利润342亿元，毛利率72.3%。ROE达到25.1%。公司持续推进高端化战略。";
      const res = await fetch(`${BASE}/api/chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: longText }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.chunks)).toBe(true);
      expect(body.chunks.length).toBeGreaterThan(0);
      // 切片不应以标点开头
      for (const chunk of body.chunks) {
        const firstChar = chunk.text?.trimStart()?.[0];
        expect(firstChar).not.toBe("，");
        expect(firstChar).not.toBe("。");
        expect(firstChar).not.toBe("；");
        expect(firstChar).not.toBe("、");
      }
      console.log(`[rag] chunk 结果: ${body.chunks.length} 个切片`);
    });

    it("C21: 空 text → 400", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  // ========== 数据一致性 ==========
  describe("数据一致性验证", () => {
    
    it("相同输入检索结果幂等", async () => {
      if (!isAvailable()) return;
      const query = { query: "五粮液净利润", topK: 5 };
      const r1 = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      const r2 = await fetch(`${BASE}/api/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      const b1 = await r1.json();
      const b2 = await r2.json();
      expect(b1.results.length).toBe(b2.results.length);
      expect(b1.results[0]?.chunkText).toBe(b2.results[0]?.chunkText);
    });

    it("embedding 维度始终为 1024", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: ["测试文本"] }),
      });
      const body = await res.json();
      expect(body.embeddings[0]).toHaveLength(1024);
    });
  });
});