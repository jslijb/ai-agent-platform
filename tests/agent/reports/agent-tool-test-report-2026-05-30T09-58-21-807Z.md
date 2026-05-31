# Agent 多工具联合测试报告

- **生成时间**: 2026/5/30 17:58:21
- **测试目标**: http://localhost:3000
- **测试用例数**: 14
- **通过**: 14
- **失败**: 0
- **通过率**: 100.0%
- **最大重试次数**: 5

## 按类别统计

| 类别 | 说明 | 总数 | 通过 | 失败 | 通过率 |
|------|------|------|------|------|--------|
| A | 单公司多工具联合查询 | 6 | 6 | 0 | 100.0% |
| B | 双公司对比查询 | 6 | 6 | 0 | 100.0% |
| C | 三公司综合查询 | 2 | 2 | 0 | 100.0% |

---

## 总体结果汇总

| 编号 | 类别 | 公司 | 查询摘要 | 工具种类 | 关键词命中 | 结果 | 尝试次数 | 耗时 |
|------|------|------|----------|----------|-----------|------|----------|------|
| A1 | A | 五粮液 | 五粮液2025年毛利率与近60日MA20趋势对比，结合年报分... | 4 | 毛利率,MA20 | ✅通过 | 1 | 53210ms |
| A2 | A | 五粮液 | 五粮液2025年资产负债率是多少？结合近30日成交量变化分析... | 4 | 资产负债率,成交量 | ✅通过 | 1 | 56155ms |
| A3 | A | 中国长城 | 中国长城2025年研发费用占营收比例是多少？结合RSI指标分... | 5 | 研发,RSI | ✅通过 | 1 | 49181ms |
| A4 | A | 中国长城 | 中国长城2025年经营现金流净额是多少？结合MACD指标判断... | 4 | 现金流,MACD | ✅通过 | 1 | 70233ms |
| A5 | A | 格力电器 | 格力电器2025年应收账款周转天数是多少？结合布林带分析股价... | 4 | 应收账款,布林 | ✅通过 | 1 | 52398ms |
| A6 | A | 格力电器 | 格力电器2025年分红方案是什么？结合夏普比率评估投资回报质... | 3 | 分红,夏普 | ✅通过 | 1 | 31799ms |
| B1 | B | 五粮液+格力电器 | 五粮液和格力电器2025年净利率谁更高？结合近20日换手率对... | 3 | 净利率,换手率 | ✅通过 | 1 | 81650ms |
| B2 | B | 五粮液+中国长城 | 五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标... | 3 | 存货,KDJ | ✅通过 | 1 | 160371ms |
| B3 | B | 格力电器+中国长城 | 格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风... | 5 | ROE,回撤 | ✅通过 | 2 | 64875ms |
| B4 | B | 五粮液+格力电器 | 五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比... | 3 | 商誉,波动率 | ✅通过 | 1 | 28730ms |
| B5 | B | 中国长城+格力电器 | 中国长城和格力电器2025年合同负债分别是多少？结合VWAP... | 4 | 合同负债,VWAP | ✅通过 | 1 | 60794ms |
| B6 | B | 五粮液+中国长城 | 五粮液和中国长城2025年无形资产分别是多少？结合VaR对比... | 4 | 无形资产,VaR | ✅通过 | 1 | 78631ms |
| C1 | C | 五粮液+格力电器+中国长城 | 五粮液、格力电器、中国长城2025年营业收入增速排名如何？结... | 3 | 营业收入,相关性 | ✅通过 | 1 | 79110ms |
| C2 | C | 五粮液+格力电器+中国长城 | 五粮液、格力电器、中国长城2025年经营活动现金流净额分别是... | 6 | 现金流,压力测试 | ✅通过 | 1 | 163267ms |

---

