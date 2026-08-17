import type { BotAdapter, BotAdapterConfig, BotSendMessageOptions } from "./base-adapter";
import { BaseBotAdapter } from "./base-adapter";
import { createHmac } from "crypto";

export class FeishuBotAdapter extends BaseBotAdapter {
  readonly platform = "feishu" as const;
  private tenantToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: BotAdapterConfig) {
    super(config);
  }

  private async getTenantToken(): Promise<string> {
    if (this.tenantToken && Date.now() < this.tokenExpiresAt) {
      return this.tenantToken;
    }

    const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Feishu auth failed: ${data.msg}`);
    }

    this.tenantToken = data.tenant_access_token;
    this.tokenExpiresAt = Date.now() + (data.expire - 300) * 1000;
    return this.tenantToken!;
  }

  async sendMessage(userId: string, content: string, options?: BotSendMessageOptions): Promise<void> {
    const token = await this.getTenantToken();
    const body: Record<string, unknown> = {
      receive_id: userId,
      msg_type: "text",
      content: JSON.stringify({ text: content }),
    };

    if (options?.replyToMessageId) {
      body.reply_in_thread = true;
    }

    const resp = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Feishu send failed: ${data.msg}`);
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
    if (!this.config.encryptKey) return true;
    const hash = createHmac("sha256", this.config.encryptKey).update(payload).digest("hex");
    return hash === signature;
  }
}