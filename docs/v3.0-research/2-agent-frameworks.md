# 调研2：Agent 框架对比与融合可行性

> 调研日期：2026-08-12
> 数据来源：各框架 GitHub README + 官方文档（截至 2026-Q2，网络受限部分基于行业认知）
> 目标：判断 Harness/Hermes/OpenClaw 等新框架能否融入现有 LangGraph+LlamaIndex 架构，**不是堆技术**

---

## 一、先澄清三个框架的真实身份

用户提到"最近 harness、Hermes、openclaw 比较出名"，这三个名字在 AI 圈有多义，先对号入座：

| 名字 | 最可能指 | 类型 | 出名原因 |
|------|---------|------|---------|
| **Harness** | EleutherAI `lm-evaluation-harness` / UK AISI `inspect-ai` | **评估框架** | LLM/Agent 能力评测的事实标准，几乎所有模型榜都基于它 |
| **Hermes** | Nous Research `Hermes-3`（及 Hermes-2-Pro） | **开源模型** | function calling 和 agent 控制能力强，开源 SOTA，常被拿来替代 GPT-4 做 agent |
| **OpenClaw** | 大概率是 **OpenManus**（MetaGPT 团队 2025-03 发布）或 **OpenHands**（原 OpenDevin） | **开源 Agent 框架** | 对标 Manus/Devin 的开源版，最近社区热度极高 |

> ⚠️ **OpenClaw 未能确认**：未找到名为 "OpenClaw" 的主流项目。最接近的是 OpenManus / OpenHands / OpenInterpreter。若用户另有所指，请补充澄清。本报告按"开源通用 Agent 框架"这一类做对比。

**关键判断**：这三者分属不同层（评估/模型/框架），不是同一类东西，不能放在一起比。要分开看"能不能融"。

---

## 二、当前项目用的框架定位

| 框架 | 在项目中的角色 | 替换成本 |
|------|--------------|---------|
| **LangGraph** | Agent 编排核心（状态图 + 多节点 + checkpoint） | 🔴 极高（已深度集成在 orchestrator/simpleAgent/反思节点/R018 错误恢复） |
| **LlamaIndex** | RAG 检索（hybrid search + rerank + 查询改写） | 🟡 中（RAG 管道可替换，但已调优） |
| **自实现 RAGAS** | 评估（CP/CR/F/AR 四指标） | 🟡 中（已对齐生产管线） |

**结论先说**：LangGraph 是编排核心，**不建议替换**；其他层可以"补充"而非"替换"。

---

## 三、分层融合分析（重点）

### 3.1 评估层：Harness / Inspect-AI / promptfoo / DeepEval

| 框架 | 能力 | 能否融 | 融合方式 | 价值 |
|------|------|--------|---------|------|
| **lm-evaluation-harness** | 300+ 标准 benchmark（MMLU/HumanEval/GSM8K） | ✅ 可融 | 作为"通用能力"评估补充，与项目自实现 RAGAS 互补 | 证明模型通用能力不退化 |
| **inspect-ai**（UK AISI） | Agent 评测 + 可解释性 + 对抗测试 | ✅ 可融 | 替代/补充 V13 自实现评估，支持 agent 多步轨迹评测 | 解决"评估可靠性"痛点（improvement-plan 问题4） |
| **promptfoo** | 离线 prompt/agent 回归测试 | ✅ 可融 | 接入 CI，每次改 prompt 跑回归 | 防止 prompt 改动退化 |
| **DeepEval** | RAG 评估（类似 RAGAS） | 🟡 重复 | 项目已有自实现 RAGAS，重复 | 不建议 |

**建议**：引入 **inspect-ai** 做 Agent 轨迹评估（弥补当前只评 RAG 不评 Agent 决策的短板），引入 **lm-evaluation-harness** 做模型通用能力基线。**不替换**自实现 RAGAS（已对齐生产）。

### 3.2 模型层：Hermes-3 / Qwen / DeepSeek / GLM

| 模型 | 能力 | 能否融 | 融合方式 | 价值 |
|------|------|--------|---------|------|
| **Hermes-3**（Nous） | 开源 405B/70B，function calling 强，agent 控制好 | ✅ 可融 | 作为 LLM 降级链一环，或私有化部署 | 降本 + 私有化 + function calling 强 |
| **Qwen3.5** 系列 | 阿里开源，已用 | ✅ 已融 | 当前降级链已在用 | - |
| **DeepSeek-V3** | 开源 SOTA，推理强 | ✅ 可融 | 降级链补充 | 推理类任务质量提升 |
| **GLM-4.5** | 智谱开源 | ✅ 可融 | 降级链补充 | 国产化选项 |

**建议**：Hermes-3 作为**私有化部署选项**纳入降级链（对应 UPGRADE_ROADMAP U17 模型国产化）。不替换主链（AGNES→百炼），作为离线/私有场景备选。**function calling 强**这点对 V3.0 的 Action Agent（OA/CRM 接入）有价值——结构化参数抽取更准。

### 3.3 编排层：OpenManus / OpenHands / CrewAI / AutoGen / Pydantic AI / smolagents

