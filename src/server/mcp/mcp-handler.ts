import type { JSONRPCRequest, JSONRPCResponse, MCPCapabilities, MCPToolDefinition, MCPToolCallResult } from "./protocol";
import {
  MCP_METHODS,
  JSONRPC_ERRORS,
  createResponse,
  createErrorResponse,
  isJSONRPCRequest,
} from "./protocol";
import { ToolRegistry } from "@/server/tools/registry";
import { SkillRegistry, executeSkill } from "@/server/agents/skills";

interface MCPToolHandler {
  definition: MCPToolDefinition;
  handler: (params: Record<string, unknown>) => Promise<MCPToolCallResult>;
}

const mcpTools = new Map<string, MCPToolHandler>();

export function resetMCPState(): void {
  mcpTools.clear();
  initialized = false;
}

let initialized = false;

export function isInitialized(): boolean {
  return initialized;
}

const SERVER_INFO = {
  name: "ai-agent-platform-mcp",
  version: "3.0.0",
};

const CAPABILITIES: MCPCapabilities = {
  tools: { listChanged: false },
  logging: {},
};

export function registerMCPTool(
  definition: MCPToolDefinition,
  handler: (params: Record<string, unknown>) => Promise<MCPToolCallResult>
): void {
  mcpTools.set(definition.name, { definition, handler });
  console.log(`[mcp-server] 注册MCP工具: ${definition.name}`);
}

export function getMCPToolCount(): number {
  return mcpTools.size;
}

export function getAllMCPToolDefinitions(): MCPToolDefinition[] {
  return Array.from(mcpTools.values()).map((t) => t.definition);
}

async function handleInitialize(params: Record<string, unknown>): Promise<unknown> {
  initialized = true;
  return {
    protocolVersion: "2024-11-05",
    capabilities: CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
}

async function handleListTools(): Promise<unknown> {
  const mcpToolDefs = Array.from(mcpTools.values()).map((t) => t.definition);
  const registryTools = ToolRegistry.list().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters
      ? {
          type: "object" as const,
          properties: t.parameters,
          required: t.requiredParameters || [],
        }
      : { type: "object" as const, properties: {} },
  }));
  return { tools: [...mcpToolDefs, ...registryTools] };
}

async function handleCallTool(
  name: string,
  args: Record<string, unknown>
): Promise<MCPToolCallResult> {
  const mcpTool = mcpTools.get(name);
  if (mcpTool) {
    return mcpTool.handler(args);
  }

  const registryTool = ToolRegistry.get(name);
  if (registryTool) {
    try {
      const result = await registryTool.execute(args);
      const text = typeof result === "string" ? result : JSON.stringify(result);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `工具执行错误: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }

  const skill = SkillRegistry.get(name);
  if (skill) {
    try {
      const result = await executeSkill(skill, args);
      return { content: [{ type: "text", text: result.finalOutput }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Skill执行错误: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: `工具不存在: ${name}` }],
    isError: true,
  };
}

async function handlePing(): Promise<unknown> {
  return {};
}

export async function handleJSONRPCRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  const { method, params } = request;
  const id = request.id ?? null;

  if (!initialized && method !== MCP_METHODS.INITIALIZE && method !== MCP_METHODS.PING) {
    return createErrorResponse(id, JSONRPC_ERRORS.INVALID_REQUEST.code, "Server not initialized");
  }

  try {
    switch (method) {
      case MCP_METHODS.INITIALIZE: {
        const result = await handleInitialize(params || {});
        return createResponse(id, result);
      }

      case MCP_METHODS.PING: {
        const result = await handlePing();
        return createResponse(id, result);
      }

      case MCP_METHODS.LIST_TOOLS: {
        const result = await handleListTools();
        return createResponse(id, result);
      }

      case MCP_METHODS.CALL_TOOL: {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};
        if (!toolName || typeof toolName !== "string") {
          return createErrorResponse(id, JSONRPC_ERRORS.INVALID_PARAMS.code, "Missing or invalid 'name' parameter");
        }
        const result = await handleCallTool(toolName, toolArgs);
        return createResponse(id, result);
      }

      case MCP_METHODS.LIST_RESOURCES: {
        return createResponse(id, { resources: [] });
      }

      case MCP_METHODS.LIST_PROMPTS: {
        return createResponse(id, { prompts: [] });
      }

      default:
        return createErrorResponse(id, JSONRPC_ERRORS.METHOD_NOT_FOUND.code, `Method not found: ${method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createErrorResponse(id, JSONRPC_ERRORS.INTERNAL_ERROR.code, message);
  }
}

export async function handleRawMessage(raw: string): Promise<JSONRPCResponse | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createErrorResponse(null, JSONRPC_ERRORS.PARSE_ERROR.code, JSONRPC_ERRORS.PARSE_ERROR.message);
  }

  if (Array.isArray(parsed)) {
    return null;
  }

  if (!isJSONRPCRequest(parsed)) {
    return createErrorResponse(null, JSONRPC_ERRORS.INVALID_REQUEST.code, JSONRPC_ERRORS.INVALID_REQUEST.message);
  }

  if (parsed.id === undefined || parsed.id === null) {
    return null;
  }

  return handleJSONRPCRequest(parsed);
}