# [A1] 五粮液2025年毛利率与近60日MA20趋势对比，结合年报分析毛利率变动原因

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 五粮液
- **预期工具**: getStockHistory, hybridSearch, getStockFinancial
- **预期关键词**: 毛利率, MA20

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤3: 调用 calculateMA，输入参数: {"period":20}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤4: 调用 hybridSearch，输入参数: {"query":"五粮液 2025年 年报 毛利率 变动原因"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 基于您提供的查询需求，我尝试获取了五粮液的财务数据和股价数据。以下是分析结果：  ### 1. 数据获取情况说明 *   **财务数据**：已成功获取五粮液2025年年度报告相关数据。 *   **股价数据**：由于数据接口暂时故障，**未能获取到五粮液近期的K线数据**，因此无法为您计算近60日的MA20（20日移动平均线）具体数值及趋势图表。建议您通过交易软件查看实时走势。  ---  ### 2. 五粮液2025年毛利率分析  根据2025年年报数据，五粮液在行业深度调整期实现了**“量跌利增”**的毛利率表现：  *   **综合毛利率**：**83.75%**（较上年同期提升 **1...

---

# [A2] 五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 五粮液
- **预期工具**: getStockHistory, hybridSearch, getFinancialReport
- **预期关键词**: 资产负债率, 成交量

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858","frequency":"d"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000858","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858","frequency":"d","source":"mootdx"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000858","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858","frequency":"d","source":"mootdx"}，返回结果: Financial report fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 000858 2025年 资产负债率 财报"}，返回结果: 
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 根据检索到的《宜宾五粮液股份有限公司2025年年度报告》相关片段，以下是关于五粮液2025年资产负债率及偿债能力的分析：  ### 1. 2025年资产负债率分析 根据年报披露的关键审计事项及财务数据片段： *   **资产端**：截至2025年12月31日，五粮液合并报表中的**货币资金余额高达127.01亿元**（注：原文为12,701,444.30万元），该部分资产占总资产的比重达到**66.86%**。据此推算，五粮液2025年末的资产总额约为**1900亿元**。 *   **负债端**：根据检索到的财务报表片段，其负债合计约为**320.20亿元**（32,020,431,941....

---

# [A3] 中国长城2025年研发费用占营收比例是多少？结合RSI指标分析近期股价是否超买

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 中国长城
- **预期工具**: getStockHistory, calculateRSI, hybridSearch
- **预期关键词**: 研发, RSI

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000066","report_type":"income"}，返回结果: Financial report fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000066","frequency":"d"}，返回结果: Financial report fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤3: 调用 calculateRSI，输入参数: {"period":14}，返回结果: Financial report fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000066","frequency":"d","source":"efinance"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockHistory，输入参数: {"code":"sz.000066","frequency":"d"}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 calculateRSI，输入参数: {"period":14}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤3: 调用 hybridSearch，输入参数: {"query":"中国长城 2025年 研发费用 营业收入 占比"}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 getStockHistory，输入参数: {"code":"sz.000066","frequency":"d"}，返回结果: History fetch error: fetch failed
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 根据检索到的中国长城2025年年度报告数据，以及系统当前无法获取实时行情的情况，回答如下：  ### 1. 2025年研发费用占营收比例 根据中国长城2025年年度报告披露的数据： *   **研发投入总额**：约 **12.52亿元**（1,252,474,116.55元）。 *   **研发投入占营业收入比例**：**7.92%**。 *   **研发费用（仅费用化部分）**：约 **10.87亿元**（1,087,421,743.45元）。  注：通常衡量企业创新投入强度时，参考“研发投入”占比（7.92%）更为全面，因为它包含了资本化的研发支出。  ### 2. RSI指标及超买分析 ...

---

