import { request } from "./request";

export async function searchFinancial(query: string, topK = 10) {
  return request<{ success: boolean; results: any[]; total: number }>({
    url: "/api/miniapp/search",
    method: "POST",
    data: { query, topK },
  });
}
