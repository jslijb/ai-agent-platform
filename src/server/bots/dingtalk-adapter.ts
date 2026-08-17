import { BaseBotAdapter } from "./base-adapter";
import type { BotAdapterConfig, BotSendMessageOptions } from "./base-adapter";
import { createHmac } from "crypto";

export class DingTalkBotAdapter extends BaseBotAdapter {
  readonly platform = "dingtalk" as const;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: BotAdapterConfig) {
    super(config);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const resp = await fetch("https://oapi.dingtalk.com/gettoken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appkey: this.config.appId,
        appsecret: this.config.appSecret,
      }),
    });

    const data = await resp.json();
    if (data.errcode !== 0) {
      throw new Error(`DingTalk auth failed: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    return this.accessToken!;
  }

  async sendMessage(userId: string, content: string, options?: BotSendMessageOptions): Promise<void> {
    const token = await this.getAccessToken();
    const body: Record<string, unknown> = {
      userIds: [userId],
      msgKey: "sampleText",
      msgParam: JSON.stringify({ content }),
    };

    const resp = await fetch(`https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (data.errcode !== 0) {
      throw new Error(`DingTalk send failed: ${data.errmsg}`);
    }
  }

  async sendStream(userId: string, chunks: AsyncIterable<string>, options?: BotSendMessageOptions): Promise<void> {
    const collected: string[] = [];
    for await (const chunk of chunks) {
      collected.push(chunk);
    }
    await this.sendMessage(userId, collected.join(""), options);
  }

  validateSignature(payload: string, signature: string): boolean {
    if (!this.config.appSecret) return true;
    const hash = createHmac("sha256", this.config.appSecret).update(payload).digest("hex");
    return hash === signature;
  }
}