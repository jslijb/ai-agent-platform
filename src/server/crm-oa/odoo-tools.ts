import { registerMCPTool } from "../mcp/mcp-handler";
import type { MCPToolCallResult } from "../mcp/protocol";
import { createOdooAdapter, OdooAdapter } from "./odoo-adapter";

function textResult(text: string, isError?: boolean): MCPToolCallResult {
  return { content: [{ type: "text", text }], isError };
}

let _adapter: OdooAdapter | null = null;

function getAdapter(): OdooAdapter {
  if (!_adapter) {
    _adapter = createOdooAdapter();
  }
  return _adapter;
}

export function registerOdooTools(): void {
  console.log("[odoo-tools] 开始注册 Odoo OA 工具");

  registerMCPTool(
    {
      name: "odoo_submit_leave",
      description: "提交请假申请到 Odoo OA 系统",
      inputSchema: {
        type: "object",
        properties: {
          employeeId: { type: "number", description: "员工ID" },
          holidayStatusId: { type: "number", description: "假期类型ID（如年假/病假）" },
          dateFrom: { type: "string", description: "开始日期，格式 YYYY-MM-DD HH:mm:ss" },
          dateTo: { type: "string", description: "结束日期，格式 YYYY-MM-DD HH:mm:ss" },
          name: { type: "string", description: "请假原因" },
        },
        required: ["employeeId", "holidayStatusId", "dateFrom", "dateTo"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const id = await adapter.submitLeave({
          employeeId: params.employeeId as number,
          holidayStatusId: params.holidayStatusId as number,
          dateFrom: params.dateFrom as string,
          dateTo: params.dateTo as string,
          name: params.name as string | undefined,
        });
        return textResult(`请假申请已提交，ID: ${id}`);
      } catch (err) {
        return textResult(`提交请假失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "odoo_submit_expense",
      description: "提交报销申请到 Odoo OA 系统",
      inputSchema: {
        type: "object",
        properties: {
          employeeId: { type: "number", description: "员工ID" },
          productId: { type: "number", description: "费用产品ID" },
          name: { type: "string", description: "报销说明" },
          totalAmount: { type: "number", description: "报销金额" },
          date: { type: "string", description: "费用日期，格式 YYYY-MM-DD" },
        },
        required: ["employeeId", "productId", "name", "totalAmount"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const id = await adapter.submitExpense({
          employeeId: params.employeeId as number,
          productId: params.productId as number,
          name: params.name as string,
          totalAmount: params.totalAmount as number,
          date: params.date as string | undefined,
        });
        return textResult(`报销申请已提交，ID: ${id}`);
      } catch (err) {
        return textResult(`提交报销失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "odoo_approve_request",
      description: "审批/拒绝/重置 Odoo 审批请求",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "number", description: "审批请求ID" },
          action: { type: "string", description: "操作: approve/refuse/reset", enum: ["approve", "refuse", "reset"] },
          reason: { type: "string", description: "拒绝原因（refuse时必填）" },
        },
        required: ["requestId", "action"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const action = params.action as "approve" | "refuse" | "reset";
        if (action === "refuse" && !params.reason) {
          return textResult("拒绝审批时必须提供原因", true);
        }
        await adapter.approveRequest(
          params.requestId as number,
          action,
          params.reason as string | undefined
        );
        const actionLabels = { approve: "已批准", refuse: "已拒绝", reset: "已重置" };
        return textResult(`审批请求 ${params.requestId} ${actionLabels[action]}`);
      } catch (err) {
        return textResult(`审批操作失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "odoo_query_process_status",
      description: "查询 Odoo 审批流程状态",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "number", description: "审批请求ID" },
        },
        required: ["requestId"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const status = await adapter.queryProcessStatus(params.requestId as number);
        return textResult(JSON.stringify(status, null, 2));
      } catch (err) {
        return textResult(`查询审批状态失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "odoo_send_notification",
      description: "通过 Odoo 发送通知消息",
      inputSchema: {
        type: "object",
        properties: {
          partnerIds: { type: "array", items: { type: "number" }, description: "接收人partner ID列表" },
          message: { type: "string", description: "通知内容" },
          subject: { type: "string", description: "通知主题" },
        },
        required: ["partnerIds", "message"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        await adapter.sendNotification({
          partnerIds: params.partnerIds as number[],
          message: params.message as string,
          subject: params.subject as string | undefined,
        });
        return textResult("通知已发送");
      } catch (err) {
        return textResult(`发送通知失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "odoo_query_schedule",
      description: "查询 Odoo 日程安排",
      inputSchema: {
        type: "object",
        properties: {
          partnerId: { type: "number", description: "查询人partner ID" },
          startDate: { type: "string", description: "开始日期，格式 YYYY-MM-DD" },
          stopDate: { type: "string", description: "结束日期，格式 YYYY-MM-DD" },
        },
        required: ["partnerId", "startDate", "stopDate"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const events = await adapter.querySchedule(
          params.partnerId as number,
          params.startDate as string,
          params.stopDate as string
        );
        return textResult(JSON.stringify(events, null, 2));
      } catch (err) {
        return textResult(`查询日程失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  console.log("[odoo-tools] Odoo OA 工具注册完成（6个工具）");
}