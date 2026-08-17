CREATE TABLE "compliance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"input_content" text NOT NULL,
	"risk_level" text NOT NULL,
	"violation_type" text NOT NULL,
	"handling_action" text NOT NULL,
	"output_content" text NOT NULL,
	"triggered_manual_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_pool" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"answer" text,
	"context" text,
	"tools_used" varchar(512),
	"category" varchar(64),
	"source" varchar(32) NOT NULL,
	"user_feedback" varchar(16),
	"conversation_id" varchar(64),
	"model" varchar(64),
	"iterations" integer,
	"latency_ms" integer,
	"token_usage" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"timestamp" varchar(64) NOT NULL,
	"evaluation_type" varchar(32) NOT NULL,
	"evaluation_level" varchar(16) NOT NULL,
	"data_source" varchar(32) NOT NULL,
	"data_source_detail" varchar(256),
	"trigger_mode" varchar(16) NOT NULL,
	"milestone" varchar(256),
	"total_tests" integer NOT NULL,
	"overall_score" numeric(8, 4) NOT NULL,
	"financial_overall_score" numeric(8, 4),
	"avg_hits_at_k" numeric(8, 4),
	"avg_context_relevance" numeric(8, 4),
	"avg_context_recall" numeric(8, 4),
	"avg_faithfulness" numeric(8, 4),
	"avg_answer_relevance" numeric(8, 4),
	"avg_numerical_accuracy" numeric(8, 4),
	"avg_compliance_score" numeric(8, 4),
	"avg_hallucination_rate" numeric(8, 4),
	"avg_risk_disclosure_score" numeric(8, 4),
	"avg_timeliness_score" numeric(8, 4),
	"avg_tool_selection_score" numeric(8, 4),
	"avg_planning_score" numeric(8, 4),
	"avg_agent_compliance_score" numeric(8, 4),
	"avg_consistency_score" numeric(8, 4),
	"avg_efficiency_score" numeric(8, 4),
	"report_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_balancesheet" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10) NOT NULL,
	"report_type" varchar(20) NOT NULL,
	"total_assets" numeric,
	"total_liabilities" numeric,
	"total_equity" numeric,
	"equity_attributable" numeric,
	"current_assets" numeric,
	"non_current_assets" numeric,
	"current_liabilities" numeric,
	"non_current_liabilities" numeric,
	"cash" numeric,
	"accounts_receivable" numeric,
	"inventory" numeric,
	"fixed_assets" numeric,
	"goodwill" numeric,
	"debt_ratio" numeric,
	"source" varchar(20) NOT NULL,
	"source_priority" integer NOT NULL,
	"document_id" varchar(64),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_cashflow" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10) NOT NULL,
	"report_type" varchar(20) NOT NULL,
	"operating_cash_flow" numeric,
	"investing_cash_flow" numeric,
	"financing_cash_flow" numeric,
	"cash_flow_from_operating" numeric,
	"cash_flow_from_investing" numeric,
	"cash_flow_from_financing" numeric,
	"free_cash_flow" numeric,
	"source" varchar(20) NOT NULL,
	"source_priority" integer NOT NULL,
	"document_id" varchar(64),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_conflict_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10) NOT NULL,
	"field_name" varchar(50) NOT NULL,
	"old_value" text,
	"old_source" varchar(20),
	"new_value" text,
	"new_source" varchar(20),
	"table_name" varchar(50) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_income" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10) NOT NULL,
	"report_type" varchar(20) NOT NULL,
	"revenue" numeric,
	"operating_cost" numeric,
	"operating_profit" numeric,
	"net_profit" numeric,
	"net_profit_attributable" numeric,
	"eps" numeric,
	"bvps" numeric,
	"gross_margin" numeric,
	"net_margin" numeric,
	"rd_expense" numeric,
	"selling_expense" numeric,
	"administrative_expense" numeric,
	"financial_expense" numeric,
	"premium_income" numeric,
	"commission_income" numeric,
	"new_signed_contract" numeric,
	"source" varchar(20) NOT NULL,
	"source_priority" integer NOT NULL,
	"document_id" varchar(64),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10) NOT NULL,
	"report_type" varchar(20) NOT NULL,
	"roe" numeric,
	"roa" numeric,
	"gross_margin" numeric,
	"net_margin" numeric,
	"debt_ratio" numeric,
	"current_ratio" numeric,
	"quick_ratio" numeric,
	"revenue_yoy" numeric,
	"net_profit_yoy" numeric,
	"total_assets_yoy" numeric,
	"eps" numeric,
	"bvps" numeric,
	"operating_cash_flow_per_share" numeric,
	"source" varchar(20) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_raw_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10),
	"table_name" varchar(100) NOT NULL,
	"table_data" jsonb NOT NULL,
	"page_num" integer,
	"source_document_id" varchar(64),
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicator_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"standard_name" varchar(50) NOT NULL,
	"standard_table" varchar(50) NOT NULL,
	"alias_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" varchar(200),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_aliases_standard_name_unique" UNIQUE("standard_name")
);
--> statement-breakpoint
CREATE TABLE "market_cache_entries" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"data_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"expires_at" timestamp (3),
	"source" text,
	"record_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "MemoryFragment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"userId" text NOT NULL,
	"scope" text DEFAULT 'personal' NOT NULL,
	"teamId" text,
	"sourceConversationId" text,
	"sourceType" text DEFAULT 'conclusion' NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryProfile" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"userId" text NOT NULL,
	"scope" text DEFAULT 'personal' NOT NULL,
	"teamId" text,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"frequentStocks" jsonb DEFAULT '[]'::jsonb,
	"riskProfile" text,
	"investmentStyle" text,
	"customNotes" jsonb DEFAULT '[]'::jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemorySummary" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversationId" text NOT NULL,
	"userId" text NOT NULL,
	"messageRangeStart" integer NOT NULL,
	"messageRangeEnd" integer NOT NULL,
	"summary" text NOT NULL,
	"keyPoints" jsonb DEFAULT '[]'::jsonb,
	"tokenCount" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_mapping" (
	"stock_code" varchar(10) PRIMARY KEY NOT NULL,
	"stock_name_full" varchar(100) NOT NULL,
	"stock_name_short" varchar(50) NOT NULL,
	"stock_name_alias" jsonb DEFAULT '[]'::jsonb,
	"exchange" varchar(10),
	"industry" varchar(50),
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TeamMember" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"teamId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joinedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Team" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"leaderId" text NOT NULL,
	"description" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wechatOpenId" text;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wechatUnionId" text;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wechatNickname" text;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wechatAvatarUrl" text;--> statement-breakpoint
