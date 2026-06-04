# 金融行业 RAG & Agent 评估最佳实践 Spec

## Why

当前项目的 RAG 评估仅覆盖通用检索质量指标（Hits@K、Context Relevance、Context Recall、Faithfulness、Answer Relevance），Agent 评估仅覆盖工具调用完整性和回答长度检查，缺乏金融行业特有的评估维度（数值精确度、合规性、幻觉检测、多跳推理准确性、风险提示完整性等）。需要设计一套面向金融行业的 RAG & Agent 评估最佳实践，确保系统在金融场景下的回答准确性、合规性和可靠性。

此外，当前评估系统存在两个关键缺失：
1. **无法体现持续改进**：评估是单次快照，无法展示系统优化前后的能力变化趋势，无法回答"系统是否在持续变好"
2. **评估数据来源单一**：仅依赖手工编写的黄金测试集，缺乏基于历史真实查询的评估，以及利用开源金融数据集进行上线前全面评估的能力

## 现有评估原理分析

### RAG 评估现状

当前 RAG 评估基于 RAGAS 框架的核心理念，采用三层评估架构：

1. **检索层评估**（Retrieval Evaluation）
   - **Hits@K**：前 K 个检索结果中是否包含与期望答案相关的文档，K=5，匹配阈值 15%
   - **Context Relevance**：检索上下文与查询的相关性，优先使用 `@reaatech/rag-eval-metrics` 的 ContextPrecisionScorer，降级使用 Jaccard 相似度
   - **Context Recall**：检索上下文对期望答案的覆盖度，使用 ContextRecallScorer 或降级使用 token 覆盖率

2. **生成层评估**（Generation Evaluation）
   - **Faithfulness**：生成答案对检索上下文的忠实度，启发式评分 40% + LLM-as-Judge 60%
   - **Answer Relevance**：答案与问题的相关性，启发式评分 40% + LLM-as-Judge 60%

3. **综合评分**
   - Overall = Hits@K×0.2 + ContextRelevance×0.15 + ContextRecall×0.15 + Faithfulness×0.25 + AnswerRelevance×0.25

**降级策略**：当 `@reaatech/rag-eval-metrics` 库不可用时，使用基于 token 的 Jaccard 相似度作为降级评分。

**黄金测试集**：25 条测试用例，覆盖 A股交易规则(5)、财报数据(3)、技术指标(5)、合规风控(4)、多跳推理(5) 五个分类，easy/medium/hard 三级难度。

### Agent 评估现状

当前 Agent 评估采用端到端黑盒测试方式：

1. **工具调用验证**：检查 Agent 是否调用了预期的工具类型（如 getStockHistory、hybridSearch、calculateMACD 等）
2. **回答完整性验证**：检查回答是否覆盖查询的所有关键方面（requiredAspects）
3. **数值答案验证**：检查回答是否包含具体数值
4. **公司覆盖验证**：检查回答是否包含查询涉及的所有公司
5. **回答长度检查**：回答长度 ≥ 50 字符

**测试集**：14 条测试用例，分单股(A1-A6)、双股(B1-B6)、三股(C1-C2) 三类。

### 现有系统不足

| 维度 | 现状 | 缺失 |
|------|------|------|
| 数值精确度 | 仅检查是否包含数字 | 不验证数值是否正确（如 PE 值、涨跌幅计算） |
| 合规性 | 无 | 不检查回答是否违反金融监管要求 |
| 幻觉检测 | Faithfulness 评估 token 级别 | 无法检测金融数据幻觉（如编造财报数据） |
| 风险提示 | 无 | 不检查是否包含必要的风险提示 |
| 多跳推理 | 仅分类标注 | 不评估推理链条的正确性 |
| 时效性 | 无 | 不评估数据时效性（如使用过期的财报数据） |
| Agent 工具选择 | 仅检查是否调用 | 不评估工具选择的合理性 |
| Agent 规划能力 | 无 | 不评估 Agent 的任务分解和规划能力 |
| 回归测试 | 无 | 无自动化回归测试框架 |
| 对抗测试 | 无 | 无对抗性测试（如诱导违规建议） |
| 趋势追踪 | 无 | 无法展示系统能力随时间的变化趋势 |
| 历史查询评估 | 无 | 不基于真实用户查询进行评估 |
| 开源数据集评估 | 无 | 不支持使用开源金融数据集进行评估 |

## What Changes

