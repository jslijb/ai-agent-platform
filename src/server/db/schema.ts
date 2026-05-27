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
