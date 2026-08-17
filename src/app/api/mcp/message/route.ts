import { handleSSEMessage } from "@/server/mcp/sse-transport";
import { registerAllMCPTools } from "@/server/mcp/register-tools";
import { handleRawMessage } from "@/server/mcp/mcp-handler";

let toolsRegistered = false;

export async function POST(request: Request) {
  if (!toolsRegistered) {
    await registerAllMCPTools();
    toolsRegistered = true;
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId");

  try {
    const body = await request.text();

    if (sessionId) {
      const response = await handleSSEMessage(sessionId, body);
      return Response.json(response);
    }

    const response = await handleRawMessage(body);
    if (response) {
      return Response.json(response);
    }

    return Response.json({ jsonrpc: "2.0", id: null, result: {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mcp] 处理请求失败:", message);
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message } },
      { status: 500 }
    );
  }
}