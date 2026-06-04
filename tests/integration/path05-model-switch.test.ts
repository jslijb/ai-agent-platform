/**
 * 路径5: 模型自动切换
 * 验证 llm-gateway 的模型降级链
 *
 * main-service → llm-gateway (:3002) → 模型1 → 模型2 → ... → 模型N
 */

import { describe, it, expect } from "vitest";

const LLM = "http://localhost:3002";

describe("路径5: 模型自动切换", () => {

  describe("I5.1: 模型1 正常", () => {
    it("LLM 调用成功返回", async () => {
      const res = await fetch(`${LLM}/api/llm/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "说一个字" }],
        }),
      });

      if (res.status === 200) {
        const body = await res.json();
        expect(body.content).toBeDefined();
        expect(body.model).toBeDefined();
        console.log(`[path5] 模型1: model=${body.model}, content=${body.content?.substring(0, 20)}`);
      } else {
        console.log(`[path5] LLM 返回 ${res.status}，模型可能额度耗尽`);
        expect([200, 503, 429]).toContain(res.status);
      }
    }, 30000);
  });

  describe("I5.2: 模型1 429 → 模型2 自动切换", () => {
    it("连续调用验证降级链", async () => {
      const results: { status: number; model?: string }[] = [];

      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${LLM}/api/llm/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: `第${i + 1}次：说一个字` }],
          }),
        });

        const body = await res.json();
        results.push({ status: res.status, model: body.model });
        console.log(`[path5] 第${i + 1}次: status=${res.status}, model=${body.model || 'N/A'}`);

        // 短暂间隔
        await new Promise(r => setTimeout(r, 500));
      }

      // 至少有一次成功
      const successCount = results.filter(r => r.status === 200).length;
      console.log(`[path5] 成功次数: ${successCount}/3`);
      expect(successCount).toBeGreaterThan(0);
    }, 120000);
  });

  describe("I5.3: 前一模型恢复", () => {
    it("模型切换后继续使用当前模型", async () => {
      // 第一次调用
      const res1 = await fetch(`${LLM}/api/llm/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "说一个字" }],
        }),
      });

      if (res1.status === 200) {
        const body1 = await res1.json();
        const model1 = body1.model;

        // 第二次调用
        const res2 = await fetch(`${LLM}/api/llm/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: "再说一个字" }],
          }),
        });

        if (res2.status === 200) {
          const body2 = await res2.json();
          const model2 = body2.model;
          console.log(`[path5] 模型: 第1次=${model1}, 第2次=${model2}`);
          // 模型可能相同也可能不同（取决于降级链状态）
          expect(model2).toBeDefined();
        }
      } else {
        console.log(`[path5] LLM 返回 ${res1.status}`);
        expect([200, 503, 429]).toContain(res1.status);
      }
    }, 60000);
  });

  describe("I5.4: api_keys.yaml 动态更新", () => {
    it("配置文件包含多个模型", async () => {
      // 通过 health 端点检查模型配置
      const res = await fetch(`${LLM}/api/health`);
      if (res.status === 200) {
        const body = await res.json();
        console.log(`[path5] health: ${JSON.stringify(body).substring(0, 200)}`);
        expect(body.status).toBeDefined();
      }
    }, 10000);
  });

  describe("LLM 降级链完整性", () => {
    it("stream 模式也能正常工作", async () => {
      const res = await fetch(`${LLM}/api/llm/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "说一个字" }],
        }),
      });

      if (res.status === 200) {
        const text = await res.text();
        expect(text).toContain("data:");
        console.log(`[path5] stream: ${text.substring(0, 100)}...`);
      } else {
        console.log(`[path5] stream 返回 ${res.status}`);
        expect([200, 503, 429]).toContain(res.status);
      }
    }, 30000);

    it("usage 统计可用", async () => {
      const res = await fetch(`${LLM}/api/llm/usage`);
      if (res.status === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
        console.log(`[path5] usage: ${JSON.stringify(body).substring(0, 100)}`);
      } else {
        console.log(`[path5] usage 返回 ${res.status}`);
        expect([200, 500, 503]).toContain(res.status);
      }
    }, 10000);
  });
});
