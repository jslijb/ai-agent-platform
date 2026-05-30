import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value === "string") {
      return value
        .slice(1, -1)
        .split(",")
        .map(Number);
    }
    return value as unknown as number[];
  },
});

export const users = pgTable("User", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});

export const documents = pgTable(
  "Document",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    fileName: text("fileName").notNull(),
    fileKey: text("fileKey").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    contentHash: text("contentHash"),
    version: integer("version").notNull().default(1),
    validUntil: timestamp("validUntil", { precision: 3 }),
    documentType: text("documentType").notNull().default("general"),
    rawContent: text("rawContent"),
    metadata: jsonb("metadata").default({}),
  },
);

export const embeddings = pgTable(
  "Embedding",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    documentId: text("documentId")
      .notNull()
      .references(() => documents.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chunkIndex: integer("chunkIndex").notNull(),
    chunkText: text("chunkText").notNull(),
    embedding: vector("embedding"),
    tokenCount: integer("tokenCount"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    documentIdIdx: index("Embedding_documentId_idx").on(table.documentId),
    embeddingIdx: index("Embedding_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);

export const conversations = pgTable(
  "Conversation",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("userId")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title").notNull().default(""),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("Conversation_userId_idx").on(table.userId),
  }),
);

export const messages = pgTable(
  "Message",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    conversationId: text("conversationId")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index("Message_conversationId_idx").on(
      table.conversationId,
    ),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  conversations: many(conversations),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  embeddings: many(embeddings),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  document: one(documents, {
    fields: [embeddings.documentId],
    references: [documents.id],
  }),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const agentLogs = pgTable(
  "AgentLog",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    conversationId: text("conversationId"),
    userId: text("userId").notNull(),
    query: text("query").notNull(),
    answer: text("answer"),
    model: text("model"),
    iterations: integer("iterations").notNull().default(0),
    totalSteps: integer("totalSteps").notNull().default(0),
    steps: jsonb("steps").notNull().default([]),
    promptTokens: integer("promptTokens").default(0),
    completionTokens: integer("completionTokens").default(0),
    totalTokens: integer("totalTokens").default(0),
    latencyMs: integer("latencyMs"),
    status: text("status").notNull().default("success"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("AgentLog_userId_idx").on(table.userId),
    conversationIdIdx: index("AgentLog_conversationId_idx").on(table.conversationId),
    createdAtIdx: index("AgentLog_createdAt_idx").on(table.createdAt),
  }),
);

export const llmUsageLogs = pgTable(
  "LLMUsageLog",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    model: text("model").notNull(),
    provider: text("provider").notNull().default("bailian"),
    promptTokens: integer("promptTokens").notNull().default(0),
    completionTokens: integer("completionTokens").notNull().default(0),
    totalTokens: integer("totalTokens").notNull().default(0),
    callType: text("callType").notNull(),
    success: integer("success").notNull().default(1),
    latencyMs: integer("latencyMs"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    modelIdx: index("LLMUsageLog_model_idx").on(table.model),
    createdAtIdx: index("LLMUsageLog_createdAt_idx").on(table.createdAt),
  }),
);

export const wrongAnswers = pgTable(
  "WrongAnswer",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    conversationId: text("conversationId"),
    agentLogId: text("agentLogId"),
    query: text("query").notNull(),
    wrongAnswer: text("wrongAnswer").notNull(),
    correctAnswer: text("correctAnswer"),
    errorType: text("errorType").notNull().default("other"),
    toolsUsed: text("toolsUsed"),
    model: text("model"),
    iterations: integer("iterations").default(0),
    note: text("note"),
    resolved: integer("resolved").notNull().default(0),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("WrongAnswer_userId_idx").on(table.userId),
    errorTypeIdx: index("WrongAnswer_errorType_idx").on(table.errorType),
    resolvedIdx: index("WrongAnswer_resolved_idx").on(table.resolved),
    createdAtIdx: index("WrongAnswer_createdAt_idx").on(table.createdAt),
  }),
);

export const wrongAnswersRelations = relations(wrongAnswers, ({ one }) => ({
  user: one(users, {
    fields: [wrongAnswers.userId],
    references: [users.id],
  }),
}));

export const marketCacheEntries = pgTable(
  "market_cache_entries",
  {
    cacheKey: text("cache_key").primaryKey(),
    dataType: text("data_type").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { precision: 3 }),
    source: text("source"),
    recordCount: integer("record_count").default(0),
  },
  (table) => ({
    dataTypeIdx: index("market_cache_data_type_idx").on(table.dataType),
    expiresAtIdx: index("market_cache_expires_at_idx").on(table.expiresAt),
  }),
);

export const memoryProfiles = pgTable(
  "MemoryProfile",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    scope: text("scope").notNull().default("personal"),
    teamId: text("teamId"),
    preferences: jsonb("preferences").default({}),
    frequentStocks: jsonb("frequentStocks").default([]),
    riskProfile: text("riskProfile"),
    investmentStyle: text("investmentStyle"),
    customNotes: jsonb("customNotes").default([]),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("MemoryProfile_userId_idx").on(table.userId),
    scopeIdx: index("MemoryProfile_scope_idx").on(table.scope),
  }),
);

export const memorySummaries = pgTable(
  "MemorySummary",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    conversationId: text("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    messageRangeStart: integer("messageRangeStart").notNull(),
    messageRangeEnd: integer("messageRangeEnd").notNull(),
    summary: text("summary").notNull(),
    keyPoints: jsonb("keyPoints").default([]),
    tokenCount: integer("tokenCount"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index("MemorySummary_conversationId_idx").on(table.conversationId),
    userIdIdx: index("MemorySummary_userId_idx").on(table.userId),
  }),
);

export const memoryFragments = pgTable(
  "MemoryFragment",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    scope: text("scope").notNull().default("personal"),
    teamId: text("teamId"),
    sourceConversationId: text("sourceConversationId"),
    sourceType: text("sourceType").notNull().default("conclusion"),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("MemoryFragment_userId_idx").on(table.userId),
    scopeIdx: index("MemoryFragment_scope_idx").on(table.scope),
    sourceTypeIdx: index("MemoryFragment_sourceType_idx").on(table.sourceType),
    embeddingIdx: index("MemoryFragment_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);

export const teams = pgTable(
  "Team",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    leaderId: text("leaderId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    description: text("description"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    leaderIdIdx: index("Team_leaderId_idx").on(table.leaderId),
  }),
);

export const teamMembers = pgTable(
  "TeamMember",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    teamId: text("teamId")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joinedAt", { precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    teamIdIdx: index("TeamMember_teamId_idx").on(table.teamId),
    userIdIdx: index("TeamMember_userId_idx").on(table.userId),
  }),
);

export const memoryProfilesRelations = relations(memoryProfiles, ({ one }) => ({
  user: one(users, {
    fields: [memoryProfiles.userId],
    references: [users.id],
  }),
}));

export const memorySummariesRelations = relations(memorySummaries, ({ one }) => ({
  conversation: one(conversations, {
    fields: [memorySummaries.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [memorySummaries.userId],
    references: [users.id],
  }),
}));

export const memoryFragmentsRelations = relations(memoryFragments, ({ one }) => ({
  user: one(users, {
    fields: [memoryFragments.userId],
    references: [users.id],
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  leader: one(users, {
    fields: [teams.leaderId],
    references: [users.id],
  }),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));
