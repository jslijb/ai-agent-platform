import { PropsWithChildren, useEffect } from "react";
import Taro from "@tarojs/taro";
import { useAuthStore } from "./store/auth";
import { wechatLogin, getStoredUser } from "./services/auth";
import { setToken } from "./services/request";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  const { setAuth } = useAuthStore();

  useEffect(() => {
    // 尝试使用缓存的登录态
    const cachedUser = getStoredUser();
    const cachedToken = Taro.getStorageSync("auth_token");
    if (cachedUser && cachedToken) {
      setAuth(cachedToken, cachedUser);
      return;
    }

    // 自动微信登录
    wechatLogin()
      .then((result) => {
        setAuth(result.token, result.user);
        console.log("[app] 微信自动登录成功");
      })
      .catch((err) => {
        console.error("[app] 微信自动登录失败:", err.message);
      });
  }, []);

  return children;
}

export default App;
