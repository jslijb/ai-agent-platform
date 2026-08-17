import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  customType,
  serial,
  varchar,
  numeric,
  uuid,
  boolean,
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
  wechatOpenId: text("wechatOpenId").unique(),
  wechatUnionId: text("wechatUnionId"),
  wechatNickname: text("wechatNickname"),
  wechatAvatarUrl: text("wechatAvatarUrl"),
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

export const evaluationPool = pgTable(
  "evaluation_pool",
  {
    id: serial("id").primaryKey(),
    query: text("query").notNull(),
    answer: text("answer"),
    context: text("context"),
    toolsUsed: varchar("tools_used", { length: 512 }),
    category: varchar("category", { length: 64 }),
    source: varchar("source", { length: 32 }).notNull(),
    userFeedback: varchar("user_feedback", { length: 16 }),
    conversationId: varchar("conversation_id", { length: 64 }),
    model: varchar("model", { length: 64 }),
    iterations: integer("iterations"),
    latencyMs: integer("latency_ms"),
    tokenUsage: integer("token_usage"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("evaluation_pool_source_idx").on(table.source),
    categoryIdx: index("evaluation_pool_category_idx").on(table.category),
    createdAtIdx: index("evaluation_pool_created_at_idx").on(table.createdAt),
  }),
);

export const evaluationVersions = pgTable(
  "evaluation_versions",
  {
    id: serial("id").primaryKey(),
    version: integer("version").notNull(),
    timestamp: varchar("timestamp", { length: 64 }).notNull(),
    evaluationType: varchar("evaluation_type", { length: 32 }).notNull(),
    evaluationLevel: varchar("evaluation_level", { length: 16 }).notNull(),
    dataSource: varchar("data_source", { length: 32 }).notNull(),
    dataSourceDetail: varchar("data_source_detail", { length: 256 }),
    triggerMode: varchar("trigger_mode", { length: 16 }).notNull(),
    milestone: varchar("milestone", { length: 256 }),
    totalTests: integer("total_tests").notNull(),
    overallScore: numeric("overall_score", { precision: 8, scale: 4 }).notNull(),
    financialOverallScore: numeric("financial_overall_score", { precision: 8, scale: 4 }),
    avgHitsAtK: numeric("avg_hits_at_k", { precision: 8, scale: 4 }),
    avgContextRelevance: numeric("avg_context_relevance", { precision: 8, scale: 4 }),
    avgContextRecall: numeric("avg_context_recall", { precision: 8, scale: 4 }),
    avgFaithfulness: numeric("avg_faithfulness", { precision: 8, scale: 4 }),
    avgAnswerRelevance: numeric("avg_answer_relevance", { precision: 8, scale: 4 }),
    avgNumericalAccuracy: numeric("avg_numerical_accuracy", { precision: 8, scale: 4 }),
    avgComplianceScore: numeric("avg_compliance_score", { precision: 8, scale: 4 }),
    avgHallucinationRate: numeric("avg_hallucination_rate", { precision: 8, scale: 4 }),
    avgRiskDisclosureScore: numeric("avg_risk_disclosure_score", { precision: 8, scale: 4 }),
    avgTimelinessScore: numeric("avg_timeliness_score", { precision: 8, scale: 4 }),
    avgToolSelectionScore: numeric("avg_tool_selection_score", { precision: 8, scale: 4 }),
    avgPlanningScore: numeric("avg_planning_score", { precision: 8, scale: 4 }),
    avgAgentComplianceScore: numeric("avg_agent_compliance_score", { precision: 8, scale: 4 }),
    avgConsistencyScore: numeric("avg_consistency_score", { precision: 8, scale: 4 }),
    avgEfficiencyScore: numeric("avg_efficiency_score", { precision: 8, scale: 4 }),
    reportJson: text("report_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    evaluationTypeIdx: index("evaluation_versions_type_idx").on(table.evaluationType),
    evaluationLevelIdx: index("evaluation_versions_level_idx").on(table.evaluationLevel),
    timestampIdx: index("evaluation_versions_timestamp_idx").on(table.timestamp),
    createdAtIdx: index("evaluation_versions_created_at_idx").on(table.createdAt),
  }),
);

// 合规日志表 - 记录被意图识别层拦截的问题（Controversial/Unsafe 级）
// 监管依据：《证券投资顾问业务暂行规定》第二十八条 - 业务档案保存期限不少于5年
export const complianceLogs = pgTable(
  "compliance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    userId: text("user_id").notNull(),
    inputContent: text("input_content").notNull(),
    riskLevel: text("risk_level").notNull(), // "Controversial" | "Unsafe"
    violationType: text("violation_type").notNull(), // "投资建议" | "预测股价" | "内幕消息" | "操纵市场" | "其他"
    handlingAction: text("handling_action").notNull(),
    outputContent: text("output_content").notNull(),
    triggeredManualReview: boolean("triggered_manual_review").notNull().default(false),
  },
  (table) => ({
    userIdIdx: index("compliance_logs_user_id_idx").on(table.userId),
    riskLevelIdx: index("compliance_logs_risk_level_idx").on(table.riskLevel),
    timestampIdx: index("compliance_logs_timestamp_idx").on(table.timestamp),
    userIdTimestampIdx: index("compliance_logs_user_id_timestamp_idx").on(table.userId, table.timestamp),
  }),
);

