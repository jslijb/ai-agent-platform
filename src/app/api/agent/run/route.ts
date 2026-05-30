import { NextResponse } from "next/server";
import { runAgent } from "@/server/agents/simpleAgent";
import { checkRateLimit } from "@/server/lib/rate-limiter";
import { auth } from "@/lib/auth";

export const maxDuration = 300;

export async function POST(request: Request) {
  console.log("[agent/run] 收到 Agent 请求");

  try {
    const session = await auth();
    const body = await request.json();
    const { query, maxIterations, conversationId, userId: bodyUserId, model } = body;

    if (!query || typeof query !== "string") {
      console.error("[agent/run] 缺少 query 参数或类型错误");
      return NextResponse.json(
        { success: false, answer: "", error: "缺少 query 参数或类型错误" },
        { status: 400 }
      );
    }

    const clientId = request.headers.get("x-forwarded-for") || "unknown";
    const rateLimitResult = checkRateLimit(clientId);
    if (!rateLimitResult.allowed) {
      console.warn(`[agent/run] 请求被限流: ${clientId}`);
      return NextResponse.json(
        { success: false, answer: "", error: `请求过于频繁，请 ${Math.ceil(rateLimitResult.resetIn / 1000)} 秒后重试` },
        { status: 429 }
      );
    }

    const iterations = typeof maxIterations === "number" && maxIterations > 0 ? maxIterations : 5;
    const userId = session?.user?.id || bodyUserId || "default-user";
    const userName = session?.user?.name || undefined;
    const userEmail = session?.user?.email || undefined;

    console.log(`[agent/run] 查询内容: ${query}, 最大迭代次数: ${iterations}, userId: ${userId}, model: ${model || "默认"}`);

    const result = await runAgent(query, iterations, conversationId, userId, model, userName, userEmail);

    console.log(
      `[agent/run] Agent 执行完成, 回答长度: ${result.answer.length}, 迭代次数: ${result.iterations}`
    );

    return NextResponse.json({
      success: true,
      answer: result.answer,
      iterations: result.iterations,
      conversationId: result.conversationId,
      steps: result.steps,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent/run] Agent 执行异常: ${message}`);
    return NextResponse.json(
      { success: false, answer: "", error: message, iterations: 0 },
      { status: 500 }
    );
  }
}
