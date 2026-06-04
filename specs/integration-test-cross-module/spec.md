# 跨模块集成测试 Spec

**版本**: 4.1 — 真实 LLM 驱动
**日期**: 2026-06-01
**状态**: 开发中 — 4 条纯逻辑路径已实现，39 个测试通过

---

## 摘要

经过近期大量模块新增（描述增强、工具校验、向量检索、路由分组、别名解析、反思节点、执行门面等），需要一套跨模块集成测试验证模块间交互的正确性。本 Spec 定义了 **16 条集成路径**，共 **94 个测试用例**。

**核心原则**：
- 涉及 LLM 的路径（Agent 执行、Skill 路由、反思、执行门面）→ **真实 LLM 调用 + 自动模型切换**
- 纯逻辑模块（记忆预算、别名解析、校验链、描述增强）→ **直接调用，不 mock 外部服务**
- 数据管道（文本清洗→切片→Embedding、数据服务降级）→ **真实数据 + 真实服务**

---

## 依赖关系

- **vitest** — 测试框架
- **api_keys.yaml** — LLM 模型配置，模型数量动态变化，测试自动读取全部可用模型并按序切换，额度耗尽自动跳到下一个
- **Data Service** (port 8001) — baostock/efinance 交易数据接口，也是本项目**唯一**的交易/指数/宏观数据来源
- **PostgreSQL** — 路径 13 日志持久化；BM25 索引从 DB 的 embeddings 表动态构建（内存索引，无需额外重建）

---

## What Changes

- 新建 `tests/integration/` 目录
- 新增 **16 条集成路径**，共 **94 个测试用例**（全部基于真实数据 + 真实 LLM）
- 删除整个评估模块，评估功能后续单独开发
- 新增回归测试（7 项）和变异测试（9 个目标模块）
- 配套 `checklist.md` 和 `tasks.md`

---

## 数据能力边界

本项目只有两类数据，全部来源 **data_service**：
1. **财务报表**: baostock 利润表（营收/净利润/毛利率/ROE）；PDF 全文检索补充
2. **股市交易数据**: 历史K线、实时行情、指数数据

### 真实数据约定

| 股票 | 代码 | baostock 代码 | 利润表 | PDF 年报 | BM25 索引 | 历史K线 |
|------|------|-------------|--------|---------|----------|---------|
| 五粮液 | 000858 | sz.000858 | ✅ | ✅ | ✅ | ~242条 |
| 中国长城 | 000066 | sz.000066 | ✅ | ✅ | ✅ | ~243条 |
| 格力电器 | 000651 | sz.000651 | ✅ | ✅ | ✅ | ~243条 |

> **PDF 年报已全部就绪并索引完成**：
> - `data/financial_reports/2025_annual/000858_五_粮_液_2025年年度报告.pdf`
> - `data/financial_reports/2025_annual/000066_中国长城_2025年年度报告.pdf`
> - `data/financial_reports/2025_annual/000651_格力电器_2025年年度报告.pdf`
> - 2026 Q1 报告同样已就绪：`data/financial_reports/2026_q1/`
> 
> **BM25 索引**：基于数据库 embeddings 表动态构建的内存索引，启动时从 DB 加载，增量更新时自动重建。无需额外重建步骤。

### 可获取字段

| 数据源 | 可获取字段 |
|--------|-----------|
| baostock 利润表 | code, roeAvg, npMargin, grossProfitMargin, netProfit, eps, bps, revenue, profit, publishDate |
| efinance 实时 | 最新价、涨跌幅、成交量、换手率、PE/PB |
| efinance 历史K线 | 五粮液正常，格力电器从 data_service 获取（最近一年，自 2026-05-29 起） |
| PDF 索引 | **五粮液/中国长城/格力电器** 年报全文检索（BM25 + Dense 混合检索，已索引） |

### 可获取字段（PDF 年报全文检索）

| 字段 | 来源 |
|------|------|
| 资产负债率 | PDF 年报全文检索 |
| 流动比率 | PDF 年报全文检索 |
| 现金流量净额 | PDF 年报全文检索 |

### 不可获取字段（已知缺口）

| 字段 | 原因 |
|------|------|
| (无) | baostock 利润表 + PDF 全文检索 + data_service 已覆盖全部需求字段 |

---

## 模型自动切换策略

