import { View, Text, Input, ScrollView } from "@tarojs/components";
import { useState, useRef, useCallback } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { getMiniAPIClient } from "../../services/api-client";
import { useAuthStore } from "../../store/auth";
import "./index.scss";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

type ChatMode = "rag" | "agent";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("rag");
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
      const client = getMiniAPIClient();
      const conversations = await client.getConversations();
      const conv = conversations.find((c) => c.id === convId);
      if (conv) {
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
      const client = getMiniAPIClient();
      let fullAnswer = "";

      await client.chatStream(
        query,
        undefined,
        chatMode,
        (chunk) => {
          fullAnswer += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: fullAnswer } : m
            )
          );
        },
        (answer) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: answer } : m
            )
          );
          setLoading(false);
          scrollToBottom();
        },
        (error) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: `错误: ${error}` } : m
            )
          );
          setLoading(false);
        },
      );
    } catch (error) {
      console.error("[chat] 发送失败:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: "发送失败，请重试" } : m
        )
      );
      setLoading(false);
    }
  }, [inputValue, loading, chatMode, scrollToBottom]);

  const toggleMode = useCallback(() => {
    setChatMode((prev) => (prev === "rag" ? "agent" : "rag"));
  }, []);

  return (
    <View className="chat-page">
      <View className="chat-header">
        <View className={`mode-toggle ${chatMode}`} onClick={toggleMode}>
          <Text className="mode-label">{chatMode === "rag" ? "RAG问答" : "Agent对话"}</Text>
        </View>
      </View>
      <ScrollView
        className="chat-messages"
        scrollY
        scrollIntoView={scrollViewRef.current}
        scrollWithAnimation
      >
        {messages.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-icon">💬</Text>
            <Text className="empty-text">
              {chatMode === "rag" ? "向AI金融助手提问" : "与AI Agent对话"}
            </Text>
            <Text className="empty-hint">
              {chatMode === "rag"
                ? "例如：格力电器2025年营收是多少？"
                : "例如：帮我提交一个请假申请"}
            </Text>
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
          placeholder={chatMode === "rag" ? "输入您的问题..." : "告诉Agent您需要什么..."}
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