# [A4] 中国长城2025年经营现金流净额是多少？结合MACD指标判断当前趋势

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 中国长城
- **预期工具**: getStockHistory, calculateMACD, hybridSearch
- **预期关键词**: 现金流, MACD

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000066"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000066"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤3: 调用 calculateMACD，输入参数: {}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"中国长城 000066 2025年 经营现金流净额"}，返回结果: History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000066","source":"mootdx"}，返回结果: History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockHistory，输入参数: {"code":"sz.000066","source":"efinance"}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 calculateMACD，输入参数: {}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 根据检索到的《中国长城科技集团股份有限公司 2025 年年度报告》相关片段，以及系统当前的数据获取情况，回答如下：  ### 1. 2025年经营现金流净额 根据年报披露数据，中国长城2025年**经营活动产生的现金流量净额为 -32,578.50 万元**（即约 **-3.26 亿元**）。  *   **数据解读**：该数值与当期净利润（-1,375.13 万元）存在较大差异，主要原因是报告期内子公司进行了战略性备货，导致采购付现同比增加；同时经营性应收项目增加了约 13.66 亿元，而经营性应付项目减少了约 5.65 亿元，导致现金流出大于流入。  ### 2. MACD指标及趋势判断 ...

---

# [A5] 格力电器2025年应收账款周转天数是多少？结合布林带分析股价波动区间

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 格力电器
- **预期工具**: getStockHistory, calculateBollinger, hybridSearch
- **预期关键词**: 应收账款, 布林

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000651"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000651"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤3: 调用 calculateBollinger，输入参数: {}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"格力电器 2025年 应收账款周转天数 财报","topK":5}，返回结果: History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000651","source":"mootdx"}，返回结果: History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000651"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000651"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤3: 调用 calculateBollinger，输入参数: {}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 很抱歉，由于系统数据接口（baostock/efinance）连接异常，导致无法获取格力电器（000651）的完整财务报表数据和历史行情数据。  1. **关于应收账款周转天数**：    由于未能获取到2025年度的**营业收入**总额以及**应收账款**的平均余额，无法计算准确的应收账款周转天数。    *注：在检索到的2025年年报片段中，仅能看到“销售商品、提供劳务收到的现金”为1097.05亿元，但这不足以推算出周转天数。*  2. **关于布林带分析**：    由于未能获取到格力电器的历史K线数据（收盘价、最高价、最低价等），无法计算布林带的上轨、中轨和下轨，因此无法进行股价波动...

---

# [A6] 格力电器2025年分红方案是什么？结合夏普比率评估投资回报质量

- **类别**: A类 (单公司多工具联合查询)
- **公司**: 格力电器
- **预期工具**: getStockHistory, calculateSharpeRatio, hybridSearch
- **预期关键词**: 分红, 夏普

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockHistory，输入参数: {"code":"sz.000651"}，返回结果: History fetch error: fetch failed
  - 步骤2: 调用 hybridSearch，输入参数: {"query":"格力电器 2025年 分红方案 利润分配"}，返回结果: History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockHistory，输入参数: {"code":"sz.000651"}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 步骤2: 调用 calculateSharpeRatio，输入参数: {}，返回结果: History fetch error: fetch failed {"error":"未提供数据且无缓存数据，请先调用getStockHistory获取股票数据"}
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 根据检索到的《珠海格力电器股份有限公司2025年年度报告》及相关公告，格力电器的2025年分红方案如下：  ### 1. 格力电器2025年分红方案详情 *   **分红比例**：拟向全体股东**每10股派发现金红利20元（含税）**。 *   **不送红股，不以公积金转增股本**。 *   **分红总额**：以享有利润分配权的股本总额 5,585,138,741 股（总股本扣除回购账户股份）为基数，共计派发现金股利约 **111.70亿元**（11,170,277,482.00元）。 *   **实施情况**：该预案尚待股东大会批准（注：根据文档时间推断，此为2025年度利润分配预案）。  ...

---

