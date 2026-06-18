import { request } from "./request";

export async function sendChatMessage(query: string, conversationId?: string) {
  return request<{ success: boolean; answer?: string; conversationId?: string }>({
    url: "/api/miniapp/chat",
    method: "POST",
    data: { query, conversationId },
  });
}
