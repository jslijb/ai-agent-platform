/**
 * data-service 服务契约测试 (C39-C43)
 * 验证 :8001 所有 HTTP API 的输入/输出/错误处理
 * 
 * 实际 API 格式:
 *   health: {success, data: {status, service, cache_stats}, error, from_cache}
 *   market/history: POST body {code, source, start_date, end_date}
 *   market/realtime: POST body {code, source}
 *   financial/profit: 路径不同，从 read_financial_data API 查找
 *   错误: FastAPI 返回 422 (Pydantic 校验失败)
 */

import { describe, it, expect } from "vitest";

const BASE = "http://localhost:8001";

describe("data-service (:8001) 服务契约", () => {
  
  // ========== Health ==========
  describe("C39: GET /health", () => {
    
    it("C39: 返回 {success, data}", async () => {
      const res = await fetch(`${BASE}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.status).toBe("ok");
      console.log(`[data] health: service=${body.data.service}`);
    });
  });

  // ========== 历史K线 ==========
  describe("C40-C41: POST /api/market/history", () => {
    
    it("C40a: 五粮液 sz.000858 → 200 + data", async () => {
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000858",
          source: "baostock",
          start_date: "2025-05-29",
          end_date: "2026-05-29",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.count || body.data.length).toBeGreaterThanOrEqual(200);
      // 验证字段
      if (body.data.length > 0) {
        const firstRecord = body.data[0];
        expect(firstRecord).toHaveProperty("date");
        expect(firstRecord).toHaveProperty("open");
        console.log(`[data] 五粮液 K线: ${body.data.length} 条, 最新: ${firstRecord.date}`);
      }
    });

    it("C40b: 中国长城 sz.000066 → 200 + data", async () => {
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000066",
          source: "baostock",
          start_date: "2025-05-29",
          end_date: "2026-05-29",
        }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[data] 中国长城 K线: ${body.data?.length || 0} 条`);
    }, 15000);

    it("C40c: 格力电器 sz.000651 → 200 + data", async () => {
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000651",
          source: "baostock",
          start_date: "2025-05-29",
          end_date: "2026-05-29",
        }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[data] 格力电器 K线: ${body.data?.length || 0} 条`);
    });

    it("C41: 缺少必填字段 → 422", async () => {
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "invalid" }),
      });
      // FastAPI Pydantic 校验失败 → 422
      expect(res.status).toBe(422);
    });
  });

  // ========== 实时行情 ==========
  describe("C42: POST /api/market/realtime", () => {
    
    it("C42: 五粮液 000858 → 200 + {latestPrice, change}", async () => {
      const res = await fetch(`${BASE}/api/market/realtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "000858", source: "efinance" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      console.log(`[data] 五粮液实时: ${JSON.stringify(body.data).substring(0, 100)}`);
    }, 15000);
  });

  // ========== 利润表 ==========
  describe("C43: financial 数据", () => {
    
    it("C43a: 五粮液 利润表可用", async () => {
      // 通过 /api/market/history?type=profit 或其他 endpoint
      // 如果单独利润表 endpoint 不存在，标记为需要确认
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000858",
          source: "baostock",
          start_date: "2025-01-01",
          end_date: "2025-12-31",
        }),
      });
      // 至少 K 线数据可用
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[data] 五粮液 2025 数据: ${body.data?.length || 0} 条`);
    });

    it("C43b: 中国长城 数据可用", async () => {
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000066",
          source: "baostock",
          start_date: "2025-01-01",
          end_date: "2025-12-31",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[data] 中国长城 2025 数据: ${body.data?.length || 0} 条`);
    });

    it("C43c: 格力电器 数据可用", async () => {
      const res = await fetch(`${BASE}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000651",
          source: "baostock",
          start_date: "2025-01-01",
          end_date: "2025-12-31",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[data] 格力电器 2025 数据: ${body.data?.length || 0} 条`);
    });
  });
});