- 新增金融行业 RAG 评估指标体系（数值精确度、合规性、幻觉检测、风险提示、时效性）
- 新增金融行业 Agent 评估指标体系（工具选择合理性、规划能力、合规性、多轮对话一致性）
- 新增金融行业专用黄金测试集（扩展至 100+ 条，覆盖更多金融场景）
- 新增自动化回归测试框架
- 新增对抗性测试用例（诱导违规建议、数据注入等）
- 新增评估报告对比和趋势分析
- 新增评估配置化能力（权重、阈值可调）
- 新增评估趋势追踪，展示系统能力随时间的变化曲线
- 新增历史查询评估，基于真实用户查询自动构建评估集，历史查询持久化保存
- 新增开源金融数据集评估，支持上线前全面评估
- 新增双轨评估级别（日常/标准/全面），适配不同场景
- 新增评估触发机制，开发阶段默认手动触发（前端按钮），上线后可切换为自动触发（前端开关）
- 新增评估版本管理，每次评估保存为版本，支持多版本指标对比，新旧指标兼容

## Impact

- Affected specs: 无直接冲突的 spec
- Affected code: `src/server/evaluation/rag-evaluator.ts`, `scripts/run-evaluation.ts`, `scripts/qa-golden.json`, `src/app/dashboard/evaluation/page.tsx`, `src/app/dashboard/agent-evaluation/page.tsx`, `tests/agent/test-agent-tools.ts`

## ADDED Requirements

### Requirement: 金融 RAG 评估指标体系

系统 SHALL 提供面向金融行业的 RAG 评估指标体系，在现有 5 个通用指标基础上新增以下金融专用指标：

#### Scenario: 数值精确度评估
- **WHEN** 评估包含数值数据的金融回答
- **THEN** 系统 SHALL 计算数值精确度分数（Numerical Accuracy），比较回答中的数值与期望答案中的数值，容忍 ±5% 的误差范围，精确匹配得 1 分，误差范围内得 0.5 分，超出范围得 0 分

#### Scenario: 金融合规性评估
- **WHEN** 评估涉及投资建议、交易策略等金融回答
- **THEN** 系统 SHALL 检测回答是否包含违规内容（如承诺收益、推荐具体买卖时点、未声明风险等），合规得分 = 1 - 违规项数 / 总检查项数

#### Scenario: 金融幻觉检测
- **WHEN** 评估引用具体金融数据的回答
- **THEN** 系统 SHALL 检测回答中引用的数据是否在检索上下文中存在对应来源，幻觉率 = 无法溯源的数据点数 / 总数据点数

#### Scenario: 风险提示完整性
- **WHEN** 评估涉及投资分析、交易建议的回答
- **THEN** 系统 SHALL 检查回答是否包含必要的风险提示（如"投资有风险"、"过往业绩不代表未来表现"等），风险提示得分 = 已包含的风险提示项 / 应包含的风险提示项

#### Scenario: 数据时效性评估
- **WHEN** 评估引用时间敏感数据的回答
- **THEN** 系统 SHALL 检查引用数据的时效性，时效性得分基于数据日期与当前日期的差距计算，30天内得 1 分，90天内得 0.7 分，1年内得 0.4 分，超过1年得 0.1 分

### Requirement: 金融 Agent 评估指标体系

系统 SHALL 提供面向金融行业的 Agent 评估指标体系，在现有工具调用验证基础上新增以下指标：

#### Scenario: 工具选择合理性评估
- **WHEN** Agent 执行金融分析任务
- **THEN** 系统 SHALL 评估 Agent 选择的工具是否合理，包括：是否选择了正确的工具类型、是否避免了不必要的工具调用、工具调用顺序是否合理

#### Scenario: 任务规划能力评估
- **WHEN** Agent 处理复杂多步骤金融分析任务
- **THEN** 系统 SHALL 评估 Agent 的任务分解和规划能力，包括：是否正确识别子任务、子任务执行顺序是否合理、是否遗漏关键步骤

#### Scenario: Agent 合规性评估
- **WHEN** Agent 生成涉及投资建议的回答
- **THEN** 系统 SHALL 检查 Agent 是否遵守合规约束，包括：不承诺收益、不推荐具体买卖时点、包含风险提示、不提供内幕信息

#### Scenario: 多轮对话一致性评估
- **WHEN** Agent 在多轮对话中回答金融问题
- **THEN** 系统 SHALL 评估 Agent 在多轮对话中是否保持回答一致性，包括：数据引用一致、观点不矛盾、上下文理解正确

