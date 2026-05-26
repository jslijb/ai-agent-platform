import { db } from "@/server/db/client";
import { conversations, messages } from "@/server/db/schema";
import { eq, desc, asc } from "drizzle-orm";

const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONTEXT_TOKENS = 6000;

interface ConversationWithMessages {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: Date;
  }>;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export async function createConversation(userId: string, title: string = "新对话"): Promise<string> {
  console.log(`[memory] 创建新会话, userId: ${userId}`);
  const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
  console.log(`[memory] 会话创建成功, id: ${conversation.id}`);
  return conversation.id;
}

export async function addMessage(
  conversationId: string,
  role: "system" | "user" | "assistant",
  content: string
): Promise<void> {
  console.log(`[memory] 添加消息, conversationId: ${conversationId}, role: ${role}, 内容长度: ${content.length}`);
  await db.insert(messages).values({ conversationId, role, content });
}

export async function getConversationHistory(
  conversationId: string,
  maxMessages: number = MAX_CONTEXT_MESSAGES
): Promise<ConversationWithMessages | null> {
  console.log(`[memory] 获取会话历史, conversationId: ${conversationId}`);

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: {
      messages: {
        orderBy: asc(messages.createdAt),
        limit: maxMessages,
      },
    },
  });

  if (!conversation) {
    console.warn(`[memory] 会话不存在: ${conversationId}`);
    return null;
  }

  console.log(`[memory] 获取到 ${conversation.messages.length} 条历史消息`);
  return conversation as unknown as ConversationWithMessages;
}

export async function getRecentMessages(
  conversationId: string
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> {
  const conversation = await getConversationHistory(conversationId);
  if (!conversation) {
    return [];
  }

  const allMessages = [...conversation.messages].reverse();
  const selectedMessages: Array<typeof allMessages[0]> = [];
  let totalTokens = 0;

  for (const msg of allMessages) {
    const tokens = estimateTokens(msg.content);
    if (totalTokens + tokens > MAX_CONTEXT_TOKENS) {
      break;
    }
    selectedMessages.push(msg);
    totalTokens += tokens;
  }

  selectedMessages.reverse();

  console.log(`[memory] 选取 ${selectedMessages.length} 条消息, 估算 tokens: ${totalTokens}`);

  return selectedMessages.map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content,
  }));
}

export async function listConversations(userId: string): Promise<Array<{ id: string; title: string; createdAt: Date }>> {
  console.log(`[memory] 列出用户会话, userId: ${userId}`);
  const result = await db.query.conversations.findMany({
    where: eq(conversations.userId, userId),
    orderBy: desc(conversations.updatedAt),
    columns: { id: true, title: true, createdAt: true },
  });
  return result;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  console.log(`[memory] 删除会话: ${conversationId}`);
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  console.log(`[memory] 会话已删除: ${conversationId}`);
}
