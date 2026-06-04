# 跨模块集成测试 Spec（数据驱动版）

## Why

本项目由 11 个独立 spec 驱动开发，各模块的单元测试均通过：
### 已有单元测试通过清单

| 测试文件 | 测试项 | 结果 |
|---------|--------|------|
| `tests/unit/test-memory-system.ts` | 29项 | 29/29 ✅ |
| `tests/unit/test-memory-overlap.ts` | 8项 | 8/8 ✅ |
| `tests/unit/test-skill-system.ts` | 35项 | 35/35 ✅ |
| `tests/unit/test-dense-retriever-truncation.ts` | 截断边界、句子边界 | ✅ |
| `tests/unit/test-semantic-chunker-integration.ts` | 切片集成 | ✅ |
| `tests/unit/test-sparse-retriever-preprocess.ts` | BM25预处理 | ✅ |
| `tests/unit/test-config-resolution.ts` | 配置解析 | ✅ |
| `tests/unit/test-drizzle-runtime.ts` | Drizzle运行时 | ✅ |
| `src/server/rag/chunking/text-cleaner.test.ts` | 文本清洗 | ✅ |
| `src/server/evaluation/agent-evaluator.test.ts` | Agent评估器 | ✅ |
| `src/server/evaluation/evaluation-history.test.ts` | 评估历史 | ✅ |
| `src/server/evaluation/historical-query-collector.test.ts` | 历史查询收集 | ✅ |
| `src/server/evaluation/regression-tester.test.ts` | 回归测试器 | ✅ |
| `src/server/__tests__/description.test.ts` | ToolDescriptionEnhancer(3) + FewShotInjector(3) | ✅ 6项 |
| `src/server/__tests__/name-aliases.test.ts` | 工具别名解析(8项) | ✅ 8项 |
| `src/server/__tests__/retrieval.test.ts` | SkillVectorRetriever(3) + ToolVectorRetriever | ✅ |
| `src/server/__tests__/routing.test.ts` | ToolGroupManager(9) + GroupRouter(5) + SkillRouter | ✅ 15项 |
| `src/server/__tests__/validation.test.ts` | ToolCallValidator(4) + CallLimiter(9) | ✅ 13项 |
| `src/server/__tests__/vision.test.ts` | PaddleOCR(4) + VisionFallback(4) + DualEngineRouter | ✅ 9项 |
| `tests/tools/test-21-tools.ts` | 21个工具注册 | 已执行 |
| `tests/tools/test-llm-router.ts` | LLM路由 | 已执行 |
| `tests/tools/test-isolated.ts` | 独立工具测试 | 已执行 |
| `tests/agent/test-agent-tools.ts` | A类6+B类6+C类2=14项 | 11/14 ✅ |

> **总计**: 约 174 个单元测试项已通过，构成了集成测试的上层覆盖基础。

但单元测试验证的是各模块**独立**行为，缺少跨模块**交互**验证。且新增了 RouterFacade、ExecutionFacade、ReflectionNode、AgentLogger、Orchestrator、14 个 Enhanced Skill 等模块，交互路径更加复杂。

## 真实数据清单

### 可用数据

| 类别 | 内容 | 状态 |
|------|------|------|
| **财务报表** | 中国长城 2025年报 PDF | ✅ 804 embeddings |
| **财务报表** | 格力电器 2025年报 PDF | ✅ 718 embeddings |
| **财务报表** | 五粮液 2025年报 PDF | ✅ 已索引（BM25 + Dense 混合检索） |
| **交易数据** | 五粮液 sz.000858 | ✅ baostock 242条日K (2025-05-29~2026-05-29) |
| **交易数据** | 中国长城 sz.000066 | ✅ baostock 243条日K (2025-05-29~2026-05-29) |
| **交易数据** | 格力电器 sz.000651 | ✅ baostock 243条日K (2025-05-29~2026-05-29) |
| **交易数据** | 格力电器 efinance | ✅ data_service 最近一年数据 (自2026-05-29起) |
| **指数数据** | 上证指数 sh.000001 | ✅ |
| **指数数据** | 深证成指 sz.399001 | ✅ |
| **指数数据** | 创业板指 sz.399006 | ✅ |
| **实时行情** | 五粮液/中国长城/格力电器 | ✅ efinance |
| **财务摘要** | 五粮液/中国长城/格力电器 | ⚠️ baostock 可用, efinance 不稳定 |
| **行业分类** | 五粮液/中国长城/格力电器 | ✅ mootdx |
| **概念板块** | 五粮液/中国长城/格力电器 | ✅ mootdx |
| **PDF全文检索** | 资产负债率/流动比率/现金流量净额 | ✅ 可从年报 PDF 全文检索获取 |

### 已知问题（用于边界测试）

| 问题 | 影响 | 集成测试使用 |
|------|------|------------|
| efinance 财务数据 WARN | Connection aborted | I10.2: 降级验证 |
| 向量格式异常 WARN | embedding 格式非标准 | I7.4: 格式兼容性 |
| getStockHistory 工具测试 ❌ | 招商银行数据不可用 | 不依赖（使用 baostock 直接获取） |

## What Changes

