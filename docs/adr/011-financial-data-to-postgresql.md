# ADR-011: 财务数据落 PostgreSQL 双轨制架构

## 状态：待审批（2026-07-30）

## 背景

当前财务数据查询存在严重质量问题，V13-r2 评估实证：

| 分类 | CR | 问题 |
|------|-----|------|
| L1-事实提取 | 0.6667 | 表格切片把"指标名"和"数值"分到不同 chunk |
| L3-计算推理 | 0.30 | 多数值检索不完整 |
| L4-趋势分析 | 0.50 | 同比/环比数据缺失 |
| L2-跨文档对比 | 0.23 | 跨公司一次检索召回混合数据 |

根因调研（见 docs/interview/rag_data_cleaning.md、rag_recall_rate.md）：

1. PDF 表格切片破坏行列结构，数值与指标名分离
2. text-cleaner 主动破坏表格（压缩多空格、删 `|` 分隔行）
3. BM25 预处理删除千分位逗号、小数点、`|`，数字格式受损
4. 表格向量化 2000 字符截断丢表头
5. 无表格元数据标记，检索层无法差异化召回
6. `multimodal/table-extractor.ts` 表格提取模块是死代码，主流程未接入

业界对比（Tushare Pro、聚宽 JQData、AKShare）均采用"标准化三张表 + 指标宽表"双轨制，数值类查询不走向量检索。

## 决策

采用 **五表双轨制 + 查询路由** 架构：

### 五张表

| 表名 | 用途 | 数据来源 |
|------|------|---------|
| financial_income | 利润表标准化指标 | PDF利润表 / Tushare income |
| financial_balancesheet | 资产负债表标准化指标 | PDF资产负债表 / Tushare balancesheet |
| financial_cashflow | 现金流量表标准化指标 | PDF现金流量表 / Tushare cashflow |
| financial_indicators | 衍生计算指标（ROE、毛利率、同比） | 三张表计算 / Tushare fina_indicator |
| financial_raw_tables | 完整原始表格 JSON（10% 个性数据） | PDF 提取整表 |

辅助表：

| 表名 | 用途 |
|------|------|
| stock_mapping | 公司简称-代码映射（解决 SQL 精确查询） |
| indicator_aliases | 指标别名映射（解决 query 标准化） |

### 查询路由

```
query → 意图识别
  ├─ 数值类（L1/L2/L3/L4）
  │   ├─ 命中标准化指标 → SQL 查 4 张表
  │   └─ 未命中 → SQL 查 raw_tables 整表返回 LLM
  └─ 非数值类（L5-L9） → RAG 向量检索
```

**核心原则：指标清单驱动路由。命中已入库指标走 SQL，未命中走向量检索 fallback。**

### 数据优先级

```
同周期同字段：PDF提取(source=pdf, priority=10) > Tushare(source=tushare, priority=5) > BaoStock(source=baostock, priority=3)
高优先级覆盖低优先级，覆盖时记 conflict_log
```

## 理由

1. **业界验证**：Tushare/聚宽均用此架构，成熟可靠
2. **解决根本问题**：表格不再切片向量化找数值，彻底消除切片切碎问题
3. **精度保证**：SQL 精确查询，数值准确率 95%+（vs 向量检索 47%）
4. **覆盖完整**：90% 标准化指标走 SQL，10% 个性表格走整表 JSON，0% 漏网
5. **公司名匹配**：用 stock_code 精确查询，规避 SQL 模糊匹配弱点
6. **query 标准化可行**：金融指标说法相对固定，别名词典 + LLM 兜底可覆盖

## 后果

### 正面
- L1/L3/L4 CR 预期从 0.47/0.30/0.50 提升至 0.95/0.85/0.85
- 表格切片问题彻底解决（数值不再走向量检索）
- 数据可溯源（每条记录带 documentId 关联 PDF）
- 与 Tushare/聚宽架构对齐，便于数据源扩展

### 负面
- 需要从 150+ 份 PDF 提取结构化数据（工程量大）
- DB schema 变更（新增 7 张表）
- 查询路由改造（意图识别层新增分支）
- data_service 需新增 PDF 表格提取端点

### 风险缓解
- PDF 提取分批进行：先 10 家评估样本公司，验证通路后再全量
- 表格提取用 pdfplumber + Camelot（docs/interview/rag_data_cleaning.md 已验证准确率 97%+）
- stock_mapping 用 Tushare stock_basic 接口一次性导入
- 查询路由先做模板 SQL（预定义指标查询），Text-to-SQL 作为后续增强

## 不做什么（范围边界）

- **不落附注表的原始结构**：附注表（如"贷款按行业分布"）只存 raw_tables JSON，不为每类附注建独立表
- **不改 BM25 预处理**：数值不再走 BM25，无需修复
- **不改 text-cleaner**：数值不再走向量检索，表格切片破坏影响降低
- **不接入 Text-to-SQL**：首期用模板 SQL，Text-to-SQL 作为后续增强

## 相关文档

- spec.md：详细实施规格（待审批）
- docs/interview/rag_data_cleaning.md：表格提取工具选型
- docs/interview/rag_recall_rate.md：表格检索方案调研
- docs/EVALUATION_EXPERIENCE.md：坑 9 表格切片丢失数值
