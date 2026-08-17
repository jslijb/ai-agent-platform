export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  logging?: {};
}

export const MCP_METHODS = {
  INITIALIZE: "initialize",
  INITIALIZED: "notifications/initialized",
  LIST_TOOLS: "tools/list",
  CALL_TOOL: "tools/call",
  LIST_RESOURCES: "resources/list",
  READ_RESOURCE: "resources/read",
  LIST_PROMPTS: "prompts/list",
  GET_PROMPT: "prompts/get",
  PING: "ping",
} as const;

export const JSONRPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
  TOOL_NOT_FOUND: { code: -32001, message: "Tool not found" },
  TOOL_EXECUTION_ERROR: { code: -32002, message: "Tool execution error" },
} as const;

export function createResponse(id: string | number | null, result: unknown): JSONRPCResponse {
  return { jsonrpc: "2.0", id, result };
}

export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JSONRPCResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export function isJSONRPCRequest(obj: unknown): obj is JSONRPCRequest {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (obj as Record<string, unknown>).jsonrpc === "2.0" &&
    typeof (obj as Record<string, unknown>).method === "string"
  );
}