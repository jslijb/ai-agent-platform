import { NextRequest, NextResponse } from "next/server";
import { authenticateMiniapp } from "@/server/auth/miniapp-middleware";
import { db } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authResult = authenticateMiniapp(request);
  if ("status" in authResult) return authResult;

  const { userId } = authResult;

  try {
    const docs = await db.query.documents.findMany({
      where: eq(documents.userId, userId),
      orderBy: [desc(documents.createdAt)],
      columns: {
        id: true,
        fileName: true,
        status: true,
        documentType: true,
        createdAt: true,
        version: true,
      },
    });

    return NextResponse.json({
      success: true,
      documents: docs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[miniapp/documents] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