所有需要 LLM 的测试使用以下策略：从 `api_keys.yaml` **动态加载所有可用模型**，按配置顺序使用。遇 429/quota 耗尽自动切换到下一个。模型数量可能随时变化（用户会维护该文件），测试代码不写死模型数量或名称。

测试启动时执行 `loadModels()` 读取最新配置，遇到故障模型自动跳过。不维护黑名单。

---

## 已有单元测试通过清单

### 核心单元测试 (tests/unit/)

| 测试文件 | 测试项 | 结果 |
|---------|--------|------|
| `test-memory-system.ts` | 记忆系统 CRUD、组装 | 29/29 ✅ |
| `test-memory-overlap.ts` | 记忆重合场景 | 8/8 ✅ |
| `test-skill-system.ts` | Skill 注册、执行、回退 | 35/35 ✅ |
| `test-dense-retriever-truncation.ts` | Embedding 截断边界 | ✅ |
| `test-semantic-chunker-integration.ts` | 语义切片集成 | ✅ |
| `test-sparse-retriever-preprocess.ts` | BM25 预处理 | ✅ |
| `test-config-resolution.ts` | 配置解析 | ✅ |
| `test-drizzle-runtime.ts` | Drizzle 运行时 | ✅ |

### 内联单元测试 (src/server/__tests__/)

| 测试文件 | 测试项 | 结果 |
|---------|--------|------|
| `description.test.ts` | ToolDescriptionEnhancer(3) + FewShotInjector(3) | 6/6 ✅ |
| `name-aliases.test.ts` | 工具别名解析(8项) | 8/8 ✅ |
| `retrieval.test.ts` | SkillVectorRetriever + ToolVectorRetriever | ✅ |
| `routing.test.ts` | ToolGroupManager(9) + GroupRouter(5) + SkillRouter | 15/15 ✅ |
| `validation.test.ts` | ToolCallValidator(4) + CallLimiter(9) | 13/13 ✅ |
| `vision.test.ts` | PaddleOCR(4) + VisionFallback(4) + DualEngineRouter | 9/9 ✅ |

### 模块级单元测试

| 测试文件 | 测试项 | 结果 |
|---------|--------|------|
| `rag/chunking/text-cleaner.test.ts` | 文本清洗 | ✅ |

### 工具/Agent 测试

| 测试文件 | 测试项 | 结果 |
|---------|--------|------|
| `tests/tools/test-21-tools.ts` | 21 工具注册 | 已执行 |
| `tests/tools/test-llm-router.ts` | LLM 路由 | 已执行 |
| `tests/tools/test-isolated.ts` | 独立工具 | 已执行 |
| `tests/agent/test-agent-tools.ts` | A类6+B类6+C类2=14项 | 11/14 ✅ |

> **总计**: 约 **170 个单元测试项**已通过，构成集成测试的上层覆盖基础。

---

## Mock vs 真实调用 策略说明

| 测试类型 | 策略 | 理由 | 例子路径 |
|---------|------|------|---------|
| **纯函数逻辑** | 直接调用，不 mock | 确定性输入→输出，不需要外部服务 | 路径1(记忆预算), 15(校验链), 16(别名) |
| **数据管道** | 真实数据 + 真实服务 | 数据清洗/切片/Embedding 需要真实文本验证 | 路径4(切片→Embedding), 9(数据服务降级) |
| **LLM 交互** | 真实 LLM + 模型自动切换 | LLM 的工具选择/路由/反思能力只能用真实 LLM 验证 | 路径8/10/11/12 |
| **数据库** | 真实 DB | 日志持久化需要真实写入验证 | 路径7(记忆检索), 13(日志) |

---

## 集成测试路径

### 路径 1: 记忆上下文组装 → Agent 系统提示注入

**模块A**: `agents/memory.ts` — `calculateTokenBudget()`, `formatUserProfileForPrompt()`
**模块B**: `agents/orchestrator.ts` — 接收 AssembledContext

> 纯函数逻辑（数学计算+字符串格式化），直接调用即可。

| # | 用例 | 输入 | 预期输出 |
|---|------|------|---------|
| I1.1 | 正确分配四层记忆 Token 预算 | calculateTokenBudget(32768) | L1≈30%, L2≈25%, L3≈25%, L4≈10%, Buffer≈10% |
| I1.2 | 全新用户无记忆返回空 | assembleContext("new-user", "你好") | L2=空, L3=空, L4=空 |
| I1.3 | 画像存在但摘要为空 | formatUserProfileForPrompt(profile) | 含 "[用户画像]" |
| I1.4 | 4K模型 Token 预算 L3 裁剪 | calculateTokenBudget(4096) | L3Budget < 500 |
| I1.5 | 画像格式化含风险偏好映射 | conservative/moderate/aggressive | "保守型"/"稳健型"/"激进型" |
| I1.6 | 常用股票最多 5 只 | 用户关注 6 只股票 | 前5只出现，第6只不出现 |

