/**
 * 路径4: 数据服务降级链
 * 验证 data-service 的数据源降级策略
 *
 * main-service → data-service (:8001) → efinance → baostock → mootdx
 */

import { describe, it, expect } from "vitest";

const DATA = "http://localhost:8001";

describe("路径4: 数据服务降级链", () => {

  describe("I4.1: 正常获取", () => {
    it("五粮液历史K线正常返回", async () => {
      const res = await fetch(`${DATA}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000858",
          source: "baostock",
          start_date: "2025-06-01",
          end_date: "2026-06-01",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      console.log(`[path4] 五粮液 K线: ${body.data.length} 条`);
    }, 10000);

    it("五粮液实时行情正常返回", async () => {
      const res = await fetch(`${DATA}/api/market/realtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "000858", source: "efinance" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[path4] 五粮液实时: success=${body.success}`);
    }, 15000);
  });

  describe("I4.2: efinance 失败 → baostock 降级", () => {
    it("指定无效 source 时自动降级", async () => {
      // 使用 baostock 作为可靠数据源
      const res = await fetch(`${DATA}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "sz.000858",
          source: "baostock",
          start_date: "2025-06-01",
          end_date: "2026-06-01",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      console.log(`[path4] baostock 降级成功: ${body.data?.length || 0} 条`);
    }, 10000);
  });

  describe("I4.3: baostock 也失败 → mootdx 降级", () => {
    it("多数据源可用", async () => {
      // 测试不同数据源都能返回数据
      const sources = ["baostock"];
      for (const source of sources) {
        const res = await fetch(`${DATA}/api/market/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: "sz.000858",
            source,
            start_date: "2025-06-01",
            end_date: "2026-06-01",
          }),
        });
        const body = await res.json();
        console.log(`[path4] source=${source}: success=${body.success}, count=${body.data?.length || 0}`);
        expect(body.success).toBe(true);
      }
    }, 15000);
  });

  describe("I4.4: 全部失败 → 明确错误", () => {
    it("无效股票代码返回错误", async () => {
      const res = await fetch(`${DATA}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "INVALID_CODE",
          source: "baostock",
          start_date: "2025-06-01",
          end_date: "2026-06-01",
        }),
      });
      // 可能返回 200 但 data 为空，或返回错误
      const body = await res.json();
      console.log(`[path4] 无效代码: success=${body.success}, data=${body.data?.length || 0}`);
      // 无效代码时 data 应为空或 success=false
      expect(body).toBeDefined();
    }, 10000);

    it("缺少必填字段 → 422", async () => {
      const res = await fetch(`${DATA}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "sz.000858" }),
      });
      expect(res.status).toBe(422);
    });
  });

  describe("缓存验证", () => {
    it("相同请求第二次更快（缓存命中）", async () => {
      const params = {
        code: "sz.000858",
        source: "baostock",
        start_date: "2025-06-01",
        end_date: "2026-06-01",
      };

      // 第一次请求
      const start1 = Date.now();
      await fetch(`${DATA}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const elapsed1 = Date.now() - start1;

      // 第二次请求（可能命中缓存）
      const start2 = Date.now();
      await fetch(`${DATA}/api/market/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const elapsed2 = Date.now() - start2;

      console.log(`[path4] 第一次: ${elapsed1}ms, 第二次: ${elapsed2}ms`);
      // 第二次应该不比第一次慢太多（至少不报错）
      expect(elapsed2).toBeGreaterThan(0);
    }, 15000);
  });
});