#### Scenario: Agent 效率评估
- **WHEN** Agent 执行金融分析任务
- **THEN** 系统 SHALL 评估 Agent 的执行效率，包括：迭代轮次是否合理（≤3轮为优秀）、Token 消耗是否在合理范围、响应时间是否满足 SLA

### Requirement: 金融行业专用黄金测试集

系统 SHALL 提供金融行业专用黄金测试集，覆盖以下场景：

#### Scenario: 扩展测试集覆盖
- **WHEN** 运行 RAG 或 Agent 评估
- **THEN** 系统 SHALL 提供至少 100 条测试用例，覆盖以下金融场景：
  - A股交易规则（15条）：涨跌幅限制、T+1规则、集合竞价、融资融券、注册制等
  - 财报数据分析（15条）：营收、净利润、ROE、资产负债率、现金流等
  - 技术指标计算（15条）：MACD、RSI、KDJ、布林带、MA等
  - 合规风控（15条）：VaR、压力测试、持仓限制、风险限额等
  - 多跳推理（15条）：跨指标综合分析、跨公司对比等
  - 投资建议合规（10条）：涉及投资建议的合规性检查
  - 对抗性测试（10条）：诱导违规建议、数据注入、越权查询等
  - 时效性测试（5条）：引用过期数据的检测

### Requirement: 自动化回归测试框架

系统 SHALL 提供自动化回归测试框架：

#### Scenario: 回归测试执行
- **WHEN** 系统代码发生变更
- **THEN** 系统 SHALL 能够自动运行评估测试集，对比变更前后的评估结果，识别性能退化

#### Scenario: 评估基线管理
- **WHEN** 建立评估基线
- **THEN** 系统 SHALL 支持保存评估基线，后续评估结果与基线对比，超过阈值（默认 5%）时发出告警

### Requirement: 评估配置化

系统 SHALL 支持评估配置化：

#### Scenario: 评估权重配置
- **WHEN** 管理员调整评估指标权重
- **THEN** 系统 SHALL 支持通过配置文件调整各评估指标的权重和阈值，无需修改代码

#### Scenario: 评估场景配置
- **WHEN** 管理员选择评估场景
- **THEN** 系统 SHALL 支持按场景（如"合规优先"、"准确性优先"、"效率优先"）选择不同的评估配置

### Requirement: 评估报告增强

系统 SHALL 提供增强的评估报告：

#### Scenario: 评估报告对比
- **WHEN** 存在多次评估结果
- **THEN** 系统 SHALL 支持评估报告的对比分析，展示指标变化趋势

#### Scenario: 金融行业评估报告
- **WHEN** 生成评估报告
- **THEN** 系统 SHALL 在报告中突出显示金融行业特有指标（合规性、幻觉率、风险提示完整性等），并提供行业基准参考

### Requirement: 评估趋势追踪

系统 SHALL 提供评估趋势追踪能力，让用户能看到系统优化后能力的持续提升：

#### Scenario: 评估历史时间线
- **WHEN** 用户查看评估历史
- **THEN** 系统 SHALL 以时间线形式展示所有历史评估记录，每次评估记录包含：评估时间、评估类型（日常/上线前）、数据来源（黄金集/历史查询/开源数据集）、各指标得分、综合得分

#### Scenario: 指标趋势曲线
- **WHEN** 用户查看某个指标的变化趋势
- **THEN** 系统 SHALL 展示该指标随时间的变化曲线图，支持按日/周/月粒度查看，曲线上的每个点对应一次评估结果，标注关键事件（如"优化了 Reranker"、"更新了 Embedding 模型"等）

#### Scenario: 优化前后对比
- **WHEN** 系统完成一次优化后运行评估
- **THEN** 系统 SHALL 自动生成优化前后对比报告，包含：各指标变化值（Δ）、变化百分比、是否显著改善（超过统计波动范围），并用 ↑↓→ 箭头直观标识改善/退化/持平

#### Scenario: 能力雷达图
- **WHEN** 用户查看系统整体能力画像
- **THEN** 系统 SHALL 提供雷达图展示各维度能力（检索质量、答案质量、数值精确度、合规性、幻觉控制、风险提示、时效性），支持叠加多次评估结果对比

#### Scenario: 里程碑标记
- **WHEN** 系统发生重大变更（如模型升级、RAG 管线优化、新增数据源等）
- **THEN** 系统 SHALL 支持在趋势图上标记里程碑事件，方便关联变更与效果

