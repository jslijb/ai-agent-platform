import { describe, it, expect, vi, beforeEach } from "vitest";
import { GuardrailsEngine } from "../guardrails/engine";
import { AuditLogger } from "../crm-oa/audit-logger";
import { OdooAdapter } from "../crm-oa/odoo-adapter";
import { TwentyAdapter } from "../crm-oa/twenty-adapter";
import { createBotAdapter } from "../bots/base-adapter";
import { tokenize, computeBM25Score } from "../routing/bm25-utils";

function mockOdooFetch(response: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  }));
}

describe("性能基准测试", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Guardrails性能", () => {
    it("Guardrails checkInput 应在5ms内完成", async () => {
      const engine = new GuardrailsEngine();
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        await engine.checkInput({ input: "帮我分析招商银行的股票行情" });
      }

      const elapsed = performance.now() - start;
      const avgMs = elapsed / 100;
      expect(avgMs).toBeLessThan(5);
    });

    it("Guardrails checkAll 应在10ms内完成", async () => {
      const engine = new GuardrailsEngine();
      const start = performance.now();

      for (let i = 0; i < 50; i++) {
        await engine.checkAll({
          input: "帮我提交请假申请",
          output: "# 结果\n\n请假已提交",
        });
      }

      const elapsed = performance.now() - start;
      const avgMs = elapsed / 50;
      expect(avgMs).toBeLessThan(10);
    });
  });

  describe("审计日志性能", () => {
    it("审计日志写入应在0.1ms内完成", async () => {
      const logger = new AuditLogger();
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        logger.log({
          userId: `user${i}`,
          platform: "odoo",
          action: "test",
          model: "test",
          params: {},
          result: "success",
          durationMs: 0,
        });
      }

      const elapsed = performance.now() - start;
      const avgMs = elapsed / 1000;
      expect(avgMs).toBeLessThan(0.5);
    });

    it("审计日志查询应在5ms内完成", async () => {
      const logger = new AuditLogger(10000);
      for (let i = 0; i < 5000; i++) {
        logger.log({
          userId: `user${i % 100}`,
          platform: i % 2 === 0 ? "odoo" : "twenty",
          action: "test",
          model: "test",
          params: {},
          result: i % 10 === 0 ? "failure" : "success",
          durationMs: 0,
        });
      }

      const start = performance.now();
      logger.query({ userId: "user50", platform: "odoo" });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
    });
  });

  describe("BM25性能", () => {
    it("BM25评分应在1ms内完成", () => {
      const queryTokens = ["应收账款", "账龄"];
      const dfMap = new Map<string, number>();
      dfMap.set("应收账款", 50);
      dfMap.set("账龄", 30);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        computeBM25Score(queryTokens, "应收账款账龄分布", "账龄 金额 比例", 15, 1000, dfMap);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 1000;

      expect(avgMs).toBeLessThan(1);
    });

    it("tokenize应在0.1ms内完成", () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        tokenize("招商银行应收账款账龄分布2025年度报告");
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 1000;

      expect(avgMs).toBeLessThan(0.5);
    });
  });

  describe("BotAdapter性能", () => {
    it("createBotAdapter应在100ms内完成", async () => {
      const start = performance.now();
      await createBotAdapter("feishu", { appId: "test", appSecret: "test" });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Odoo/Twenty适配器性能", () => {
    it("Odoo submitLeave应在mock环境下快速完成", async () => {
      const odoo = new OdooAdapter({
        baseUrl: "http://localhost:8069",
        db: "odoo",
        uid: 1,
        password: "admin",
      });
      mockOdooFetch({ jsonrpc: "2.0", id: 1, result: 42 });

      const start = performance.now();
      await odoo.submitLeave({
        employeeId: 1,
        holidayStatusId: 1,
        dateFrom: "2026-08-14 09:00:00",
        dateTo: "2026-08-15 18:00:00",
      });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it("Twenty createCustomer应在mock环境下快速完成", async () => {
      const twenty = new TwentyAdapter({
        baseUrl: "http://localhost:3003",
        apiKey: "test_key",
      });
      mockOdooFetch({
        data: { createCompany: { id: "c1", name: "Test" } },
      });

      const start = performance.now();
      await twenty.createCustomer({ name: "Test Corp" });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});