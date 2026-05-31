import { callWithFallback } from "@/server/llm/router";

export async function hydeRewrite(originalQuery: string): Promise<string> {
  console.log(`[HyDE] 开始查询改写, 原始查询: "${originalQuery}"`);

  const messages = [
    {
      role: "system" as const,
      content:
        "你是一个金融领域的研究助手。请根据用户的问题，写一段可能出现在相关研究报告或财经文档中的答案文本。要求：1) 内容专业准确 2) 长度100-200字 3) 直接输出答案文本，不要加任何前缀或解释",
    },
    {
      role: "user" as const,
      content: `问题：${originalQuery}`,
    },
  ];

  try {
    const response = await callWithFallback(messages);
    const hydeText = (response.content ?? "").trim();

    console.log(`[HyDE] 改写完成, 假设文档长度: ${hydeText.length} 字`);
    console.log(`[HyDE] 假设文档: ${hydeText.substring(0, 100)}...`);

    return hydeText;
  } catch (error) {
    console.error("[HyDE] 查询改写失败，使用原始查询:", error);
    return originalQuery;
  }
}
