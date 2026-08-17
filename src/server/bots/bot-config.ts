import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { BotAdapterConfig } from "./base-adapter";

export interface BotPlatformConfig {
  app_id: string;
  app_secret: string;
  verification_token?: string;
  encrypt_key?: string;
  token?: string;
  encoding_aes_key?: string;
}

export interface BotConfigFile {
  feishu: BotPlatformConfig;
  dingtalk: BotPlatformConfig;
  wecom: BotPlatformConfig;
  wechat: BotPlatformConfig;
}

const CONFIG_PATHS = [
  join(process.cwd(), "config", "bot-config.yaml"),
  join(process.cwd(), "bot-config.yaml"),
];

export function parseYamlSimple(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection = "";
  let currentObj: Record<string, unknown> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const isIndented = rawLine !== rawLine.trimStart();

    const sectionMatch = line.match(/^(\w+):\s*$/);
    if (sectionMatch && !isIndented) {
      if (currentSection && Object.keys(currentObj).length > 0) {
        result[currentSection] = currentObj;
      }
      currentSection = sectionMatch[1];
      currentObj = {};
      continue;
    }

    const kvMatch = line.match(/^(\w+):\s*"?(.*?)"?\s*(?:#.*)?$/);
    if (kvMatch && currentSection && isIndented) {
      currentObj[kvMatch[1]] = kvMatch[2];
    }
  }

  if (currentSection && Object.keys(currentObj).length > 0) {
    result[currentSection] = currentObj;
  }

  return result;
}

export function loadBotConfig(): BotConfigFile {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const parsed = parseYamlSimple(content);
      return {
        feishu: (parsed.feishu || {}) as BotPlatformConfig,
        dingtalk: (parsed.dingtalk || {}) as BotPlatformConfig,
        wecom: (parsed.wecom || {}) as BotPlatformConfig,
        wechat: (parsed.wechat || {}) as BotPlatformConfig,
      };
    }
  }

  return {
    feishu: { app_id: "", app_secret: "" },
    dingtalk: { app_id: "", app_secret: "" },
    wecom: { app_id: "", app_secret: "" },
    wechat: { app_id: "", app_secret: "" },
  };
}

export function loadBotConfigFromEnv(): BotConfigFile {
  return {
    feishu: {
      app_id: process.env.FEISHU_APP_ID || "",
      app_secret: process.env.FEISHU_APP_SECRET || "",
      verification_token: process.env.FEISHU_VERIFICATION_TOKEN,
      encrypt_key: process.env.FEISHU_ENCRYPT_KEY,
    },
    dingtalk: {
      app_id: process.env.DINGTALK_APP_ID || "",
      app_secret: process.env.DINGTALK_APP_SECRET || "",
    },
    wecom: {
      app_id: process.env.WECOM_APP_ID || "",
      app_secret: process.env.WECOM_APP_SECRET || "",
    },
    wechat: {
      app_id: process.env.WECHAT_APP_ID || "",
      app_secret: process.env.WECHAT_APP_SECRET || "",
    },
  };
}

export function getBotAdapterConfig(platform: "feishu" | "dingtalk" | "wecom" | "wechat"): BotAdapterConfig {
  const fileConfig = loadBotConfig();
  const envConfig = loadBotConfigFromEnv();

  const filePlatform = fileConfig[platform] || {};
  const envPlatform = envConfig[platform] || {};

  const appId = envPlatform.app_id || (filePlatform as BotPlatformConfig).app_id || "";
  const appSecret = envPlatform.app_secret || (filePlatform as BotPlatformConfig).app_secret || "";

  if (!appId || !appSecret) {
    throw new Error(`Bot config for ${platform} is incomplete: app_id=${appId}, app_secret=${appSecret ? "***" : "empty"}`);
  }

  return {
    appId,
    appSecret,
    verificationToken: envPlatform.verification_token || (filePlatform as BotPlatformConfig).verification_token,
    encryptKey: envPlatform.encrypt_key || (filePlatform as BotPlatformConfig).encrypt_key,
  };
}

export function isBotConfigured(platform: "feishu" | "dingtalk" | "wecom" | "wechat"): boolean {
  try {
    const config = getBotAdapterConfig(platform);
    return !!(config.appId && config.appSecret);
  } catch {
    return false;
  }
}