# Agent 多工具联合查询测试 Spec

## Why
当前 RAG 测试只验证了文档检索能力（10个query），未测试 Agent 的多工具联合调用能力。需要设计高复杂度 query，验证系统能否同时调用行情数据工具（getStockHistory/getStockRealtime）、财务数据工具（getStockFinancial/getFinancialReport）和 RAG 检索工具（hybridSearch），以及 PDF 表格数据的检索可靠性。

## What Changes
- 新增 14 个高复杂度测试 query（A类6个 + B类6个 + C类2个）
- 新增 Agent 多工具联合测试脚本 `tests/agent/test-agent-tools.ts`
- 测试报告输出到 `tests/agent/reports/`

## Impact
- Affected code: `tests/agent/`（新增目录和文件）
- 不影响现有代码逻辑

## ADDED Requirements

### Requirement: Agent 多工具联合查询测试

系统 SHALL 提供 14 个高复杂度测试 query，验证 Agent 的多工具联合调用能力。

#### Query 设计规范

**A类：单公司多工具联合查询（6个）**
每个 query 必须同时触发：
- 交易数据工具（getStockHistory 或 getStockRealtime）
- 年报数据（hybridSearch 检索 PDF 年报）
- 季报/财务数据工具（getStockFinancial 或 getFinancialReport）

| # | 公司 | Query | 涉及表格 | 预期工具 |
|---|------|-------|---------|---------|
| A1 | 五粮液 | 五粮液2025年毛利率与近60日MA20趋势对比，结合年报分析毛利率变动原因 | 利润表（毛利率行） | getStockHistory + hybridSearch + getStockFinancial |
| A2 | 五粮液 | 五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力 | 资产负债表（资产/负债合计行） | getStockHistory + hybridSearch + getFinancialReport(balance) |
| A3 | 中国长城 | 中国长城2025年研发费用占营收比例是多少？结合RSI指标分析近期股价是否超买 | 利润表/研发费用行 | getStockHistory + calculateRSI + hybridSearch + getFinancialReport(income) |
| A4 | 中国长城 | 中国长城2025年经营现金流净额是多少？结合MACD指标判断当前趋势 | 现金流量表（经营活动现金流净额行） | getStockHistory + calculateMACD + hybridSearch + getFinancialReport(cashflow) |
| A5 | 格力电器 | 格力电器2025年应收账款周转天数是多少？结合布林带分析股价波动区间 | 资产负债表（应收账款行） | getStockHistory + calculateBollinger + hybridSearch + getFinancialReport(balance) |
| A6 | 格力电器 | 格力电器2025年分红方案是什么？结合夏普比率评估投资回报质量 | 利润分配表/分红行 | getStockHistory + calculateSharpeRatio + hybridSearch |

**B类：双公司对比查询（6个）**
每个 query 必须同时触发两家公司的工具调用：

| # | 公司 | Query | 涉及表格 | 预期工具 |
|---|------|-------|---------|---------|
| B1 | 五粮液+格力电器 | 五粮液和格力电器2025年净利率谁更高？结合近20日换手率对比市场活跃度 | 利润表（净利润/营业收入行） | getStockHistory×2 + hybridSearch×2 + getStockFinancial×2 |
| B2 | 五粮液+中国长城 | 五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标分析短期超买超卖 | 资产负债表（存货行）+ 利润表（营业成本行） | getStockHistory×2 + calculateKDJ×2 + hybridSearch×2 + getFinancialReport(balance)×2 |
| B3 | 格力电器+中国长城 | 格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风险水平 | 盈利能力指标表 | getStockHistory×2 + calculateMaxDrawdown×2 + hybridSearch×2 + getStockFinancial×2 |
| B4 | 五粮液+格力电器 | 五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比股价稳定性 | 资产负债表（商誉行） | getStockHistory×2 + calculateVolatility×2 + hybridSearch×2 + getFinancialReport(balance)×2 |
| B5 | 中国长城+格力电器 | 中国长城和格力电器2025年合同负债分别是多少？结合VWAP对比机构持仓成本 | 资产负债表（合同负债/预收款项行） | getStockHistory×2 + calculateVWAP×2 + hybridSearch×2 + getFinancialReport(balance)×2 |
| B6 | 五粮液+中国长城 | 五粮液和中国长城2025年无形资产分别是多少？结合VaR对比尾部风险 | 资产负债表（无形资产行） | getStockHistory×2 + calculateVaR×2 + hybridSearch×2 + getFinancialReport(balance)×2 |

**C类：三公司综合查询（2个）**

| # | 公司 | Query | 涉及表格 | 预期工具 |
|---|------|-------|---------|---------|
| C1 | 五粮液+格力电器+中国长城 | 五粮液、格力电器、中国长城2025年营业收入增速排名如何？结合相关性分析三只股票走势的联动性 | 利润表（营业收入行） | getStockHistory×3 + calculateCorrelation + hybridSearch×3 + getStockFinancial×3 |
| C2 | 五粮液+格力电器+中国长城 | 五粮液、格力电器、中国长城2025年经营活动现金流净额分别是多少？结合压力测试对比三家公司极端行情下的风险承受能力 | 现金流量表（经营活动现金流净额行） | getStockHistory×3 + calculateStressTest×3 + hybridSearch×3 + getFinancialReport(cashflow)×3 |

#### 测试验证标准
- 每个 query 必须成功调用至少3种不同类型的工具
- 回答必须包含具体数值（不能只有定性描述）
- PDF 表格数据检索结果必须与年报原文一致
- 双公司/三公司 query 必须对每家公司都返回数据
- **所有14个query必须全部通过**，不通过的需分析原因、修复、重新测试

#### 测试报告格式

每个 query 的报告格式如下：

```markdown
# [query编号] [query内容]

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 [tool名称]，输入参数: [参数]，返回结果: [结果摘要]
  - 步骤2: 调用 [tool名称]，输入参数: [参数]，返回结果: [结果摘要]
  - 信息完整 → 结束循环，输出结果
- 第2轮（如需要）
  - 步骤1: ...
  - 信息不完整 → 进入下一轮
- ...（最多5轮）

### 测试结果
- ✅ 成功: [输出结果摘要]
- ❌ 失败: [错误信息]

## 修复方案（仅失败时）
- 问题: [根因分析]
- 修复: [具体修复措施]

## 第2次测试（仅失败修复后）

### 测试过程
- 第1轮
  - ...
- ...

### 测试结果
- ✅ 成功: [输出结果摘要]
- ❌ 失败: [错误信息]

## 修复方案（如仍失败）
- ...

（循环直到成功或确认无法修复）
```

## MODIFIED Requirements
无

## REMOVED Requirements
无
