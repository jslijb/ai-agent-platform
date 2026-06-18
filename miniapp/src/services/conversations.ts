import { request } from "./request";

export async function getConversations() {
  return request<{ success: boolean; conversations: any[] }>({
    url: "/api/miniapp/conversations",
    method: "GET",
  });
}

export async function getConversationDetail(conversationId: string) {
  return request<{ success: boolean; conversation: any }>({
    url: `/api/miniapp/conversations?conversationId=${conversationId}`,
    method: "GET",
  });
}
