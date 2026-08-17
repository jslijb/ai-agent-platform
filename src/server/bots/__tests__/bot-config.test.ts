import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadBotConfig, loadBotConfigFromEnv, getBotAdapterConfig, isBotConfigured, parseYamlSimple } from "../bot-config";

describe("Bot 配置加载器", () => {
  describe("parseYamlSimple", () => {
    it("应解析简单 YAML 结构", () => {
      const yaml = `
feishu:
  app_id: "cli_test123"
  app_secret: "secret123"
dingtalk:
  app_id: "ding123"
  app_secret: "ding_secret"
`;
      const result = parseYamlSimple(yaml);
      expect(result.feishu).toEqual({ app_id: "cli_test123", app_secret: "secret123" });
      expect(result.dingtalk).toEqual({ app_id: "ding123", app_secret: "ding_secret" });
    });

    it("应忽略注释行", () => {
      const yaml = `
# 这是注释
feishu:
  app_id: "test"  # 行尾注释
`;
      const result = parseYamlSimple(yaml);
      expect(result.feishu).toEqual({ app_id: "test" });
    });

    it("应处理空文件", () => {
      const result = parseYamlSimple("");
      expect(result).toEqual({});
    });
  });

  describe("loadBotConfigFromEnv", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it("应从环境变量加载飞书配置", () => {
      vi.stubEnv("FEISHU_APP_ID", "cli_env_test");
      vi.stubEnv("FEISHU_APP_SECRET", "env_secret");

      const config = loadBotConfigFromEnv();
      expect(config.feishu.app_id).toBe("cli_env_test");
      expect(config.feishu.app_secret).toBe("env_secret");
    });

    it("环境变量为空时应返回空字符串", () => {
      const config = loadBotConfigFromEnv();
      expect(config.feishu.app_id).toBe("");
      expect(config.feishu.app_secret).toBe("");
    });

    it("应加载钉钉配置", () => {
      vi.stubEnv("DINGTALK_APP_ID", "ding_env");
      vi.stubEnv("DINGTALK_APP_SECRET", "ding_secret_env");

      const config = loadBotConfigFromEnv();
      expect(config.dingtalk.app_id).toBe("ding_env");
      expect(config.dingtalk.app_secret).toBe("ding_secret_env");
    });
  });

  describe("isBotConfigured", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it("环境变量完整时应返回 true", () => {
      vi.stubEnv("FEISHU_APP_ID", "cli_test");
      vi.stubEnv("FEISHU_APP_SECRET", "secret_test");

      expect(isBotConfigured("feishu")).toBe(true);
    });

    it("环境变量缺失时应返回 false", () => {
      vi.stubEnv("FEISHU_APP_ID", "cli_test");
      vi.stubEnv("FEISHU_APP_SECRET", "");

      expect(isBotConfigured("feishu")).toBe(false);
    });

    it("未配置的平台应返回 false", () => {
      expect(isBotConfigured("dingtalk")).toBe(false);
    });
  });

  describe("getBotAdapterConfig", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it("应返回有效的 BotAdapterConfig", () => {
      vi.stubEnv("FEISHU_APP_ID", "cli_adapter_test");
      vi.stubEnv("FEISHU_APP_SECRET", "adapter_secret");

      const config = getBotAdapterConfig("feishu");
      expect(config.appId).toBe("cli_adapter_test");
      expect(config.appSecret).toBe("adapter_secret");
    });

    it("配置不完整时应抛出错误", () => {
      vi.stubEnv("DINGTALK_APP_ID", "");
      vi.stubEnv("DINGTALK_APP_SECRET", "");

      expect(() => getBotAdapterConfig("dingtalk")).toThrow("incomplete");
    });

    it("环境变量应优先于文件配置", () => {
      vi.stubEnv("FEISHU_APP_ID", "env_priority");
      vi.stubEnv("FEISHU_APP_SECRET", "env_secret_priority");

      const config = getBotAdapterConfig("feishu");
      expect(config.appId).toBe("env_priority");
    });
  });
});