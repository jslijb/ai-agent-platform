import { describe, it, expect, beforeEach } from "vitest";
import { handleJSONRPCRequest, registerMCPTool, getMCPToolCount, getAllMCPToolDefinitions, resetMCPState } from "../mcp-handler";
import { createResponse, createErrorResponse, isJSONRPCRequest } from "../protocol";
import type { JSONRPCRequest, MCPToolCallResult } from "../protocol";

function textResult(text: string): MCPToolCallResult {
  return { content: [{ type: "text", text }] };
}

describe("MCP Protocol", () => {
  describe("JSON-RPC 2.0", () => {
    it("should create success response", () => {
      const resp = createResponse(1, { status: "ok" });
      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBe(1);
      expect(resp.result).toEqual({ status: "ok" });
      expect(resp.error).toBeUndefined();
    });

    it("should create error response", () => {
      const resp = createErrorResponse(2, -32601, "Method not found");
      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBe(2);
      expect(resp.error?.code).toBe(-32601);
      expect(resp.result).toBeUndefined();
    });

    it("should validate JSONRPC request", () => {
      expect(isJSONRPCRequest({ jsonrpc: "2.0", method: "ping" })).toBe(true);
      expect(isJSONRPCRequest({ jsonrpc: "1.0", method: "ping" })).toBe(false);
      expect(isJSONRPCRequest({ method: "ping" })).toBe(false);
      expect(isJSONRPCRequest(null)).toBe(false);
    });
  });

  describe("MCP Handler", () => {
    beforeEach(() => {
      resetMCPState();
    });

    it("should handle initialize", async () => {
      const req: JSONRPCRequest = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.result).toBeDefined();
      const result = resp.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe("2024-11-05");
      expect(result.serverInfo).toBeDefined();
      expect((result.serverInfo as Record<string, unknown>).name).toBe("ai-agent-platform-mcp");
    });

    it("should reject requests before initialize", async () => {
      const req: JSONRPCRequest = { jsonrpc: "2.0", id: 2, method: "tools/list" };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32600);
    });

    it("should handle ping", async () => {
      const req: JSONRPCRequest = { jsonrpc: "2.0", id: 3, method: "ping" };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.result).toEqual({});
    });

    it("should handle unknown method", async () => {
      const initReq: JSONRPCRequest = { jsonrpc: "2.0", id: 10, method: "initialize", params: {} };
      await handleJSONRPCRequest(initReq);

      const req: JSONRPCRequest = { jsonrpc: "2.0", id: 4, method: "unknown/method" };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32601);
    });
  });

  describe("MCP Tool Registration", () => {
    beforeEach(() => {
      const defs = getAllMCPToolDefinitions();
      if (defs.length === 0) {
        registerMCPTool(
          {
            name: "test_tool",
            description: "A test tool",
            inputSchema: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
          },
          async (params) => textResult(`Result: ${params.input}`)
        );
      }
    });

    it("should register tools", () => {
      expect(getMCPToolCount()).toBeGreaterThanOrEqual(1);
    });

    it("should list tools via protocol", async () => {
      const initReq: JSONRPCRequest = { jsonrpc: "2.0", id: 20, method: "initialize", params: {} };
      await handleJSONRPCRequest(initReq);

      const req: JSONRPCRequest = { jsonrpc: "2.0", id: 21, method: "tools/list" };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.result).toBeDefined();
      const result = resp.result as { tools: Array<{ name: string }> };
      expect(result.tools.length).toBeGreaterThanOrEqual(1);
    });

    it("should call tool via protocol", async () => {
      const initReq: JSONRPCRequest = { jsonrpc: "2.0", id: 30, method: "initialize", params: {} };
      await handleJSONRPCRequest(initReq);

      const req: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: { name: "test_tool", arguments: { input: "hello" } },
      };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.result).toBeDefined();
      const result = resp.result as MCPToolCallResult;
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("hello");
    });

    it("should return error for missing tool name", async () => {
      const initReq: JSONRPCRequest = { jsonrpc: "2.0", id: 40, method: "initialize", params: {} };
      await handleJSONRPCRequest(initReq);

      const req: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 41,
        method: "tools/call",
        params: { arguments: {} },
      };
      const resp = await handleJSONRPCRequest(req);
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
    });

    it("should return error for non-existent tool", async () => {
      const initReq: JSONRPCRequest = { jsonrpc: "2.0", id: 50, method: "initialize", params: {} };
      await handleJSONRPCRequest(initReq);

      const req: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 51,
        method: "tools/call",
        params: { name: "nonexistent_tool", arguments: {} },
      };
      const resp = await handleJSONRPCRequest(req);
      const result = resp.result as MCPToolCallResult;
      expect(result.isError).toBe(true);
    });
  });
});