| 框架 | 定位 | 能否融 | 融合方式 | 价值 | 风险 |
|------|------|--------|---------|------|------|
| **OpenManus** | 通用浏览器/代码 agent | 🟡 部分可融 | 借鉴其"思考-执行"循环设计，但不引入代码 | 思路参考 | 不直接集成（定位不同，我们是金融 agent） |
| **OpenHands** | AI 软件工程师 | ❌ 不融 | 定位完全不同（写代码 vs 金融问答） | 无 | - |
| **CrewAI** | 多 agent 角色协作 | 🟡 可参考 | 项目已有 Researcher/Quant/Compliance 多 agent（ADR-003），CrewAI 的角色定义更简洁 | 简化角色定义 | 替换 LangGraph 成本高 |
| **AutoGen**（微软） | 多 agent 对话 | 🟡 可参考 | 同上 | 同上 | 同上 |
| **Pydantic AI** | 类型安全 agent | 🟡 部分可融 | 借鉴其类型安全工具定义（当前工具用 zod） | 工具定义更严谨 | 不替换 LangGraph |
| **smolagents**（HF） | 轻量 code agent | ❌ 不融 | 走代码执行路线，与项目工具调用路线不同 | 无 | 安全风险 |

**关键判断**：
- **LangGraph 已深度集成**（orchestrator + checkpoint + 反思节点 + R018 错误恢复），替换 = 推倒重来，**不值得**。
- 这些框架的**设计思想**可以借鉴（如 CrewAI 的角色声明式定义、Pydantic AI 的类型安全工具），但**不引入框架本身**。
- 用户原话"不是堆技术，炫技术"——**认同**。融合的前提是解决实际问题，不是 README 多几个框架名。

### 3.4 工具层：MCP（Model Context Protocol）

| 标准 | 能力 | 能否融 | 价值 |
|------|------|--------|------|
| **MCP**（Anthropic 提出） | 工具/资源/prompt 的统一协议 | ✅ 已融 | 项目已有 ADR-010 MCP 双轨设计 |

**建议**：V3.0 的 OA/CRM 接入直接走 MCP（把 OA/CRM Connector 做成 MCP Server），与现有架构一致。

---

## 四、融合决策矩阵

| 候选 | 决策 | 理由 |
|------|------|------|
| **inspect-ai**（评估） | ✅ 引入 | 补 Agent 轨迹评估短板，解决评估可靠性痛点 |
| **lm-evaluation-harness** | ✅ 引入 | 做模型通用能力基线，防退化 |
| **promptfoo** | ✅ 引入 CI | prompt 改动回归测试 |
| **Hermes-3**（模型） | ✅ 纳入降级链 | 私有化 + function calling 强，服务 Action Agent |
| **DeepSeek-V3** | ✅ 纳入降级链 | 推理任务备选 |
| **OpenManus** | 🟡 借鉴思路 | 不集成框架，参考其 think-act 循环 |
| **OpenHands** | ❌ 不融 | 定位不同 |
| **CrewAI** | 🟡 借鉴思路 | 不替换 LangGraph，参考角色定义 |
| **AutoGen** | 🟡 借鉴思路 | 同上 |
| **Pydantic AI** | 🟡 借鉴思路 | 工具定义类型安全可借鉴 |
| **smolagents** | ❌ 不融 | code agent 路线，安全风险 |
| **DeepEval** | ❌ 不融 | 与自实现 RAGAS 重复 |

---

## 五、为什么不替换 LangGraph

用户可能问"既然有新框架为什么不换"，回答：

1. **沉没成本**：LangGraph 已深度集成在 6+ 核心模块（orchestrator/simpleAgent/反思节点/R018 checkpoint/R017 compaction/R019 transcript），替换 = 重写这些模块。
2. **能力对等**：LangGraph 的状态图 + checkpoint + 多节点编排，已覆盖项目所需，新框架没有压倒性优势。
3. **风险**：V13-r6 综合 0.9153 是在 LangGraph 上调出来的，换框架 = 重新调参，评估基线会废。
4. **生态**：LangGraph 背后是 LangChain 生态，工具/记忆/可观测最全。
5. **大版本升级原则**：V3.0 应"加法"不是"减法"——新增能力（OA/CRM），不替换已验证的核心。

**唯一考虑替换的场景**：如果要做"代码执行型 agent"（如让 agent 写代码跑分析），smolagents/OpenHands 更合适。但项目定位是金融问答 + 流程提交，不需要。

---

## 六、与 V3.0 的关系

| 融合项 | V3.0 阶段 | 对应需求 |
|--------|----------|---------|
| inspect-ai Agent 评估 | V3.0 评估增强 | R023 |
| lm-eval-harness 通用基线 | V3.0 评估增强 | R024 |
| promptfoo CI 回归 | V3.0 工程化 | R025 |
| Hermes-3 降级链 | V3.0 模型层 | R026 |
| DeepSeek-V3 降级链 | V3.0 模型层 | R026 |
| MCP OA/CRM Connector | V3.0 Action Agent | R022 |

**核心原则**：**能补不换，能借鉴不引入，引入必解决具体问题**。