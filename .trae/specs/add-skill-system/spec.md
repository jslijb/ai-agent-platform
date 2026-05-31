# Skill 技能层 Spec

## Why

当前 Agent 直接从 21 个工具中选择调用，LLM 每轮都要判断调什么、怎么编排，导致工具选择不精准、参数构造不稳定、复杂任务迭代轮次多。同时项目存在两套工具系统（simpleAgent 内联 + MCP Server 注册），各自为政，没有统一调度。引入 Skill 层可以在 Agent 和 Tools 之间建立"技能编排"中间层，将高频任务模式固化为可复用的 Skill，同时统一 MCP 工具注册，实现真正的并行工具执行。

## What Changes

* 新增 Skill 定义框架：每个 Skill 声明式描述工具编排流程（哪些工具、什么顺序、参数如何传递）

* 新增 Skill 注册表：统一管理所有 Skill，供 Agent 查询和调用

* 修改 simpleAgent.ts：Agent 先选 Skill，Skill 内部编排工具调用；无匹配 Skill 时回退到直接工具调用

* 统一工具注册：将 simpleAgent 内联工具和 MCP Server 工具合并为统一工具注册表，消除双系统

* 实现并行工具执行：Skill 内无依赖关系的工具步骤使用 Promise.all 并行执行

* MCP 协议对外暴露 Skill：外部 MCP 客户端可调用 Skill（而不仅是原子工具）

* 新增 4 个预定义 Skill：技术分析、合规检查、风控评估、综合诊断

## Impact

* Affected specs: optimize-agent-rounds（Skill 可进一步减少迭代轮次）、agent-memory-system（Skill 可利用记忆上下文）

* Affected code:

  * `src/server/agents/simpleAgent.ts` — 增加 Skill 选择和调用逻辑

  * `src/server/mcp/server.ts` — 统一工具注册 + Skill 暴露

  * `src/server/mcp/tools/` — 工具实现保持不变，注册方式统一

  * `src/server/agents/skills/` — 新增 Skill 定义目录

  * `src/app/api/mcp/sse/route.ts` — MCP 端点增加 Skill 支持

## ADDED Requirements

### Requirement: Skill 定义框架

系统 SHALL 提供声明式的 Skill 定义框架，每个 Skill 包含：名称、描述、触发条件、工具编排步骤、步骤间参数传递规则。

#### Scenario: Skill 定义结构

* **WHEN** 开发者定义一个"技术分析"Skill

* **THEN** Skill 声明包含：name="技术分析"、description="对股票进行完整技术分析"、steps=\[getStockHistory → calculateMA+calculateRSI(并行) → getStockRealtime]、每步的参数映射规则

#### Scenario: Skill 步骤间参数传递

* **WHEN** Skill 第1步 getStockHistory 返回历史数据

* **THEN** 第2步 calculateMA 可引用第1步的输出作为输入参数（如 `{{steps[0].output}}`）

#### Scenario: Skill 内并行执行

* **WHEN** Skill 定义中多个步骤标记为 parallel=true

* **THEN** 这些步骤使用 Promise.all 并行执行，而非顺序执行

### Requirement: Skill 注册表

系统 SHALL 提供统一的 Skill 注册表，支持注册、查询、列举所有 Skill。

#### Scenario: Agent 查询可用 Skill

* **WHEN** Agent 收到用户请求后查询 Skill 注册表

* **THEN** 返回所有 Skill 的名称和描述，供 LLM 判断是否匹配

#### Scenario: Skill 按意图匹配

* **WHEN** 用户请求"分析招商银行的技术面"

* **THEN** Agent 识别意图匹配"技术分析"Skill，调用该 Skill 执行

### Requirement: Agent 优先选择 Skill

Agent SHALL 优先从 Skill 注册表匹配用户意图，匹配到 Skill 时按 Skill 编排执行工具；无匹配时回退到直接工具调用。

#### Scenario: 匹配到 Skill

* **WHEN** 用户请求匹配到"技术分析"Skill

* **THEN** Agent 调用 Skill，Skill 按预定义流程编排工具调用，Agent 只需1轮即可获得完整结果

#### Scenario: 无匹配 Skill 回退

* **WHEN** 用户请求不匹配任何 Skill（如"帮我查一下贵州茅台的营收"）

* **THEN** Agent 回退到直接工具调用模式，逐轮选择和执行工具

### Requirement: 统一工具注册表

系统 SHALL 将 simpleAgent 内联工具和 MCP Server 工具合并为统一工具注册表，消除双系统。

#### Scenario: 工具统一注册

* **WHEN** 系统启动时

