import { NextRequest, NextResponse } from "next/server";
import { authenticateMiniapp } from "@/server/auth/miniapp-middleware";
import { db } from "@/server/db/client";
import { evaluationVersions } from "@/server/db/schema";
import { desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authResult = authenticateMiniapp(request);
  if ("status" in authResult) return authResult;

  try {
    const latest = await db.query.evaluationVersions.findFirst({
      orderBy: [desc(evaluationVersions.createdAt)],
      columns: {
        id: true,
        version: true,
        timestamp: true,
        evaluationType: true,
        evaluationLevel: true,
        totalTests: true,
        overallScore: true,
        financialOverallScore: true,
        avgFaithfulness: true,
        avgAnswerRelevance: true,
        avgComplianceScore: true,
        avgHallucinationRate: true,
        createdAt: true,
      },
    });

    if (!latest) {
      return NextResponse.json({ success: false, error: "暂无评估记录" }, { status: 404 });
    }

    return NextResponse.json({ success: true, evaluation: latest });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[miniapp/evaluation/latest] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