- 重写 `tests/integration/` 目录
- 新增 **17 条集成路径**，共 **99 个测试用例**（全部基于真实数据）
- 新增回归测试（7项）和变异测试（9个目标模块）
- 更新 `checklist.md` 和 `tasks.md`

## Impact

- Affected specs: 全部 11 个
- Affected code: 无（仅测试）
- 依赖服务: PostgreSQL (agentdb)、Data Service (port 8001, 仅 I10.x)

---

## ADDED Requirements

### Requirement: 14 条跨模块集成路径测试（数据驱动）

#### 数据约定

统一定义测试中使用的股票标识：

```
五粮液: code="000858", bsCode="sz.000858"
中国长城: code="000066", bsCode="sz.000066"
格力电器: code="000651", bsCode="sz.000651"
```

---

### 路径 1: 记忆上下文组装 → Agent 系统提示注入

**模块A**: `memory.ts` — `assembleContext(query, userId, convId, modelMaxTokens) -> AssembledContext`
**模块B**: `simpleAgent.ts` / `orchestrator.ts` — 将 context 注入 system prompt

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I1.1 | 完整四层记忆注入 | 用户有 L1/L2/L3/L4 数据 | userId="user-001", convId="conv-001", query="分析中国长城基本面" | AssembledContext 各字段非空；l4Profile 含偏好字段 | `assert(l1Messages.length > 0)`; `assert(l2Summary !== "")`; `assert(l3Fragments.length > 0)`; `assert(l4Profile !== "")` |
| I1.2 | 全新用户无记忆 | 无任何记忆数据 | userId="user-new", convId="conv-new", query="格力电器最新股价" | L2/L3/L4 为空字符串/空数组；L1 仅含当前 query | `assert(l2Summary === "")`; `assert(l3Fragments.length === 0)`; Agent 正常执行不崩溃 |
| I1.3 | L4 画像存在但 L2/L3 为空 | 仅用户画像表有数据 | userId="user-profile-only", query="五粮液技术分析" | AssembledContext.l4Profile 非空；l2Summary=""；l3Fragments=[] | `assert(l4Profile.includes("偏好"))`; 注入到 system prompt 的仅画像部分 |
| I1.4 | Token 预算不足时 L3 裁剪 | modelMaxTokens=4096 (4K窗口) | userId="user-001", query="中国长城研发费用占营收比例" | inputBudget≈3072, L3 预算≈500tokens, 仅返回 1-2 条片段 | `assert(budget.l3Budget < 1000)`; `assert(l3Fragments.length <= 2)` |
| I1.5 | assembleContext 抛出异常时 Agent 降级 | 模拟 DB 连接失败 → memory.ts throw Error | query="格力电器毛利率" | Agent 捕获异常，记录错误日志，继续执行（无记忆上下文） | 日志含 "记忆上下文组装失败" 或 "memory assemble failed"；Agent 仍返回答案 |
| I1.6 | 跨会话 L3 检索 | 用户在会话 A 分析了中国长城，当前在会话 B | userId="user-001", convId="conv-B", query="上次分析的中国长城财务数据" | L3Fragments 中某片段 sourceConversationId ≠ "conv-B" | `assert(l3Fragments.some(f => f.sourceConversationId !== "conv-B"))` |

**验证策略**：检查 `assembleContext` 返回值各字段的**存在性**和**内容相关性**，不检查具体数值。

---

### 路径 2: Skill 执行 → Agent 工具调用回退

**模块A**: `skills/executor.ts` / `skills/enhanced-orchestrator.ts` — `executeSkill()` / `executeEnhancedSkill()`
**模块B**: `simpleAgent.ts` / `orchestrator.ts` — 解析 `__skill__` 调用，执行或回退

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I2.1 | technical-analysis Skill 正常执行 | 注册 technical-analysis，工具可用 | params={code:"sz.000858", start:"2025-05-29", end:"2026-05-29"} | success=true, 5 stepResults（MA/RSI/Bollinger 并行+2个串行） | `assert(result.success === true)`; `assert(result.stepResults.length === 5)`; MA/RSI/Bollinger 的 executionTimeMs 存在 |
| I2.2 | 某步骤所需工具未注册 | 从 ToolRegistry 中移除 calculateMA | skillName="technical-analysis" | success=false, 失败步骤 error 含 "未注册" 或 "not found" | `assert(result.success === false)` |
| I2.3 | Agent 调用不存在的 Skill | SkillRegistry 无此名称 | LLM 输出 `{"skill":"nonexistent-skill"}` | observationParts 含 "not found" 或 "不存在" | `assert(observationParts.some(s => s.includes("not found") \|\| s.includes("不存在")))` |
| I2.4 | 并行步骤执行时间验证 | technical-analysis 中 MA/RSI/Bollinger 标记 parallel | code="sz.000651" | parallel 步骤的总耗时 < 各步骤单独耗时之和 | `assert(parallelExecutionTime < sumOfIndividualTimes)` |
| I2.5 | 综合诊断嵌套 Skill 执行 | comprehensive-diagnosis 包含 3 个子 Skill | code="sz.000066" | 子 Skill 按定义执行，最终综合报告含"技术分析""合规检查""风控评估"三个部分 | `assert(result.finalOutput.includes("技术分析"))`; `assert(result.finalOutput.includes("合规"))`; `assert(result.finalOutput.includes("风控"))` |
| I2.6 | stock-comparison Skill 多股票对比 | 新增 investment Skill, 工具可用 | params={codes:["sz.000858","sz.000651"]} | 两个公司的财务和估值数据都获取到 | `assert(result.stepResults.every(s => s.success))`; 输出含两个公司对比 |
| I2.7 | valuation-analysis Skill 估值分析 | 使用中国长城数据 | params={code:"sz.000066"} | 返回 PE/PB/PS 等估值指标与行业对比 | `assert(result.success)`; `assert(result.finalOutput.includes("估值"))` |
| I2.8 | fundamental-analysis Skill 基本面分析 | 使用格力电器数据 | params={code:"sz.000651"} | 4 步串行：财务→估值→公司概况→分红 | `assert(result.stepResults.length === 4)`; `assert(result.finalOutput.includes("基本面"))` |