// ============================================================
// 财务数据表（ADR-011：五表双轨制 + 查询路由）
// 详见 docs/adr/011-financial-data-to-postgresql.md 和 docs/spec.md
// 核心原则：指标清单驱动路由，命中走SQL，未命中走向量fallback
// ============================================================

// 公司映射表 - 解决SQL精确查询的公司名匹配问题
export const stockMapping = pgTable(
  "stock_mapping",
  {
    stockCode: varchar("stock_code", { length: 10 }).primaryKey(),
    stockNameFull: varchar("stock_name_full", { length: 100 }).notNull(),
    stockNameShort: varchar("stock_name_short", { length: 50 }).notNull(),
    stockNameAlias: jsonb("stock_name_alias").default([]),
    exchange: varchar("exchange", { length: 10 }),
    industry: varchar("industry", { length: 50 }),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    nameShortIdx: index("stock_mapping_name_short_idx").on(table.stockNameShort),
  }),
);

// 指标别名词典 - 解决query标准化问题
export const indicatorAliases = pgTable(
  "indicator_aliases",
  {
    id: serial("id").primaryKey(),
    standardName: varchar("standard_name", { length: 50 }).notNull().unique(),
    standardTable: varchar("standard_table", { length: 50 }).notNull(),
    aliasList: jsonb("alias_list").notNull().default([]),
    description: varchar("description", { length: 200 }),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    standardNameIdx: index("indicator_aliases_standard_name_idx").on(table.standardName),
  }),
);

