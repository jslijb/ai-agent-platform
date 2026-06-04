# 跨模块集成测试 — 检查清单

**版本**: 4.1 | **日期**: 2026-06-01
**数据来源**: 五粮液/中国长城/格力电器 2025年报 + 2026Q1 + 交易数据（data_service）
**BM25 索引**: ✅ 已从 DB 建立，无需重建
**交易数据**: ✅ 全部从 data_service 接口获取

---

## 路径 1: 记忆上下文组装 → Agent 系统提示注入 (纯逻辑)

| # | 用例 | 状态 |
|---|------|------|
| I1.1 | 正确分配四层记忆 Token 预算 | ✅ |
| I1.2 | 全新用户无记忆返回空 | ✅ |
| I1.3 | 画像存在但摘要为空 | ✅ |
| I1.4 | 4K模型 Token 预算 L3 裁剪 | ✅ |
| I1.5 | 画像格式化含风险偏好映射 | ✅ |
| I1.6 | 常用股票最多 5 只 | ✅ |

> 文件: `tests/integration/path01-memory-agent.test.ts` — **6/6 ✅**

---

## 路径 2: Skill 执行 → Agent 回退 (混合)

| # | 用例 | LLM | 状态 |
|---|------|-----|------|
| I2.1 | technical-analysis 正常执行 | 不需要 | ⏳ |
| I2.2 | 工具未注册返回失败 | 不需要 | ⏳ |
| I2.3 | Agent 调用不存在 Skill → ReAct 回退 | 真实LLM | ⏳ |
| I2.4 | 并行步骤执行时间 < 顺序之和 | 不需要 | ⏳ |
| I2.5 | stock-comparison 多股票对比 | 不需要 | ⏳ |
| I2.6 | valuation-analysis 估值分析 | 不需要 | ⏳ |
| I2.7 | fundamental-analysis 基本面分析 | 不需要 | ⏳ |
| I2.8 | debt-solvency-analysis 偿债分析 | 不需要 | ⏳ |

> 进度: **0/8**

---

## 路径 3: 工具注册 → Agent 动态路由 (混合)

| # | 用例 | LLM | 状态 |
|---|------|-----|------|
| I3.1 | 技术分析 query→正确组 | 不需要 | ⏳ |
| I3.2 | 风控 query→风险组 | 不需要 | ⏳ |
| I3.3 | 无匹配→full_fallback | 不需要 | ⏳ |
| I3.4 | 空工具→回退全部 | 不需要 | ⏳ |
| I3.5 | 别名 getMA→calculateMA | 不需要 | ⏳ |
| I3.6 | Vector 路由降级→keyword | 不需要 | ⏳ |
| I3.7 | 路由结果传给 Agent 端到端 | 真实LLM | ⏳ |

> 进度: **0/7**

---

## 路径 4: 文本清洗 → 切片 → Embedding 全链路 (真实数据)

> PDF 已就绪，BM25 索引已从 DB 构建。交易数据从 data_service 获取。

| # | 用例 | 数据来源 | 状态 |
|---|------|---------|------|
| I4.1 | 五粮液年报全链路 | `000858_五_粮_液_2025年年度报告.pdf` | ⏳ |
| I4.2 | 中国长城年报全链路 | `000066_中国长城_2025年年度报告.pdf` | ⏳ |
| I4.3 | 格力电器年报全链路 | `000651_格力电器_2025年年度报告.pdf` | ⏳ |
| I4.4 | 全噪声输入→empty | 构造数据 | ⏳ |
| I4.5 | 切片边界修正 | 真实年报 | ⏳ |
| I4.6 | Embedding 截断 | 2000+ chars | ⏳ |
| I4.7 | 全角数字+零宽→半角 | 构造数据 | ⏳ |

> PDF 索引（BM25）: ✅ 已建立 | 进度: **0/7**

---

## 路径 5: RAG 检索 → Agent 回答 (混合)

