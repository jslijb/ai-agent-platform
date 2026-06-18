import jwt from "jsonwebtoken";

// 微信配置 - 在调用时读取，确保测试可以覆盖环境变量
function getWechatAppId(): string {
  return process.env.WECHAT_APP_ID || "";
}

function getWechatAppSecret(): string {
  return process.env.WECHAT_APP_SECRET || "";
}

function getJwtSecret(): string {
  return process.env.AUTH_SECRET || "dev-only-fallback-secret-change-in-production";
}

const JWT_EXPIRES_IN = "8h";

// 调用微信 code2Session API
export async function code2Session(code: string): Promise<{ openid: string; unionid?: string; session_key: string }> {
  const appId = getWechatAppId();
  const appSecret = getWechatAppSecret();
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;
  console.log(`[wechat] 调用 code2Session API, code: ${code.slice(0, 4)}****`);
  const res = await fetch(url);
  const data = await res.json();
  if (data.errcode) {
    console.error(`[wechat] code2Session 失败: errcode=${data.errcode}, errmsg=${data.errmsg}`);
    throw new Error(`微信登录失败: ${data.errmsg} (code: ${data.errcode})`);
  }
  console.log(`[wechat] code2Session 成功, openid: ${data.openid.slice(0, 4)}****`);
  return { openid: data.openid, unionid: data.unionid, session_key: data.session_key };
}

// 签发 JWT
export function signJwt(payload: { userId: string; openid: string }): string {
  console.log(`[wechat] 签发 JWT, userId: ${payload.userId}`);
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

// 验证 JWT
export function verifyJwt(token: string): { userId: string; openid: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; openid: string };
    console.log(`[wechat] JWT 验证成功, userId: ${decoded.userId}`);
    return decoded;
  } catch (error) {
    console.error(`[wechat] JWT 验证失败:`, error);
    return null;
  }
}