# [B1] 五粮液和格力电器2025年净利率谁更高？结合近20日换手率对比市场活跃度

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+格力电器
- **预期工具**: getStockHistory, hybridSearch, getStockFinancial
- **预期关键词**: 净利率, 换手率

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000651","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","frequency":"d"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000651","frequency":"d"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000651","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","frequency":"d","source":"mootdx"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000651","frequency":"d","source":"mootdx"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 2025年 年报 净利率","topK":5}，返回结果: 
  - 步骤2: 调用 hybridSearch，输入参数: {"query":"格力电器 2025年 年报 净利率","topK":5}，返回结果: 
  - 步骤3: 调用 hybridSearch，输入参数: {"query":"五粮液 格力电器 近20日 换手率 市场活跃度 对比","topK":5}，返回结果: 
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 很抱歉，由于系统数据接口（股票历史行情及财务数据接口）暂时不可用，且知识库检索未能提取到五粮液和格力电器2025年完整的财务指标（如净利率）及近20日的具体交易数据（如换手率），我无法为您提供精确的数值对比。  根据检索到的部分2025年年报片段，**五粮液**在2025年面临了一定的经营挑战，公告显示其归属于上市公司股东的净利润出现较大幅度下降（同比下降71.89%），但具体的净利率数值及格力电器的对应数据未能从现有信息中完整获取。  基于行业一般情况及已有信息进行如下分析（仅供参考）：  ### 1. 净利率对比 *   **五粮液（白酒行业）**：历史上净利率极高，常年维持在 **30%...

---

# [B2] 五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标分析短期超买超卖

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+中国长城
- **预期工具**: getStockHistory, calculateKDJ, hybridSearch
- **预期关键词**: 存货, KDJ

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000066"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000858","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"sz.000066","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000066"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 中国长城 2025年 存货周转率 财务数据对比","topK":5}，返回结果: 
  - 信息不完整 → 进入下一轮
- 第5轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"中国长城 2025年 存货周转率 财务指标","topK":5}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000066"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第6轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000066"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: 很抱歉，由于金融数据接口（baostock/efinance）连接异常，我未能成功获取五粮液和中国长城的最新历史K线数据及完整的财务报表数据。因此，无法为您提供精确的2025年存货周转率数值对比，也无法计算当前的KDJ技术指标。  不过，根据已检索到的**五粮液2025年年度报告**片段，我们可以对其存货周转趋势进行如下定性分析：  ### 1. 五粮液存货周转情况分析（基于2025年年报数据） 根据检索到的数据，五粮液在2025年呈现出明显的**“量跌库增”**特征，这对存货周转率构成了巨大的下行压力：  *   **营收与销量双降**：2025年五粮液酒类营业收入约为 **371.04亿元...

---

# [B3] 格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风险水平

- **类别**: B类 (双公司对比查询)
- **公司**: 格力电器+中国长城
- **预期工具**: getStockHistory, calculateMaxDrawdown, hybridSearch
- **预期关键词**: ROE, 回撤

## 第1次测试

### 测试过程

### 测试结果
- ❌ 失败: tool count 0 < 3 (called: )
- 回答摘要: 我需要先获取这两家公司的财务数据来对比ROE，同时获取它们的历史股价数据以计算最大回撤。  ```json {"tool": "getStockFinancial", "parameters": {"code": "000651"}} {"tool": "getStockFinancial", "parameters": {"code": "000066"}} {"tool": "getStockHistory", "parameters": {"code": "sh.000651"}} ```
- 工具调用种类: 0 (预期≥3)
- 关键词命中: ROE, 回撤
- 关键词缺失: 无
- 包含数值: 是

## 修复方案

- only 0 tool types called, need >= 3