**验证策略**：检查 Skill 执行成功/失败状态、步骤数、输出内容结构，**使用真实的 baostock 股票代码**。

---

### 路径 3: 工具注册 → Agent 动态路由

**模块A**: `tools/registry.ts` — `ToolRegistry.listByGroup()`, `listNames()`
**模块B**: `routing/router-facade.ts` — `RouterFacade.route(query)` → `RouterFacade.routeWithVector(query)`
**模块C**: `orchestrator.ts` — 消费 RouteDecision

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I3.1 | 技术分析 query 路由到 correct 组 | 21 工具已按 category 分组 | query="计算五粮液RSI和MACD指标" | RouterFacade 激活 "technical-analysis" 组；activeTools 含 calculateRSI/calculateMACD | `assert(decision.routeType === "group" \|\| decision.routeType === "skill")`; `assert(decision.availableTools.includes("calculateRSI"))` |
| I3.2 | 风控 query 路由到风险组 | 风控合规工具已注册 | query="格力电器仓位是否合规" | RouterFacade 激活 "risk-compliance" 组；activeTools 含 checkPositionLimit | `assert(decision.availableTools.includes("checkPositionLimit"))` |
| I3.3 | 查询不匹配任何工具组 | query 无金融关键词 | query="你好" | routeType="full_fallback"；availableTools 为全部 21 个工具 | `assert(decision.routeType === "full_fallback")`; `assert(decision.availableTools.length >= 20)` |
| I3.4 | 空工具组过滤后 activeTools 为空 | 模拟 RouterFacade 返回空列表 | 强制 RouterFacade 返回空 availableTools | Orchestrator 使用全部工具兜底 | `assert(availableTools.length === ToolRegistry.listNames().length)` |
| I3.5 | 工具别名解析 getMA → calculateMA | ToolRegistry 注册了别名 | toolName="getMA" | resolveToolName 返回 "calculateMA" | `assert(resolveToolName("getMA") === "calculateMA")` |
| I3.6 | RouterFacade vector 路由降级到 keyword | RouterFacade 向量索引未初始化 | query="中国长城技术面分析" | 降级到 keyword routing，仍返回有效决策 | `assert(decision.routeType !== undefined)`; 向量初始化失败时仍能路由 |

**验证策略**：通过 RouterFacade 路由后检查 activeTools 和 routeType，验证分组过滤逻辑。

---

### 路径 4: 文本清洗 → 语义切片 → Embedding（全链路）

**模块A**: `text-cleaner.ts` — `cleanText(rawText) -> string`
**模块B**: `semantic-chunker.ts` — `chunkDocument(cleanText) -> Chunk[]`
**模块C**: `dense-retriever.ts` — `generateEmbedding(chunkText) -> vector`

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I4.1 | 中国长城年报片段清洗→切片→Embedding | 使用中国长城年报真实文本片段 | rawText="中国长城科技集团股份有限公司...实现营业收入825亿元，同比增长..." | cleanText 保留核心数字（825亿）；chunkDocument 生成 > 1 个切片；embedding 维度 = 1024（modelScope nomic-embed-text-v2） | `assert(cleaned.includes("825亿"))`; `assert(chunks.length > 0)`; `assert(embedding.length === 1024)` |
| I4.2 | 清洗后文本为空 | 原始文本全是 Markdown 噪声（图片标记+表格分隔+空链接） | rawText="![图1](http://x.com)\n\n---|---|---\n\n***\n\n[链接](http://x.com)" | cleanText 返回空或仅含空白；chunkDocument 返回空数组 | `assert(cleaned.trim().length < 10)`; `assert(chunks.length === 0)` |
| I4.3 | 切片边界修正（逗号开头） | 包含以标点开头的切片 | chunks=[{text:"前文内容..."}, {text:"，后续内容..."}] | fixChunkBoundaries 将 "，" 开头修正为从 "后续" 开始 | `assert(!fixedChunks.some(c => /^[，。、；：！？》\)」』】]/.test(c.text)))` |
| I4.4 | Embedding 输入截断（超长文本） | 切片长度 > 2000 字符 | 3000+ 字符的格力电器年报片段 | truncateForEmbedding 在句子边界截断，不超过 2000 | `assert(truncated.length <= 2000)`; `assert(truncated.endsWith("。") \|\| truncated.endsWith("？"))` |
| I4.5 | 全角数字/零宽字符清洗 | 格力电器年报含全角数字 | rawText="营收１２３４亿元\u200B，同比增长15%" | cleanText 输出 "营收1234亿元，同比增长15%" | `assert(!cleaned.includes("\u200B"))`; `assert(cleaned.includes("1234"))`; `assert(!cleaned.includes("１２３４"))` |

