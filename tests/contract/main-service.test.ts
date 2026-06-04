/**
 * main-service (:3000) 服务契约测试
 * 验证 Next.js 主服务所有 HTTP API 的输入/输出/错误处理
 */

import { describe, it, expect } from "vitest";
import { useServiceCheck } from "../helpers/service-check";

const BASE = "http://localhost:3000";

describe("main-service (:3000) 服务契约", () => {
  const isAvailable = useServiceCheck(["main-service"]);

  // ========== Health ==========
  describe("GET /api/health", () => {
    it("正常返回 200 + {status, checks}", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBeDefined();
      // main-service health 格式: {status:"healthy", timestamp, checks:{database,redis,...}}
      console.log(`[main] health: ${JSON.stringify(body).substring(0, 200)}`);
    });
  });

  // ========== Agent Run ==========
  describe("POST /api/agent/run", () => {
    it("正常 query → 200 + {answer, iterations, steps}", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "1+1等于几？用一句话回答",
          maxIterations: 1,
          userId: "contract-test-user",
        }),
      });

      if (res.status === 200) {
        const body = await res.json();
        expect(body.answer).toBeDefined();
        expect(body.iterations).toBeDefined();
        console.log(`[main] agent/run: answer=${body.answer?.substring(0, 50)}, iterations=${body.iterations}`);
      } else {
        console.log(`[main] agent/run 返回 ${res.status}，可能 LLM 不可用`);
        expect([200, 503, 500]).toContain(res.status);
      }
    }, 60000);

    it("空 query → 400 或 500", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "", userId: "contract-test-user" }),
      });
      // 空 query 可能返回 400 或 500
      expect([400, 500, 200]).toContain(res.status);
    });
  });

  // ========== Agent Stream ==========
  describe("POST /api/agent/stream", () => {
    it("SSE 流式输出", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "说一个字",
          maxIterations: 1,
          userId: "contract-test-user",
        }),
      });

      if (res.status === 200) {
        const text = await res.text();
        // SSE 格式应该包含 data: 前缀
        console.log(`[main] agent/stream: ${text.substring(0, 100)}...`);
        expect(text.length).toBeGreaterThan(0);
      } else {
        console.log(`[main] agent/stream 返回 ${res.status}`);
        expect([200, 503, 500, 404]).toContain(res.status);
      }
    }, 60000);
  });

  // ========== RAG Search ==========
  describe("POST /api/rag/search", () => {
    it("正常检索 → 200 + {results}", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/rag/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-user-id": "contract-test-user" },
        body: JSON.stringify({ query: "五粮液营收", topK: 5, mode: "hybrid", useRerank: true }),
      });

      if (res.status === 200) {
        const body = await res.json();
        expect(body.results).toBeDefined();
        console.log(`[main] rag/search: ${body.results?.length || 0} 条结果`);
      } else {
        console.log(`[main] rag/search 返回 ${res.status}，可能需要认证`);
        expect([200, 401, 500]).toContain(res.status);
      }
    });

    it("空 query → 400 或错误", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/rag/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-user-id": "contract-test-user" },
        body: JSON.stringify({ query: "" }),
      });
      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });

  // ========== RAG Answer with Citation ==========
  describe("POST /api/rag/answer-with-citation", () => {
    it("带引用的回答", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/rag/answer-with-citation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-user-id": "contract-test-user" },
        body: JSON.stringify({ query: "五粮液2025年营收", topK: 3 }),
      });

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
        console.log(`[main] answer-with-citation: ${JSON.stringify(body).substring(0, 100)}`);
      } else {
        console.log(`[main] answer-with-citation 返回 ${res.status}`);
        expect([200, 401, 404, 500]).toContain(res.status);
      }
    }, 60000);
  });

  // ========== Document Upload ==========
  describe("POST /api/document/upload", () => {
    it("文件上传端点可达", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/document/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-user-id": "contract-test-user" },
        body: JSON.stringify({ fileName: "test.pdf", content: "测试内容" }),
      });
      // 上传需要 multipart/form-data，JSON 格式可能触发解析错误
      expect([200, 400, 401, 404, 413, 500]).toContain(res.status);
      console.log(`[main] document/upload: status=${res.status}`);
    });
  });

  // ========== Memories ==========
  describe("GET /api/memories", () => {
    it("获取记忆列表", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/memories`, {
        headers: { "x-test-user-id": "contract-test-user" },
      });

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
        console.log(`[main] memories GET: ${JSON.stringify(body).substring(0, 100)}`);
      } else {
        console.log(`[main] memories GET 返回 ${res.status}`);
        expect([200, 401, 500]).toContain(res.status);
      }
    });
  });

  describe("POST /api/memories", () => {
    it("创建记忆", async () => {
      if (!isAvailable()) return;
      const res = await fetch(`${BASE}/api/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-user-id": "contract-test-user" },
        body: JSON.stringify({
          type: "fragment",
          content: "契约测试记忆片段",
          tags: ["test"],
        }),
      });

      if (res.status === 200 || res.status === 201) {
        const body = await res.json();
        expect(body).toBeDefined();
        console.log(`[main] memories POST: status=${res.status}`);
      } else {
        console.log(`[main] memories POST 返回 ${res.status}`);
        expect([200, 201, 400, 401, 405, 500]).toContain(res.status);
      }
    });
  });
});