| # | 用例 | 数据来源 | LLM | 状态 |
|---|------|---------|-----|------|
| I5.1 | 中国长城 文档检索 | BM25 索引 | 不需要 | ⏳ |
| I5.2 | 五粮液 文档检索 | BM25 索引 | 不需要 | ⏳ |
| I5.3 | 无检索结果不崩溃 | — | 不需要 | ⏳ |
| I5.4 | 不同公司检索结果隔离 | BM25 索引 | 不需要 | ⏳ |
| I5.5 | Agent 基于检索结果回答 | BM25 索引 | 真实LLM | ⏳ |
| I5.6 | Agent 检索为空时告知 | — | 真实LLM | ⏳ |

> 进度: **0/6**

---

## 路径 6: 配置 → LLM 路由降级 (真实配置)

| # | 用例 | LLM | 状态 |
|---|------|-----|------|
| I6.1 | 正常加载 api_keys.yaml（动态模型数） | 不需要 | ⏳ |
| I6.2 | thinking 为 boolean | 不需要 | ⏳ |
| I6.3 | functionCalling 为 boolean | 不需要 | ⏳ |
| I6.4 | 模型自动切换验证 | 真实LLM | ⏳ |
| I6.5 | 所有模型额度耗尽 | 不需要 | ⏳ |

> 进度: **0/5**

---

## 路径 7: L3 记忆 → 向量检索 (真实DB)

| # | 用例 | 状态 |
|---|------|------|
| I7.1 | 有 embedding 正常检索 | ⏳ |
| I7.2 | 无 embedding 降级 | ⏳ |
| I7.3 | 表为空 | ⏳ |

> 进度: **0/3**

---

## 路径 8: 全链路 Agent 端到端 (真实LLM)

> 模型自动切换，动态读取 api_keys.yaml 全部模型

| # | 用户 query | 预期路由 | 状态 |
|---|-----------|---------|------|
| I8.1 | "分析五粮液的技术面，RSI和MACD" | technical-analysis | ⏳ |
| I8.2 | "格力电器2025年的净利润和毛利率" | fundamental-analysis | ⏳ |
| I8.3 | "对比五粮液和格力电器的估值" | stock-comparison | ⏳ |
| I8.4 | "全面诊断中国长城" | comprehensive-diagnosis | ⏳ |
| I8.5 | "你好" | full_fallback | ⏳ |
| I8.6 | "今天北京天气怎么样" | full_fallback | ⏳ |
| I8.7 | "帮我检查五粮液持仓合规" | compliance-check | ⏳ |
| I8.8 | "中国长城2025年年报的核心亮点" | hybridSearch | ⏳ |

> 数据来源: data_service (交易) + BM25 索引 (年报) | 进度: **0/8**

---

## 路径 9: 数据服务降级链 (真实数据)

> 全部数据从 data_service (port 8001) 获取

| # | 用例 | 输入 | 状态 |
|---|------|------|------|
| I9.1 | baostock 历史K线 五粮液 | sz.000858, 2025-05-29→2026-05-29 | ⏳ |
| I9.2 | baostock 历史K线 中国长城 | sz.000066 | ⏳ |
| I9.3 | baostock 历史K线 格力电器 | sz.000651 | ⏳ |
| I9.4 | efinance 格力→baostock 降级 | code="000651", source="efinance" | ⏳ |
| I9.5 | 实时行情 | code="000858" | ⏳ |
| I9.6 | 利润表数据 | sz.000066, 2025, Q4 | ⏳ |
| I9.7 | 缓存命中 | 第二次请求同一数据 | ⏳ |
| I9.8 | 指数数据 | sh.000001 | ⏳ |
| I9.9 | 财务数据季度回退 | 2026 Q1 → 2025 Q4 | ⏳ |

> 进度: **0/9**

---

## 路径 10: RouterFacade → Orchestrator 智能路由 (真实LLM)

> 模型自动切换，动态读取 api_keys.yaml 全部模型