**验证策略**：使用中国长城/格力电器年报的真实文本片段，验证清洗→切片→Embedding 全链路数据传递。

---

### 路径 5: 精排分离 → RAG 搜索结果合并

**模块A**: `reranker.ts` — 文档 Top-K + 图谱 Top-M 分离精排
**模块B**: `api/rag/search/route.ts` — 结果合并

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I5.1 | 文档+图谱分离精排合并 | 两者都有结果 | query="中国长城研发费用" | docRerankResults (top-5) + graphRerankResults (top-3) = results(8条) | `assert(results.length >= 5)`; 文档来源与图谱来源不混合排名 |
| I5.2 | 仅文档结果（图谱为空） | Neo4j 不可用 | query="格力电器营收" | graphRerankResults 为空数组；results 仅文档结果 | `assert(results.every(r => r.sourceType === "document"))` |
| I5.3 | 两者都为空 | 无检索结果 | query="xyzxyz123不存在" | results=[]；success=true（非错误） | `assert(results.length === 0)`; `assert(success === true)` |
| I5.4 | 精排后文档排名不被图谱挤占 | 混合精排场景 | query="中国长城" | 分离精排：文档 top-5 基于文档自身分数排序，图谱 top-3 基于图谱自身分数 | 对比分离精排 vs 混合精排结果中文档的排名差异 |
| I5.5 | BM25 401 时仅用 dense | BM25 端返回 401 | query="格力电器利润率" | 仅使用向量检索（dense）返回结果；日志含 BM25 降级信息 | `assert(results.length > 0)`; 降级后仍能返回检索结果 |

**验证策略**：使用真实数据调用 RAG search API，验证返回结果结构。

---

### 路径 6: 配置解析 → LLM 路由降级

**模块A**: `config` 系统 — `resolveEnvVars(configObj) -> resolvedObj`
**模块B**: `llm/router.ts` — `getModelChain()` → `callWithFallback()`

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I6.1 | 正常降级链构建 | api_keys.yaml 有多个模型 | 读取 api_keys.yaml | models 列表非空，第一个模型为默认 | `assert(models.length > 0)`; `assert(typeof models[0].id === "string")` |
| I6.2 | models 列表为空时明确报错 | api_keys.yaml 中 llm.models=[] | 空列表 | 错误信息含 "models 列表为空" 或 "no models" | `assert(errorMessage.includes("models") \|\| errorMessage.includes("model"))` |
| I6.3 | 所有模型不可用时错误传递 | 所有模型 API Key 无效 | 模拟全部 API Key 错误 | 尝试所有模型后失败，错误信息列出尝试的模型 | `assert(attemptedModels.length === models.length)` |
| I6.4 | 环境变量格式值保留原值 | 配置值 "1M"（context 字段，非环境变量） | 值="1M" | resolveEnvVars 保留 "1M" | `assert(resolvedVal === "1M")` |
| I6.5 | thinking/functionCalling 字段正确性 | api_keys.yaml 中模型配置 | 遍历所有模型 | 每个模型的 thinking 和 functionCalling 字段存在且为 boolean | `assert(typeof model.thinking === "boolean")`; `assert(typeof model.functionCalling === "boolean")` |

**验证策略**：纯配置解析测试，不依赖网络。验证配置链从 YAML → 解析 → 路由的完整性。

---

### 路径 7: L3 记忆片段 → 向量检索

**模块A**: `memory.ts` — MemoryFragment 存储（含 embedding）
**模块B**: `dense-retriever.ts` — pgvector 相似度搜索

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I7.1 | MemoryFragment 有 embedding 正常检索 | 片段含 1024 维向量 | query="中国长城ROE分析" | 向量相似度搜索返回相关片段 | `assert(results.length > 0)`; 顶部片段 content 与 query 主题相关 |
| I7.2 | MemoryFragment 无 embedding 降级 | 片段 embedding 为 NULL | query="格力电器营收" | 降级为按 createdAt 倒序返回最近片段 | 返回片段为时间倒序；日志含 "无 embedding" 或降级信息 |
| I7.3 | MemoryFragment 表为空 | 无数据 | query="五粮液策略" | 返回空数组，不影响 Agent | `assert(fragments.length === 0)`; Agent 正常执行 |
| I7.4 | 向量格式兼容性 | 向量格式为非标准格式（如 hex binary） | 正常 query | 检索仍然成功返回结果 | `assert(results.length > 0)`; 不抛出格式异常 |

**验证策略**：直接操作数据库，验证不同状态下的检索行为。

---

