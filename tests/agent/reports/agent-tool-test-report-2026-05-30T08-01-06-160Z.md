# Agent 多工具联合测试报告

- **生成时间**: 2026/5/30 16:01:06
- **测试目标**: http://localhost:3000
- **测试用例数**: 14
- **通过**: 0
- **失败**: 14
- **通过率**: 0.0%

## 按类别统计

| 类别 | 说明 | 总数 | 通过 | 失败 | 通过率 |
|------|------|------|------|------|--------|
| A | 单公司多工具联合查询 | 6 | 0 | 6 | 0.0% |
| B | 双公司对比查询 | 6 | 0 | 6 | 0.0% |
| C | 三公司综合查询 | 2 | 0 | 2 | 0.0% |

---

## 总体结果汇总

| 编号 | 类别 | 公司 | 查询摘要 | 工具种类 | 关键词命中 | 结果 | 耗时 |
|------|------|------|----------|----------|-----------|------|------|
| A1 | A | 五粮液 | 五粮液2025年毛利率与近60日MA20趋势对比，结合年报分... | 0 |  (缺:毛利率,MA20) | ❌失败 | 2859ms |
| A2 | A | 五粮液 | 五粮液2025年资产负债率是多少？结合近30日成交量变化分析... | 0 |  (缺:资产负债率,成交量) | ❌失败 | 19ms |
| A3 | A | 中国长城 | 中国长城2025年研发费用占营收比例是多少？结合RSI指标分... | 0 |  (缺:研发,RSI) | ❌失败 | 20ms |
| A4 | A | 中国长城 | 中国长城2025年经营现金流净额是多少？结合MACD指标判断... | 0 |  (缺:现金流,MACD) | ❌失败 | 22ms |
| A5 | A | 格力电器 | 格力电器2025年应收账款周转天数是多少？结合布林带分析股价... | 0 |  (缺:应收账款,布林) | ❌失败 | 18ms |
| A6 | A | 格力电器 | 格力电器2025年分红方案是什么？结合夏普比率评估投资回报质... | 0 |  (缺:分红,夏普) | ❌失败 | 22ms |
| B1 | B | 五粮液+格力电器 | 五粮液和格力电器2025年净利率谁更高？结合近20日换手率对... | 0 |  (缺:净利率,换手率) | ❌失败 | 24ms |
| B2 | B | 五粮液+中国长城 | 五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标... | 0 |  (缺:存货,KDJ) | ❌失败 | 20ms |
| B3 | B | 格力电器+中国长城 | 格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风... | 0 |  (缺:ROE,回撤) | ❌失败 | 18ms |
| B4 | B | 五粮液+格力电器 | 五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比... | 0 |  (缺:商誉,波动率) | ❌失败 | 15ms |
| B5 | B | 中国长城+格力电器 | 中国长城和格力电器2025年合同负债分别是多少？结合VWAP... | 0 |  (缺:合同负债,VWAP) | ❌失败 | 16ms |
| B6 | B | 五粮液+中国长城 | 五粮液和中国长城2025年无形资产分别是多少？结合VaR对比... | 0 |  (缺:无形资产,VaR) | ❌失败 | 18ms |
| C1 | C | 五粮液+格力电器+中国长城 | 五粮液、格力电器、中国长城2025年营业收入增速排名如何？结... | 0 |  (缺:营业收入,相关性) | ❌失败 | 20ms |
| C2 | C | 五粮液+格力电器+中国长城 | 五粮液、格力电器、中国长城2025年经营活动现金流净额分别是... | 0 |  (缺:现金流,压力测试) | ❌失败 | 16ms |

---

# [A1] 五粮液2025年毛利率与近60日MA20趋势对比，结合年报分析毛利率变动原因

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 五粮液
- **预期工具**: getStockHistory, hybridSearch, getStockFinancial
- **预期关键词**: 毛利率, MA20

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 毛利率, MA20
- 包含数值: 否

---

# [A2] 五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 五粮液
- **预期工具**: getStockHistory, hybridSearch, getFinancialReport
- **预期关键词**: 资产负债率, 成交量

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 资产负债率, 成交量
- 包含数值: 否

