import { BaseBotAdapter } from "./base-adapter";
import type { BotAdapterConfig, BotSendMessageOptions } from "./base-adapter";

export class WeChatBotAdapter extends BaseBotAdapter {
  readonly platform = "wechat" as const;

  constructor(config: BotAdapterConfig) {
    super(config);
  }

  async sendMessage(_userId: string, _content: string, _options?: BotSendMessageOptions): Promise<void> {
    throw new Error("微信服务号机器人需企业资质，当前为预留接口。请注册微信服务号后实现。");
  }

  async sendStream(_userId: string, _chunks: AsyncIterable<string>, _options?: BotSendMessageOptions): Promise<void> {
    throw new Error("微信服务号机器人需企业资质，当前为预留接口。请注册微信服务号后实现。");
  }

  validateSignature(_payload: string, _signature: string): boolean {
    return false;
  }
}