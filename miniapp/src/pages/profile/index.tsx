import { View, Text, Input, Button } from "@tarojs/components";
import { useState } from "react";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../store/auth";
import { bindExistingAccount, logout } from "../../services/auth";
import "./index.scss";

export default function ProfilePage() {
  const { user, clearAuth } = useAuthStore();
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindEmail, setBindEmail] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [binding, setBinding] = useState(false);

  async function handleBind() {
    if (!bindEmail || !bindPassword) {
      Taro.showToast({ title: "请填写完整", icon: "none" });
      return;
    }

    setBinding(true);
    try {
      const success = await bindExistingAccount(bindEmail, bindPassword);
      if (success) {
        Taro.showToast({ title: "绑定成功", icon: "success" });
        setShowBindModal(false);
        // 重新登录以获取新 token
        logout();
        clearAuth();
      }
    } catch (error: any) {
      Taro.showToast({ title: error.message || "绑定失败", icon: "none" });
    } finally {
      setBinding(false);
    }
  }

  function handleLogout() {
    Taro.showModal({
      title: "确认退出",
      content: "退出后需要重新登录",
      success: (res) => {
        if (res.confirm) {
          logout();
          clearAuth();
          Taro.showToast({ title: "已退出", icon: "success" });
        }
      },
    });
  }

  return (
    <View className="profile-page">
      <View className="profile-header">
        <View className="avatar-circle">
          <Text className="avatar-text">
            {(user?.wechatNickname || user?.name || "?")[0]}
          </Text>
        </View>
        <Text className="username">{user?.wechatNickname || user?.name || "未登录"}</Text>
        <Text className="user-email">{user?.email || ""}</Text>
      </View>

      <View className="profile-menu">
        <View className="menu-item" onClick={() => setShowBindModal(true)}>
          <Text className="menu-text">绑定已有账号</Text>
          <Text className="menu-arrow">›</Text>
        </View>
        <View className="menu-item" onClick={handleLogout}>
          <Text className="menu-text menu-text-danger">退出登录</Text>
          <Text className="menu-arrow">›</Text>
        </View>
      </View>

      {showBindModal && (
        <View className="modal-overlay" onClick={() => setShowBindModal(false)}>
          <View className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Text className="modal-title">绑定已有账号</Text>
            <Input
              className="modal-input"
              value={bindEmail}
              onInput={(e) => setBindEmail(e.detail.value)}
              placeholder="请输入邮箱"
              type="text"
            />
            <Input
              className="modal-input"
              value={bindPassword}
              onInput={(e) => setBindPassword(e.detail.value)}
              placeholder="请输入密码"
              password
            />
            <View className="modal-buttons">
              <View className="modal-btn modal-btn-cancel" onClick={() => setShowBindModal(false)}>
                取消
              </View>
              <View className={`modal-btn modal-btn-confirm ${binding ? "disabled" : ""}`} onClick={handleBind}>
                {binding ? "绑定中..." : "确认绑定"}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
