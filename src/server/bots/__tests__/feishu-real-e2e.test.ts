import { describe, it, expect, beforeAll } from "vitest";
import { FeishuBotAdapter } from "../../bots/feishu-adapter";
import { FeishuSaaSAdapter } from "../../bots/saas-adapters";
import { isBotConfigured, getBotAdapterConfig } from "../../bots/bot-config";

const feishuConfigured = isBotConfigured("feishu");

const skipIfNotConfigured = () => {
  if (!feishuConfigured) {
    console.warn("[R029-c] 飞书未配置（需设置 FEISHU_APP_ID + FEISHU_APP_SECRET）");
    console.warn("[R029-c] 请在 config/bot-config.yaml 或环境变量中配置飞书凭证");
    return true;
  }
  return false;
};

describe("R029-c: 飞书真实 E2E", () => {
  describe("飞书 Bot 适配器", () => {
    it("飞书 tenant_access_token 应获取成功", async () => {
      if (skipIfNotConfigured()) return;
      const config = getBotAdapterConfig("feishu");
      const adapter = new FeishuBotAdapter(config);

      try {
        const token = await (adapter as any).getTenantToken();
        expect(typeof token).toBe("string");
        expect(token.length).toBeGreaterThan(0);
        console.log(`[R029-c] 飞书 tenant_token 获取成功, 长度=${token.length}`);
      } catch (err) {
        console.error(`[R029-c] 飞书 token 获取失败: ${err}`);
        throw err;
      }
    });

    it("飞书 healthCheck 应通过", async () => {
      if (skipIfNotConfigured()) return;
      const config = getBotAdapterConfig("feishu");
      const adapter = new FeishuBotAdapter(config);

      try {
        const token = await (adapter as any).getTenantToken();
        expect(token).toBeTruthy();
      } catch (err) {
        console.warn(`[R029-c] 飞书 healthCheck 失败: ${err}`);
        throw err;
      }
    });
  });

  describe("飞书 SaaS 适配器", () => {
    it("飞书 SaaS tenant_access_token 应获取成功", async () => {
      if (skipIfNotConfigured()) return;
      const config = getBotAdapterConfig("feishu");
      const adapter = new FeishuSaaSAdapter({
        appId: config.appId,
        appSecret: config.appSecret,
      });

      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
      console.log("[R029-c] 飞书 SaaS healthCheck 通过");
    });

    it("飞书 SaaS 发送通知应返回结果", async () => {
      if (skipIfNotConfigured()) return;
      const config = getBotAdapterConfig("feishu");
      const adapter = new FeishuSaaSAdapter({
        appId: config.appId,
        appSecret: config.appSecret,
      });

      const result = await adapter.sendNotification({
        userIds: ["e2e_test_user"],
        title: "E2E测试通知",
        content: "这是一条来自 AI Agent Platform 的 E2E 测试通知",
      });

      console.log(`[R029-c] 飞书通知结果: success=${result.success}, error=${result.errorMessage || "none"}`);
      expect(result).toHaveProperty("success");
    });

    it("飞书 SaaS 提交审批应返回结果", async () => {
      if (skipIfNotConfigured()) return;
      const config = getBotAdapterConfig("feishu");
      const adapter = new FeishuSaaSAdapter({
        appId: config.appId,
        appSecret: config.appSecret,
      });

      const result = await adapter.submitApproval({
        approvalCode: "e2e_test_approval_code",
        userId: "e2e_test_user",
        formData: [],
      });

      console.log(`[R029-c] 飞书审批结果: success=${result.success}, error=${result.errorMessage || "none"}`);
      expect(result).toHaveProperty("success");
    });

    it("飞书 SaaS 创建日历事件应返回结果", async () => {
      if (skipIfNotConfigured()) return;
      const config = getBotAdapterConfig("feishu");
      const adapter = new FeishuSaaSAdapter({
        appId: config.appId,
        appSecret: config.appSecret,
      });

      const now = new Date();
      const later = new Date(now.getTime() + 3600000);
      const result = await adapter.createCalendarEvent({
        userId: "e2e_test_user",
        summary: "E2E测试日历事件",
        startTime: now.toISOString(),
        endTime: later.toISOString(),
        description: "AI Agent Platform E2E 测试",
      });

      console.log(`[R029-c] 飞书日历结果: success=${result.success}, error=${result.errorMessage || "none"}`);
      expect(result).toHaveProperty("success");
    });
  });
});