# 增强 LLM 工具调用充分性 Spec

## Why
Agent 多工具联合测试中，3/14 用例失败（A2/B1/C2），LLM 5轮循环仍只调用2种工具。根因是系统设计缺陷：21个工具扁平暴露给LLM，导致注意力稀释（choice overload）；缺少规划阶段，LLM直接跳入工具调用而不先规划需要哪些工具；反思机制只检查信息充分性，不检查工具覆盖完整性。业界研究表明，工具超过15个时选择准确率急剧下降（Berkeley BFCL V4），需要通过工具分组、规划阶段和结构化反思来系统解决。

## What Changes
- **新增工具分组机制**：将21个工具分为4组（行情数据/技术指标/风控合规/RAG检索），按查询意图动态选择相关组
- **新增规划阶段（Planning Phase）**：在工具执行前，LLM先规划需要哪些工具类别和调用顺序
- **增强反思机制**：shouldRetrieveAgain 新增"工具覆盖完整性"评估维度
- **恢复测试标准**：A2/B1/C2 的 minToolKinds 恢复为 3

## Impact
- Affected specs: optimize-agent-rounds（反思机制增强）、add-skill-system（Skill与工具分组协同）
- Affected code: `src/server/agents/simpleAgent.ts`（主循环增加规划阶段）、`src/server/agents/reflection-node.ts`（反思增强）、`src/server/tools/registry.ts`（增加分组能力）、`tests/agent/test-agent-tools.ts`（恢复 minToolKinds=3）

## ADDED Requirements

### Requirement: 工具分组机制
系统 SHALL 将21个工具按功能分为4组，每组有明确的触发条件，LLM只看到与查询相关的工具组。

#### Scenario: 查询涉及技术分析
- **WHEN** 用户查询"五粮液RSI指标分析"
- **THEN** 系统激活"技术指标"工具组（getMA/getMACD/getRSI/getBollinger/getKDJ/getVWAP）+ "行情数据"工具组（getStockHistory/getStockFinancial/getFinancialReport）
- **AND** 不激活"风控合规"工具组（checkCompliance/getRestrictedStocks/getPositionLimits/calculateVaR/stressTest/getRiskLimits）

#### Scenario: 查询涉及风控评估
- **WHEN** 用户查询"五粮液VaR和压力测试"
- **THEN** 系统激活"风控合规"工具组 + "行情数据"工具组
- **AND** 不激活"技术指标"工具组

#### Scenario: 查询涉及综合分析
- **WHEN** 用户查询"五粮液综合诊断"
- **THEN** 系统激活全部4个工具组

### Requirement: 规划阶段（Planning Phase）
系统 SHALL 在工具执行前增加规划阶段，LLM先输出结构化的工具调用计划，再按计划执行。

#### Scenario: 规划阶段输出工具调用计划
- **WHEN** 用户查询"五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力"
- **THEN** 规划阶段输出：
  ```
  PLAN:
  1. getFinancialReport → 获取资产负债率
  2. getStockHistory → 获取近30日成交量
  3. calculateVolatility 或 calculateSharpeRatio → 量化偿债能力
  ```
- **AND** 后续执行阶段按计划调用工具，确保3种工具都被调用

#### Scenario: 规划阶段识别Skill匹配
- **WHEN** 用户查询"帮我做技术分析"
- **THEN** 规划阶段识别匹配 technical-analysis Skill，直接调用Skill

### Requirement: 工具覆盖完整性反思
系统 SHALL 在反思阶段评估已调用工具的种类是否充分覆盖查询的多维度需求。

#### Scenario: 反思检测到工具种类不足
- **WHEN** 查询"五粮液资产负债率+成交量+偿债能力"只调用了2种工具
- **THEN** 反思返回 needMore=true，refinedQuery 包含具体缺失工具建议（如"你还需要调用 calculateVolatility 来量化偿债能力"）

#### Scenario: 反思确认工具调用充分
- **WHEN** 查询"五粮液毛利率"已调用3种工具
- **THEN** 反思返回 needMore=false

## MODIFIED Requirements

### Requirement: ToolRegistry 增加分组能力
原：ToolRegistry 只有 register/get/list 扁平方法
改：增加 toolGroup 定义和 getToolsByGroup(query) 方法，根据查询意图返回相关工具组

### Requirement: simpleAgent 主循环增加规划阶段
原：直接进入 Think→Act→Observe 循环
改：先进入 Planning→Think→Act→Observe 循环，Planning 阶段输出结构化工具调用计划

### Requirement: shouldRetrieveAgain 反思 prompt
原：只评估"信息充分性"和"幻觉检测"
改：增加"工具覆盖完整性"评估维度，检查查询中的多维度需求是否被已调用工具覆盖

### Requirement: 测试用例 minToolKinds
原：A2/B1/C2 的 minToolKinds=2（降标临时修复）
改：恢复为 minToolKinds=3，通过规划阶段和增强反思使 LLM 自然调用3种以上工具

## REMOVED Requirements
无
