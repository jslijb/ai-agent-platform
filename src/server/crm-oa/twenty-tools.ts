import { registerMCPTool } from "../mcp/mcp-handler";
import type { MCPToolCallResult } from "../mcp/protocol";
import { createTwentyAdapter, TwentyAdapter } from "./twenty-adapter";

function textResult(text: string, isError?: boolean): MCPToolCallResult {
  return { content: [{ type: "text", text }], isError };
}

let _adapter: TwentyAdapter | null = null;

function getAdapter(): TwentyAdapter {
  if (!_adapter) {
    _adapter = createTwentyAdapter();
  }
  return _adapter;
}

export function registerTwentyTools(): void {
  console.log("[twenty-tools] 开始注册 Twenty CRM 工具");

  registerMCPTool(
    {
      name: "crm_create_customer",
      description: "在 Twenty CRM 中创建客户/公司",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "公司名称" },
          domainName: { type: "string", description: "公司域名" },
          employees: { type: "number", description: "员工数量" },
          linkedinUrl: { type: "string", description: "LinkedIn链接" },
        },
        required: ["name"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const customer = await adapter.createCustomer({
          name: params.name as string,
          domainName: params.domainName as string | undefined,
          employees: params.employees as number | undefined,
          linkedinUrl: params.linkedinUrl as string | undefined,
        });
        return textResult(`客户已创建: ${JSON.stringify(customer)}`);
      } catch (err) {
        return textResult(`创建客户失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "crm_search_customer",
      description: "在 Twenty CRM 中搜索客户/公司",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          limit: { type: "number", description: "返回数量，默认10" },
        },
        required: ["query"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const customers = await adapter.searchCustomer({
          query: params.query as string,
          limit: (params.limit as number) || 10,
        });
        return textResult(JSON.stringify(customers, null, 2));
      } catch (err) {
        return textResult(`搜索客户失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "crm_update_opportunity",
      description: "更新 Twenty CRM 商机阶段",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: { type: "string", description: "商机ID" },
          stage: { type: "string", description: "新阶段: Prospecting/Qualification/Proposal/Negotiation/Closed Won/Closed Lost" },
        },
        required: ["opportunityId", "stage"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const opp = await adapter.updateOpportunity(
          params.opportunityId as string,
          params.stage as string
        );
        return textResult(`商机已更新: ${JSON.stringify(opp)}`);
      } catch (err) {
        return textResult(`更新商机失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "crm_create_opportunity",
      description: "在 Twenty CRM 中创建商机",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "商机名称" },
          companyId: { type: "string", description: "关联公司ID" },
          amount: { type: "number", description: "金额" },
          closeDate: { type: "string", description: "预计关闭日期 YYYY-MM-DD" },
          stage: { type: "string", description: "阶段" },
        },
        required: ["name", "companyId"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const opp = await adapter.createOpportunity({
          name: params.name as string,
          companyId: params.companyId as string,
          amount: params.amount as number | undefined,
          closeDate: params.closeDate as string | undefined,
          stage: params.stage as string | undefined,
        });
        return textResult(`商机已创建: ${JSON.stringify(opp)}`);
      } catch (err) {
        return textResult(`创建商机失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "crm_generate_report",
      description: "生成 Twenty CRM 报表",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "报表类型: pipeline/revenue/activity/forecast" },
          filters: { type: "object", description: "过滤条件" },
        },
        required: ["type"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const adapter = getAdapter();
        const report = await adapter.generateReport(
          params.type as string,
          params.filters as Record<string, unknown> | undefined
        );
        return textResult(JSON.stringify(report, null, 2));
      } catch (err) {
        return textResult(`生成报表失败: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  console.log("[twenty-tools] Twenty CRM 工具注册完成（5个工具）");
}