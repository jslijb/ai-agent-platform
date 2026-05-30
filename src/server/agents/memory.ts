import { db } from "@/server/db/client";
import { conversations, messages, users, memoryProfiles, memorySummaries, memoryFragments } from "@/server/db/schema";
import { eq, desc, asc, sql, and, cosineDistance } from "drizzle-orm";
import bcrypt from "bcryptjs";

const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONTEXT_TOKENS = 6000;

const DEFAULT_USER_ID = "default-user";

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

/**
 * 确保 default-user 存在于 User 表中，避免 Conversation 外键约束失败
 */
export async function ensureUserExists(userId: string, userName?: string, userEmail?: string): Promise<void> {
  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (existing) return;
  } catch (err) {
    console.error(`[memory] 查询用户失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const name = userName || (userId === DEFAULT_USER_ID ? "Default User" : `User-${userId.substring(0, 8)}`);
  const email = userEmail || (userId === DEFAULT_USER_ID ? "default@agent.local" : `${userId.substring(0, 8)}@agent.local`);

  console.log(`[memory] 创建用户: ${userId}, name: ${name}`);
  try {
    await db.insert(users).values({
      id: userId,
      email,
      name,
      password: await bcrypt.hash("auto-created-not-for-login", 10),
    });
    console.log(`[memory] 用户创建成功: ${userId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      console.log(`[memory] 用户已存在（并发创建）: ${userId}`);
    } else {
      console.error(`[memory] 创建用户失败: ${msg}`);
    }
  }
}