### 路径 8: 全链路：文本清洗→RAG检索→Agent工具调用

**模块A**: `text-cleaner.ts` — 清洗年报文档
**模块B**: `hybrid-retriever.ts` — 检索清洗后切片
**模块C**: `simpleAgent.ts` — `hybridSearch` 工具调用 → 生成回答

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I8.1 | 中国长城年报检索质量 | 中国长城 804 embeddings 正常 | query="中国长城2025年营业收入具体是多少" | hybridSearch 返回相关切片，top-1 包含 "825亿" 或 "营业收入" > 500亿 | `assert(topResults[0].text.includes("营业收入") \|\| topResults[0].text.includes("825"))` |
| I8.2 | 格力电器年报检索质量 | 格力电器 718 embeddings 正常 | query="格力电器2025年净利润率" | hybridSearch 返回相关切片，包含利润率数据 | `assert(results.length >= 3)`; top-3 至少 1 条含百分比数字 |
| I8.3 | 五粮液年报检索质量 | 五粮液 PDF 已索引，BM25+Dense 混合检索 | query="五粮液2025年毛利率" | hybridSearch 返回相关切片，包含毛利率数据 | `assert(results.length >= 3)` |
| I8.4 | 切片清洗后检索噪声降低 | 对比清洗前后检索结果 | query="中国长城核心竞争力" | 清洗后 top-5 结果中不含图片标记 `![`、表格分隔行 `---\|---` | `assert(!topResults.some(r => r.text.includes("![图") \|\| r.text.includes("---|---|---")))` |
| I8.5 | Agent 全链路：RAG→回答 | 需要 Agent 服务运行 | query="格力电器2025年报中应收账款周转天数是多少" | Agent 调用 hybridSearch 获取年报，回答包含具体数值或提示无法获取 | 检查工具调用含 hybridSearch；回答不凭空编造数字 |

**验证策略**：I8.1-I8.4 直接调用 hybridSearch 验证检索质量；I8.5 需 Agent 服务运行。

---

### 路径 9: Agent 执行 → 评估系统消费

**模块A**: `simpleAgent.ts` / `orchestrator.ts` — `runAgent()` / `runOrchestrator()` 返回 `{answer, iterations, steps}`
**模块B**: `api/evaluation/*` — 评估 API 消费 Agent 输出

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I9.1 | Agent 正常回答被评估消费 | Agent 返回完整回答 | query="中国长城2025年营收" | 评估系统正确解析 answer、steps、工具调用 | `assert(evalResult.toolCalls.length > 0)`; `assert(evalResult.answer.length > 20)` |
| I9.2 | Agent 错误时的评估 | Agent 执行失败（如所有模型不可用） | query 触发异常 | 评估标记 status=failed，记录错误，不影响其他用例 | `assert(evalResult.status === "failed")`; `assert(evalResult.error !== null)` |
| I9.3 | Agent 空回答时的评估 | Agent 返回 "" | query="超出能力的查询" | 各指标为 0 或 null，不崩溃 | `assert(evalResult.answer === "")`; `assert(evalResult.score === 0)` |
| I9.4 | Agent 超长回答时的评估 | 回答 > 10000 字符 | query="详细分析格力电器2025年报" | 评估系统正常处理，不截断 | `assert(evalResult.answer.length === originalLength)` |
| I9.5 | 评估版本管理 | 两次评估 | 同一 query 两次 | 版本号自增；对比报告含 diff | `assert(version2 > version1)`; 对比含变化值 |

**验证策略**：调用代理 API 和评估 API，验证数据格式兼容。

---

### 路径 10: 配置 → 数据服务（Python FastAPI）

**模块A**: JavaScript `config` — API key 解析
**模块B**: Python `data_service/main.py` — 多源数据获取（efinance→baostock→mootdx→tushare）

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I10.1 | 历史行情正常获取（baostock）| Data Service 运行 | code="sz.000858", start="2025-06-01", end="2026-05-31" | 返回约 242 条日K线记录，含 date/open/high/low/close | `assert(data.length >= 200)`; `assert(data[0].date !== undefined)`; `assert(data[0].close !== "0")` |
| I10.2 | 多源降级：efinance失败→baostock | efinance 格力历史行情可用 | code="000651", source auto | 自动降级到 baostock，返回约 243 条记录 | `assert(data.length >= 200)` |
| I10.3 | 实时行情获取 | efinance 可用 | code="000858" (五粮液) | 返回最新价、涨跌幅等字段 | `assert(data.latestPrice !== undefined)` |
| I10.4 | 财务数据缓存命中 | 缓存预热已完成 | code="sz.000066", year=2025, quarter=4 | 从 PostgreSQL 缓存直接返回，不调用外部 API | 响应耗时 < 100ms；日志含 "缓存命中" |
| I10.5 | 指数数据获取 | 三大指数可用 | 上证指数 sh.000001 | 返回约 243 条日K线 | `assert(data.length >= 200)` |
| I10.6 | 所有数据源都不可用时的错误传递 | 模拟全部数据源不可用 | code="sz.000858" | 返回明确错误信息，列出尝试的源 | `assert(error.includes("不可用") \|\| error.includes("failed"))` |

