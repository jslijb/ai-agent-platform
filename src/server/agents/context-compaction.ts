import { callWithFallback } from "@/server/llm/router";
import type { BailianMessage } from "@/server/llm/providers/bailian";

const COMPACTION_THRESHOLD = 20;
const RECENT_MESSAGES_TO_KEEP = 5;
const MAX_FINANCIAL_VALUES = 50;

interface CompactionResult {
  compacted: boolean;
  originalMessageCount: number;
  compactedMessageCount: number;
  savedTokens: number;
}

interface StructuredSummary {
  decisions: string[];
  toolResults: Array<{ tool: string; key: string; value: string }>;
  userPrefs: string[];
  financialData: Record<string, string>;
}

function extractFinancialValues(text: string): Record<string, string> {
  const financialData: Record<string, string> = {};
  const patterns = [
    /(?:营收|营业收入|revenue)[：:\s]*([¥￥]?\d+[\.\d]*\s*[亿万]?元?)/gi,
    /(?:净利润|net profit)[：:\s]*([¥￥]?\d+[\.\d]*\s*[亿万]?元?)/gi,
    /(?:ROE|净资产收益率)[：:\s]*(\d+[\.\d]*%?)/gi,
    /(?:毛利率|gross margin)[：:\s]*(\d+[\.\d]*%?)/gi,
    /(?:最新价|latestClose|price)[：:\s]*([¥￥]?\d+[\.\d]*)/gi,
    /(?:MA\d+|RSI|MACD|DIF|DEA)[：:\s]*([-\d+[\.\d]*)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const key = match[0].split(/[：:\s]/)[0];
      if (Object.keys(financialData).length < MAX_FINANCIAL_VALUES) {
        financialData[key] = match[1];
      }
    }
  }
  return financialData;
}

function extractToolResults(messages: BailianMessage[]): Array<{ tool: string; key: string; value: string }> {
  const results: Array<{ tool: string; key: string; value: string }> = [];
  for (const msg of messages) {
    if (msg.role === "user" && msg.content) {
      const toolMatch = msg.content.match(/\[(\w+)\]\s*(.{0,200})/);
      if (toolMatch) {
        results.push({ tool: toolMatch[1], key: "observation", value: toolMatch[2].substring(0, 200) });
      }
    }
  }
  return results.slice(-10);
}

async function generateStructuredSummary(
  messagesToCompact: BailianMessage[]
): Promise<string> {
  const content = messagesToCompact
    .map((m) => `[${m.role}]: ${m.content?.substring(0, 500) || ""}`)
    .join("\n");

  const prompt: BailianMessage[] = [
    {
      role: "system",
      content:
        "你是对话摘要生成器。将以下对话历史压缩为结构化摘要。金融数值必须保留原始精度，不可四舍五入或近似。输出JSON格式：{\"decisions\":[\"决策1\"],\"toolResults\":[{\"tool\":\"工具名\",\"key\":\"关键字段\",\"value\":\"值\"}],\"userPrefs\":[\"偏好1\"],\"financialData\":{\"指标名\":\"值\"}}。只输出JSON，不要其他内容。",
    },
    {
      role: "user",
      content: content.substring(0, 8000),
    },
  ];

  try {
    const response = await callWithFallback(prompt, 0.3);
    const text = (response.content ?? "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed: StructuredSummary = JSON.parse(jsonMatch[0]);
      const parts: string[] = [];
      if (parsed.decisions?.length > 0) {
        parts.push(`决策: ${parsed.decisions.join("; ")}`);
      }
      if (parsed.toolResults?.length > 0) {
        parts.push(`工具结果: ${parsed.toolResults.map((r) => `${r.tool}(${r.key}=${r.value})`).join("; ")}`);
      }
      if (parsed.userPrefs?.length > 0) {
        parts.push(`用户偏好: ${parsed.userPrefs.join("; ")}`);
      }
      if (parsed.financialData && Object.keys(parsed.financialData).length > 0) {
        parts.push(`金融数据: ${Object.entries(parsed.financialData).map(([k, v]) => `${k}=${v}`).join("; ")}`);
      }
      return parts.length > 0 ? `[对话压缩摘要] ${parts.join("\n")}` : "";
    }
    return "";
  } catch (error) {
    console.error("[context-compaction] LLM摘要生成失败:", error);
    const financialData = extractFinancialValues(
      messagesToCompact.map((m) => m.content || "").join(" ")
    );
    if (Object.keys(financialData).length > 0) {
      return `[对话压缩摘要-降级] 金融数据: ${Object.entries(financialData).map(([k, v]) => `${k}=${v}`).join("; ")}`;
    }
    return "";
  }
}

export async function compactContext(
  messages: BailianMessage[]
): Promise<{ messages: BailianMessage[]; result: CompactionResult }> {
  const totalMessages = messages.filter((m) => m.role !== "system").length;

  if (totalMessages <= COMPACTION_THRESHOLD) {
    return {
      messages,
      result: {
        compacted: false,
        originalMessageCount: totalMessages,
        compactedMessageCount: totalMessages,
        savedTokens: 0,
      },
    };
  }

  console.log(`[context-compaction] 开始压缩: ${totalMessages}条消息 > 阈值${COMPACTION_THRESHOLD}`);

  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const messagesToCompact = nonSystemMessages.slice(0, -RECENT_MESSAGES_TO_KEEP);
  const recentMessages = nonSystemMessages.slice(-RECENT_MESSAGES_TO_KEEP);

  const originalTokens = messagesToCompact.reduce(
    (sum, m) => sum + Math.ceil((m.content || "").length / 2),
    0
  );

  const summary = await generateStructuredSummary(messagesToCompact);

  const compactedMessages: BailianMessage[] = [
    ...systemMessages,
  ];

  if (summary) {
    compactedMessages.push({
      role: "user",
      content: `[系统] 以下是对话历史的压缩摘要，请据此理解上下文：\n${summary}`,
    });
    compactedMessages.push({
      role: "assistant",
      content: "已了解对话历史摘要，将继续对话。",
    });
  }

  compactedMessages.push(...recentMessages);

  const compactedTokens = compactedMessages.reduce(
    (sum, m) => sum + Math.ceil((m.content || "").length / 2),
    0
  );

  const savedTokens = originalTokens - compactedTokens;
  console.log(
    `[context-compaction] 压缩完成: ${totalMessages}→${compactedMessages.filter((m) => m.role !== "system").length}条, 节省${savedTokens}tokens`
  );

  return {
    messages: compactedMessages,
    result: {
      compacted: true,
      originalMessageCount: totalMessages,
      compactedMessageCount: compactedMessages.filter((m) => m.role !== "system").length,
      savedTokens: Math.max(0, savedTokens),
    },
  };
}

export { COMPACTION_THRESHOLD, RECENT_MESSAGES_TO_KEEP };