| # | 用户 query | 预期路由 | 状态 |
|---|-----------|---------|------|
| I10.1 | "五粮液的RSI是多少？MACD金叉了吗？" | technical-analysis | ⏳ |
| I10.2 | "我持仓五粮液30%，有没有超限？" | compliance-check | ⏳ |
| I10.3 | "格力电器现在估值合理吗？PE多少？" | valuation-analysis | ⏳ |
| I10.4 | "五粮液和泸州老窖哪个更好？" | stock-comparison | ⏳ |
| I10.5 | "全面分析一下中国长城" | comprehensive-diagnosis | ⏳ |
| I10.6 | "今天A股怎么样？" | full_fallback | ⏳ |
| I10.7 | "对比五粮液和格力，顺便看下风险" | stock-comparison + compliance-check | ⏳ |
| I10.8 | query="" | full_fallback | ⏳ |

> 进度: **0/8**

---

## 路径 11: ReflectionNode → Orchestrator 迭代控制 (真实LLM)

> 模型自动切换，动态读取 api_keys.yaml 全部模型

| # | 用例 | 预期 | 状态 |
|---|------|------|------|
| I11.1 | 答案充分 → needMore=false | needMore=false | ⏳ |
| I11.2 | 需要更多数据 → needMore=true | needMore=true | ⏳ |
| I11.3 | 无数据可获取 → needMore=false | needMore=false | ⏳ |
| I11.4 | 首次检索为空 → needMore=true | needMore=true | ⏳ |
| I11.5 | 工具调用失败 → needMore=true | needMore=true | ⏳ |
| I11.6 | 迭代上限 → needMore=false | needMore=false | ⏳ |

> 进度: **0/6**

---

## 路径 12: ExecutionFacade → 统一执行入口 (真实LLM)

> 模型自动切换，动态读取 api_keys.yaml 全部模型

| # | 用例 | 预期 | 状态 |
|---|------|------|------|
| I12.1 | Skill 模式成功 | executionMode="skill" | ⏳ |
| I12.2 | ReAct 模式成功 | executionMode="react" | ⏳ |
| I12.3 | Skill 失败 → 错误传播 | success=false | ⏳ |
| I12.4 | ReAct 多轮迭代 | 多轮工具调用 | ⏳ |
| I12.5 | Unknown routeType 兜底 | 回退到 ReAct | ⏳ |

> 进度: **0/5**

---

## 路径 13: AgentLogger → 数据库持久化 (真实DB)

| # | 用例 | 状态 |
|---|------|------|
| I13.1 | 成功日志入库 | ⏳ |
| I13.2 | 失败日志入库 | ⏳ |
| I13.3 | LLM 使用记录入库 | ⏳ |
| I13.4 | 日志 API 返回正确 | ⏳ |

> 进度: **0/4**

---

## 路径 14: ToolDescriptionEnhancer → LLM 工具调用精度 (混合)

| # | 用例 | LLM | 状态 |
|---|------|-----|------|
| I14.1 | 格式验证: whenToUse 非空 | 不需要 | ✅ |
| I14.2 | few-shot 示例注入 | 不需要 | ✅ |
| I14.3 | 分组描述生成 | 不需要 | ✅ |
| I14.4 | LLM: "计算五粮液MA20" → calculateMA | 真实LLM | ⏳ |
| I14.5 | LLM: "获取五粮液PE" → getStockRealtime | 真实LLM | ⏳ |

> 文件: `tests/integration/path15-description-enhancer.test.ts` — 纯逻辑 3/3 ✅，LLM 2/2 ⏳ | 进度: **3/5**

---

## 路径 15: ToolCallValidator/CallLimiter 校验链 (纯逻辑)

| # | 用例 | 状态 |
|---|------|------|
| I15.1 | 正确参数通过 | ✅ |
| I15.2 | 不存在工具 | ✅ |
| I15.3 | 必填参数缺失 | ✅ |
| I15.4 | 次数限制 | ✅ |
| I15.5 | 缓存命中 | ✅ |
| I15.6 | 不同参数不命中 | ✅ |

> 文件: `tests/integration/path16-validation.test.ts` — **6/6 ✅**

---

## 路径 16: NameAliases → ToolRegistry 别名解析 (纯逻辑)