**验证策略**：I10.1-I10.5 需 Data Service (port 8001) 运行；I10.6 使用 mock。

---

### 路径 11: RouterFacade → Orchestrator 路由决策

**模块A**: `routing/router-facade.ts` — `RouterFacade.route(query)` → `RouteDecision`
**模块B**: `orchestrator.ts` — `runOrchestrator()` 根据 RouteDecision 选择执行方式

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I11.1 | 量化 query 路由到 quant 模式 | 技术指标关键词匹配 | query="计算五粮液过去一年RSI和MACD" | routeType="skill" (technical-analysis) 或 "group"；mode="quant" | `assert(decision.routeType !== "full_fallback")` |
| I11.2 | 风控 query 路由到 compliance 模式 | 合规关键词匹配 | query="格力电器持仓是否超过风险限额" | routeType 匹配 compliance 相关 Skill 或组 | `assert(decision.availableTools.some(t => t.includes("VaR") \|\| t.includes("Risk")))` |
| I11.3 | 通用 query 走 full_fallback | 无任何关键词匹配 | query="你好，股市最近怎么样" | routeType="full_fallback"；availableTools 包含全部工具 | `assert(decision.availableTools.length >= 20)` |
| I11.4 | Multi-Skill 匹配（同时匹配多个 Skill）| query 含多个 Skill 触发词 | query="对比五粮液和格力电器的基本面和估值" | MultiSkillMatcher 匹配 stock-comparison(primary) + fundamental-analysis/valuation-analysis(auxiliary) | `assert(multiResult.primarySkill.name === "stock-comparison")`; `assert(multiResult.auxiliarySkills.length >= 1)` |
| I11.5 | RouterFacade 初始化失败降级 | 向量索引构建失败 | 模拟初始化异常 | 降级到 keyword-based routing，route() 仍返回有效决策 | `assert(decision.routeType !== undefined)`; `assert(decision.availableTools.length > 0)` |

**验证策略**：直接调用 RouterFacade.route()，检查路由决策结果和工具匹配。

---

### 路径 12: ReflectionNode → Orchestrator 迭代控制

**模块A**: `reflection-node.ts` — `shouldRetrieveAgain(query, answer, searchResults, observations) -> ReflectionResult`
**模块B**: `orchestrator.ts` — 根据 `needMore` 决定是否继续迭代

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I12.1 | 答案充分时停止迭代 | 答案包含工具返回的具体数据 | query="中国长城2025年营收", answer="825亿，来自工具调用结果", observations=["getStockFinancial返回: 营收825亿"] | needMore=false | `assert(reflectionResult.needMore === false)` |
| I12.2 | 答案空洞（幻觉检测）触发重试 | 答案有数字但无工具调用支撑 | query="格力电器ROE", answer="格力电器ROE约25%（根据公开资料）", observations=[] | needMore=true；refinedQuery 建议调用 getStockFinancial | `assert(reflectionResult.needMore === true)`; `assert(reflectionResult.refinedQuery?.includes("getStockFinancial"))` |
| I12.3 | 答案含万金油表述触发重试 | 答案有 "无法确定""信息不足" | query="五粮液毛利率趋势", answer="由于信息不足，无法确定五粮液的毛利率趋势" | needMore=true | `assert(reflectionResult.needMore === true)` |
| I12.4 | 技术指标计算后停止迭代 | 已调用 getStockHistory + calculateRSI | query="五粮液RSI值", answer="当前RSI为62.5", observations=["getStockHistory: 242条记录", "calculateRSI: 62.5"] | needMore=false（技术指标不需要 RAG 检索） | `assert(reflectionResult.needMore === false)` |
| I12.5 | 解析失败时默认不重试 | LLM 返回非 JSON 格式 | 模拟 LLM 返回纯文本 | 返回 needMore=false（安全兜底） | `assert(reflectionResult.needMore === false)` |

**验证策略**：I12.1-I12.4 使用真实工具调用结果或构造 realistic observations；I12.5 使用 mock。

---

### 路径 13: ExecutionFacade → 统一执行

**模块A**: `execution-facade.ts` — `ExecutionFacade.execute(decision, query, config, messages) -> ExecutionResult`
**模块B**: `orchestrator.ts` — 调用 execute 并处理返回结果

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I13.1 | Skill 模式执行 | decision.routeType="skill", matchedSkill=technicalAnalysis | query="五粮液技术分析" | executionMode="skill"；skillResult.success=true | `assert(result.executionMode === "skill")`; `assert(result.success === true)` |
| I13.2 | ReAct 模式执行 | decision.routeType="full_fallback" | query="中国长城和格力电器哪家更值得投资" | executionMode="react"；reactResult.answer 非空 | `assert(result.executionMode === "react")`; `assert(result.output.length > 20)` |
| I13.3 | Skill 失败时 ExecutionFacade 返回失败 | Skill 执行抛异常 | 模拟 enhanced-orchestrator 抛出 Error | success=false；output 含 "Skill执行失败" | `assert(result.success === false)`; `assert(result.output.includes("失败"))` |
| I13.4 | ReAct 超时时 ExecutionFacade 返回失败 | 模拟 LLM 调用超时 | query="复杂查询" | success=false；output 含 "超时" 或 "timeout" | `assert(result.success === false)` |