## 第2次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000651","source":"efinance"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000651"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000651","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000651","source":"baostock"}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 getStockFinancial，输入参数: {"code":"sz.000066","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed History fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"格力电器 000651 2025年 ROE 净资产收益率 财务数据","topK":5}，返回结果: 
  - 步骤2: 调用 hybridSearch，输入参数: {"query":"中国长城 000066 2025年 ROE 净资产收益率 财务数据","topK":5}，返回结果: 
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000651","report_type":"income"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getFinancialReport，输入参数: {"code":"000066","report_type":"income"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000651","source":"baostock","start_date":"2025-01-01","end_date":"2025-12-31"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第5轮
  - 步骤1: 调用 getStockRealtime，输入参数: {"code":"000651","source":"efinance"}，返回结果: Realtime fetch error: fetch failed Realtime fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockRealtime，输入参数: {"code":"000066","source":"efinance"}，返回结果: Realtime fetch error: fetch failed Realtime fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000651","source":"efinance","start_date":"2025-01-01","end_date":"2025-12-31"}，返回结果: Realtime fetch error: fetch failed Realtime fetch error: fetch failed History fetch error: fetch failed
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: ## 数据获取失败  很遗憾，在尝试了多种方式和数据源后，**所有金融数据接口均返回了错误**，无法获取到格力电器（000651）和中国长城（000066）的实际数据。具体尝试如下：  \| 尝试工具 \| 数据源 \| 目标 \| 结果 \| \|---------\|--------\|------\|------\| \| `getStockFinancial` \| efinance \| 两家公司ROE等财务指标 \| ❌ 失败 \| \| `getStockFinancial` \| baostock \| 两家公司ROE等财务指标 \| ❌ 失败 \| \| `getFinancialReport` \| efinance...

---

