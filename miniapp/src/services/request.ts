import Taro from "@tarojs/taro";

const BASE_URL = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: any;
  header?: Record<string, string>;
}

function getToken(): string {
  return Taro.getStorageSync("auth_token") || "";
}

export function setToken(token: string): void {
  Taro.setStorageSync("auth_token", token);
}

export function clearToken(): void {
  Taro.removeStorageSync("auth_token");
}

export async function request<T = any>(options: RequestOptions): Promise<T> {
  const token = getToken();
  const header: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.header,
  };

  if (token) {
    header["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await Taro.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || "GET",
      data: options.data,
      header,
    });

    if (res.statusCode === 401) {
      clearToken();
      Taro.showToast({ title: "登录已过期，请重新登录", icon: "none" });
      throw new Error("Unauthorized");
    }

    if (res.statusCode >= 400) {
      const errorMsg = res.data?.error || res.data?.message || "请求失败";
      throw new Error(errorMsg);
    }

    return res.data as T;
  } catch (error: any) {
    if (error.message === "Unauthorized") throw error;
    console.error("[request] 请求失败:", error.message);
    Taro.showToast({ title: error.message || "网络错误", icon: "none" });
    throw error;
  }
}
