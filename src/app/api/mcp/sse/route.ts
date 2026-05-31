import { listTools, callTool, callSkill, listSkills, registerAllTools } from "@/server/mcp/server";

let toolsRegistered = false;

export async function GET() {
  if (!toolsRegistered) {
    registerAllTools();
    toolsRegistered = true;
  }

  const tools = listTools();
  const skills = listSkills();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tools", tools })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "skills", skills })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping" })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  if (!toolsRegistered) {
    registerAllTools();
    toolsRegistered = true;
  }

  try {
    const body = await request.json();
    const { method, params } = body;

    if (method === "tools/list") {
      return Response.json({ tools: listTools() });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      const result = await callTool(name, args || {});
      return Response.json({ content: [{ type: "text", text: result }] });
    }

    if (method === "skills/list") {
      return Response.json({ skills: listSkills() });
    }

    if (method === "skills/call") {
      const { name, arguments: args } = params || {};
      const result = await callSkill(name, args || {});
      return Response.json({ content: [{ type: "text", text: result }] });
    }

    return Response.json({ error: `未知方法: ${method}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mcp/sse] 处理请求失败:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
