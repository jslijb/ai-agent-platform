import { describe, it, expect, beforeEach } from "vitest";
import { MockBotAdapter, createBotAdapter } from "../base-adapter";
import { FeishuBotAdapter } from "../feishu-adapter";
import { DingTalkBotAdapter } from "../dingtalk-adapter";
import { WeComBotAdapter } from "../wecom-adapter";
import { WeChatBotAdapter } from "../wechat-adapter";

describe("Bot Adapters", () => {
  describe("MockBotAdapter", () => {
    let mock: MockBotAdapter;

    beforeEach(() => {
      mock = new MockBotAdapter();
    });

    it("should record sent messages", async () => {
      await mock.sendMessage("user1", "hello");
      await mock.sendMessage("user2", "world");
      expect(mock.messages.length).toBe(2);
      expect(mock.messages[0]).toEqual({ userId: "user1", content: "hello", options: undefined });
    });

    it("should record stream messages", async () => {
      async function* stream() {
        yield "chunk1";
        yield "chunk2";
      }
      await mock.sendStream("user1", stream());
      expect(mock.streamMessages.length).toBe(1);
      expect(mock.streamMessages[0].chunks).toEqual(["chunk1", "chunk2"]);
    });

    it("should validate signature", () => {
      expect(mock.validateSignature("payload", "sig")).toBe(true);
      mock.signatureValid = false;
      expect(mock.validateSignature("payload", "sig")).toBe(false);
    });

    it("should clear messages", async () => {
      await mock.sendMessage("user1", "hello");
      mock.clear();
      expect(mock.messages.length).toBe(0);
    });

    it("should support platform change", () => {
      mock.setPlatform("dingtalk");
      expect(mock.platform).toBe("dingtalk");
    });
  });

  describe("FeishuBotAdapter", () => {
    it("should have feishu platform", () => {
      const adapter = new FeishuBotAdapter({ appId: "test", appSecret: "test" });
      expect(adapter.platform).toBe("feishu");
    });

    it("should validate signature without encrypt key", () => {
      const adapter = new FeishuBotAdapter({ appId: "test", appSecret: "test" });
      expect(adapter.validateSignature("payload", "sig")).toBe(true);
    });
  });

  describe("DingTalkBotAdapter", () => {
    it("should have dingtalk platform", () => {
      const adapter = new DingTalkBotAdapter({ appId: "test", appSecret: "test" });
      expect(adapter.platform).toBe("dingtalk");
    });

    it("should validate signature without secret", () => {
      const adapter = new DingTalkBotAdapter({ appId: "test", appSecret: "" });
      expect(adapter.validateSignature("payload", "sig")).toBe(true);
    });
  });

  describe("WeComBotAdapter", () => {
    it("should have wecom platform", () => {
      const adapter = new WeComBotAdapter({ appId: "test", appSecret: "test" });
      expect(adapter.platform).toBe("wecom");
    });

    it("should fail signature validation", () => {
      const adapter = new WeComBotAdapter({ appId: "test", appSecret: "test" });
      expect(adapter.validateSignature("payload", "sig")).toBe(false);
    });
  });

  describe("WeChatBotAdapter", () => {
    it("should have wechat platform", () => {
      const adapter = new WeChatBotAdapter({ appId: "test", appSecret: "test" });
      expect(adapter.platform).toBe("wechat");
    });

    it("should throw on sendMessage (reserved)", async () => {
      const adapter = new WeChatBotAdapter({ appId: "test", appSecret: "test" });
      await expect(adapter.sendMessage("user1", "hello")).rejects.toThrow("企业资质");
    });

    it("should throw on sendStream (reserved)", async () => {
      const adapter = new WeChatBotAdapter({ appId: "test", appSecret: "test" });
      async function* stream() { yield "chunk"; }
      await expect(adapter.sendStream("user1", stream())).rejects.toThrow("企业资质");
    });
  });

  describe("createBotAdapter factory", () => {
    const configs: Record<string, { appId: string; appSecret: string }> = {
      feishu: { appId: "cli_test", appSecret: "secret" },
      dingtalk: { appId: "ding_test", appSecret: "secret" },
      wecom: { appId: "ww_test", appSecret: "secret" },
      wechat: { appId: "wx_test", appSecret: "secret" },
    };

    it("should create feishu adapter", async () => {
      const adapter = await createBotAdapter("feishu", configs.feishu);
      expect(adapter).toBeInstanceOf(FeishuBotAdapter);
      expect(adapter.platform).toBe("feishu");
    });

    it("should create dingtalk adapter", async () => {
      const adapter = await createBotAdapter("dingtalk", configs.dingtalk);
      expect(adapter).toBeInstanceOf(DingTalkBotAdapter);
      expect(adapter.platform).toBe("dingtalk");
    });

    it("should create wecom adapter", async () => {
      const adapter = await createBotAdapter("wecom", configs.wecom);
      expect(adapter).toBeInstanceOf(WeComBotAdapter);
      expect(adapter.platform).toBe("wecom");
    });

    it("should create wechat adapter", async () => {
      const adapter = await createBotAdapter("wechat", configs.wechat);
      expect(adapter).toBeInstanceOf(WeChatBotAdapter);
      expect(adapter.platform).toBe("wechat");
    });

    it("should throw for unknown platform", async () => {
      await expect(createBotAdapter("unknown" as any, configs.feishu)).rejects.toThrow("Unsupported");
    });
  });
});