# [B4] 五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比股价稳定性

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+格力电器
- **预期工具**: getStockHistory, calculateVolatility, hybridSearch
- **预期关键词**: 商誉, 波动率

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000858","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getFinancialReport，输入参数: {"code":"000651","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2025-01-01","end_date":"2025-12-31"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000651","start_date":"2025-01-01","end_date":"2025-12-31"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000858","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"sz.000651","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","source":"baostock","start_date":"2025-01-01","end_date":"2025-12-31"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000651","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2025-06-01","end_date":"2025-12-31"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: ## 数据获取失败，无法回答  很抱歉，经过多次尝试，以下数据源均返回失败：  \| 数据类型 \| 尝试的数据源 \| 结果 \| \|---------\|------------\|------\| \| **五粮液(000858)资产负债表** \| getFinancialReport（默认）、getStockFinancial（baostock）、getStockFinancial（efinance） \| ❌ 均失败 \| \| **格力电器(000651)资产负债表** \| getFinancialReport（默认）、getStockFinancial（baostock）、getStockFinanc...

---

# [B5] 中国长城和格力电器2025年合同负债分别是多少？结合VWAP对比机构持仓成本

- **类别**: B类 (双公司对比查询)
- **公司**: 中国长城+格力电器
- **预期工具**: getStockHistory, calculateVWAP, hybridSearch
- **预期关键词**: 合同负债, VWAP

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000066","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getFinancialReport，输入参数: {"code":"000651","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000066"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000651"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000651","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 hybridSearch，输入参数: {"query":"中国长城 000066 2025年 合同负债 年报","topK":5}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤4: 调用 hybridSearch，输入参数: {"query":"格力电器 000651 2025年 合同负债 年报","topK":5}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"中国长城 000066 合同负债 期末余额 2025年12月31日","topK":5}，返回结果: 
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"中国长城 合同负债 期末余额 期初余额 2025年报 资产负债表","topK":5}，返回结果: 
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: ## 查询结果汇总  ---  ### 一、格力电器（000651）2025年合同负债  根据格力电器2025年年度报告（数据截止 **2025年12月31日**）：  \| 项目 \| 期末余额（2025年末） \| 期初余额（2024年末） \| \|------\|---------------------\|---------------------\| \| **合同负债** \| **152.07亿元**（15,206,576,385.44元） \| 124.91亿元（12,491,059,928.53元） \|  📌 **同比变动**：增加约 **27.15亿元**，增幅 **21.7%**。年报注释...

---

# [B6] 五粮液和中国长城2025年无形资产分别是多少？结合VaR对比尾部风险

- **类别**: B类 (双公司对比查询)
- **公司**: 五粮液+中国长城
- **预期工具**: getStockHistory, calculateVaR, hybridSearch
- **预期关键词**: 无形资产, VaR

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000858","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getFinancialReport，输入参数: {"code":"000066","report_type":"balance"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2024-05-30","end_date":"2026-05-30"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","source":"efinance","start_date":"2024-05-30","end_date":"2026-05-30"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000858","source":"baostock","year":2025,"quarter":1}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"sz.000066","source":"baostock","year":2025,"quarter":1}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 hybridSearch，输入参数: {"query":"五粮液 000858 2025年 无形资产","topK":5}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: ## 数据获取结果  很遗憾，在本次查询中，多个数据源均遇到了连接问题，以下是具体情况：  ---  ### 1. 无形资产数据  \| 数据源 \| 五粮液 (000858) \| 中国长城 (000066) \| \|--------\|:--:\|:--:\| \| efinance（财务数据） \| ❌ 获取失败 \| ❌ 获取失败 \| \| baostock（财务数据） \| ❌ 获取失败 \| ❌ 获取失败 \| \| 详细财务报表（资产负债表） \| ❌ 获取失败 \| ❌ 获取失败 \|  通过 **hybridSearch 文档检索**，找到了「宜宾五粮液股份有限公司 **2025 年度报告全文**」的部分片段，...

---

# [C1] 五粮液、格力电器、中国长城2025年营业收入增速排名如何？结合相关性分析三只股票走势的联动性

- **类别**: C类 (三公司综合查询)
- **公司**: 五粮液+格力电器+中国长城
- **预期工具**: getStockHistory, calculateCorrelation, hybridSearch
- **预期关键词**: 营业收入, 相关性

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000651","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000858","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"sz.000651","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 getStockFinancial，输入参数: {"code":"sz.000066","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 格力电器 中国长城 2025年营业收入 营收增速"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2025-01-01","end_date":"2026-05-30"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000651","start_date":"2025-01-01","end_date":"2026-05-30"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 2025年 营业收入 年度报告"}，返回结果: History fetch error: fetch failed
  - 步骤2: 调用 hybridSearch，输入参数: {"query":"中国长城 2025年 营业收入 年度报告"}，返回结果: History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000066","start_date":"2025-01-01","end_date":"2026-05-30"}，返回结果: History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第5轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 2025年 营业收入 同比 亿元"}，返回结果: History fetch error: fetch failed
  - 步骤2: 调用 hybridSearch，输入参数: {"query":"中国长城 2025年 营业收入 同比 2024年"}，返回结果: History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2025-01-01","end_date":"2026-05-30"}，返回结果: History fetch error: fetch failed
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: ## 三家公司2025年营业收入增速排名及联动性分析  ---  ### 一、营业收入增速排名  根据从各公司2025年年度报告中提取的数据：  \| 排名 \| 公司 \| 2025年营收 \| 2024年营收 \| 同比增速 \| \|:---:\|------\|-----------\|-----------\|:-------:\| \| 🥇 \| **中国长城** \| **158.09亿元** \| 142.03亿元 \| **+11.30%** \| \| 🥈 \| **格力电器** \| **1,704.47亿元** \| 1,891.64亿元 \| **-9.89%** \| \| 🥉 \| **五粮液** \| 数据未...

---

# [C2] 五粮液、格力电器、中国长城2025年经营活动现金流净额分别是多少？结合压力测试对比三家公司极端行情下的风险承受能力

- **类别**: C类 (三公司综合查询)
- **公司**: 五粮液+格力电器+中国长城
- **预期工具**: getStockHistory, calculateStressTest, hybridSearch
- **预期关键词**: 现金流, 压力测试

## 第1次测试

