import { db } from "@/server/db";
import { complianceLogs } from "@/server/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

/**
 * 合规日志记录函数
 *
 * 将被意图识别层拦截的问题（Controversial/Unsafe 级）记录到 compliance_logs 表。
 * 日志保存期限不少于5年，不自动删除。
 *
 * 监管依据：
 * - 《证券投资顾问业务暂行规定》第二十八条：业务档案保存期限不少于5年
 * - 《生成式人工智能服务管理暂行办法》第十五条：保存有关记录
 */
export async function logCompliance(params: {
  userId: string;
  inputContent: string;
  riskLevel: "Controversial" | "Unsafe";
  violationType: string;
  handlingAction: string;
  outputContent: string;
}): Promise<void> {
  let triggeredManualReview = false;

  try {
    // 人工审核阈值触发：检查同一用户24小时内 Unsafe 级问题数量
    if (params.riskLevel === "Unsafe") {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentUnsafeCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(complianceLogs)
        .where(
          and(
            eq(complianceLogs.userId, params.userId),
            eq(complianceLogs.riskLevel, "Unsafe"),
            gte(complianceLogs.timestamp, twentyFourHoursAgo)
          )
        );

      const existingCount = recentUnsafeCount[0]?.count ?? 0;
      // 包含当前这次，总数 = 已有 + 1
      const totalCount = existingCount + 1;

      if (totalCount >= 3) {
        triggeredManualReview = true;
        console.warn(
          `[COMPLIANCE ALERT] User ${params.userId} triggered manual review: ${totalCount} Unsafe queries in 24h`
        );
      }
    }

    // 写入合规日志
    await db.insert(complianceLogs).values({
      userId: params.userId,
      inputContent: params.inputContent,
      riskLevel: params.riskLevel,
      violationType: params.violationType,
      handlingAction: params.handlingAction,
      outputContent: params.outputContent,
      triggeredManualReview,
    });

    console.log(
      `[compliance] 日志已记录: userId=${params.userId}, riskLevel=${params.riskLevel}, violationType=${params.violationType}, manualReview=${triggeredManualReview}`
    );
  } catch (error) {
    // 日志记录失败不应影响主流程，仅输出错误日志
    console.error(
      `[compliance] 日志记录失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