**验证策略**：mock Skill/ReAct 执行过程，验证 ExecutionFacade 对不同模式的处理。

---

### 路径 14: AgentLogger → 数据库持久化

**模块A**: `agent-logger.ts` — `saveAgentLog(params)` → `agentLogs` 表
**模块B**: `db/schema.ts` — `agentLogs`, `llmUsageLogs` 表结构
**模块C**: `api/agent/logs/route.ts` — 查询日志 API

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I14.1 | Agent 成功执行后日志入库 | Agent 正常完成 | runAgent("中国长城营收") 成功返回 | agentLogs 表中新增 1 条 status="success" 记录 | `assert(row.status === "success")`; `assert(row.query.includes("中国长城"))` |
| I14.2 | Agent 执行失败后日志入库 | Agent 执行出错 | runAgent("错误query") 失败 | agentLogs 表中新增 1 条 status="error"；errorMessage 非空 | `assert(row.status === "error")`; `assert(row.errorMessage !== null)` |
| I14.3 | LLM 使用记录入库 | LLM 调用发生 | 任意 Agent 查询 | llmUsageLogs 表中新增记录，含 model/promptTokens/completionTokens | `assert(row.model !== null)`; `assert(row.totalTokens > 0)` |
| I14.4 | 日志查询 API 返回正确数据 | agentLogs 表有数据 | GET /api/agent/logs?userId=test-user | 返回历史日志数组 | `assert(Array.isArray(response))`; `assert(response.length > 0)` |
| I14.5 | 日志摘要统计正确 | 多条日志记录 | getAgentLogsSummary(userId) | 返回总调用次数、总 Token、按模型统计 | `assert(summary.totalCalls > 0)`; `assert(summary.byModel)` |

**验证策略**：直接操作数据库验证 agentLogs/llmUsageLogs 表写入；调用日志 API 验证读取。


### 路径 16: ToolCallValidator/CallLimiter → EnhancedReActExecutor 校验链

**模块A**: `validation/tool-call-validator.ts` — 校验工具名是否存在、必填参数是否齐全
**模块B**: `validation/call-limiter.ts` — 限制最大工具调用次数、缓存去重
**模块C**: `agents/enhanced-react-executor.ts` — 每次 LLM 工具调用后触发校验和限流

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I16.1 | 已知工具+正确参数通过校验 | ToolRegistry 已注册所有工具 | toolName="calculateRSI", params={period:14} | valid=true, errors=[] | `assert(result.valid === true)`; `assert(result.errors.length === 0)` |
| I16.2 | 不存在工具返回错误 | 使用未注册的工具名 | toolName="getUnknownMetric", params={} | valid=false, errors[0].type="unknown_tool" | `assert(result.valid === false)`; `assert(result.errors[0].type === "unknown_tool")` |
| I16.3 | 必填参数缺失返回错误 | 工具定义了 required 参数 | toolName="calculateRSI", params={} | valid=false, errors 含 missing 类型 | `assert(result.errors.some(e => e.type === "missing"))` |
| I16.4 | 工具调用次数限制生效 | CallLimiter 设置 maxToolCalls=3 | 连续调用 4 次 | 前3次 canCall=true，第4次 canCall=false | `assert(limiter.getCount() === 3)`; 第4次被拒绝 |
| I16.5 | 校验失败→LLM修正重试→成功 | Validator 返回错误信息 | toolName="calculateRSI", params={}（缺少period） | LLM 收到错误提示后修正参数，重试成功 | `assert(corrected)`; 最终调用成功 |
| I16.6 | 校验失败超过重试次数→放弃 | 设置了 validationRetryLimit=2 | 连续3次校验失败 | 第3次失败后不再重试，标记 error | `assert(step.type === "error")`; 含 "校验失败且修正超限" |
| I16.7 | CallLimiter 缓存命中返回缓存值 | 相同 toolName+params 已执行过 | executeWithLimit("calculateRSI", {period:14}, fn) | 第二次调用返回缓存结果，不执行 fn | `assert(secondResult === firstResult)`; fn 只调用1次 |

**验证策略**：直接实例化 ToolCallValidator/CallLimiter，mock 工具执行函数。


### 路径 17: NameAliases → ToolRegistry → Agent 工具别名解析

**模块A**: `tools/name-aliases.ts` — `TOOL_NAME_ALIASES` 别名映射表 + `resolveToolName()`
**模块B**: `tools/registry.ts` — `ToolRegistry.get()` / `ToolRegistry.listNames()`
**模块C**: `agents/enhanced-react-executor.ts` — 工具调用前通过别名解析找到正确工具

