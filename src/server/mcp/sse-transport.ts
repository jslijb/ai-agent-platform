import { handleJSONRPCRequest, handleRawMessage } from "./mcp-handler";
import type { JSONRPCRequest, JSONRPCResponse } from "./protocol";

const SSE_CONNECTIONS = new Map<string, { controller: ReadableStreamDefaultController; heartbeat: NodeJS.Timeout }>();

function generateSessionId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createSSEStream(): { stream: ReadableStream; sessionId: string } {
  const sessionId = generateSessionId();
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      SSE_CONNECTIONS.set(sessionId, { controller, heartbeat });

      const endpoint = `/api/mcp/message?sessionId=${sessionId}`;
      controller.enqueue(`event: endpoint\ndata: ${endpoint}\n\n`);
    },
    cancel() {
      const conn = SSE_CONNECTIONS.get(sessionId);
      if (conn) {
        clearInterval(conn.heartbeat);
        SSE_CONNECTIONS.delete(sessionId);
      }
    },
  });

  return { stream, sessionId };
}

export async function handleSSEMessage(sessionId: string, body: string): Promise<JSONRPCResponse> {
  const response = await handleRawMessage(body);
  if (response) {
    sendSSEEvent(sessionId, "message", JSON.stringify(response));
  }
  return response || { jsonrpc: "2.0", id: null, result: {} };
}

function sendSSEEvent(sessionId: string, event: string, data: string): void {
  const conn = SSE_CONNECTIONS.get(sessionId);
  if (!conn) return;
  try {
    conn.controller.enqueue(`event: ${event}\ndata: ${data}\n\n`);
  } catch {
    clearInterval(conn.heartbeat);
    SSE_CONNECTIONS.delete(sessionId);
  }
}

export function getActiveConnectionCount(): number {
  return SSE_CONNECTIONS.size;
}

export { SSE_CONNECTIONS };