ALTER TABLE "MemoryFragment" ADD CONSTRAINT "MemoryFragment_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryProfile" ADD CONSTRAINT "MemoryProfile_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemorySummary" ADD CONSTRAINT "MemorySummary_conversationId_Conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemorySummary" ADD CONSTRAINT "MemorySummary_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_Team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderId_User_id_fk" FOREIGN KEY ("leaderId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "compliance_logs_user_id_idx" ON "compliance_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compliance_logs_risk_level_idx" ON "compliance_logs" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "compliance_logs_timestamp_idx" ON "compliance_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "compliance_logs_user_id_timestamp_idx" ON "compliance_logs" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "evaluation_pool_source_idx" ON "evaluation_pool" USING btree ("source");--> statement-breakpoint
CREATE INDEX "evaluation_pool_category_idx" ON "evaluation_pool" USING btree ("category");--> statement-breakpoint
CREATE INDEX "evaluation_pool_created_at_idx" ON "evaluation_pool" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "evaluation_versions_type_idx" ON "evaluation_versions" USING btree ("evaluation_type");--> statement-breakpoint
CREATE INDEX "evaluation_versions_level_idx" ON "evaluation_versions" USING btree ("evaluation_level");--> statement-breakpoint
CREATE INDEX "evaluation_versions_timestamp_idx" ON "evaluation_versions" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "evaluation_versions_created_at_idx" ON "evaluation_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "financial_balancesheet_stock_code_idx" ON "financial_balancesheet" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "financial_balancesheet_year_quarter_idx" ON "financial_balancesheet" USING btree ("report_year","report_quarter");--> statement-breakpoint
CREATE INDEX "financial_balancesheet_unique_idx" ON "financial_balancesheet" USING btree ("stock_code","report_year","report_quarter","report_type");--> statement-breakpoint
CREATE INDEX "financial_cashflow_stock_code_idx" ON "financial_cashflow" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "financial_cashflow_year_quarter_idx" ON "financial_cashflow" USING btree ("report_year","report_quarter");--> statement-breakpoint
CREATE INDEX "financial_cashflow_unique_idx" ON "financial_cashflow" USING btree ("stock_code","report_year","report_quarter","report_type");--> statement-breakpoint
CREATE INDEX "financial_conflict_log_stock_code_idx" ON "financial_conflict_log" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "financial_conflict_log_year_quarter_idx" ON "financial_conflict_log" USING btree ("report_year","report_quarter");--> statement-breakpoint
CREATE INDEX "financial_income_stock_code_idx" ON "financial_income" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "financial_income_year_quarter_idx" ON "financial_income" USING btree ("report_year","report_quarter");--> statement-breakpoint
CREATE INDEX "financial_income_unique_idx" ON "financial_income" USING btree ("stock_code","report_year","report_quarter","report_type");--> statement-breakpoint
CREATE INDEX "financial_indicators_stock_code_idx" ON "financial_indicators" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "financial_indicators_year_quarter_idx" ON "financial_indicators" USING btree ("report_year","report_quarter");--> statement-breakpoint
CREATE INDEX "financial_indicators_unique_idx" ON "financial_indicators" USING btree ("stock_code","report_year","report_quarter","report_type");--> statement-breakpoint
CREATE INDEX "financial_raw_tables_stock_code_idx" ON "financial_raw_tables" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "financial_raw_tables_year_idx" ON "financial_raw_tables" USING btree ("report_year");--> statement-breakpoint
CREATE INDEX "financial_raw_tables_table_name_idx" ON "financial_raw_tables" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "indicator_aliases_standard_name_idx" ON "indicator_aliases" USING btree ("standard_name");--> statement-breakpoint
CREATE INDEX "market_cache_data_type_idx" ON "market_cache_entries" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX "market_cache_expires_at_idx" ON "market_cache_entries" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "MemoryFragment_userId_idx" ON "MemoryFragment" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "MemoryFragment_scope_idx" ON "MemoryFragment" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "MemoryFragment_sourceType_idx" ON "MemoryFragment" USING btree ("sourceType");--> statement-breakpoint
CREATE INDEX "MemoryFragment_embedding_idx" ON "MemoryFragment" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "MemoryProfile_userId_idx" ON "MemoryProfile" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "MemoryProfile_scope_idx" ON "MemoryProfile" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "MemorySummary_conversationId_idx" ON "MemorySummary" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "MemorySummary_userId_idx" ON "MemorySummary" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "stock_mapping_name_short_idx" ON "stock_mapping" USING btree ("stock_name_short");--> statement-breakpoint
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Team_leaderId_idx" ON "Team" USING btree ("leaderId");--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_wechatOpenId_unique" UNIQUE("wechatOpenId");