### Requirement: 评估触发机制

系统 SHALL 支持灵活的评估触发机制，开发阶段默认手动触发，上线后可切换为自动触发：

#### Scenario: 手动触发评估（开发阶段默认）
- **WHEN** 评估模式设置为"手动"（默认）
- **THEN** 系统 SHALL 在前端评估页面提供"运行评估"按钮，用户点击后选择评估级别（日常/标准/全面）并触发评估，评估运行期间展示进度状态

#### Scenario: 自动触发评估（上线后可开启）
- **WHEN** 评估模式设置为"自动"
- **THEN** 系统 SHALL 支持以下自动触发条件（前端可配置开关）：
  - **定时触发**：每日指定时间运行日常级别评估
  - **部署后触发**：代码部署完成后自动运行标准级别评估
  - **文档更新后触发**：RAG 文档新增/更新后自动触发评估
  - **错误率上升触发**：检测到用户差评或错误率上升时自动触发评估

#### Scenario: 触发模式切换
- **WHEN** 管理员在前端切换评估模式
- **THEN** 系统 SHALL 支持在"手动"和"自动"模式之间切换，切换时自动保存配置，无需重启服务

### Requirement: 评估版本管理与对比

系统 SHALL 提供评估版本管理能力，每次评估保存为一个版本，支持多版本对比：

#### Scenario: 评估版本保存
- **WHEN** 一次评估完成
- **THEN** 系统 SHALL 自动将评估结果保存为一个版本，版本信息包含：版本号（自增）、评估时间、评估级别、数据来源、各指标得分、综合得分、里程碑标记，版本不可删除不可修改

#### Scenario: 版本列表展示
- **WHEN** 用户查看评估历史
- **THEN** 系统 SHALL 在前端展示评估版本列表，支持按时间倒序排列，显示版本号、时间、级别、综合得分，支持筛选和搜索

#### Scenario: 多版本指标对比
- **WHEN** 用户选择两个或多个评估版本进行对比
- **THEN** 系统 SHALL 展示同一指标在不同版本的表现对比，包含：
  - 逐指标数值对比表格
  - 指标变化趋势图（选中的版本作为数据点）
  - 变化值（Δ）和变化百分比
  - ↑↓→ 箭头标识改善/退化/持平

#### Scenario: 新旧指标兼容
- **WHEN** 评估报告升级后新增了指标
- **THEN** 系统 SHALL 在多版本对比时，对历史版本中不存在的指标留空显示（标记为"-"），不影响已有指标的对比，确保新旧版本始终可以对比

#### Scenario: 版本详情查看
- **WHEN** 用户点击某个评估版本
- **THEN** 系统 SHALL 展示该版本的完整评估报告，包含所有指标的详细得分、逐条测试结果、数据来源信息

### Requirement: 历史查询评估

系统 SHALL 支持基于历史真实用户查询进行评估，历史查询必须持久化保存：

#### Scenario: 历史查询持久化保存
- **WHEN** 用户通过 Chat 或 Agent 进行查询
- **THEN** 系统 SHALL 自动记录查询及对应的回答、检索上下文、工具调用等信息到评估数据池，记录包含：query、answer、context、tools_used、timestamp、user_feedback（如有），历史查询数据不可自动清理，需持久化保存

#### Scenario: 历史查询自动构建评估集
- **WHEN** 评估数据池积累到一定量（≥50 条）
- **THEN** 系统 SHALL 支持从历史查询中自动构建评估集：
  1. 去重和聚类，避免相似查询过多
  2. 按分类均匀采样，确保各场景覆盖
  3. 对无标注的查询，使用 LLM 生成参考答案（标注为"自动标注"，置信度较低）
  4. 对有用户反馈的查询，优先纳入评估集

#### Scenario: 历史查询评估执行
- **WHEN** 运行基于历史查询的评估
- **THEN** 系统 SHALL 使用历史查询重新调用 RAG/Agent 管线，对比当前回答与历史回答，计算各指标得分，并标注数据来源为"历史查询"

### Requirement: 双轨评估级别

系统 SHALL 提供三级评估级别，适配不同场景的数据源组合：

#### Scenario: 日常级别评估
- **WHEN** 系统日常运行或小迭代后触发评估
- **THEN** 系统 SHALL 基于黄金测试集 + 最近 50 条历史查询运行评估，快速反馈当前系统状态，评估耗时控制在 10 分钟内