> ✅ 已实现: `tests/integration/path01-memory-agent.test.ts`

---

### 路径 2: Skill 执行 → Agent 回退

**模块A**: `agents/skills/enhanced-orchestrator.ts`
**模块B**: `agents/skills/enhanced-registry.ts`
**模块C**: `agents/orchestrator.ts`

| # | 用例 | 输入 | LLM |
|---|------|------|-----|
| I2.1 | technical-analysis 正常执行 | executeEnhancedSkill("technical-analysis", {code:"000858"}) | 不需要 |
| I2.2 | 工具未注册返回失败 | executeEnhancedSkill("nonexistent-skill") | 不需要 |
| I2.3 | Agent 调用不存在 Skill → ReAct 回退 | Agent query="不存在的skill" | ✅ 真实LLM |
| I2.4 | 并行步骤执行时间 < 顺序之和 | 含 parallel:true 的 Skill | 不需要 |
| I2.5 | stock-comparison 多股票对比 | 对比 五粮液 vs 格力电器 | 不需要 |
| I2.6 | valuation-analysis 估值分析 | 估值分析 Skill (000858) | 不需要 |
| I2.7 | fundamental-analysis 基本面分析 | 4 步串行 | 不需要 |
| I2.8 | debt-solvency-analysis 偿债分析 | 偿债分析 Skill (000066 中国长城) | 不需要 |

---

### 路径 3: 工具注册 → Agent 动态路由

**模块A**: `tools/registry.ts`
**模块B**: `routing/tool-group-manager.ts`
**模块C**: `routing/group-router.ts`
**模块D**: `agents/routing/router-facade.ts`

| # | 用例 | 输入 | LLM |
|---|------|------|-----|
| I3.1 | 技术分析 query→正确组 | query="帮我计算RSI" | 不需要 |
| I3.2 | 风控 query→风险组 | query="检查持仓限制" | 不需要 |
| I3.3 | 无匹配→full_fallback | query="今天天气" | 不需要 |
| I3.4 | 空工具→回退全部 | ToolRegistry 为空 | 不需要 |
| I3.5 | 别名 getMA→calculateMA | 使用 getMA 名称 | 不需要 |
| I3.6 | Vector 路由降级→keyword | ToolVectorRetriever 初始化失败 | 不需要 |
| I3.7 | 路由结果传给 Agent 端到端 | query="分析五粮液技术指标" | ✅ 真实LLM |

---

### 路径 4: 文本清洗 → 切片 → Embedding 全链路

**模块A**: `rag/chunking/text-cleaner.ts`
**模块B**: `rag/chunking/semantic-chunker.ts`
**模块C**: `rag/retrieval/dense-retriever.ts`
**模块D**: `rag/retrieval/sparse-retriever.ts` — BM25 索引

> 使用 `data/financial_reports/2025_annual/` 目录下的真实年报 PDF 验证全链路。PDF 已就绪，BM25 索引已从 DB 构建，Dense embedding 已存在。无需重建。

| # | 用例 | 输入 |
|---|------|------|
| I4.1 | 五粮液年报全链路 | `000858_五_粮_液_2025年年度报告.pdf` |
| I4.2 | 中国长城年报全链路 | `000066_中国长城_2025年年度报告.pdf` |
| I4.3 | 格力电器年报全链路 | `000651_格力电器_2025年年度报告.pdf` |
| I4.4 | 全噪声输入→empty | 控制字符+Markdown噪声 |
| I4.5 | 切片边界修正 | 以标点开头的切片 |
| I4.6 | Embedding 截断 | 2000+ chars 文本 |
| I4.7 | 全角数字+零宽→半角 | `"营收１２３亿元"` |

---

### 路径 5: RAG 检索 → Agent 回答

**模块A**: `rag/retrieval/hybrid-retriever.ts`
**模块B**: `agents/orchestrator.ts`

