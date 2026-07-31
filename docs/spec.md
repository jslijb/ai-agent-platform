# Spec: R001 财务数据落 PostgreSQL 双轨制实施规格

> **状态：已审批通过，进入阶段1实施**
> **关联 ADR**：[ADR-011](file:///d:/Python/ai-agent-platform/docs/adr/011-financial-data-to-postgresql.md)
> **关联需求**：R001（REQUIREMENTS.md）
> **最后更新**：2026-07-31

---

## 一、背景与目标

### 1.1 问题

V13-r2 评估实证，数值类查询检索质量严重不足：

| 分类 | 当前 CR | 达标线 | 差距 | 根因 |
|------|---------|--------|------|------|
| L1-事实提取 | 0.6667 | 0.8 | -0.13 | 表格切片切碎，数值与指标名分离 |
| L2-跨文档对比 | 0.23 | 0.8 | -0.57 | 跨公司一次检索召回混合数据 |
| L3-计算推理 | 0.30 | 0.8 | -0.50 | 多数值检索不完整 |
| L4-趋势分析 | 0.50 | 0.8 | -0.30 | 同比/环比数据缺失 |

### 1.2 目标

- 数值类查询走 SQL 精确查询，不再走向量检索
- L1/L3/L4 CR 提升至 0.85+
- L2 CR 提升至 0.80+（多实体并行检索，R003 另行规格）
- 建立 5 张财务数据表 + 2 张辅助表

### 1.3 核心原则

**指标清单驱动路由。** 不能保证 100% 的数值都进入 PostgreSQL，因此通过 `indicator_aliases` 指标清单快速判断路由：
- **命中标准化指标** → 走 SQL 精确查询（financial_income/balancesheet/cashflow/indicators）
- **未命中标准化指标** → 优先走 SQL 查 `financial_raw_tables`（整表返回 LLM 读表回答），仍查不到时走向量检索 fallback
- **非数值类查询** → 直接走向量检索（现有链路不变）

向量检索作为最终兜底，不再承担"已知标准化指标"的数值查询。

---

## 二、架构设计

### 2.1 整体架构

```
财报 PDF
  ├─ 三张主表（利润表/资产负债表/现金流量表）
  │   └─ pdfplumber + Camelot 提取 → 4 张结构化表（SQL 精确查询）
  │       └─ 命中指标清单的 L1/L3/L4 数值查询走 SQL
  │
  └─ 附注表格 + 正文（非标准化内容）
      └─ MinerU → Markdown → 整表 JSON → raw_tables（LLM 读表回答）
          └─ 未命中清单的数值查询走 raw_tables / 向量检索 fallback
          └─ L5-L9 非数值查询走 RAG
```

### 2.2 查询路由

```
用户 query
  │
  ├─ Step 1: 公司名识别 → stock_code（查 stock_mapping 表）
  ├─ Step 2: 指标识别 → standard_name（查 indicator_aliases 指标清单）
  ├─ Step 3: 意图判断 → 数值类 or 非数值类
  │
  ├─ 数值类查询
  │   ├─ 命中标准化指标 → SQL 查 financial_income/balancesheet/cashflow/indicators
  │   ├─ 未命中但 raw_tables 有相关表 → SQL 查 financial_raw_tables → 整表返回 LLM 读表
  │   └─ raw_tables 也查不到 → 走向量检索 fallback（最终兜底）
  │
  └─ 非数值类 → RAG 向量检索（现有链路不变）
```

---

## 三、表结构详细定义

### 3.1 financial_income（利润表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| stock_code | varchar(10) | 股票代码，关联 stock_mapping |
| report_year | int | 报告年度 |
| report_quarter | varchar(10) | Q1/Q2/Q3/annual |
| report_type | varchar(20) | 年报/一季报/半年报/三季报 |
| revenue | numeric | 营业收入 |
| operating_cost | numeric | 营业成本 |
| operating_profit | numeric | 营业利润 |
| net_profit | numeric | 净利润 |
| net_profit_attributable | numeric | 归属于母公司股东的净利润 |
| eps | numeric | 基本每股收益 |
| bvps | numeric | 每股净资产 |
| gross_margin | numeric | 毛利率（计算字段） |
| net_margin | numeric | 净利率（计算字段） |
| rd_expense | numeric | 研发费用 |
| selling_expense | numeric | 销售费用 |
| administrative_expense | numeric | 管理费用 |
| financial_expense | numeric | 财务费用 |
| premium_income | numeric | 保费收入（保险公司专用，其他 NaN） |
| commission_income | numeric | 经纪业务收入（证券公司专用，其他 NaN） |
| new_signed_contract | numeric | 新签合同额（建筑类公司专用，其他 NaN） |
| source | varchar(20) | pdf_extract / tushare / baostock |
| source_priority | int | 10/5/3 |
| document_id | varchar | 关联 PDF 源文件 |
| created_at | timestamp | 入库时间 |
| updated_at | timestamp | 更新时间 |

**主键约束**：`(stock_code, report_year, report_quarter, report_type)` 唯一
**缺失值**：NaN（不适用字段显式 NaN，不填 0 或空字符串）

### 3.2 financial_balancesheet（资产负债表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| stock_code | varchar(10) | 股票代码 |
| report_year | int | 报告年度 |
| report_quarter | varchar(10) | Q1/Q2/Q3/annual |
| report_type | varchar(20) | 报告类型 |
| total_assets | numeric | 总资产 |
| total_liabilities | numeric | 总负债 |
| total_equity | numeric | 股东权益合计 |
| equity_attributable | numeric | 归属于母公司股东权益合计 |
| current_assets | numeric | 流动资产合计 |
| non_current_assets | numeric | 非流动资产合计 |
| current_liabilities | numeric | 流动负债合计 |
| non_current_liabilities | numeric | 非流动负债合计 |
| cash | numeric | 货币资金 |
| accounts_receivable | numeric | 应收账款 |
| inventory | numeric | 存货 |
| fixed_assets | numeric | 固定资产 |
| goodwill | numeric | 商誉 |
| debt_ratio | numeric | 资产负债率（计算字段） |
| source | varchar(20) | 数据来源 |
| source_priority | int | 优先级 |
| document_id | varchar | 关联 PDF |
| created_at | timestamp | 入库时间 |
| updated_at | timestamp | 更新时间 |

**主键约束**：`(stock_code, report_year, report_quarter, report_type)` 唯一

### 3.3 financial_cashflow（现金流量表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| stock_code | varchar(10) | 股票代码 |
| report_year | int | 报告年度 |
| report_quarter | varchar(10) | Q1/Q2/Q3/annual |
| report_type | varchar(20) | 报告类型 |
| operating_cash_flow | numeric | 经营活动现金流量净额 |
| investing_cash_flow | numeric | 投资活动现金流量净额 |
| financing_cash_flow | numeric | 筹资活动现金流量净额 |
| cash_flow_from_operating | numeric | 经营活动现金流入 |
| cash_flow_from_investing | numeric | 投资活动现金流入 |
| cash_flow_from_financing | numeric | 筹资活动现金流入 |
| free_cash_flow | numeric | 自由现金流（计算字段） |
| source | varchar(20) | 数据来源 |
| source_priority | int | 优先级 |
| document_id | varchar | 关联 PDF |
| created_at | timestamp | 入库时间 |
| updated_at | timestamp | 更新时间 |

**主键约束**：`(stock_code, report_year, report_quarter, report_type)` 唯一

### 3.4 financial_indicators（衍生指标宽表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| stock_code | varchar(10) | 股票代码 |
| report_year | int | 报告年度 |
| report_quarter | varchar(10) | Q1/Q2/Q3/annual |
| report_type | varchar(20) | 报告类型 |
| roe | numeric | 净资产收益率 |
| roa | numeric | 总资产收益率 |
| gross_margin | numeric | 毛利率 |
| net_margin | numeric | 净利率 |
| debt_ratio | numeric | 资产负债率 |
| current_ratio | numeric | 流动比率 |
| quick_ratio | numeric | 速动比率 |
| revenue_yoy | numeric | 营业收入同比增长率 |
| net_profit_yoy | numeric | 净利润同比增长率 |
| total_assets_yoy | numeric | 总资产同比增长率 |
| eps | numeric | 基本每股收益 |
| bvps | numeric | 每股净资产 |
| operating_cash_flow_per_share | numeric | 每股经营现金流 |
| source | varchar(20) | 数据来源 |
| created_at | timestamp | 入库时间 |

**主键约束**：`(stock_code, report_year, report_quarter, report_type)` 唯一

### 3.5 financial_raw_tables（原始表格 JSON）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| stock_code | varchar(10) | 股票代码 |
| report_year | int | 报告年度 |
| report_quarter | varchar(10) | Q1/Q2/Q3/annual |
| table_name | varchar(100) | 表格名称（如"分行业营业收入"） |
| table_data | jsonb | 完整表格，行列结构保留 |
| page_num | int | PDF 页码 |
| source_document_id | varchar | 关联 PDF |
| created_at | timestamp | 入库时间 |

**用途**：存 10% 个性表格（非标准化），整表返回 LLM 读表回答
**不切片、不向量化**

### 3.6 stock_mapping（公司映射表）

| 字段 | 类型 | 说明 |
|------|------|------|
| stock_code | varchar(10) PK | 股票代码（主键） |
| stock_name_full | varchar(100) | 全称（中国能源建设股份有限公司） |
| stock_name_short | varchar(50) | 简称（中国能建） |
| stock_name_alias | jsonb | 别名列表（["能建","中国能源","CEEC"]） |
| exchange | varchar(10) | 交易所（SH/SZ/BJ） |
| industry | varchar(50) | 行业 |
| created_at | timestamp | 入库时间 |

**数据来源**：Tushare `stock_basic` 接口一次性导入

### 3.7 indicator_aliases（指标别名词典）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| standard_name | varchar(50) | 标准字段名（revenue） |
| standard_table | varchar(50) | 所属表（financial_income） |
| alias_list | jsonb | 别名列表（["营收","营业收入","主营收入","总收入"]） |
| description | varchar(200) | 指标说明 |

**预置别名词典**覆盖 90% 常见说法，未命中时 LLM 兜底

---

## 四、数据流设计

### 4.1 PDF 提取流程

```
PDF 年报
  │
  ├─ Step 1: pdfplumber 提取三张主表
  │   ├─ 识别"合并利润表"/"合并资产负债表"/"合并现金流量表"标题
  │   ├─ 提取表格行（保留行列结构）
  │   └─ 字段映射到标准字段名（revenue/net_profit/...）
  │
  ├─ Step 2: Camelot lattice 提取有线框表格
  │   └─ 补充 pdfplumber 漏掉的表格
  │
  ├─ Step 3: 识别非标准表格（附注表）
  │   ├─ 判断表格是否属于三张主表
  │   └─ 非主表 → 整表存入 financial_raw_tables（jsonb）
  │
  ├─ Step 4: 计算衍生指标
  │   └─ 毛利率 = (营收 - 营业成本) / 营收
  │   └─ 净利率 = 净利润 / 营收
  │   └─ 同比 = (本期 - 上期) / 上期
  │   └─ 写入 financial_indicators
  │
  └─ Step 5: 写入 PostgreSQL（按 source_priority 覆盖）
      └─ 记录 conflict_log（同周期同字段被覆盖时）
```

### 4.2 数据源优先级

| 来源 | priority | 适用周期 |
|------|----------|---------|
| PDF 提取（pdf_extract） | 10 | 历史所有周期 |
| Tushare（tushare） | 5 | 最新季度（临时） |
| BaoStock（baostock） | 3 | 最新季度（临时） |

**覆盖规则**：高优先级覆盖低优先级，同优先级不覆盖（避免重复回填）

### 4.3 分批实施

| 批次 | 公司数 | 用途 | 状态 |
|------|--------|------|------|
| 第1批 | 10 家 | 评估样本公司，验证通路 | 进行中 |
| ~~第2批~~ | ~~90 家~~ | ~~2026 Q1 报告全量~~ | **已取消（2026-07-31）** |
| ~~第3批~~ | ~~150 家~~ | ~~2025 年报全量~~ | **已取消（2026-07-31）** |

**数据规模调整说明（2026-07-31）**：
- 用户决策：机器性能有限，PostgreSQL 财务表只保留 10 家评估样本公司数据，不做 A 股全量回填
- embedding 库同样保持 10 家不变（已与 R001 设计一致：数值走 SQL、非数值走向量）
- 第1批 10 家清单：片仔癀、华海药业、江苏银行、东吴证券、格力电器、五粮液、中国长城、中国能建、中国铁建、中国人保
- 后续若评估集扩公司，再按需补充对应公司的 PostgreSQL 数据

---

## 五、查询路由实现

### 5.1 意图识别（轻量，不调 LLM）

```
规则匹配：
  - query 包含数值关键词（营收/净利润/资产/负债/现金流/毛利率/ROE/同比...）
  - query 包含公司名
  - 不包含交易规则/技术指标/合规/政策关键词
→ 判定为数值类查询
```

### 5.2 公司名识别

```
1. 精确匹配 stock_mapping.stock_name_short
2. 未命中 → 模糊匹配 stock_name_alias (pg_trgm, similarity > 0.6)
3. 未命中 → LLM 兜底（"这个简称可能是哪家上市公司"）
→ 返回 stock_code
```

### 5.3 指标识别

```
1. 正则匹配 indicator_aliases.alias_list
2. 未命中 → LLM 改写（"营收" → "revenue"）
→ 返回 standard_name + standard_table
```

### 5.4 SQL 查询（模板 SQL，首期不接 Text-to-SQL）

```sql
-- 模板1：单指标查询
SELECT {standard_name} FROM {standard_table}
WHERE stock_code = '{stock_code}'
  AND report_year = {year}
  AND report_quarter = '{quarter}';

-- 模板2：多指标查询
SELECT revenue, net_profit, gross_margin FROM financial_income fi
JOIN financial_indicators find ON fi.stock_code = find.stock_code
  AND fi.report_year = find.report_year
  AND fi.report_quarter = find.report_quarter
WHERE fi.stock_code = '{stock_code}'
  AND fi.report_year = {year};

-- 模板3：整表查询（未命中标准化指标时）
SELECT table_name, table_data FROM financial_raw_tables
WHERE stock_code = '{stock_code}'
  AND report_year = {year}
  AND table_name ILIKE '%{keyword}%';
```

---

## 六、实施步骤

### 阶段1：表结构与基础数据（P0）

| 步骤 | 内容 | 产出 |
|------|------|------|
| 1.1 | 创建 7 张表的 schema（src/server/db/schema.ts） | drizzle migration |
| 1.2 | 导入 stock_mapping（Tushare stock_basic） | 5000+ 公司映射 |
| 1.3 | 预置 indicator_aliases（30+ 常见指标） | 别名词典 |
| 1.4 | 写 ADR-011 已完成 | 架构决策固化 |

### 阶段2：PDF 提取与回填（P0）

| 步骤 | 内容 | 产出 |
|------|------|------|
| 2.1 | data_service 新增 PDF 表格提取端点（pdfplumber + Camelot） | /api/pdf/extract_tables |
| 2.2 | 编写 extract_financial_from_pdf.py 脚本 | 提取逻辑 |
| 2.3 | 第1批：10 家评估样本公司回填 | 验证通路 |
| 2.4 | 第2/3批：全量回填 | 150+ 公司数据 |

### 阶段3：查询路由改造（P0）

| 步骤 | 内容 | 产出 |
|------|------|------|
| 3.1 | 实现意图识别（src/server/rag/query-router.ts） | 数值/非数值分流 |
| 3.2 | 实现公司名识别 + 指标识别 | query 预处理 |
| 3.3 | 实现模板 SQL 查询 | SQL 查询层 |
| 3.4 | 接入 RAG API（数值类走 SQL，其他走原 RAG） | 路由整合 |

### 阶段4：验证与评估（P0）

| 步骤 | 内容 | 验收标准 |
|------|------|---------|
| 4.1 | 单条验证：抽 10 个 PDF 数值 vs 入库值 | 100% 一致 |
| 4.2 | 批量校验：对比 Tushare 同周期 | 差异率 < 5% |
| 4.3 | 端到端：重跑 L1/L3/L4 评估 | L1 CR→0.85+, L3 CR→0.85+, L4 CR→0.85+ |

---

## 七、验证方案

### 7.1 数据正确性验证

| 层级 | 方法 | 验收 |
|------|------|------|
| 单条 | 从 PDF 年报人工抽 10 个数值，与入库值对比 | 100% 一致 |
| 批量 | 对比 Tushare 同周期数据，不一致项人工复核 | 差异率 < 5%（PDF 为准） |
| 范围 | 数值范围合理性检查（营收 > 0、毛利率 0-100%） | 0 异常 |

### 7.2 检索质量验证

| 分类 | 当前 CR | 目标 CR | 验证方式 |
|------|---------|---------|---------|
| L1-事实提取 | 0.6667 | 0.85+ | 重跑 V13 评估 L1 |
| L3-计算推理 | 0.30 | 0.85+ | 重跑 V13 评估 L3 |
| L4-趋势分析 | 0.50 | 0.85+ | 重跑 V13 评估 L4 |

### 7.3 溯源能力验证

- 每条记录带 `document_id`，可溯源到 PDF 源文件
- 同周期同字段冲突时，`conflict_log` 记录被覆盖的旧值

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| PDF 提取准确率不达标 | 中 | 高 | 用 pdfplumber + Camelot（已验证 97%+），分批验证 |
| query 意图识别误判 | 中 | 中 | 规则匹配 + LLM 兜底，边界 case 人工标注 |
| 公司名匹配失败 | 低 | 中 | stock_mapping 预导入 5000+ 公司，模糊匹配兜底 |
| 工程量过大延期 | 高 | 中 | 分批实施，先 10 家验证再全量 |
| 数据源不一致 | 中 | 低 | 以 PDF 为准，conflict_log 记录冲突 |

---

## 九、不做什么（范围边界）

- **不落附注表的原始结构**：附注表只存 raw_tables JSON，不为每类附注建独立表
- **不改 BM25 预处理**：数值不再走 BM25，无需修复
- **不改 text-cleaner**：数值不再走向量检索，表格切片破坏影响降低
- **不接入 Text-to-SQL**：首期用模板 SQL，Text-to-SQL 作为后续增强
- **不处理 L2 跨文档对比**：L2 需要 R003 多实体并行检索，另行规格
- **不处理 L5-L9**：非数值类查询走现有 RAG，不在本规格范围

---

## 十、依赖与前置条件

### 10.1 前置条件

- [x] ADR-011 已写并审批通过
- [x] 表格提取工具选型已完成（docs/interview/rag_data_cleaning.md）
- [x] 本 spec 审批通过（2026-07-31）
- [x] DB schema 变更已执行（r001_financial_tables.sql 已建 7 张表 + UNIQUE INDEX）

### 10.2 依赖

- Tushare Pro API（stock_basic / income / balancesheet / cashflow / fina_indicator）
- pdfplumber + Camelot（Python 库，conda agent 环境）
  - 注：Windows 权限问题，pdfplumber / psycopg2-binary 已装到项目 `vendor/` 目录
- PostgreSQL pgvector 扩展（已部署）
- pg_trgm 扩展（模糊匹配，需确认是否已启用）

### 10.3 产出文档与代码

- [x] ADR-011（架构决策）
- [x] spec.md（本文件，实施规格）
- [x] drizzle/0003_tense_warhawk.sql + r001_financial_tables.sql（表结构脚本）
- [x] scripts/import_stock_mapping.py（stock_mapping 导入，5534 条）
- [x] scripts/import_indicator_aliases.py（indicator_aliases 预置，42 指标 124 别名）
- [x] data_service/pdf_extractor.py + /api/pdf/extract_tables 端点
- [x] scripts/extract_financial_from_pdf.py（批量处理+DB回填）
- [x] scripts/_add_unique_constraints.py（修复 ON CONFLICT 约束）
- [ ] 阶段 2.3：5 家提取 0 字段修复（华海药业/江苏银行/格力电器/东吴证券/...）
- [ ] query-router.ts（查询路由实现，阶段 3）
- [ ] 验证报告（数据正确性 + 检索质量，阶段 4）

---

## 审批确认

- [x] 五表双轨制架构（4张标准化表 + 1张原始JSON表）
- [x] 2张辅助表（stock_mapping + indicator_aliases）
- [x] 数据源优先级：PDF > Tushare > BaoStock
- [x] 指标清单驱动路由（命中走SQL，未命中走向量fallback）
- [x] 分批实施：先 10 家验证，再全量
- [x] 不做 Text-to-SQL（首期用模板 SQL）
- [x] 不处理 L2（R003 另行规格）
- [x] 表结构字段（用户确认开始写代码）

**审批通过，进入阶段1：建表 + 导入基础数据。**