* **THEN** 所有工具（simpleAgent 的21个 + MCP 的6个）统一注册到 ToolRegistry，Skill 和 MCP Server 均从 ToolRegistry 获取工具

#### Scenario: MCP Server 从 ToolRegistry 获取工具

* **WHEN** 外部 MCP 客户端请求 tools/list

* **THEN** 返回 ToolRegistry 中所有工具的列表（而非硬编码的6个）

### Requirement: MCP 协议暴露 Skill

MCP Server SHALL 对外暴露 Skill 列表和 Skill 调用能力，外部 MCP 客户端可直接调用 Skill。

#### Scenario: MCP 客户端列举 Skill

* **WHEN** 外部 MCP 客户端发送 skills/list 请求

* **THEN** 返回所有 Skill 的名称和描述

#### Scenario: MCP 客户端调用 Skill

* **WHEN** 外部 MCP 客户端发送 skills/call 请求，指定 Skill 名称和参数

* **THEN** 执行该 Skill 的编排流程并返回结果

### Requirement: 预定义 Skill

系统 SHALL 提供以下 4 个预定义 Skill：

1. **技术分析**：getStockHistory → [calculateMA + calculateRSI + calculateBollinger](并行) → getStockRealtime → 综合结论
2. **合规检查**：getStockRealtime → checkTradeCompliance + checkPositionLimit + checkRestrictedStock(并行) → 合规报告
3. **风控评估**：getStockHistory → [calculateVaR + calculateMaxDrawdown + calculateVolatility](并行) → checkRiskLimits → 风控报告
4. **综合诊断**：技术分析 + 合规检查 + 风控评估(并行) → 综合诊断报告

#### Scenario: 技术分析 Skill 执行

* **WHEN** 用户请求"分析招商银行技术面"

* **THEN** Skill 自动编排：获取历史数据 → 并行计算 MA/RSI/Bollinger → 获取实时行情 → 输出技术分析结论

#### Scenario: 综合诊断 Skill 执行

* **WHEN** 用户请求"全面分析招商银行"

* **THEN** Skill 自动编排：并行执行技术分析+合规检查+风控评估三个子 Skill → 汇总输出综合诊断报告

## MODIFIED Requirements

### Requirement: simpleAgent 工具调用流程

simpleAgent 的工具调用流程 SHALL 变更为：先匹配 Skill → Skill 编排工具 → 无匹配则直接调用工具。

### Requirement: MCP Server 工具注册

MCP Server SHALL 从统一工具注册表获取工具列表，而非硬编码注册6个工具。

## REMOVED Requirements

### Requirement: simpleAgent 内联工具数组

**Reason**: 工具定义迁移到统一工具注册表，simpleAgent 不再硬编码21个工具
**Migration**: simpleAgent 从 ToolRegistry 获取工具定义，工具 execute 逻辑保留在各自实现文件中

### Requirement: MCP Server 硬编码注册6个工具

**Reason**: 统一工具注册表后，MCP Server 从注册表获取工具
**Migration**: MCP Server 的 registerAllTools() 改为从 ToolRegistry 批量注册

***

## 附录：架构设计

### 当前架构（双系统）

```
用户请求 → simpleAgent (21个内联工具)
用户请求 → MCP Server (6个注册工具) → SSE/HTTP
两者独立，工具重叠，各自为政
```

### 目标架构（统一 + Skill）

```
用户请求 → Agent → Skill注册表 → 匹配Skill?
                        ↓是              ↓否
                   Skill编排工具      直接调用工具
                        ↓
                  统一工具注册表 (ToolRegistry)
                   ↙    ↓    ↘
              量化工具  行情工具  合规工具  风控工具  ...
                        ↓
              MCP Server (对外暴露 Skill + Tool)
```

### Skill 定义示例

```typescript
interface SkillStep {
  tool: string;                    // 工具名称
  params: Record<string, any>;     // 固定参数
  paramRefs?: Record<string, string>; // 引用前步输出的参数，如 "{{steps[0].output.code}}"
  parallel?: boolean;              // 是否可与前一步并行执行
}

interface SkillDefinition {
  name: string;                    // Skill 名称
  description: string;             // Skill 描述（供 LLM 匹配）
  triggerKeywords?: string[];      // 触发关键词（辅助匹配）
  steps: SkillStep[];              // 工具编排步骤
  outputTemplate?: string;         // 输出模板（可选）
}
```

### 并行执行策略

* Skill 步骤中 `parallel=true` 的步骤与前一步并行执行

* 无依赖关系的工具（如 calculateMA 和 calculateRSI）标记为并行

* 有依赖关系的工具（如 getStockHistory → calculateMA）必须顺序执行

* 综合诊断 Skill 中，技术分析/合规检查/风控评估三个子 Skill 并行执行

