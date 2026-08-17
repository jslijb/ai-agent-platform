import type {
  ChatRequest,
  ChatResponse,
  DeviceType,
  MCPToolRequest,
  MCPToolResponse,
} from "shared-types";

export interface APIClientConfig {
  baseUrl: string;
  deviceType: DeviceType;
  token?: string;
  timeout?: number;
}

export class APIClient {
  private config: APIClientConfig;

  constructor(config: APIClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-device-type": this.config.deviceType,
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const resp = await fetch(`${this.config.baseUrl}/api/v2/chat`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout!),
    });
    if (!resp.ok) {
      throw new Error(`Chat API error: ${resp.status}`);
    }
    return resp.json();
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const resp = await fetch(`${this.config.baseUrl}/api/v2/chat/stream`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ ...request, stream: true }),
      signal: AbortSignal.timeout(300000),
    });
    if (!resp.ok) {
      throw new Error(`Chat Stream API error: ${resp.status}`);
    }
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        yield data;
      }
    }
  }

  async callMCPTool(request: MCPToolRequest): Promise<MCPToolResponse> {
    const resp = await fetch(`${this.config.baseUrl}/api/mcp/message`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: request,
      }),
      signal: AbortSignal.timeout(this.config.timeout!),
    });
    if (!resp.ok) {
      throw new Error(`MCP API error: ${resp.status}`);
    }
    const json = await resp.json();
    return json.result || json;
  }

  async listMCPTools(): Promise<Array<{ name: string; description: string }>> {
    const resp = await fetch(`${this.config.baseUrl}/api/mcp/message`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/list",
      }),
      signal: AbortSignal.timeout(this.config.timeout!),
    });
    if (!resp.ok) {
      throw new Error(`MCP List API error: ${resp.status}`);
    }
    const json = await resp.json();
    return json.result?.tools || [];
  }

  updateToken(token: string): void {
    this.config.token = token;
  }

  getDeviceType(): DeviceType {
    return this.config.deviceType;
  }
}

export function createAPIClient(config: APIClientConfig): APIClient {
  return new APIClient(config);
}