import Taro from "@tarojs/taro";
import { request, setToken } from "./request";

interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    wechatNickname: string | null;
    wechatAvatarUrl: string | null;
  };
}

export async function wechatLogin(): Promise<LoginResult> {
  // 1. 调用 wx.login 获取 code
  const loginRes = await Taro.login();
  if (!loginRes.code) {
    throw new Error("微信登录失败: 未获取到 code");
  }

  // 2. 发送 code 到后端换取 token
  const result = await request<{ token: string; user: any }>({
    url: "/api/auth/wechat/login",
    method: "POST",
    data: { code: loginRes.code },
  });

  // 3. 存储 token
  setToken(result.token);

  // 4. 缓存用户信息
  Taro.setStorageSync("user_info", result.user);

  return result as LoginResult;
}

export async function bindExistingAccount(email: string, password: string): Promise<boolean> {
  const result = await request<{ success: boolean }>({
    url: "/api/auth/wechat/bind",
    method: "POST",
    data: { email, password },
  });
  return result.success;
}

export function getStoredUser() {
  return Taro.getStorageSync("user_info") || null;
}

export function logout() {
  Taro.removeStorageSync("auth_token");
  Taro.removeStorageSync("user_info");
}
