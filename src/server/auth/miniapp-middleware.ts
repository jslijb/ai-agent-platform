import { verifyJwt } from "./wechat";
import { NextRequest, NextResponse } from "next/server";

export function authenticateMiniapp(request: NextRequest): { userId: string; openid: string } | NextResponse {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ success: false, error: "未提供 token" }, { status: 401 });
  }

  const payload = verifyJwt(token);
  if (!payload) {
    return NextResponse.json({ success: false, error: "token 无效或已过期" }, { status: 401 });
  }

  return payload;
}