| # | 用例 | 前置条件 | 输入 | 预期输出 | 验证方法 |
|---|------|---------|------|---------|---------|
| I17.1 | getMA→calculateMA 别名解析 | ToolRegistry 注册了 calculateMA | toolName="getMA" | resolveToolName 返回 "calculateMA" | `assert(resolveToolName("getMA") === "calculateMA")` |
| I17.2 | getMACD→calculateMACD 别名解析 | ToolRegistry 注册了 calculateMACD | toolName="getMACD" | resolveToolName 返回 "calculateMACD" | `assert(resolveToolName("getMACD") === "calculateMACD")` |
| I17.3 | getFinancialData→getStockFinancial 别名解析 | ToolRegistry 注册了 getStockFinancial | toolName="getFinancialData" | resolveToolName 返回 "getStockFinancial" | `assert(resolveToolName("getFinancialData") === "getStockFinancial")` |
| I17.4 | LLM 输出别名→Agent 正确执行 | LLM 调用 getMA 时 ToolRegistry 无此名 | LLM tool_calls 含 {name:"getMA", params:{period:20}} | Agent 通过别名解析找到 calculateMA，正确执行 | `assert(executedTool === "calculateMA")`; 结果正确 |
| I17.5 | 别名目标不存在时返回原名 | 别名指向的工具未注册 | toolName="getMA"（calculateMA 未注册） | resolveToolName 返回 "getMA" | `assert(resolveToolName("getMA") === "getMA")` |
| I17.6 | 已知工具名直接返回 | ToolRegistry 直接注册了此名 | toolName="calculateRSI" | resolveToolName 返回 "calculateRSI" | `assert(resolveToolName("calculateRSI") === "calculateRSI")` |

**验证策略**：直接调用 resolveToolName()，验证别名映射正确性；mock Agent 工具调用场景。


### Requirement: 集成测试验证策略（不变）

系统 SHALL 对每条集成路径使用以下验证策略：

| 策略 | 说明 | 适用于 |
|------|------|-------|
| **数据传递完整性** | 模块 A 的返回值被模块 B 正确消费 | 全部路径 |
| **错误传播正确性** | 错误信息完整传递，下游优雅降级 | I1.5, I2.2, I2.3, I9.2, I13.3, I13.4 |
| **降级路径可用性** | 可选依赖不可用时降级到备用方案 | I3.4, I6.1-6.4, I7.2, I10.2, I11.5, I12.5 |
| **边界值处理** | 空值、零值、极大值、特殊字符正确处理 | I1.2, I1.4, I4.2, I4.5, I6.2, I7.3, I9.3 |
| **真实数据驱动** | 使用五粮液/中国长城/格力电器的真实数据 | 全部 I4.x, I5.x, I8.x, I10.x |

---

### Requirement: 上线前回归测试

| # | 检查项 | 是否依赖外部 | 超时 |
|---|--------|-----------|------|
| R1 | 配置加载：api_keys.yaml 解析成功，models 列表非空 | 否 | 5s |
| R2 | DB 连接：PostgreSQL 连接正常，关键表存在 | 是(本地PG) | 10s |
| R3 | RAG 冒烟：中国长城年报 hybridSearch 返回 ≥5 条 | 是(本地PG Embedding) | 30s |
| R4 | Agent 冒烟：中国长城营收查询返回非空回答 | 是(LLM) | 120s |
| R5 | 记忆冒烟：assembleContext 返回有效结构 | 是(本地PG) | 10s |
| R6 | 数据服务：baostock 历史行情 ≥200 条 | 是(Data Service) | 30s |
| R7 | API 端点：GET /api/health 返回 200 | 否 | 5s |

**回归测试必须全部通过才能上线。**

---

### Requirement: 变异测试（不变，仅更新目标模块）

| 目标模块 | 现有单元测试 | 变异操作 | 存活率阈值 |
|---------|------------|---------|----------|
| `memory.ts` — calculateTokenBudget | test-memory-system.ts | 算术替换、常量修改、边界偏移 | ≥60% |
| `memory.ts` — formatUserProfileForPrompt | test-memory-system.ts | 返回值 null、字段删除 | ≥60% |
| `memory.ts` — assembleContext | test-memory-overlap.ts | 条件删除、变量交换 | ≥60% |
| `text-cleaner.ts` — cleanText | run_all_tests.ts | 返回值替换、正则删除 | ≥60% |
| `text-cleaner.ts` — fixChunkBoundaries | run_all_tests.ts | 边界偏移、索引修改 | ≥60% |
| `skills/executor.ts` — executeSkill | test-skill-system.ts | 参数交换、并行→串行转换 | ≥60% |
| `skills/enhanced-orchestrator.ts` — executeEnhancedSkill | test-skill-system.ts | 条件删除、返回值 null | ≥60% |
| `tools/registry.ts` — ToolRegistry | test-skill-system.ts | 过滤条件反转、size 返回值篡改 | ≥60% |
| `config` — resolveEnvVars | run_all_tests.ts | 正则替换、返回值 null | ≥60% |

---

### Requirement: 测试报告对比

| 维度 | 说明 |
|------|------|
| **覆盖对比** | 集成测试 vs 单元测试覆盖矩阵 |
| **失败模式** | 集成测试 vs integrity-test/cache-warmup 报告的失败是否一致 |
| **根因关联** | 集成失败是否可追溯到某单元测试薄弱点 |
| **降级验证** | 集成测试中的降级行为是否按单元测试假设工作 |

## MODIFIED Requirements

无

## REMOVED Requirements

无