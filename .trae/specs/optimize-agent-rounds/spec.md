# Agent 迭代轮次优化 Spec

## Why
21 个工具测试中，10 个技术指标查询（calculateMA/MACD/RSI/布林带/KDJ/VWAP/夏普/回撤/波动率/VaR）都需要 3 轮迭代，平均耗时 27s。而同类 2 轮查询平均仅 20s。3 轮的根因是：第1轮调用 getStockHistory 缓存数据，第2轮调用计算工具，第3轮生成答案。如果能将前两轮合并，可节省约 8-10s/次，节省约 30% 的 LLM Token 消耗。

## 优化方向

### 方向1: LLM 同时调用多个 tool（已实现）
- 新增"链式工具调用"机制：当 LLM 在同一轮中同时输出 getStockHistory + 计算工具时，按依赖顺序自动执行
- 修改 `parseToolCall` 支持解析多个工具调用（当前只解析第一个）
- 修改 Agent 主循环支持同一轮执行多个工具（按顺序，前一个的结果作为后一个的输入）
- 修改 system prompt 引导 LLM 在计算指标时同时输出 getStockHistory 和计算工具
- 效果：技术指标查询从3轮降到2轮

### 方向2: getFinancialReport 数据合并（已实现）
- 问题：getFinancialReport 3轮（第1轮 getFinancialReport，第2轮 getStockFinancial，第3轮答案）
- 方案：getFinancialReport 内部自动补充 getStockFinancial 的关键财务指标数据
- 修改 description 说明已自动包含盈利能力指标，无需再调用 getStockFinancial
- 效果：从3轮降到2轮

### 方向3: calculateCorrelation 引导使用 code1/code2（已实现）
- 问题：calculateCorrelation 5轮（LLM不知道用code1/code2参数，逐个获取数据）
- 方案：在 system prompt 中新增规则9，引导 LLM 同时输出 getStockHistory + calculateCorrelation（只需传code2参数）
- 效果：从5轮降到2轮

### 方向4: 错题本功能（已实现）
- 新增 WrongAnswer 数据库表，记录 Agent 回答错误的案例
- 前端聊天界面添加"标记为错误"按钮，支持选择错误类型、填写正确答案和备注
- 错题本管理页面，支持按错误类型/解决状态筛选、编辑、删除
- 目的：定期回顾错题，分析错误模式，降低错误率

## Impact
- Affected specs: Agent 核心循环、工具调用解析、数据库 schema
- Affected code: `src/server/agents/simpleAgent.ts`（parseToolCall、主循环、system prompt）、`src/server/db/schema.ts`（WrongAnswer表）、`src/app/api/wrong-answers/route.ts`（API）、`src/app/chat/page.tsx`（标记按钮）、`src/app/dashboard/wrong-answers/page.tsx`（错题本页面）

## ADDED Requirements

### Requirement: 多工具调用解析
系统 SHALL 支持从单次 LLM 响应中解析出多个工具调用。

#### Scenario: LLM 同时输出两个工具调用
- **WHEN** LLM 在一次响应中同时输出 getStockHistory 和 calculateMA 的调用
- **THEN** 系统按顺序执行两个工具，将所有工具结果合并为一条 observation 消息

#### Scenario: LLM 只输出一个工具调用
- **WHEN** LLM 只输出一个工具调用
- **THEN** 行为与当前一致，无变化

### Requirement: 链式工具执行
系统 SHALL 支持在同一轮迭代中按顺序执行多个工具调用。

#### Scenario: getStockHistory 后接计算工具
- **WHEN** LLM 同时调用 getStockHistory 和 calculateMA
- **THEN** 系统先执行 getStockHistory（缓存数据），再执行 calculateMA（使用缓存数据），两步结果合并后返回 LLM

#### Scenario: 工具间无依赖
- **WHEN** LLM 同时调用两个无依赖的工具（如 hybridSearch + getStockRealtime）
- **THEN** 系统按顺序执行，结果合并

### Requirement: system prompt 引导并行调用
系统 SHALL 在 system prompt 中引导 LLM 在计算技术指标时同时输出 getStockHistory 和计算工具。

#### Scenario: 用户请求计算技术指标
- **WHEN** 用户请求"计算招商银行的MA20"
- **THEN** LLM 应在一次响应中同时输出 getStockHistory 和 calculateMA 的调用，而非分两轮

### Requirement: getFinancialReport 数据合并
系统 SHALL 在 getFinancialReport 工具执行时自动补充 getStockFinancial 的关键盈利能力指标。

#### Scenario: 用户查询财务报表
- **WHEN** 用户查询"贵州茅台的利润表"
- **THEN** getFinancialReport 自动同时获取财务报表和盈利能力指标，LLM 无需再调用 getStockFinancial

### Requirement: calculateCorrelation 引导使用 code1/code2
系统 SHALL 在 system prompt 中引导 LLM 使用 code1/code2 参数调用 calculateCorrelation。

#### Scenario: 用户计算相关系数
- **WHEN** 用户请求"计算招商银行和五粮液的相关系数"
- **THEN** LLM 应同时输出 getStockHistory 和 calculateCorrelation（只需传code2参数），而非逐个获取数据

### Requirement: 错题本
系统 SHALL 支持记录和管理 Agent 回答错误的案例。

#### Scenario: 用户标记错误回答
- **WHEN** 用户在聊天界面点击"标记为错误"按钮
- **THEN** 系统弹出表单，用户可选择错误类型、填写正确答案和备注，提交后存储到数据库

#### Scenario: 查看错题本
- **WHEN** 用户访问错题本页面
- **THEN** 显示所有错题记录，支持按错误类型、解决状态筛选，支持编辑和删除

## MODIFIED Requirements

### Requirement: parseToolCall 函数
原：只返回单个工具调用 `{ name, params } | null`
改：返回工具调用数组 `{ name, params }[]`，空数组表示无工具调用

### Requirement: Agent 主循环工具执行
原：每轮只执行一个工具调用
改：每轮可执行多个工具调用，按顺序执行，所有结果合并为一条 observation

### Requirement: system prompt 技术指标流程
原：步骤1调用getStockHistory，步骤2调用计算工具
改：步骤1同时调用getStockHistory和计算工具（在一次响应中输出两个工具调用）

### Requirement: getFinancialReport 工具
原：只返回财务报表数据，LLM 需要额外调用 getStockFinancial 获取盈利指标
改：自动补充盈利能力指标数据，LLM 无需再调用 getStockFinancial

### Requirement: calculateCorrelation 工具引导
原：LLM 不知道使用 code1/code2 参数，逐个获取数据导致5轮
改：system prompt 引导 LLM 同时输出 getStockHistory + calculateCorrelation(code2)

## REMOVED Requirements
无