| # | 用例 | 状态 |
|---|------|------|
| I16.1 | getMA → calculateMA | ✅ |
| I16.2 | getMACD → calculateMACD | ✅ |
| I16.3 | getFinancialData → getStockFinancial | ✅ |
| I16.4 | 已知工具名直接返回 | ✅ |
| I16.5 | 别名目标不存在 | ✅ |
| I16.6 | 未知名称 | ✅ |

> 文件: `tests/integration/path17-name-aliases.test.ts` — **6/6 ✅**

---

## 回归测试

| # | 检查项 | 验证方法 | 状态 |
|---|--------|---------|------|
| R1 | 配置加载: 所有 api_keys.yaml 中模型加载成功 | 动态读取，模型数不确定 | ⏳ |
| R2 | DB 连接: 关键表存在 | SELECT 查询 | ⏳ |
| R3 | RAG 冒烟: 中国长城 ≥5 条 | hybridSearch (BM25 ✅) | ⏳ |
| R4 | Agent 冒烟: 非空回答 | 真实LLM + 模型自动切换 | ⏳ |
| R5 | 记忆冒烟: assembleContext 有效 | assembleContext | ⏳ |
| R6 | 数据服务: baostock 五粮液 ≥200 条 | POST /api/market/history | ⏳ |
| R7 | 模型切换: 所有 api_keys.yaml 中模型逐个可用 | 动态读取全部，逐个调用 | ⏳ |

> 进度: **0/7**

---

## 变异测试

| # | 目标模块 | 函数 | 存活率目标 | 状态 |
|---|---------|------|-----------|------|
| M1 | `agents/memory.ts` | `calculateTokenBudget` | ≥60% | ⏳ |
| M2 | `agents/memory.ts` | `formatUserProfileForPrompt` | ≥60% | ⏳ |
| M3 | `agents/memory.ts` | `assembleContext` | ≥60% | ⏳ |
| M4 | `rag/chunking/text-cleaner.ts` | `cleanText` | ≥60% | ⏳ |
| M5 | `rag/chunking/text-cleaner.ts` | `fixChunkBoundaries` | ≥60% | ⏳ |
| M6 | `agents/skills/executor.ts` | `executeSkill` | ≥60% | ⏳ |
| M7 | `agents/skills/enhanced-orchestrator.ts` | `executeEnhancedSkill` | ≥60% | ⏳ |
| M8 | `tools/registry.ts` | `ToolRegistry` | ≥60% | ⏳ |
| M9 | `config/llm-config.ts` | `resolveEnvVars` | ≥60% | ⏳ |

> 进度: **0/9**

---

## 总体进度

| 类别 | 总数 | 完成 | 进度 |
|------|------|------|------|
| 集成测试 (路径1-16) | 94 | 21 | 22% |
| 回归测试 (R1-R7) | 7 | 0 | 0% |
| 变异测试 (M1-M9) | 9 | 0 | 0% |
| **合计** | **110** | **21** | **19%** |

---

## 数据就绪确认

| 数据项 | 状态 | 来源 |
|--------|------|------|
| 五粮液 2025 年报 PDF | ✅ | `data/financial_reports/2025_annual/000858_五_粮_液_2025年年度报告.pdf` |
| 中国长城 2025 年报 PDF | ✅ | `data/financial_reports/2025_annual/000066_中国长城_2025年年度报告.pdf` |
| 格力电器 2025 年报 PDF | ✅ | `data/financial_reports/2025_annual/000651_格力电器_2025年年度报告.pdf` |
| 2026 Q1 报告 | ✅ | `data/financial_reports/2026_q1/` |
| BM25 索引 (年报全文) | ✅ | 从 DB embeddings 表动态构建，已建立 |
| Dense Embedding | ✅ | 已存在 |
| 交易数据 (K线) | ✅ | data_service (port 8001) |
| 利润表数据 | ✅ | data_service → baostock |
| 实时行情 | ✅ | data_service → efinance |
| 指数数据 | ✅ | data_service |
| api_keys.yaml 模型配置 | ✅ | 动态加载，数量可变 |