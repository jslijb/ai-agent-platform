import { View, Text, Input, ScrollView, Image } from "@tarojs/components";
import { useState, useRef, useCallback } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { request } from "../../services/request";
import { useAuthStore } from "../../store/auth";
import "./index.scss";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef("");
  const { user } = useAuthStore();

  const scrollToBottom = useCallback(() => {
    const id = `msg-${Date.now()}`;
    scrollViewRef.current = id;
  }, []);

  useDidShow(() => {
    const pendingId = Taro.getStorageSync("pendingConversationId");
    if (pendingId) {
      Taro.removeStorageSync("pendingConversationId");
      loadConversation(pendingId);
    }
  });

  async function loadConversation(convId: string) {
    try {
      const res = await request<{ success: boolean; conversation: { messages: Array<{ role: string; content: string }> } }>({
        url: `/api/miniapp/conversations?conversationId=${convId}`,
        method: "GET",
      });
      if (res.success && res.conversation) {
        const loaded: Message[] = res.conversation.messages.map((m, i) => ({
          id: `msg-${i}`,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: Date.now(),
        }));
        setMessages(loaded);
        scrollToBottom();
      }
    } catch (err) {
      console.error("[chat] 加载对话失败:", err);
    }
  }

  const handleSend = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setLoading(true);
    scrollToBottom();

    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const token = Taro.getStorageSync("auth_token");
      const BASE_URL = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000";

      const requestTask = Taro.request({
        url: `${BASE_URL}/api/miniapp/chat`,
        method: "POST",
        data: { query },
        header: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        responseType: "text",
        success: (res) => {
          if (res.statusCode === 200) {
            const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            // 解析 SSE 事件
            const lines = text.split("\n");
            let currentEvent = "";
            let answer = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (currentEvent === "done" && data.answer) {
                    answer = data.answer;
                  } else if (currentEvent === "error") {
                    answer = `错误: ${data.message}`;
                  }
                } catch { /* ignore parse errors */ }
              }
            }

            if (!answer) {
              // 如果 SSE 解析失败，尝试直接作为 JSON 解析
              try {
                const jsonData = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
                answer = jsonData.answer || jsonData.message || "抱歉，无法生成回答";
              } catch {
                answer = "抱歉，无法生成回答";
              }
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: answer } : m
              )
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: "请求失败，请重试" } : m
              )
            );
          }
        },
        fail: (err) => {
          console.error("[chat] 请求失败:", err);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: "网络错误，请重试" } : m
            )
          );
        },
        complete: () => {
          setLoading(false);
          scrollToBottom();
        },
      });
    } catch (error) {
      console.error("[chat] 发送失败:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: "发送失败，请重试" } : m
        )
      );
      setLoading(false);
    }
  }, [inputValue, loading, scrollToBottom]);

  return (
    <View className="chat-page">
      <ScrollView
        className="chat-messages"
        scrollY
        scrollIntoView={scrollViewRef.current}
        scrollWithAnimation
      >
        {messages.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-icon">💬</Text>
            <Text className="empty-text">向AI金融助手提问</Text>
            <Text className="empty-hint">例如：格力电器2025年营收是多少？</Text>
          </View>
        ) : (
          messages.map((msg) => (
            <View
              key={msg.id}
              id={msg.id}
              className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}
            >
              {msg.role === "assistant" && (
                <View className="avatar avatar-ai">AI</View>
              )}
              <View className={`bubble ${msg.role === "user" ? "bubble-user" : "bubble-assistant"}`}>
                <Text>{msg.content || (loading && msg.role === "assistant" ? "思考中..." : "")}</Text>
              </View>
              {msg.role === "user" && (
                <View className="avatar avatar-user">
                  {(user?.wechatNickname || user?.name || "?")[0]}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
      <View className="chat-input-bar">
        <Input
          className="chat-input"
          value={inputValue}
          onInput={(e) => setInputValue(e.detail.value)}
          onConfirm={handleSend}
          placeholder="输入您的问题..."
          confirmType="send"
          disabled={loading}
        />
        <View
          className={`send-btn ${!inputValue.trim() || loading ? "send-btn-disabled" : ""}`}
          onClick={handleSend}
        >
          发送
        </View>
      </View>
    </View>
  );
}
