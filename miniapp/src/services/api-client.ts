import Taro from "@tarojs/taro";
import type { DeviceType } from "shared-types";

export interface MiniAPIClientConfig {
  baseUrl: string;
  token?: string;
  timeout?: number;
}

export class MiniAPIClient {
  private config: MiniAPIClientConfig;

  constructor(config: MiniAPIClientConfig) {
    this.config = { timeout: 30000, ...config };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-device-type": "miniapp" as DeviceType,
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  async chat(query: string, conversationId?: string, mode: "rag" | "agent" = "rag"): Promise<string> {
    const endpoint = mode === "agent" ? "/api/v2/agent" : "/api/v2/chat";
    const res = await Taro.request({
      url: `${this.config.baseUrl}${endpoint}`,
      method: "POST",
      data: { query, conversationId },
      header: this.getHeaders(),
      timeout: this.config.timeout,
    });

    if (res.statusCode === 401) {
      this.clearToken();
      throw new Error("Unauthorized");
    }
    if (res.statusCode >= 400) {
      throw new Error(res.data?.error || `请求失败: ${res.statusCode}`);
    }

    return res.data?.answer || res.data?.content || "";
  }

  async chatStream(
    query: string,
    conversationId: string | undefined,
    mode: "rag" | "agent",
    onChunk: (chunk: string) => void,
    onDone: (fullAnswer: string) => void,
    onError: (error: string) => void,
  ): Promise<void> {
    const endpoint = mode === "agent" ? "/api/v2/agent/stream" : "/api/v2/chat/stream";
    try {
      const res = await Taro.request({
        url: `${this.config.baseUrl}${endpoint}`,
        method: "POST",
        data: { query, conversationId, stream: true },
        header: {
          ...this.getHeaders(),
          Accept: "text/event-stream",
        },
        responseType: "text",
        timeout: 300000,
      });

      if (res.statusCode === 200) {
        const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        const lines = text.split("\n");
        let currentEvent = "";
        let fullAnswer = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (dataStr === "[DONE]") {
              onDone(fullAnswer);
              return;
            }
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "chunk" && data.content) {
                fullAnswer += data.content;
                onChunk(data.content);
              } else if (currentEvent === "done" && data.answer) {
                fullAnswer = data.answer;
                onDone(fullAnswer);
                return;
              } else if (currentEvent === "error") {
                onError(data.message || "未知错误");
                return;
              }
            } catch { /* ignore */ }
          }
        }

        if (!fullAnswer) {
          try {
            const jsonData = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
            fullAnswer = jsonData.answer || jsonData.content || "抱歉，无法生成回答";
          } catch {
            fullAnswer = "抱歉，无法生成回答";
          }
        }
        onDone(fullAnswer);
      } else {
        onError(`请求失败: ${res.statusCode}`);
      }
    } catch (err: any) {
      onError(err.message || "网络错误");
    }
  }

  async getConversations(): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
    const res = await Taro.request({
      url: `${this.config.baseUrl}/api/v2/chat/conversations`,
      method: "GET",
      header: this.getHeaders(),
      timeout: this.config.timeout,
    });
    if (res.statusCode >= 400) throw new Error("获取对话列表失败");
    return res.data?.conversations || [];
  }

  async callMCPTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await Taro.request({
      url: `${this.config.baseUrl}/api/mcp/message`,
      method: "POST",
      data: {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      header: this.getHeaders(),
      timeout: this.config.timeout,
    });
    if (res.statusCode >= 400) throw new Error("MCP工具调用失败");
    return res.data?.result || res.data;
  }

  updateToken(token: string): void {
    this.config.token = token;
  }

  clearToken(): void {
    this.config.token = undefined;
    Taro.removeStorageSync("auth_token");
  }
}

let _client: MiniAPIClient | null = null;

export function getMiniAPIClient(): MiniAPIClient {
  if (!_client) {
    const token = Taro.getStorageSync("auth_token") || undefined;
    _client = new MiniAPIClient({
      baseUrl: process.env.TARO_APP_API_BASE_URL || "http://localhost",
      token,
    });
  }
  return _client;
}

export function initMiniAPIClient(token: string): MiniAPIClient {
  _client = new MiniAPIClient({
    baseUrl: process.env.TARO_APP_API_BASE_URL || "http://localhost",
    token,
  });
  Taro.setStorageSync("auth_token", token);
  return _client;
}