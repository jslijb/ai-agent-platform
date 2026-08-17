import type { BotPlatform } from "shared-types";

export interface BotMessage {
  platform: BotPlatform;
  userId: string;
  content: string;
  timestamp: number;
  messageId: string;
  chatId?: string;
}

export interface BotSendMessageOptions {
  replyToMessageId?: string;
  card?: BotCardMessage;
}

export interface BotCardMessage {
  header: string;
  elements: Array<BotCardElement>;
}

export interface BotCardElement {
  type: "text" | "button" | "hr";
  content?: string;
  action?: { type: string; value: Record<string, unknown> };
}

export interface BotAdapter {
  readonly platform: BotPlatform;
  sendMessage(userId: string, content: string, options?: BotSendMessageOptions): Promise<void>;
  sendStream(userId: string, chunks: AsyncIterable<string>, options?: BotSendMessageOptions): Promise<void>;
  validateSignature(payload: string, signature: string): boolean;
}

export interface BotAdapterConfig {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  baseUrl?: string;
}

export abstract class BaseBotAdapter implements BotAdapter {
  abstract readonly platform: BotPlatform;
  protected config: BotAdapterConfig;

  constructor(config: BotAdapterConfig) {
    this.config = config;
  }

  abstract sendMessage(userId: string, content: string, options?: BotSendMessageOptions): Promise<void>;
  abstract sendStream(userId: string, chunks: AsyncIterable<string>, options?: BotSendMessageOptions): Promise<void>;
  abstract validateSignature(payload: string, signature: string): boolean;

  getAppId(): string {
    return this.config.appId;
  }
}

export class MockBotAdapter extends BaseBotAdapter {
  readonly platform: BotPlatform = "feishu";
  messages: Array<{ userId: string; content: string; options?: BotSendMessageOptions }> = [];
  streamMessages: Array<{ userId: string; chunks: string[]; options?: BotSendMessageOptions }> = [];
  signatureValid: boolean = true;

  constructor() {
    super({ appId: "mock", appSecret: "mock" });
  }

  setPlatform(platform: BotPlatform): void {
    (this as { platform: BotPlatform }).platform = platform;
  }

  async sendMessage(userId: string, content: string, options?: BotSendMessageOptions): Promise<void> {
    this.messages.push({ userId, content, options });
  }

  async sendStream(userId: string, chunks: AsyncIterable<string>, options?: BotSendMessageOptions): Promise<void> {
    const collected: string[] = [];
    for await (const chunk of chunks) {
      collected.push(chunk);
    }
    this.streamMessages.push({ userId, chunks: collected, options });
  }

  validateSignature(_payload: string, _signature: string): boolean {
    return this.signatureValid;
  }

  clear(): void {
    this.messages = [];
    this.streamMessages = [];
  }
}

export async function createBotAdapter(platform: BotPlatform, config: BotAdapterConfig): Promise<BotAdapter> {
  switch (platform) {
    case "feishu": {
      const { FeishuBotAdapter } = await import("./feishu-adapter");
      return new FeishuBotAdapter(config);
    }
    case "dingtalk": {
      const { DingTalkBotAdapter } = await import("./dingtalk-adapter");
      return new DingTalkBotAdapter(config);
    }
    case "wecom": {
      const { WeComBotAdapter } = await import("./wecom-adapter");
      return new WeComBotAdapter(config);
    }
    case "wechat": {
      const { WeChatBotAdapter } = await import("./wechat-adapter");
      return new WeChatBotAdapter(config);
    }
    default:
      throw new Error(`Unsupported bot platform: ${platform}`);
  }
}