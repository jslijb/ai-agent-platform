# V13 版本设计（DESIGN）

> **基线**: [docs/design.md](../../design.md)（全局架构）+ [V13 spec.md](spec.md)
> **最后更新**: 2026-08-01

---

## 一、R001 查询路由架构（核心设计）

### 1.1 五表双轨制
```
PostgreSQL
  ├─ financial_income          # 利润表（revenue/operating_cost/net_profit/eps等）
  ├─ financial_balancesheet    # 资产负债表（total_assets/total_liabilities/equity等）
  ├─ financial_cashflow        # 现金流量表（operating/investing/financing_cash_flow）
  ├─ financial_indicators      # 衍生指标（gross_margin/net_margin/debt_ratio/yoy）
  └─ financial_raw_tables      # 非标准化表格（jsonb整表存储）
辅助表：
  ├─ stock_mapping             # 股票代码↔公司名（精确+模糊匹配）
  └─ indicator_aliases         # 指标别名（正则匹配，长别名优先）
```

### 1.2 查询路由流程
```
用户query
  ├─ Step 1: 意图识别（规则匹配）
  │   ├─ 数值类（含营收/净利润/资产/负债/现金流/毛利率/ROE/同比+公司名）→ SQL路径
  │   └─ 非数值类（交易规则/技术指标/合规/政策）→ 向量检索路径
  │
  ├─ Step 2: 公司名识别
  │   ├─ 精确匹配 stock_mapping.stock_name_short
  │   └─ 模糊匹配 stock_mapping.stock_name_alias
  │
  ├─ Step 3: 指标识别
  │   └─ 正则匹配 indicator_aliases.alias_list（长别名优先）
  │
  ├─ Step 4: 模板SQL查询
  │   ├─ 按 standard_table 分组查询
  │   ├─ 支持单指标/多指标/整表查询
  │   └─ SQL结果注入LLM上下文（JSON格式，待优化为自然语言）
  │
  └─ Fallback: SQL未命中 → hybridSearch 向量检索
```

### 1.3 数据源优先级
```
pdf_extract (priority=10) > tushare (priority=5) > baostock (priority=3)
同周期同字段：高优先级覆盖低优先级，记录到 financial_conflict_log
同优先级不覆盖（避免重复回填）
```

## 二、PDF 提取设计

### 2.1 工具分工
```
pdfplumber（优先，文本层提取）
  ├─ extract_tables() 提取表格
  ├─ 字段映射（INCOME/BALANCE/CASHFLOW_FIELD_MAP）
  └─ 附注列识别（_identify_skip_columns，扫描20行）

PyMuPDF（兜底，文本层缺失时）
  ├─ get_text() 文本提取
  └─ 页面渲染为图片（pixmap）

PaddleOCR（图片型PDF）
  ├─ data_service /api/ocr/analyze（端口8020）
  └─ 接收图片Base64，返回OCR文本

Vision模型（最终fallback）
  └─ qwen-vl 多模态理解
```

### 2.2 字段映射策略
- key 长度降序排序，长别名优先匹配
- 银行/保险业专用字段（业务及管理费、保险服务收入等）
- 附注列识别：精确匹配"附注" + 前缀匹配"附注五" + 小整数列检测

## 三、评估设计

### 3.1 评估指标
| 指标 | 公式 | 达标线 |
|------|------|--------|
| CP | 检索片段排序质量（LLM判定相关/不相关） | 0.8 |
| CR | ground_truth事实覆盖率 | 0.8 |
| F | 答案对context的忠实度 | 0.85 |
| AR | 答案与query相关性 | 0.8 |
| 综合 | CP×0.2 + CR×0.2 + F×0.3 + AR×0.3 | 0.82 |

### 3.2 评估数据集来源
- 现状（V13-r4）：向量检索originalText + LLM生成expectedAnswer
- 问题：循环依赖（用检索结果评估检索质量）
- 改进方向（R013）：数值类问题从SQL查询结果生成expectedAnswer

## 四、相关 ADR
- [ADR-011](../../adr/011-financial-data-to-postgresql.md)：财务数据落PostgreSQL双轨制
