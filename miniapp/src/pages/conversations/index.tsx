import { View, Text, ScrollView } from "@tarojs/components";
import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { request } from "../../services/request";
import "./index.scss";

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const res = await request<{ success: boolean; conversations: Conversation[] }>({
        url: "/api/miniapp/conversations",
        method: "GET",
      });
      setConversations(res.conversations || []);
    } catch (error) {
      console.error("[conversations] 加载失败:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleConversationClick(id: string) {
    Taro.setStorageSync("pendingConversationId", id);
    Taro.switchTab({ url: "/pages/chat/index" });
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days}天前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  return (
    <View className="conversations-page">
      <View className="page-header">
        <Text className="page-title">对话历史</Text>
      </View>
      <ScrollView className="conversation-list" scrollY>
        {loading ? (
          <View className="loading-state"><Text>加载中...</Text></View>
        ) : conversations.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-icon">📋</Text>
            <Text className="empty-text">暂无对话记录</Text>
            <Text className="empty-hint">开始聊天后会自动保存</Text>
          </View>
        ) : (
          conversations.map((conv) => (
            <View
              key={conv.id}
              className="conversation-item"
              onClick={() => handleConversationClick(conv.id)}
            >
              <View className="conv-info">
                <Text className="conv-title">{conv.title || "未命名对话"}</Text>
                <Text className="conv-date">{formatDate(conv.createdAt)}</Text>
              </View>
              <Text className="conv-arrow">›</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
