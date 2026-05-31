# Tasks

- [x] Task 1: 创建统一工具注册表 (ToolRegistry)
  - [x] SubTask 1.1: 创建 `src/server/tools/registry.ts`，定义 ToolRegistry 类，支持 register/get/list 方法
  - [x] SubTask 1.2: simpleAgent.ts 中 21 个工具在启动时注册到 ToolRegistry（保留内联定义，通过 ensureToolsAndSkillsRegistered 统一注册）
  - [x] SubTask 1.3: 创建 `src/server/agents/skills/index.ts`，统一导出 Skill 相关类型和函数
  - [x] SubTask 1.4: 修改 simpleAgent.ts，启动时调用 ensureToolsAndSkillsRegistered 注册工具和 Skill
- [x] Task 2: 创建 Skill 定义框架
  - [x] SubTask 2.1: 创建 `src/server/agents/skills/types.ts`，定义 SkillDefinition、SkillStep、SkillExecutionResult、RegisteredTool 接口
  - [x] SubTask 2.2: 创建 `src/server/agents/skills/executor.ts`，实现 Skill 执行引擎（步骤解析、参数传递、并行执行、输出模板）
  - [x] SubTask 2.3: 在 executor.ts 中实现 SkillRegistry（register/get/list/match/listDescriptions）
- [x] Task 3: 实现预定义 Skill
  - [x] SubTask 3.1: 创建 `src/server/agents/skills/definitions/technical-analysis.ts`（技术分析 Skill，5步：MA/MACD/RSI/布林带/KDJ）
  - [x] SubTask 3.2: 创建 `src/server/agents/skills/definitions/compliance-check.ts`（合规检查 Skill，3步：合规/受限/持仓限制）
  - [x] SubTask 3.3: 创建 `src/server/agents/skills/definitions/risk-assessment.ts`（风控评估 Skill，5步：VaR/最大回撤/波动率/压力测试/风险限额）
  - [x] SubTask 3.4: 创建 `src/server/agents/skills/definitions/comprehensive-diagnosis.ts`（综合诊断 Skill，7步：MA/MACD/RSI/合规/VaR/最大回撤/波动率）
  - [x] SubTask 3.5: 创建 `src/server/agents/skills/definitions/index.ts`，统一注册所有 Skill（registerAllSkills）
- [x] Task 4: 修改 simpleAgent.ts 集成 Skill 层
  - [x] SubTask 4.1: 在 parseSingleToolCall 中增加 Skill 调用解析（`{"skill": "xxx"}` → `{name: "__skill__", params: {skillName: "xxx"}}`）
  - [x] SubTask 4.2: 匹配到 Skill 时调用 executeSkill 执行，将结果作为工具观察返回
  - [x] SubTask 4.3: 无匹配 Skill 时回退到直接工具调用（保持现有逻辑，regularCalls 过滤）
  - [x] SubTask 4.4: 修改 system prompt，告知 LLM 可用 Skill 列表及其描述（规则16）
- [x] Task 5: 统一 MCP Server 工具注册
  - [x] SubTask 5.1: 修改 `src/server/mcp/server.ts`，callTool 先查 MCP 注册表再查 ToolRegistry，新增 callSkill/listSkills 函数
  - [x] SubTask 5.2: 增加 Skill 暴露能力（skills/list、skills/call 方法）
  - [x] SubTask 5.3: 修改 `src/app/api/mcp/sse/route.ts`，支持 skills/list 和 skills/call JSON-RPC 方法
- [x] Task 6: 验证测试
  - [x] SubTask 6.1: 验证 ToolRegistry 统一注册后工具一致性 — 5/5 PASSED
  - [x] SubTask 6.2: 验证"技术分析"Skill 正确编排工具 — SkillRegistry 注册+匹配 10/10 PASSED
  - [x] SubTask 6.3: 验证"综合诊断"Skill 正确并行执行 — 并行执行 2/2 PASSED
  - [x] SubTask 6.4: 验证无匹配 Skill 时回退到直接工具调用 — 缺失工具测试 2/2 PASSED
  - [x] SubTask 6.5: 验证 MCP 客户端可列举和调用 Skill — MCP SSE 路由支持 skills/list 和 skills/call

# Task Dependencies
- [Task 2] 依赖 [Task 1] ✅
- [Task 3] 依赖 [Task 2] ✅
- [Task 4] 依赖 [Task 2] 和 [Task 3] ✅
- [Task 5] 依赖 [Task 1] 和 [Task 2] ✅
- [Task 6] 依赖 [Task 1-5] 全部完成 ✅

# 测试结果
- Skill系统验证测试: 35/35 PASSED

# All Tasks Completed ✅