| # | 用例 | 输入 | LLM |
|---|------|------|-----|
| I5.1 | 中国长城 文档检索 | query="中国长城2025年营收" | 不需要 |
| I5.2 | 五粮液 文档检索 | query="五粮液净利润" | 不需要 |
| I5.3 | 无检索结果不崩溃 | query="xyzabc123" | 不需要 |
| I5.4 | 不同公司检索结果隔离 | query="五粮液" | 不需要 |
| I5.5 | Agent 基于检索结果回答 | query="中国长城2025年营收多少" | ✅ 真实LLM |
| I5.6 | Agent 检索为空时告知 | query="不存在公司年报" | ✅ 真实LLM |

---

### 路径 6: 配置 → LLM 路由降级

**模块A**: `config/llm-config.ts`
**模块B**: LLM Router

| # | 用例 | LLM |
|---|------|-----|
| I6.1 | 正常加载 api_keys.yaml | 不需要 |
| I6.2 | thinking 为 boolean | 不需要 |
| I6.3 | functionCalling 为 boolean | 不需要 |
| I6.4 | 模型自动切换验证 | ✅ 真实LLM |
| I6.5 | 所有模型额度耗尽 | 不需要 |

---

### 路径 7: L3 记忆 → 向量检索

**模块A**: `agents/memory.ts`
**模块B**: `rag/retrieval/dense-retriever.ts`

| # | 用例 |
|---|------|
| I7.1 | 有 embedding 正常检索 |
| I7.2 | 无 embedding 降级 |
| I7.3 | 表为空 |

---

### 路径 8: 全链路 Agent 端到端 【真实LLM】

**模块A**: `agents/routing/router-facade.ts`
**模块B**: `agents/skills/enhanced-orchestrator.ts`
**模块C**: `agents/enhanced-react-executor.ts`
**模块D**: `agents/execution-facade.ts`

> 最核心的端到端测试。用真实用户 query、真实 LLM、真实数据服务。模型自动切换。

| # | 用户 query（真实行为） | 预期路由 |
|---|----------------------|---------|
| I8.1 | "分析五粮液的技术面，RSI和MACD" | technical-analysis |
| I8.2 | "格力电器2025年的净利润和毛利率" | fundamental-analysis |
| I8.3 | "对比五粮液和格力电器的估值" | stock-comparison |
| I8.4 | "全面诊断中国长城" | comprehensive-diagnosis |
| I8.5 | "你好" | full_fallback |
| I8.6 | "今天北京天气怎么样" | full_fallback, 告知能力限制 |
| I8.7 | "帮我检查五粮液持仓合规" | compliance-check |
| I8.8 | "中国长城2025年年报的核心亮点" | hybridSearch |

---

### 路径 9: 数据服务降级链

**模块A**: `data_service/main.py`
**模块B**: `data_service/providers/baostock_provider.py`
**模块C**: `data_service/providers/efinance_provider.py`

| # | 用例 | 输入 |
|---|------|------|
| I9.1 | baostock 历史K线 五粮液 | sz.000858, 2025-05-29→2026-05-29 |
| I9.2 | baostock 历史K线 中国长城 | sz.000066 |
| I9.3 | baostock 历史K线 格力电器 | sz.000651 |
| I9.4 | efinance 格力→baostock 降级 | code="000651", source="efinance" |
| I9.5 | 实时行情 | code="000858" |
| I9.6 | 利润表数据 | sz.000066, 2025, Q4 |
| I9.7 | 缓存命中 | 第二次请求同一数据 |
| I9.8 | 指数数据 | sh.000001 |
| I9.9 | 财务数据季度回退 | 2026 Q1 → 2025 Q4 |

---

### 路径 10: RouterFacade → Orchestrator 智能路由 【真实LLM】

**模块A**: `agents/routing/router-facade.ts`
**模块B**: `agents/routing/skill-router.ts`
**模块C**: `agents/routing/multi-skill-matcher.ts`
**模块D**: `agents/orchestrator.ts`

> 模拟真实用户 query，验证路由能否正确分发。模型自动切换。

| # | 用户 query（真实行为） | 预期路由 |
|---|----------------------|---------|
| I10.1 | "五粮液的RSI是多少？MACD金叉了吗？" | technical-analysis |
| I10.2 | "我持仓五粮液30%，有没有超限？" | compliance-check |
| I10.3 | "格力电器现在估值合理吗？PE多少？" | valuation-analysis |
| I10.4 | "五粮液和泸州老窖哪个更好？" | stock-comparison |
| I10.5 | "全面分析一下中国长城" | comprehensive-diagnosis |
| I10.6 | "今天A股怎么样？" | full_fallback |
| I10.7 | "对比五粮液和格力，顺便看下风险" | stock-comparison + compliance-check |
| I10.8 | query="" | full_fallback |

