-- R001 财务数据表（ADR-011：五表双轨制 + 查询路由）
-- 核心原则：指标清单驱动路由，命中走SQL，未命中走向量fallback

-- 公司映射表
CREATE TABLE IF NOT EXISTS "stock_mapping" (
	"stock_code" varchar(10) PRIMARY KEY,
	"stock_name_full" varchar(100) NOT NULL,
	"stock_name_short" varchar(50) NOT NULL,
	"stock_name_alias" jsonb DEFAULT '[]'::jsonb,
	"exchange" varchar(10),
	"industry" varchar(50),
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "stock_mapping_name_short_idx" ON "stock_mapping" ("stock_name_short");

-- 指标别名词典
CREATE TABLE IF NOT EXISTS "indicator_aliases" (
	"id" serial PRIMARY KEY,
	"standard_name" varchar(50) NOT NULL UNIQUE,
	"standard_table" varchar(50) NOT NULL,
	"alias_list" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"description" varchar(200),
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "indicator_aliases_standard_name_idx" ON "indicator_aliases" ("standard_name");

-- 利润表标准化指标
CREATE TABLE IF NOT EXISTS "financial_income" (
	"id" serial PRIMARY KEY,
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
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "financial_income_stock_code_idx" ON "financial_income" ("stock_code");
CREATE INDEX IF NOT EXISTS "financial_income_year_quarter_idx" ON "financial_income" ("report_year", "report_quarter");
CREATE INDEX IF NOT EXISTS "financial_income_unique_idx" ON "financial_income" ("stock_code", "report_year", "report_quarter", "report_type");

-- 资产负债表标准化指标
CREATE TABLE IF NOT EXISTS "financial_balancesheet" (
	"id" serial PRIMARY KEY,
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
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "financial_balancesheet_stock_code_idx" ON "financial_balancesheet" ("stock_code");
CREATE INDEX IF NOT EXISTS "financial_balancesheet_year_quarter_idx" ON "financial_balancesheet" ("report_year", "report_quarter");
CREATE INDEX IF NOT EXISTS "financial_balancesheet_unique_idx" ON "financial_balancesheet" ("stock_code", "report_year", "report_quarter", "report_type");

-- 现金流量表标准化指标
CREATE TABLE IF NOT EXISTS "financial_cashflow" (
	"id" serial PRIMARY KEY,
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
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "financial_cashflow_stock_code_idx" ON "financial_cashflow" ("stock_code");
CREATE INDEX IF NOT EXISTS "financial_cashflow_year_quarter_idx" ON "financial_cashflow" ("report_year", "report_quarter");
CREATE INDEX IF NOT EXISTS "financial_cashflow_unique_idx" ON "financial_cashflow" ("stock_code", "report_year", "report_quarter", "report_type");

-- 衍生指标宽表
CREATE TABLE IF NOT EXISTS "financial_indicators" (
	"id" serial PRIMARY KEY,
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
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "financial_indicators_stock_code_idx" ON "financial_indicators" ("stock_code");
CREATE INDEX IF NOT EXISTS "financial_indicators_year_quarter_idx" ON "financial_indicators" ("report_year", "report_quarter");
CREATE INDEX IF NOT EXISTS "financial_indicators_unique_idx" ON "financial_indicators" ("stock_code", "report_year", "report_quarter", "report_type");

-- 原始表格JSON存储
CREATE TABLE IF NOT EXISTS "financial_raw_tables" (
	"id" serial PRIMARY KEY,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10),
	"table_name" varchar(100) NOT NULL,
	"table_data" jsonb NOT NULL,
	"page_num" integer,
	"source_document_id" varchar(64),
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "financial_raw_tables_stock_code_idx" ON "financial_raw_tables" ("stock_code");
CREATE INDEX IF NOT EXISTS "financial_raw_tables_year_idx" ON "financial_raw_tables" ("report_year");
CREATE INDEX IF NOT EXISTS "financial_raw_tables_table_name_idx" ON "financial_raw_tables" ("table_name");

-- 数据冲突日志
CREATE TABLE IF NOT EXISTS "financial_conflict_log" (
	"id" serial PRIMARY KEY,
	"stock_code" varchar(10) NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" varchar(10) NOT NULL,
	"field_name" varchar(50) NOT NULL,
	"old_value" text,
	"old_source" varchar(20),
	"new_value" text,
	"new_source" varchar(20),
	"table_name" varchar(50) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "financial_conflict_log_stock_code_idx" ON "financial_conflict_log" ("stock_code");
CREATE INDEX IF NOT EXISTS "financial_conflict_log_year_quarter_idx" ON "financial_conflict_log" ("report_year", "report_quarter");
