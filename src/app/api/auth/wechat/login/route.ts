import { NextRequest, NextResponse } from "next/server";
import { code2Session, signJwt } from "@/server/auth/wechat";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "缺少 code 参数" }, { status: 400 });
    }

    // 1. 调用微信 API 获取 openid
    const { openid, unionid } = await code2Session(code);

    // 2. 查找已关联的用户
    let user = await db.query.users.findFirst({
      where: eq(users.wechatOpenId, openid),
    });

    // 3. 如果未找到，自动创建新用户
    if (!user) {
      const userId = randomUUID();
      console.log(`[wechat-login] 自动创建新用户, openid: ${openid.slice(0, 4)}****, userId: ${userId}`);
      const [newUser] = await db.insert(users).values({
        id: userId,
        email: `${openid}@wechat.placeholder`,
        name: `微信用户${openid.slice(-6)}`,
        password: await bcrypt.hash(randomUUID(), 10),
        wechatOpenId: openid,
        wechatUnionId: unionid || null,
        wechatNickname: `微信用户${openid.slice(-6)}`,
        wechatAvatarUrl: null,
      }).returning();
      user = newUser;
    } else {
      console.log(`[wechat-login] 已有用户登录, userId: ${user.id}`);
    }

    // 4. 签发 JWT
    const token = signJwt({ userId: user.id, openid });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        wechatNickname: user.wechatNickname,
        wechatAvatarUrl: user.wechatAvatarUrl,
      },
    });
  } catch (error: any) {
    console.error("[wechat-login] 微信登录失败:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
