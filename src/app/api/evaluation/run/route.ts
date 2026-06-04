import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { triggerEvaluation } from "@/server/evaluation/evaluation-trigger";
import { pushEvaluationTask, isMicroserviceMode } from "@/server/lib/service-adapter";

export const maxDuration = 300;

export async function POST(request: Request) {
  console.log("[evaluation-run] 收到评估触发请求");

  try {
    const session = await auth();
    if (!session?.user) {
      console.error("[evaluation-run] 未认证用户，拒绝请求");
      return NextResponse.json(
        { success: false, message: "未认证用户，请先登录" },
        { status: 401 }
      );
    }

    console.log(`[evaluation-run] 用户: ${session.user.email}, 角色: ${(session.user as any).role ?? "user"}`);

    const body = await request.json();
    const { evaluationLevel, evaluationType, milestone } = body;

    const traceId = request.headers.get("x-trace-id") || undefined;

    console.log(
      `[evaluation-run] 请求参数 - 级别: ${evaluationLevel}, 类型: ${evaluationType}, 里程碑: ${milestone ?? "无"}, 微服务模式: ${isMicroserviceMode()}`
    );

    if (!evaluationLevel || !["daily", "standard", "full"].includes(evaluationLevel)) {
      console.error(`[evaluation-run] 无效的评估级别: ${evaluationLevel}`);
      return NextResponse.json(
        { success: false, message: "无效的评估级别，有效值为 daily、standard、full" },
        { status: 400 }
      );
    }

    if (!evaluationType || !["rag", "agent"].includes(evaluationType)) {
      console.error(`[evaluation-run] 无效的评估类型: ${evaluationType}`);
      return NextResponse.json(
        { success: false, message: "无效的评估类型，有效值为 rag、agent" },
        { status: 400 }
      );
    }

    if (milestone !== undefined && typeof milestone !== "string") {
      console.error(`[evaluation-run] 无效的里程碑参数: ${milestone}`);
      return NextResponse.json(
        { success: false, message: "里程碑参数必须为字符串" },
        { status: 400 }
      );
    }

    if (isMicroserviceMode() && evaluationType === "rag") {
      console.log(`[evaluation-run] 微服务模式，通过 service-adapter 推送评估任务, 级别: ${evaluationLevel}`);

      const taskResult = await pushEvaluationTask(
        evaluationLevel as "standard" | "full",
        milestone,
        undefined,
        undefined,
        traceId
      );

      console.log(`[evaluation-run] 评估任务已推送, taskId: ${taskResult.taskId}, status: ${taskResult.status}`);
      return NextResponse.json({
        success: true,
        taskId: taskResult.taskId,
        status: taskResult.status,
        message: "评估任务已推送至队列",
      });
    }

    console.log(`[evaluation-run] 进程内模式，直接触发评估, 级别: ${evaluationLevel}, 类型: ${evaluationType}`);

    const result = await triggerEvaluation(
      evaluationLevel,
      evaluationType,
      milestone
    );

    if (result.success) {
      console.log(`[evaluation-run] 评估触发成功, 版本号: ${result.version}`);
      return NextResponse.json({
        success: true,
        version: result.version,
        message: result.message,
      });
    } else {
      console.error(`[evaluation-run] 评估触发失败: ${result.message}`);
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[evaluation-run] 评估触发请求处理失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "评估触发失败",
      },
      { status: 500 }
    );
  }
}