---

# [A3] 中国长城2025年研发费用占营收比例是多少？结合RSI指标分析近期股价是否超买

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 中国长城
- **预期工具**: getStockHistory, calculateRSI, hybridSearch
- **预期关键词**: 研发, RSI

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 研发, RSI
- 包含数值: 否

---

# [A4] 中国长城2025年经营现金流净额是多少？结合MACD指标判断当前趋势

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 中国长城
- **预期工具**: getStockHistory, calculateMACD, hybridSearch
- **预期关键词**: 现金流, MACD

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 现金流, MACD
- 包含数值: 否

---

# [A5] 格力电器2025年应收账款周转天数是多少？结合布林带分析股价波动区间

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 格力电器
- **预期工具**: getStockHistory, calculateBollinger, hybridSearch
- **预期关键词**: 应收账款, 布林

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 应收账款, 布林
- 包含数值: 否

---

# [A6] 格力电器2025年分红方案是什么？结合夏普比率评估投资回报质量

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 格力电器
- **预期工具**: getStockHistory, calculateSharpeRatio, hybridSearch
- **预期关键词**: 分红, 夏普

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 分红, 夏普
- 包含数值: 否

---

# [B1] 五粮液和格力电器2025年净利率谁更高？结合近20日换手率对比市场活跃度

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+格力电器
- **预期工具**: getStockHistory, hybridSearch, getStockFinancial
- **预期关键词**: 净利率, 换手率

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 净利率, 换手率
- 包含数值: 否

---

# [B2] 五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标分析短期超买超卖

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+中国长城
- **预期工具**: getStockHistory, calculateKDJ, hybridSearch
- **预期关键词**: 存货, KDJ

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 存货, KDJ
- 包含数值: 否

---

# [B3] 格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风险水平

- **类别**: B类 (双公司对比查询)
- **公司**: 格力电器+中国长城
- **预期工具**: getStockHistory, calculateMaxDrawdown, hybridSearch
- **预期关键词**: ROE, 回撤

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: ROE, 回撤
- 包含数值: 否

---

# [B4] 五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比股价稳定性

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+格力电器
- **预期工具**: getStockHistory, calculateVolatility, hybridSearch
- **预期关键词**: 商誉, 波动率

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 商誉, 波动率
- 包含数值: 否

---

# [B5] 中国长城和格力电器2025年合同负债分别是多少？结合VWAP对比机构持仓成本

- **类别**: B类 (双公司对比查询)
- **公司**: 中国长城+格力电器
- **预期工具**: getStockHistory, calculateVWAP, hybridSearch
- **预期关键词**: 合同负债, VWAP

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 合同负债, VWAP
- 包含数值: 否

---

# [B6] 五粮液和中国长城2025年无形资产分别是多少？结合VaR对比尾部风险

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+中国长城
- **预期工具**: getStockHistory, calculateVaR, hybridSearch
- **预期关键词**: 无形资产, VaR

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 无形资产, VaR
- 包含数值: 否

---

# [C1] 五粮液、格力电器、中国长城2025年营业收入增速排名如何？结合相关性分析三只股票走势的联动性

- **类别**: C类 (三公司综合查询)
- **公司**: 五粮液+格力电器+中国长城
- **预期工具**: getStockHistory, calculateCorrelation, hybridSearch
- **预期关键词**: 营业收入, 相关性

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 营业收入, 相关性
- 包含数值: 否

---

# [C2] 五粮液、格力电器、中国长城2025年经营活动现金流净额分别是多少？结合压力测试对比三家公司极端行情下的风险承受能力

- **类别**: C类 (三公司综合查询)
- **公司**: 五粮液+格力电器+中国长城
- **预期工具**: getStockHistory, calculateStressTest, hybridSearch
- **预期关键词**: 现金流, 压力测试

## 第1次测试

### 测试过程
- ❌ API调用失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

### 测试结果
- ❌ 失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- 回答摘要: 
- 工具调用种类: 0 (预期≥3)
- 关键词命中: 无
- 关键词缺失: 现金流, 压力测试
- 包含数值: 否

---
