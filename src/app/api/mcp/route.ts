import { createSSEStream, handleSSEMessage } from "@/server/mcp/sse-transport";
import { registerAllMCPTools } from "@/server/mcp/register-tools";

let toolsRegistered = false;

export async function GET() {
  if (!toolsRegistered) {
    await registerAllMCPTools();
    toolsRegistered = true;
  }

  const { stream } = createSSEStream();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}