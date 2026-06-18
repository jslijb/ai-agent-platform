import { NextRequest, NextResponse } from "next/server";
import { authenticateMiniapp } from "@/server/auth/miniapp-middleware";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authResult = authenticateMiniapp(request);
  if ("status" in authResult) return authResult;

  const { userId } = authResult;

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        wechatNickname: true,
        wechatAvatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[miniapp/user/profile] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
