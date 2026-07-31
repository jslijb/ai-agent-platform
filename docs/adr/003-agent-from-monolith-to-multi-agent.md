# ADR-003: Agent 从单体重构为多 Agent 编排 + Skill 技能层

## 状态：已采纳（2026-06）

## 背景

SimpleAgent 采用 21 个工具平铺架构，在复杂金融查询场景下暴露三个核心问题：

1. **工具选择困惑**：21 个工具的描述全部注入 Prompt，LLM 经常选错工具或遗漏工具
2. **幻觉编造数据**：工具返回 `fetch failed` 时，Agent 编造完整数据作为回答
3. **8 轮超时无输出**：Agent 反复调用相同工具不输出答案，最终超时

## 决策

引入「Query → Skill → Tool」三层决策架构，重构为多 Agent 编排 + Skill 技能层。

## 理由

1. **Skill 固化高频任务**：13+ 声明式 Skill 将投研工作流模式固化，减少 LLM 决策负担，Prompt Token 减少 50%+
2. **工具子集动态匹配**：Skill/Tool 双级向量检索，根据 query 语义只注入相关工具子集，避免选择困惑
3. **多 Agent 编排**：Researcher/Quant/Compliance 三个专业 Agent 分工，查询路由精准
4. **反思循环**：`shouldRetrieveAgain()` 判断是否需要再次检索，避免无效迭代

## 后果

### 正面
- 复杂查询迭代轮次从 5 轮降至 2 轮（省 30% Token）
- 工具选择准确率显著提升
- 幻觉率下降（数据真实性校验 + 规则约束）

### 负面
- 架构复杂度增加，调试链路变长
- Skill 定义需要持续维护，新工具需同步更新 Skill 定义
- 多 Agent 编排引入路由误判风险

### 风险缓解
- 统一 ToolRegistry 注册表，消除 SimpleAgent 内联工具和 MCP 硬编码工具的双系统问题
- 重复调用检测（`toolCallHistory` + `duplicateCallCount`），连续 2 轮重复强制输出
- 数据真实性原则（规则 15），工具结果成功性检查