### 测试过程
- 第1轮
  - 步骤1: 调用 getFinancialReport，输入参数: {"code":"000858","report_type":"cashflow"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed His...
  - 步骤2: 调用 getFinancialReport，输入参数: {"code":"000651","report_type":"cashflow"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed His...
  - 步骤3: 调用 getFinancialReport，输入参数: {"code":"000066","report_type":"cashflow"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed His...
  - 步骤4: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2024-01-01"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed His...
  - 步骤5: 调用 getStockHistory，输入参数: {"code":"sz.000651","start_date":"2024-01-01"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed His...
  - 步骤6: 调用 getStockHistory，输入参数: {"code":"sz.000066","start_date":"2024-01-01"}，返回结果: Financial report fetch error: fetch failed Financial report fetch error: fetch failed Financial report fetch error: fetch failed History fetch error: fetch failed History fetch error: fetch failed His...
  - 信息不完整 → 进入下一轮
- 第2轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"000858","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"000651","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 getStockFinancial，输入参数: {"code":"000066","source":"efinance"}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第3轮
  - 步骤1: 调用 getStockFinancial，输入参数: {"code":"sz.000858","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤2: 调用 getStockFinancial，输入参数: {"code":"sz.000651","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 步骤3: 调用 getStockFinancial，输入参数: {"code":"sz.000066","source":"baostock","year":2025,"quarter":4}，返回结果: Financial data fetch error: fetch failed Financial data fetch error: fetch failed Financial data fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第4轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"五粮液 格力电器 中国长城 2025年 经营活动现金流净额","topK":10}，返回结果: Realtime fetch error: fetch failed Realtime fetch error: fetch failed
  - 步骤2: 调用 getStockRealtime，输入参数: {"code":"000858","source":"efinance"}，返回结果: Realtime fetch error: fetch failed Realtime fetch error: fetch failed
  - 步骤3: 调用 getStockRealtime，输入参数: {"code":"000651","source":"efinance"}，返回结果: Realtime fetch error: fetch failed Realtime fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第5轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"宜宾五粮液 2025年 经营活动产生的现金流量净额 现金流量表","topK":5}，返回结果: 
  - 步骤2: 调用 hybridSearch，输入参数: {"query":"中国长城 2025年 经营活动产生的现金流量净额 现金流量表","topK":5}，返回结果: 
  - 信息不完整 → 进入下一轮
- 第6轮
  - 步骤1: 调用 hybridSearch，输入参数: {"query":"宜宾五粮液股份有限公司 2025年度 合并现金流量表 经营活动产生的现金流量净额 1-12月","topK":5}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 步骤2: 调用 getStockHistory，输入参数: {"code":"sz.000858","start_date":"2025-01-01"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 步骤3: 调用 getStockHistory，输入参数: {"code":"sz.000651","start_date":"2025-01-01"}，返回结果: History fetch error: fetch failed History fetch error: fetch failed
  - 信息不完整 → 进入下一轮
- 第7轮
  - 步骤1: 调用 calculateStressTest，输入参数: {"portfolio":{"五粮液":{"weight":0.333,"code":"000858"},"格力电器":{"weight":0.333,"code":"000651"},"中国长城":{"weight":0.333,"code":"000066"}},"scenarios":["2008年全球金融危机","2015年A股股灾","2020年新冠疫情崩盘","2024年极端下跌行情","利率飙升+经济衰退双重冲击"]}，返回结果: {"success":true,"results":[{"portfolioValue":null,"loss":null,"lossPercent":null},{"portfolioValue":null,"loss":null,"lossPercent":null},{"portfolioValue":null,"loss":null,"lossPercent":null},{"portfo...
  - 信息完整 → 结束循环，输出结果

### 测试结果
- ✅ 成功: ---  ## 一、2025年经营活动现金流净额  根据已检索到的2025年年度报告数据，三家公司经营活动现金流净额如下：  ### 📊 数据汇总  \| 公司 \| 2025年经营现金流净额 \| 2024年（对比） \| 同比变化 \| \|------\|---------------------\|---------------\|----------\| \| **格力电器** \| **562.61亿元** \| 278.65亿元 \| **+101.9%** ✅ \| \| **五粮液** \| 未获取到合并报表数据 \| — \| — \| \| **中国长城** \| **-3.26亿元** \| 未明确 \| 由正转负...

---