---

### 路径 11: ReflectionNode → Orchestrator 迭代控制 【真实LLM】

**模块A**: `agents/reflection-node.ts`
**模块B**: `agents/orchestrator.ts`

> 真实 LLM 判断"答案是否充分"，是否需要继续检索。模型自动切换。

| # | 用例 | 场景 | 预期 |
|---|------|------|------|
| I11.1 | 答案充分 | Agent已调用工具获取数据 | needMore=false |
| I11.2 | 需要更多数据 | 只拿到一年数据 | needMore=true |
| I11.3 | 无数据可获取 | 无相关工具 | needMore=false |
| I11.4 | 首次检索为空 | 检索返回空 | needMore=true |
| I11.5 | 工具调用失败 | 工具返回错误 | needMore=true |
| I11.6 | 迭代上限 | 已调用3轮工具 | needMore=false |

---

### 路径 12: ExecutionFacade → 统一执行入口 【真实LLM】

**模块A**: `agents/execution-facade.ts`
**模块B**: `agents/skills/enhanced-orchestrator.ts`
**模块C**: `agents/enhanced-react-executor.ts`

> 真实 LLM 执行 Skill 和 ReAct 两种模式。模型自动切换。

| # | 用例 | 输入 | 预期 |
|---|------|------|------|
| I12.1 | Skill 模式成功 | routeType="skill", query="分析五粮液技术面" | executionMode="skill" |
| I12.2 | ReAct 模式成功 | routeType="full_fallback", query="五粮液现在多少钱" | executionMode="react" |
| I12.3 | Skill 失败 → 错误传播 | Skill 执行抛出异常 | success=false |
| I12.4 | ReAct 多轮迭代 | query="对比五粮液和格力电器" | 多轮工具调用 |
| I12.5 | Unknown routeType 兜底 | routeType="unknown" | 回退到 ReAct |

---

### 路径 13: AgentLogger → 数据库持久化

**模块A**: `agents/agent-logger.ts`
**模块B**: PostgreSQL

| # | 用例 |
|---|------|
| I13.1 | 成功日志入库 |
| I13.2 | 失败日志入库 |
| I13.3 | LLM 使用记录入库 |
| I13.4 | 日志 API 返回正确 |

---

### 路径 14: ToolDescriptionEnhancer → LLM 工具调用精度

**模块A**: `description/tool-description-enhancer.ts`
**模块B**: `description/fewshot-injector.ts`

> 格式验证：纯逻辑。LLM 调用精度：真实 LLM。

| # | 用例 | LLM |
|---|------|-----|
| I14.1 | 格式验证: whenToUse 非空 | 不需要 |
| I14.2 | few-shot 示例注入 | 不需要 |
| I14.3 | 分组描述生成 | 不需要 |
| I14.4 | LLM 调用精度: "计算五粮液MA20" → calculateMA | ✅ 真实LLM |
| I14.5 | LLM 避免混淆: "获取五粮液PE" → getStockRealtime | ✅ 真实LLM |

> ✅ 纯逻辑部分已实现: `tests/integration/path15-description-enhancer.test.ts`

---

### 路径 15: ToolCallValidator/CallLimiter 校验链

**模块A**: `validation/tool-call-validator.ts`
**模块B**: `validation/call-limiter.ts`

> 纯逻辑校验，直接实例化验证。

| # | 用例 |
|---|------|
| I15.1 | 正确参数通过 |
| I15.2 | 不存在工具 |
| I15.3 | 必填参数缺失 |
| I15.4 | 次数限制 |
| I15.5 | 缓存命中 |
| I15.6 | 不同参数不命中 |

> ✅ 已实现: `tests/integration/path16-validation.test.ts`

---

### 路径 16: NameAliases → ToolRegistry 别名解析

**模块A**: `tools/name-aliases.ts`
**模块B**: `tools/registry.ts`

> 纯别名映射逻辑。

| # | 用例 |
|---|------|
| I16.1 | getMA → calculateMA |
| I16.2 | getMACD → calculateMACD |
| I16.3 | getFinancialData → getStockFinancial |
| I16.4 | 已知工具名直接返回 |
| I16.5 | 别名目标不存在 |
| I16.6 | 未知名称 |

> ✅ 已实现: `tests/integration/path17-name-aliases.test.ts`

