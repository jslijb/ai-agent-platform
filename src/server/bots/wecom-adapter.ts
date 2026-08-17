import { BaseBotAdapter } from "./base-adapter";
import type { BotAdapterConfig, BotSendMessageOptions } from "./base-adapter";

export class WeComBotAdapter extends BaseBotAdapter {
  readonly platform = "wecom" as const;
  private webhookUrl: string;

  constructor(config: BotAdapterConfig) {
    super(config);
    this.webhookUrl = config.baseUrl || "";
  }

  async sendMessage(userId: string, content: string, _options?: BotSendMessageOptions): Promise<void> {
    if (this.webhookUrl) {
      const resp = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content, mentioned_list: [userId] },
        }),
      });
      const data = await resp.json();
      if (data.errcode !== 0) {
        throw new Error(`WeCom webhook failed: ${data.errmsg}`);
      }
      return;
    }
    console.warn("[WeComBot] 企微应用机器人需企业认证，当前仅支持群Webhook");
  }

  async sendStream(userId: string, chunks: AsyncIterable<string>, options?: BotSendMessageOptions): Promise<void> {
    const collected: string[] = [];
    for await (const chunk of chunks) {
      collected.push(chunk);
    }
    await this.sendMessage(userId, collected.join(""), options);
  }

  validateSignature(_payload: string, _signature: string): boolean {
    return false;
  }
}