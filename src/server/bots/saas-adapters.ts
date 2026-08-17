import { SaaSChannelAdapter } from "./saas-channel-adapter";
import type {
  SaaSApprovalParams,
  SaaSApprovalResult,
  SaaSNotificationParams,
  SaaSNotificationResult,
  SaaSCalendarParams,
  SaaSCalendarResult,
} from "./saas-channel-adapter";
import { BaseBotAdapter } from "./base-adapter";
import type { BotAdapterConfig, BotSendMessageOptions } from "./base-adapter";
import { createHmac } from "crypto";

export class FeishuSaaSAdapter extends SaaSChannelAdapter {
  readonly platform = "feishu";
  private appId: string;
  private appSecret: string;
  private tenantToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: { appId: string; appSecret: string }) {
    super();
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  private async getTenantToken(): Promise<string> {
    if (this.tenantToken && Date.now() < this.tokenExpiresAt) {
      return this.tenantToken;
    }

    const resp = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
      }
    );

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Feishu SaaS auth failed: ${data.msg}`);
    }

    this.tenantToken = data.tenant_access_token;
    this.tokenExpiresAt = Date.now() + (data.expire - 300) * 1000;
    return this.tenantToken!;
  }

  async submitApproval(params: SaaSApprovalParams): Promise<SaaSApprovalResult> {
    try {
      const token = await this.getTenantToken();
      const resp = await fetch(
        "https://open.feishu.cn/open-apis/approval/v4/instance",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            approval_code: params.approvalCode,
            user_id: params.userId,
            form: params.formData,
          }),
        }
      );

      const data = await resp.json();
      if (data.code !== 0) {
        return {
          success: false,
          errorCode: String(data.code),
          errorMessage: data.msg,
        };
      }

      return {
        success: true,
        instanceId: data.data?.instance_code,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendNotification(params: SaaSNotificationParams): Promise<SaaSNotificationResult> {
    try {
      const token = await this.getTenantToken();
      const messageIds: string[] = [];

      for (const userId of params.userIds) {
        const resp = await fetch(
          "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              receive_id: userId,
              msg_type: "interactive",
              content: JSON.stringify({
                config: { wide_screen_mode: true },
                header: {
                  title: { tag: "plain_text", content: params.title },
                  template: "blue",
                },
                elements: [
                  {
                    tag: "div",
                    text: { tag: "plain_text", content: params.content },
                  },
                ],
              }),
            }),
          }
        );

        const data = await resp.json();
        if (data.code === 0 && data.data?.message_id) {
          messageIds.push(data.data.message_id);
        }
      }

      return { success: true, messageIds };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async createCalendarEvent(params: SaaSCalendarParams): Promise<SaaSCalendarResult> {
    try {
      const token = await this.getTenantToken();
      const resp = await fetch(
        "https://open.feishu.cn/open-apis/calendar/v4/calendars/primary/events",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            summary: params.summary,
            start_time: {
              timestamp: String(Math.floor(new Date(params.startTime).getTime() / 1000)),
            },
            end_time: {
              timestamp: String(Math.floor(new Date(params.endTime).getTime() / 1000)),
            },
            description: params.description || "",
            attendees: [
              { user_id: params.userId, is_optional: false },
            ],
          }),
        }
      );

      const data = await resp.json();
      if (data.code !== 0) {
        return {
          success: false,
          errorCode: String(data.code),
          errorMessage: data.msg,
        };
      }

      return {
        success: true,
        eventId: data.data?.event?.event_id,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getTenantToken();
      return true;
    } catch {
      return false;
    }
  }
}

export class DingTalkSaaSAdapter extends SaaSChannelAdapter {
  readonly platform = "dingtalk";
  private appId: string;
  private appSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: { appId: string; appSecret: string }) {
    super();
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const resp = await fetch(
      "https://oapi.dingtalk.com/gettoken",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appkey: this.appId,
          appsecret: this.appSecret,
        }),
      }
    );

    const data = await resp.json();
    if (data.errcode !== 0) {
      throw new Error(`DingTalk SaaS auth failed: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    return this.accessToken!;
  }

  async submitApproval(params: SaaSApprovalParams): Promise<SaaSApprovalResult> {
    try {
      const token = await this.getAccessToken();
      const resp = await fetch(
        `https://oapi.dingtalk.com/topapi/processinstance/create?access_token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            process_code: params.approvalCode,
            originator_user_id: params.userId,
            form_component_values: params.formData.map((f) => ({
              name: f.control,
              value: JSON.stringify(f.value),
            })),
          }),
        }
      );

      const data = await resp.json();
      if (data.errcode !== 0) {
        return {
          success: false,
          errorCode: String(data.errcode),
          errorMessage: data.errmsg,
        };
      }

      return {
        success: true,
        instanceId: data.result?.process_instance_id,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendNotification(params: SaaSNotificationParams): Promise<SaaSNotificationResult> {
    try {
      const token = await this.getAccessToken();
      const messageIds: string[] = [];

      for (const userId of params.userIds) {
        const resp = await fetch(
          `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userIds: [userId],
              msgKey: "sampleText",
              msgParam: JSON.stringify({
                title: params.title,
                content: params.content,
              }),
            }),
          }
        );

        const data = await resp.json();
        if (data.errcode === 0) {
          messageIds.push(String(data.result?.task_id || ""));
        }
      }

      return { success: true, messageIds };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async createCalendarEvent(params: SaaSCalendarParams): Promise<SaaSCalendarResult> {
    try {
      const token = await this.getAccessToken();
      const resp = await fetch(
        `https://oapi.dingtalk.com/topapi/calendar/create?access_token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: params.userId,
            summary: params.summary,
            startTime: params.startTime,
            endTime: params.endTime,
            description: params.description || "",
          }),
        }
      );

      const data = await resp.json();
      if (data.errcode !== 0) {
        return {
          success: false,
          errorCode: String(data.errcode),
          errorMessage: data.errmsg,
        };
      }

      return {
        success: true,
        eventId: data.result?.event_id,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}

export function createSaaSChannelAdapter(
  platform: "feishu" | "dingtalk",
  config: { appId: string; appSecret: string }
): SaaSChannelAdapter {
  switch (platform) {
    case "feishu":
      return new FeishuSaaSAdapter(config);
    case "dingtalk":
      return new DingTalkSaaSAdapter(config);
    default:
      throw new Error(`Unsupported SaaS platform: ${platform}`);
  }
}