---

## 回归测试

| # | 检查项 | 验证方法 |
|---|--------|---------|
| R1 | 配置加载: 所有 api_keys.yaml 中配置的模型加载成功 | 加载 api_keys.yaml，动态读取模型数量 |
| R2 | DB 连接: 关键表存在 | SELECT 查询 |
| R3 | RAG 冒烟: 中国长城 ≥5 条 | hybridSearch |
| R4 | Agent 冒烟: 非空回答 | 真实LLM |
| R5 | 记忆冒烟: assembleContext 有效 | assembleContext |
| R6 | 数据服务: baostock 五粮液 ≥200 条 | POST /api/market/history |
| R7 | 模型切换: 所有 api_keys.yaml 中配置的模型逐个可用 | 动态读取全部模型，逐个调用 |

---

## 变异测试

| 目标模块 | 函数 | 存活率目标 |
|---------|------|-----------|
| `agents/memory.ts` | `calculateTokenBudget` | ≥60% |
| `agents/memory.ts` | `formatUserProfileForPrompt` | ≥60% |
| `agents/memory.ts` | `assembleContext` | ≥60% |
| `rag/chunking/text-cleaner.ts` | `cleanText` | ≥60% |
| `rag/chunking/text-cleaner.ts` | `fixChunkBoundaries` | ≥60% |
| `agents/skills/executor.ts` | `executeSkill` | ≥60% |
| `agents/skills/enhanced-orchestrator.ts` | `executeEnhancedSkill` | ≥60% |
| `tools/registry.ts` | `ToolRegistry` | ≥60% |
| `config/llm-config.ts` | `resolveEnvVars` | ≥60% |

---

## 测试执行计划

```
# 纯逻辑测试（毫秒级，不需要服务）
npx vitest run tests/integration/path01-memory-agent.test.ts
npx vitest run tests/integration/path16-validation.test.ts
npx vitest run tests/integration/path17-name-aliases.test.ts
npx vitest run tests/integration/path15-description-enhancer.test.ts

# 真实LLM测试（需要 Agent 服务运行，模型自动切换）
npx vitest run tests/integration/path08-end-to-end.test.ts
npx vitest run tests/integration/path10-router-orchestrator.test.ts
npx vitest run tests/integration/path11-reflection-real.test.ts
npx vitest run tests/integration/path12-execution-facade.test.ts

# 数据管道测试（需要 Data Service + 年报已上传）
npx vitest run tests/integration/path04-chunking-embedding.test.ts
npx vitest run tests/integration/path09-data-service.test.ts

# 全部
npx vitest run tests/integration/
```

---

## 当前进度

| 路径 | 说明 | 类型 | 测试数 | 状态 |
|------|------|------|--------|------|
| 路径 1 | 记忆→Agent | 纯逻辑 | 6 | ✅ 已实现 |
| 路径 2 | Skill→Agent | 混合 | 8 | ⏳ 待实现 |
| 路径 3 | 工具注册→路由 | 混合 | 7 | ⏳ 待实现 |
| 路径 4 | 清洗→切片→Embedding | 真实数据 | 7 | ⏳ 待实现 |
| 路径 5 | RAG→Agent | 混合 | 6 | ⏳ 待实现 |
| 路径 6 | 配置→LLM路由 | 真实配置 | 5 | ⏳ 待实现 |
| 路径 7 | 记忆→向量检索 | 真实DB | 3 | ⏳ 待实现 |
| 路径 8 | 全链路端到端 | **真实LLM** | 8 | ⏳ 待实现 |
| 路径 9 | 数据服务降级 | 真实数据 | 9 | ⏳ 待实现 |
| 路径 10 | RouterFacade→Orchestrator | **真实LLM** | 8 | ⏳ 待实现 |
| 路径 11 | ReflectionNode→迭代控制 | **真实LLM** | 6 | ⏳ 待实现 |
| 路径 12 | ExecutionFacade→执行 | **真实LLM** | 5 | ⏳ 待实现 |
| 路径 13 | AgentLogger→DB | 真实DB | 4 | ⏳ 待实现 |
| 路径 14 | 描述增强→LLM | 混合 | 5 | 部分实现 |
| 路径 15 | 校验链→执行器 | 纯逻辑 | 6 | ✅ 已实现 |
| 路径 16 | 别名→注册表 | 纯逻辑 | 6 | ✅ 已实现 |
| **总计** | | | **94** | **46/94** |