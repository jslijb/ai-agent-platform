import { registerMCPTool } from "../mcp/mcp-handler";
import type { MCPToolCallResult } from "../mcp/protocol";
import { createSaaSChannelAdapter } from "../bots/saas-adapters";
import type { SaaSChannelAdapter } from "../bots/saas-channel-adapter";

function textResult(text: string, isError?: boolean): MCPToolCallResult {
  return { content: [{ type: "text", text }], isError };
}

let _feishuAdapter: SaaSChannelAdapter | null = null;
let _dingtalkAdapter: SaaSChannelAdapter | null = null;

function getFeishuAdapter(): SaaSChannelAdapter {
  if (!_feishuAdapter) {
    _feishuAdapter = createSaaSChannelAdapter("feishu", {
      appId: process.env.FEISHU_APP_ID || "",
      appSecret: process.env.FEISHU_APP_SECRET || "",
    });
  }
  return _feishuAdapter;
}

function getDingTalkAdapter(): SaaSChannelAdapter {
  if (!_dingtalkAdapter) {
    _dingtalkAdapter = createSaaSChannelAdapter("dingtalk", {
      appId: process.env.DINGTALK_APP_ID || "",
      appSecret: process.env.DINGTALK_APP_SECRET || "",
    });
  }
  return _dingtalkAdapter;
}

export function registerSaaSTools(): void {
  console.log("[saas-tools] 开始注册 SaaS 备选通道工具");

  registerMCPTool(
    {
      name: "saas_submit_approval",
      description: "通过飞书/钉钉SaaS平台提交审批流程",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", description: "平台: feishu/dingtalk", enum: ["feishu", "dingtalk"] },
          approvalCode: { type: "string", description: "审批流程代码" },
          userId: { type: "string", description: "发起人用户ID" },
          formData: { type: "array", description: "表单数据", items: { type: "object", properties: { control: { type: "string" }, value: { type: "array", items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } } } } } } },
        },
        required: ["platform", "approvalCode", "userId"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = params.platform === "feishu" ? getFeishuAdapter() : getDingTalkAdapter();
        const result = await adapter.submitApproval({
          approvalCode: params.approvalCode as string,
          userId: params.userId as string,
          formData: (params.formData as Array<{ control: string; value: Array<{ key: string; value: string | number }> }>) || [],
        });
        if (result.success) {
          return textResult(`审批已提交，实例ID: ${result.instanceId}`);
        }
        return textResult(`审批提交失败: ${result.errorMessage}`, true);
      } catch (err) {
        return textResult(`SaaS审批错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "saas_send_notification",
      description: "通过飞书/钉钉SaaS平台发送通知",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", description: "平台: feishu/dingtalk", enum: ["feishu", "dingtalk"] },
          userIds: { type: "array", items: { type: "string" }, description: "接收人ID列表" },
          title: { type: "string", description: "通知标题" },
          content: { type: "string", description: "通知内容" },
        },
        required: ["platform", "userIds", "title", "content"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = params.platform === "feishu" ? getFeishuAdapter() : getDingTalkAdapter();
        const result = await adapter.sendNotification({
          userIds: params.userIds as string[],
          title: params.title as string,
          content: params.content as string,
        });
        if (result.success) {
          return textResult(`通知已发送，消息数: ${result.messageIds?.length || 0}`);
        }
        return textResult(`通知发送失败: ${result.errorMessage}`, true);
      } catch (err) {
        return textResult(`SaaS通知错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "saas_create_calendar_event",
      description: "通过飞书/钉钉SaaS平台创建日程事件",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", description: "平台: feishu/dingtalk", enum: ["feishu", "dingtalk"] },
          userId: { type: "string", description: "参与人用户ID" },
          summary: { type: "string", description: "日程标题" },
          startTime: { type: "string", description: "开始时间 ISO格式" },
          endTime: { type: "string", description: "结束时间 ISO格式" },
          description: { type: "string", description: "日程描述" },
        },
        required: ["platform", "userId", "summary", "startTime", "endTime"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = params.platform === "feishu" ? getFeishuAdapter() : getDingTalkAdapter();
        const result = await adapter.createCalendarEvent({
          userId: params.userId as string,
          summary: params.summary as string,
          startTime: params.startTime as string,
          endTime: params.endTime as string,
          description: params.description as string | undefined,
        });
        if (result.success) {
          return textResult(`日程已创建，事件ID: ${result.eventId}`);
        }
        return textResult(`日程创建失败: ${result.errorMessage}`, true);
      } catch (err) {
        return textResult(`SaaS日程错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  console.log("[saas-tools] SaaS 备选通道工具注册完成（3个工具）");
}