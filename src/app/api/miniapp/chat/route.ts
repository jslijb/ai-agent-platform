import { NextRequest } from "next/server";
import { authenticateMiniapp } from "@/server/auth/miniapp-middleware";
import { runAgent } from "@/server/agents/simpleAgent";
import { checkRateLimit } from "@/server/lib/rate-limiter";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  console.log("[miniapp/chat] 收到小程序聊天请求");

  const authResult = authenticateMiniapp(request);
  if ("status" in authResult) return authResult;

  const { userId } = authResult;
  const body = await request.json();
  const { query, maxIterations, conversationId, model } = body;

  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ success: false, error: "缺少 query 参数" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientId = request.headers.get("x-forwarded-for") || "miniapp";
  const rateLimitResult = checkRateLimit(clientId);
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({ success: false, error: "请求过于频繁" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const iterations = typeof maxIterations === "number" && maxIterations > 0 ? maxIterations : 5;
  console.log(`[miniapp/chat] 查询: ${query}, userId: ${userId}, model: ${model || "默认"}`);

  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          return true;
        } catch (e) {
          if (!streamClosed) {
            console.error(`[miniapp/chat] 发送事件失败 (${event}):`, e instanceof Error ? e.message : String(e));
            streamClosed = true;
          }
          return false;
        }
      };

      sendEvent("start", { query, userId });

      try {
        const result = await runAgent(
          query, iterations, conversationId, userId, model, undefined, undefined,
          (step) => { sendEvent("step", step); }
        );

        sendEvent("done", {
          success: true,
          answer: result.answer,
          iterations: result.iterations,
          conversationId: result.conversationId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[miniapp/chat] 执行异常: ${message}`);
        sendEvent("error", { message });
      } finally {
        if (!streamClosed) {
          try { controller.close(); } catch { /* ignore */ }
        }
        streamClosed = true;
      }
    },
    cancel() {
      console.log("[miniapp/chat] 客户端断开连接");
      streamClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