// 利润表标准化指标
export const financialIncome = pgTable(
  "financial_income",
  {
    id: serial("id").primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    reportYear: integer("report_year").notNull(),
    reportQuarter: varchar("report_quarter", { length: 10 }).notNull(),
    reportType: varchar("report_type", { length: 20 }).notNull(),
    revenue: numeric("revenue"),
    operatingCost: numeric("operating_cost"),
    operatingProfit: numeric("operating_profit"),
    netProfit: numeric("net_profit"),
    netProfitAttributable: numeric("net_profit_attributable"),
    eps: numeric("eps"),
    bvps: numeric("bvps"),
    grossMargin: numeric("gross_margin"),
    netMargin: numeric("net_margin"),
    rdExpense: numeric("rd_expense"),
    sellingExpense: numeric("selling_expense"),
    administrativeExpense: numeric("administrative_expense"),
    financialExpense: numeric("financial_expense"),
    premiumIncome: numeric("premium_income"),
    commissionIncome: numeric("commission_income"),
    newSignedContract: numeric("new_signed_contract"),
    source: varchar("source", { length: 20 }).notNull(),
    sourcePriority: integer("source_priority").notNull(),
    documentId: varchar("document_id", { length: 64 }),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => ({
    stockCodeIdx: index("financial_income_stock_code_idx").on(table.stockCode),
    yearQuarterIdx: index("financial_income_year_quarter_idx").on(table.reportYear, table.reportQuarter),
    uniqueIdx: index("financial_income_unique_idx").on(table.stockCode, table.reportYear, table.reportQuarter, table.reportType),
  }),
);

// 资产负债表标准化指标
export const financialBalancesheet = pgTable(
  "financial_balancesheet",
  {
    id: serial("id").primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    reportYear: integer("report_year").notNull(),
    reportQuarter: varchar("report_quarter", { length: 10 }).notNull(),
    reportType: varchar("report_type", { length: 20 }).notNull(),
    totalAssets: numeric("total_assets"),
    totalLiabilities: numeric("total_liabilities"),
    totalEquity: numeric("total_equity"),
    equityAttributable: numeric("equity_attributable"),
    currentAssets: numeric("current_assets"),
    nonCurrentAssets: numeric("non_current_assets"),
    currentLiabilities: numeric("current_liabilities"),
    nonCurrentLiabilities: numeric("non_current_liabilities"),
    cash: numeric("cash"),
    accountsReceivable: numeric("accounts_receivable"),
    inventory: numeric("inventory"),
    fixedAssets: numeric("fixed_assets"),
    goodwill: numeric("goodwill"),
    debtRatio: numeric("debt_ratio"),
    source: varchar("source", { length: 20 }).notNull(),
    sourcePriority: integer("source_priority").notNull(),
    documentId: varchar("document_id", { length: 64 }),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => ({
    stockCodeIdx: index("financial_balancesheet_stock_code_idx").on(table.stockCode),
    yearQuarterIdx: index("financial_balancesheet_year_quarter_idx").on(table.reportYear, table.reportQuarter),
    uniqueIdx: index("financial_balancesheet_unique_idx").on(table.stockCode, table.reportYear, table.reportQuarter, table.reportType),
  }),
);

// 现金流量表标准化指标
export const financialCashflow = pgTable(
  "financial_cashflow",
  {
    id: serial("id").primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    reportYear: integer("report_year").notNull(),
    reportQuarter: varchar("report_quarter", { length: 10 }).notNull(),
    reportType: varchar("report_type", { length: 20 }).notNull(),
    operatingCashFlow: numeric("operating_cash_flow"),
    investingCashFlow: numeric("investing_cash_flow"),
    financingCashFlow: numeric("financing_cash_flow"),
    cashFlowFromOperating: numeric("cash_flow_from_operating"),
    cashFlowFromInvesting: numeric("cash_flow_from_investing"),
    cashFlowFromFinancing: numeric("cash_flow_from_financing"),
    freeCashFlow: numeric("free_cash_flow"),
    source: varchar("source", { length: 20 }).notNull(),
    sourcePriority: integer("source_priority").notNull(),
    documentId: varchar("document_id", { length: 64 }),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => ({
    stockCodeIdx: index("financial_cashflow_stock_code_idx").on(table.stockCode),
    yearQuarterIdx: index("financial_cashflow_year_quarter_idx").on(table.reportYear, table.reportQuarter),
    uniqueIdx: index("financial_cashflow_unique_idx").on(table.stockCode, table.reportYear, table.reportQuarter, table.reportType),
  }),
);

// 衍生指标宽表 - 三张表的计算字段
export const financialIndicators = pgTable(
  "financial_indicators",
  {
    id: serial("id").primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    reportYear: integer("report_year").notNull(),
    reportQuarter: varchar("report_quarter", { length: 10 }).notNull(),
    reportType: varchar("report_type", { length: 20 }).notNull(),
    roe: numeric("roe"),
    roa: numeric("roa"),
    grossMargin: numeric("gross_margin"),
    netMargin: numeric("net_margin"),
    debtRatio: numeric("debt_ratio"),
    currentRatio: numeric("current_ratio"),
    quickRatio: numeric("quick_ratio"),
    revenueYoy: numeric("revenue_yoy"),
    netProfitYoy: numeric("net_profit_yoy"),
    totalAssetsYoy: numeric("total_assets_yoy"),
    eps: numeric("eps"),
    bvps: numeric("bvps"),
    operatingCashFlowPerShare: numeric("operating_cash_flow_per_share"),
    source: varchar("source", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    stockCodeIdx: index("financial_indicators_stock_code_idx").on(table.stockCode),
    yearQuarterIdx: index("financial_indicators_year_quarter_idx").on(table.reportYear, table.reportQuarter),
    uniqueIdx: index("financial_indicators_unique_idx").on(table.stockCode, table.reportYear, table.reportQuarter, table.reportType),
  }),
);

// 原始表格JSON存储 - 10%个性表格
export const financialRawTables = pgTable(
  "financial_raw_tables",
  {
    id: serial("id").primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    reportYear: integer("report_year").notNull(),
    reportQuarter: varchar("report_quarter", { length: 10 }),
    tableName: varchar("table_name", { length: 100 }).notNull(),
    tableData: jsonb("table_data").notNull(),
    pageNum: integer("page_num"),
    sourceDocumentId: varchar("source_document_id", { length: 64 }),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    stockCodeIdx: index("financial_raw_tables_stock_code_idx").on(table.stockCode),
    yearIdx: index("financial_raw_tables_year_idx").on(table.reportYear),
    tableNameIdx: index("financial_raw_tables_table_name_idx").on(table.tableName),
  }),
);

// 数据冲突日志
export const financialConflictLog = pgTable(
  "financial_conflict_log",
  {
    id: serial("id").primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    reportYear: integer("report_year").notNull(),
    reportQuarter: varchar("report_quarter", { length: 10 }).notNull(),
    fieldName: varchar("field_name", { length: 50 }).notNull(),
    oldValue: text("old_value"),
    oldSource: varchar("old_source", { length: 20 }),
    newValue: text("new_value"),
    newSource: varchar("new_source", { length: 20 }),
    tableName: varchar("table_name", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    stockCodeIdx: index("financial_conflict_log_stock_code_idx").on(table.stockCode),
    yearQuarterIdx: index("financial_conflict_log_year_quarter_idx").on(table.reportYear, table.reportQuarter),
  }),
);

export const semanticCache = pgTable(
  "semantic_cache",
  {
    id: serial("id").primaryKey(),
    promptTemplate: varchar("prompt_template", { length: 100 }).notNull(),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    inputText: text("input_text").notNull(),
    embedding: vector("embedding"),
    response: text("response").notNull(),
    model: varchar("model", { length: 50 }),
    provider: varchar("provider", { length: 50 }),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { precision: 3 }),
  },
  (table) => ({
    templateIdx: index("semantic_cache_template_idx").on(table.promptTemplate),
    inputHashIdx: index("semantic_cache_input_hash_idx").on(table.inputHash),

  }),
);