export async function createConversation(userId: string, title: string = "新对话", userName?: string, userEmail?: string): Promise<string> {
  console.log(`[memory] 创建新会话, userId: ${userId}`);

  await ensureUserExists(userId, userName, userEmail);

  const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
  console.log(`[memory] 会话创建成功, id: ${conversation.id}, userId: ${userId}`);
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

export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  console.log(`[memory] 更新会话标题, conversationId: ${conversationId}, title: ${title}`);
  try {
    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    console.log(`[memory] 会话标题更新成功: ${conversationId}`);
  } catch (err) {
    console.error(`[memory] 更新会话标题失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  console.log(`[memory] 删除会话: ${conversationId}`);
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  console.log(`[memory] 会话已删除: ${conversationId}`);
}

export interface UserProfile {
  id: string;
  userId: string;
  scope: string;
  preferences: Record<string, unknown>;
  frequentStocks: Array<{ code: string; name: string; queryCount: number; lastQueriedAt: string }>;
  riskProfile: string | null;
  investmentStyle: string | null;
  customNotes: Array<{ key: string; value: string; updatedAt: string }>;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  console.log(`[memory:L4] 获取用户画像, userId: ${userId}`);
  try {
    const profile = await db.query.memoryProfiles.findFirst({
      where: and(eq(memoryProfiles.userId, userId), eq(memoryProfiles.scope, "personal")),
    });
    if (!profile) {
      console.log(`[memory:L4] 用户画像不存在, userId: ${userId}`);
      return null;
    }
    return {
      id: profile.id,
      userId: profile.userId,
      scope: profile.scope,
      preferences: (profile.preferences as Record<string, unknown>) || {},
      frequentStocks: (profile.frequentStocks as Array<{ code: string; name: string; queryCount: number; lastQueriedAt: string }>) || [],
      riskProfile: profile.riskProfile,
      investmentStyle: profile.investmentStyle,
      customNotes: (profile.customNotes as Array<{ key: string; value: string; updatedAt: string }>) || [],
    };
  } catch (err) {
    console.error(`[memory:L4] 获取用户画像失败: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function updateUserProfile(userId: string, updates: Partial<Pick<UserProfile, "preferences" | "frequentStocks" | "riskProfile" | "investmentStyle" | "customNotes">>): Promise<void> {
  console.log(`[memory:L4] 更新用户画像, userId: ${userId}, fields: ${Object.keys(updates).join(",")}`);
  try {
    const existing = await db.query.memoryProfiles.findFirst({
      where: and(eq(memoryProfiles.userId, userId), eq(memoryProfiles.scope, "personal")),
    });

    if (existing) {
      await db
        .update(memoryProfiles)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(memoryProfiles.id, existing.id));
      console.log(`[memory:L4] 用户画像更新成功, userId: ${userId}`);
    } else {
      await db.insert(memoryProfiles).values({
        userId,
        scope: "personal",
        ...updates,
      });
      console.log(`[memory:L4] 用户画像创建成功, userId: ${userId}`);
    }
  } catch (err) {
    console.error(`[memory:L4] 更新用户画像失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function trackStockQuery(userId: string, stockCode: string, stockName: string): Promise<void> {
  console.log(`[memory:L4] 追踪股票查询, userId: ${userId}, stock: ${stockCode} ${stockName}`);
  try {
    const profile = await getUserProfile(userId);
    const stocks = profile?.frequentStocks || [];
    const existing = stocks.find((s) => s.code === stockCode);

    if (existing) {
      existing.queryCount += 1;
      existing.lastQueriedAt = new Date().toISOString();
    } else {
      stocks.push({
        code: stockCode,
        name: stockName,
        queryCount: 1,
        lastQueriedAt: new Date().toISOString(),
      });
    }

    const frequentStocks = stocks.sort((a, b) => b.queryCount - a.queryCount).slice(0, 20);
    await updateUserProfile(userId, { frequentStocks });
  } catch (err) {
    console.error(`[memory:L4] 追踪股票查询失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function formatUserProfileForPrompt(profile: UserProfile): string {
  const lines: string[] = ["[用户画像]"];

  if (profile.preferences && Object.keys(profile.preferences).length > 0) {
    const prefs = profile.preferences as Record<string, string>;
    if (prefs.sectorFocus) lines.push(`- 关注板块：${prefs.sectorFocus}`);
    if (prefs.infoStyle) lines.push(`- 信息风格：${prefs.infoStyle}`);
  }

  if (profile.riskProfile) {
    const riskMap: Record<string, string> = { conservative: "保守型", moderate: "稳健型", aggressive: "激进型" };
    lines.push(`- 风险偏好：${riskMap[profile.riskProfile] || profile.riskProfile}`);
  }

  if (profile.investmentStyle) {
    const styleMap: Record<string, string> = { value: "价值投资", growth: "成长投资", momentum: "动量投资", balanced: "均衡投资" };
    lines.push(`- 投资风格：${styleMap[profile.investmentStyle] || profile.investmentStyle}`);
  }

  if (profile.frequentStocks && profile.frequentStocks.length > 0) {
    const top5 = profile.frequentStocks.slice(0, 5);
    lines.push(`- 常用股票：${top5.map((s) => `${s.name}(${s.code},查询${s.queryCount}次)`).join("、")}`);
  }

  if (profile.customNotes && profile.customNotes.length > 0) {
    const notes = profile.customNotes.slice(0, 3);
    lines.push(`- 注意事项：${notes.map((n) => n.value).join("；")}`);
  }

  if (lines.length <= 1) return "";

  return lines.join("\n");
}

export async function extractAndApplyPreferences(userId: string, userMessage: string): Promise<void> {
  const preferencePatterns: Array<{ pattern: RegExp; field: string; extractor: (match: RegExpMatchArray) => Record<string, unknown> }> = [
    {
      pattern: /我[主要]?关注(.+?)(板块|行业|领域)/,
      field: "preferences",
      extractor: (match) => ({ sectorFocus: match[1] + match[2] }),
    },
    {
      pattern: /我是(.+?)(投资者|投资人)/,
      field: "investmentStyle",
      extractor: (match) => {
        const styleMap: Record<string, string> = { 价值: "value", 成长: "growth", 动量: "momentum", 均衡: "balanced" };
        const key = Object.keys(styleMap).find((k) => match[1].includes(k));
        return { investmentStyle: key ? styleMap[key] : match[1] };
      },
    },
    {
      pattern: /我[是比]?[较偏]?([保守稳健激进]+)/,
      field: "riskProfile",
      extractor: (match) => {
        const riskMap: Record<string, string> = { 保守: "conservative", 稳健: "moderate", 激进: "aggressive" };
        const key = Object.keys(riskMap).find((k) => match[1].includes(k));
        return { riskProfile: key ? riskMap[key] : match[1] };
      },
    },
  ];

  for (const { pattern, field, extractor } of preferencePatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      console.log(`[memory:L4] 检测到偏好表达: pattern=${pattern.source}, field=${field}`);
      const extracted = extractor(match);
      if (field === "preferences") {
        const profile = await getUserProfile(userId);
        const currentPrefs = profile?.preferences || {};
        await updateUserProfile(userId, { preferences: { ...currentPrefs, ...extracted } });
      } else if (field === "investmentStyle") {
        await updateUserProfile(userId, extracted as { investmentStyle: string });
      } else if (field === "riskProfile") {
        await updateUserProfile(userId, extracted as { riskProfile: string });
      }
    }
  }
}

export interface TokenBudget {
  inputBudget: number;
  l1Budget: number;
  l2Budget: number;
  l3Budget: number;
  l4DynamicBudget: number;
  bufferBudget: number;
}

export function calculateTokenBudget(modelMaxTokens: number): TokenBudget {
  const inputBudget = Math.floor(modelMaxTokens * 0.75);
  const fixedOverhead = 1500;
  const remaining = inputBudget - fixedOverhead;

  return {
    inputBudget,
    l1Budget: Math.floor(remaining * 0.30),
    l2Budget: Math.floor(remaining * 0.25),
    l3Budget: Math.floor(remaining * 0.25),
    l4DynamicBudget: Math.floor(remaining * 0.10),
    bufferBudget: Math.floor(remaining * 0.10),
  };
}

export interface AssembledContext {
  l1Messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  l2Summary: string;
  l3Fragments: string;
  l4Profile: string;
  budget: TokenBudget;
}

export async function assembleContext(
  query: string,
  userId: string,
  conversationId: string,
  modelMaxTokens: number = 32768
): Promise<AssembledContext> {
  console.log(`[memory:assemble] 组装上下文, userId: ${userId}, convId: ${conversationId}, maxTokens: ${modelMaxTokens}`);

  const budget = calculateTokenBudget(modelMaxTokens);
  console.log(`[memory:assemble] Token预算: L1=${budget.l1Budget}, L2=${budget.l2Budget}, L3=${budget.l3Budget}, L4=${budget.l4DynamicBudget}`);

  const l1Messages = await getL1Messages(conversationId, budget.l1Budget);
  const l2Summary = await getL2Summary(conversationId, budget.l2Budget);
  const l3Fragments = await getL3Fragments(query, userId, budget.l3Budget);
  const l4Profile = await getL4Profile(userId);

  return { l1Messages, l2Summary, l3Fragments, l4Profile, budget };
}

async function getL1Messages(
  conversationId: string,
  tokenBudget: number
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> {
  const conversation = await getConversationHistory(conversationId, 10);
  if (!conversation) return [];

  const messages = conversation.messages.slice(-10);
  let totalTokens = 0;
  const selected: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    const tokens = estimateTokens(msg.content);
    if (totalTokens + tokens > tokenBudget) break;
    selected.push({ role: msg.role as "system" | "user" | "assistant", content: msg.content });
    totalTokens += tokens;
  }

  console.log(`[memory:L1] 选取 ${selected.length} 条最新消息, tokens: ${totalTokens}`);
  return selected;
}

async function getL2Summary(conversationId: string, tokenBudget: number): Promise<string> {
  try {
    const summaries = await db.query.memorySummaries.findMany({
      where: eq(memorySummaries.conversationId, conversationId),
      orderBy: desc(memorySummaries.createdAt),
    });

    if (summaries.length === 0) {
      console.log(`[memory:L2] 无滚动摘要, conversationId: ${conversationId}`);
      return "";
    }

    const parts: string[] = [];
    let totalTokens = 0;

    for (const s of summaries) {
      const tokens = s.tokenCount || estimateTokens(s.summary);
      if (totalTokens + tokens > tokenBudget) break;
      parts.push(s.summary);
      totalTokens += tokens;
    }

    const result = parts.length > 0 ? `[近期对话摘要]\n${parts.join("\n")}` : "";
    console.log(`[memory:L2] 注入 ${parts.length} 条摘要, tokens: ${totalTokens}`);
    return result;
  } catch (err) {
    console.error(`[memory:L2] 获取滚动摘要失败: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

async function getL3Fragments(query: string, userId: string, tokenBudget: number): Promise<string> {
  try {
    const fragments = await db.query.memoryFragments.findMany({
      where: eq(memoryFragments.userId, userId),
      orderBy: desc(memoryFragments.createdAt),
      limit: 20,
    });

    if (fragments.length === 0) {
      console.log(`[memory:L3] 无历史片段, userId: ${userId}`);
      return "";
    }

    const avgFragmentTokens = 200;
    const maxFragments = Math.max(1, Math.floor(tokenBudget / avgFragmentTokens));
    const selected = fragments.slice(0, maxFragments);

    const parts = selected.map((f) => {
      const source = f.sourceConversationId ? `来源会话${f.sourceConversationId.slice(0, 8)}` : "历史记录";
      const date = f.createdAt ? new Date(f.createdAt).toLocaleDateString("zh-CN") : "";
      return `[${source} | ${date}] ${f.content}`;
    });

    const result = parts.length > 0 ? `[历史相关记忆]\n${parts.join("\n")}` : "";
    console.log(`[memory:L3] 注入 ${parts.length} 条历史片段 (max=${maxFragments})`);
    return result;
  } catch (err) {
    console.error(`[memory:L3] 获取历史片段失败: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

async function getL4Profile(userId: string): Promise<string> {
  const profile = await getUserProfile(userId);
  if (!profile) return "";
  const formatted = formatUserProfileForPrompt(profile);
  console.log(`[memory:L4] 用户画像注入: ${formatted ? "有内容" : "空"}`);
  return formatted;
}