#### Scenario: 标准级别评估
- **WHEN** RAG 管线参数调整、Prompt 优化、新增工具后触发评估
- **THEN** 系统 SHALL 基于黄金测试集 + 历史查询采样运行评估，评估耗时控制在 20 分钟内

#### Scenario: 全面级别评估（上线前）
- **WHEN** 系统有重大变更或准备上线
- **THEN** 系统 SHALL 基于黄金测试集 + 历史查询 + 开源金融数据集运行全面评估，全面衡量系统在更广泛场景下的能力，评估耗时 30-60 分钟

### Requirement: 开源金融数据集评估

系统 SHALL 支持使用开源金融数据集进行评估：

#### Scenario: 支持的开源数据集
- **WHEN** 运行上线前全面评估
- **THEN** 系统 SHALL 支持以下开源金融数据集（优先从魔塔社区下载）：
  - **FinEval**：中文金融大模型评估数据集，覆盖金融专业知识、金融计算、金融合规等维度
  - **CFLUE**：中文金融语言理解评估基准，包含金融文本分类、情感分析、关系抽取等任务
  - **FinQA**：金融数值推理数据集，测试数值计算和多步推理能力
  - **ConvFinQA**：多轮对话金融推理数据集，测试对话式金融推理能力
  - **AntFinQA**：蚂蚁金融问答数据集，覆盖基金、保险、股票等领域

#### Scenario: 数据集格式适配
- **WHEN** 加载开源数据集
- **THEN** 系统 SHALL 提供数据集适配器，将不同格式的开源数据集统一转换为内部评估格式（query、expectedAnswer、category、difficulty、metadata），适配器包括：
  - FinEvalAdapter：适配 FinEval 的多选题格式
  - CFLUEAdapter：适配 CFLUE 的分类/抽取格式
  - FinQAAdapter：适配 FinQA 的数值推理格式
  - ConvFinQAAdapter：适配 ConvFinQA 的多轮对话格式

#### Scenario: 开源数据集评估执行
- **WHEN** 运行基于开源数据集的评估
- **THEN** 系统 SHALL：
  1. 从配置的数据集路径加载数据（模型存储在 `D:\models\modelscope`，数据集存储在 `D:\data\modelscope`）
  2. 按内部评估格式转换数据
  3. 运行 RAG/Agent 管线生成回答
  4. 计算各指标得分
  5. 在评估报告中标注数据来源为"开源数据集: {数据集名称}"

#### Scenario: 数据集子集选择
- **WHEN** 开源数据集规模较大
- **THEN** 系统 SHALL 支持按分类、难度、数量等条件选择数据集子集，避免评估耗时过长

## MODIFIED Requirements

### Requirement: RAG 评估器扩展

现有 `rag-evaluator.ts` 的 `EvaluationReport` 接口 SHALL 扩展以包含金融行业专用指标：

```typescript
interface FinancialEvaluationResult {
  numericalAccuracy: number;
  complianceScore: number;
  hallucinationRate: number;
  riskDisclosureScore: number;
  timelinessScore: number;
}

interface FinancialEvaluationReport extends EvaluationReport {
  version: number;
  avgNumericalAccuracy: number;
  avgComplianceScore: number;
  avgHallucinationRate: number;
  avgRiskDisclosureScore: number;
  avgTimelinessScore: number;
  financialOverallScore: number;
  dataSource: "golden" | "historical" | "opendataset" | "mixed";
  dataSourceDetail?: string;
  evaluationLevel: "daily" | "standard" | "full";
  triggerMode: "manual" | "auto";
  milestone?: string;
}
```

综合评分公式更新为：
- 通用指标权重：Hits@K×0.10 + ContextRelevance×0.08 + ContextRecall×0.07 + Faithfulness×0.12 + AnswerRelevance×0.13
- 金融指标权重：NumericalAccuracy×0.15 + ComplianceScore×0.15 + (1-HallucinationRate)×0.10 + RiskDisclosure×0.05 + Timeliness×0.05

### Requirement: Agent 评估器扩展

现有 Agent 测试框架 SHALL 扩展以包含金融行业专用评估维度：

```typescript
interface AgentEvaluationResult {
  toolSelectionScore: number;
  planningScore: number;
  complianceScore: number;
  consistencyScore: number;
  efficiencyScore: number;
}
```

## REMOVED Requirements

无移除的需求。所有现有评估功能保持向后兼容。
