import { NextRequest, NextResponse } from "next/server";
import { code2Session, verifyJwt } from "@/server/auth/wechat";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq, and, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "未提供 token" }, { status: 401 });
    }

    const payload = verifyJwt(token);
    if (!payload) {
      return NextResponse.json({ error: "token 无效或已过期" }, { status: 401 });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "缺少邮箱或密码" }, { status: 400 });
    }

    // 查找已有账号
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!existingUser) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 });
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, existingUser.password);
    if (!isValid) {
      return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }

    // 检查该 openid 是否已绑定其他账号
    const boundUser = await db.query.users.findFirst({
      where: and(eq(users.wechatOpenId, payload.openid), ne(users.id, existingUser.id)),
    });
    if (boundUser) {
      return NextResponse.json({ error: "该微信已绑定其他账号" }, { status: 409 });
    }

    // 绑定
    console.log(`[wechat-bind] 绑定微信到账号, userId: ${existingUser.id}, openid: ${payload.openid.slice(0, 4)}****`);
    await db.update(users)
      .set({ wechatOpenId: payload.openid, wechatUnionId: null })
      .where(eq(users.id, existingUser.id));

    // 删除自动创建的微信用户
    if (payload.userId !== existingUser.id) {
      console.log(`[wechat-bind] 删除自动创建的微信用户, userId: ${payload.userId}`);
      await db.delete(users).where(eq(users.id, payload.userId));
    }

    return NextResponse.json({ success: true, userId: existingUser.id });
  } catch (error: any) {
    console.error("[wechat-bind] 绑定失败:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
