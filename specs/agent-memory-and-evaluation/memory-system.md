# Agent 记忆系统增强 Spec

## Why
当前 Agent 的记忆架构存在明显缺陷：只有"短期记忆"（单次会话内最近20条消息/6000 token），没有长期记忆和跨会话记忆。`lastStockData` 模块级缓存在每次请求时被清空，`getRecentMessages` 仅限当前会话，用户换一个会话就丢失所有上下文。需要设计分层记忆架构、权限隔离体系、自适应 token 预算，使 Agent 具备真正的记忆能力。

## 现状分析

### 当前记忆架构

| 记忆类型 | 实现方式 | 持久性 | 范围 | 问题 |
|---------|---------|--------|------|------|
| 短期记忆 | `getRecentMessages()` — 最近20条消息/6000 token | 会话内 | 单会话 | ✅ 基本可用，但无压缩 |
| 长期记忆 | ❌ 不存在 | - | - | 用户偏好、常用股票、风险偏好等无法跨会话保留 |
| 跨会话记忆 | ❌ 不存在 | - | - | 无法引用其他会话的结论或数据 |
| 模块级缓存 | `lastStockData` — 进程内存 | 请求级 | 单次请求 | 每次请求开头 `lastStockData = null` 清空 |

### 关键代码位置
- `src/server/agents/memory.ts` — 会话CRUD + `getRecentMessages()`（短期记忆）
- `src/server/agents/simpleAgent.ts:854` — `lastStockData = null` 每次请求清空
- `src/server/agents/simpleAgent.ts:868` — `getRecentMessages(convId)` 仅取当前会话
- `src/server/llm/cache.ts` — LLM 响应缓存（30分钟TTL，非记忆）
- `src/server/agents/reflection-node.ts` — 反思检索（非记忆，是检索优化）
- `src/server/db/schema.ts` — Conversation/Message 表（按 userId 隔离）

### 上下文管理/压缩
- **有截断**：`MAX_CONTEXT_MESSAGES = 20`，`MAX_CONTEXT_TOKENS = 6000`，`getRecentMessages` 从最新消息倒序取，超限截断
- **无压缩**：没有摘要压缩、滑动窗口摘要、关键信息提取等机制
- **无优先级**：所有消息平等对待，system prompt 和工具结果同等权重

### 权限隔离
- **会话级隔离**：Conversation 表有 `userId` 字段，`listConversations` 按 userId 过滤
- **文档级隔离**：Document 表有 `userId` 字段
- **错题本隔离**：WrongAnswer 表有 `userId` 字段
- **❌ 无长期记忆隔离**：因为长期记忆不存在

## What Changes
- 设计四层分层记忆架构（L1原始消息 / L2滚动摘要 / L3历史检索 / L4用户画像）
- 设计长期记忆（用户画像）和会话记忆（跨会话检索）的数据模型
- 设计三级权限隔离体系（个人 / 团队 / 企业）
- 设计自适应 token 预算机制
- 替换现有的简单截断为分层记忆组装

## Impact
- Affected specs: Agent 记忆架构、simpleAgent.ts、memory.ts
- Affected code: `src/server/agents/memory.ts`、`src/server/agents/simpleAgent.ts`、`src/server/db/schema.ts`
- 新增数据表: `MemoryProfile`、`MemorySummary`、`MemoryFragment`、`Team`、`TeamMember`

---

## ADDED Requirements

### Requirement: 四层分层记忆架构

系统 SHALL 实现四层分层记忆，按优先级从高到低组装 LLM 上下文：

#### L1 — 最近 10 条原始消息
- **数据来源**：当前会话的 Message 表，按 `createdAt` ASC 排序取最新 10 条
- **格式**：原始消息，保留完整 role/content
- **用途**：保证对话顺序与即时性，支持代词消解、条件修正等短期场景
- **Token 预算**：由自适应预算分配，约占最新对话区的一部分
- **实现**：复用现有 `getRecentMessages`，将 `MAX_CONTEXT_MESSAGES` 改为 10

#### L2 — 最近 100 条的滚动摘要
- **数据来源**：当前会话的 Message 表，取最近 100 条消息
- **生成方式**：每累积 20 条新消息，触发一次 LLM 摘要生成，将前 20 条压缩为一段摘要文本
- **存储**：摘要存入 `MemorySummary` 表，关联 conversationId
- **格式**：纯文本摘要，包含关键数据点、结论、用户意图
- **用途**：保留近期对话脉络，避免 L1 之外的上下文完全丢失
- **Token 预算**：由自适应预算分配

#### L3 — 从全部历史中检索出的 5 条相关片段
- **数据来源**：用户所有会话的 Message 表 + MemorySummary 表 + MemoryFragment 表
- **检索方式**：基于当前 query 的 embedding 向量检索（复用现有 dense-retriever 的 pgvector 基础设施）
- **数量**：top-5 相关片段
- **格式**：`[会话标题 | 日期] 摘要/原文片段`
- **用途**：跨会话记忆，引用历史结论、延续分析、数据对比
- **Token 预算**：由自适应预算分配

#### L4 — 永久用户画像（长期记忆）
- **数据来源**：`MemoryProfile` 表，按 userId 隔离
- **内容**：用户偏好、常用股票、风险偏好、投资风格、交互习惯等
- **更新方式**：
  - 显式更新：用户直接表达偏好（如"我关注白酒板块"）
  - 隐式更新：Agent 从对话中提取偏好（如用户频繁查询某只股票，自动记入常用股票）
- **格式**：结构化 JSON，包含 `preferences`、`frequentStocks`、`riskProfile`、`investmentStyle` 等字段
- **用途**：个性化回答，跨会话一致性
- **Token 预算**：固定约 500 token，始终注入 system prompt 末尾

---

### Requirement: 自适应 Token 预算

系统 SHALL 根据当前模型的最大上下文窗口动态调整各层记忆的 token 分配。**每次请求都可能使用不同模型，预算在运行时实时计算，不依赖任何硬编码值。**

#### 预算计算规则
- **模型窗口检测**：从 ModelManager 获取当前请求所用模型的 `maxTokens` 参数
- **输出预留**：始终预留 25% 窗口给输出
- **输入预算**：`inputBudget = modelMaxTokens * 0.75`
- **固定开销扣除**：`inputBudget -= systemPromptTokens + L4CoreTokens`（约 1k-2k）
- **剩余预算按比例分配**：

| 层级 | 分配比例 | 说明 |
|------|---------|------|
| L1 最新对话 | 剩余预算的 30% | 保证即时性，不可裁剪 |
| L2 滚动摘要 | 剩余预算的 25% | 保留脉络 |
| L3 历史检索 | 剩余预算的 25% | 跨会话关联 |
| L4 用户画像（动态部分） | 剩余预算的 10% | 偏好详情、常用股票等 |
| 缓冲区 | 剩余预算的 10% | 工具输出、本轮对话膨胀、安全余量 |

#### 模型切换时的自适应行为

当用户在对话中切换模型（如从 32k 模型切换到 256k 模型），系统 SHALL 在**下一次请求**时自动重新计算预算：

1. **读取新模型的 maxTokens** → 重新计算 inputBudget
2. **各层预算自动按比例伸缩** — 无需任何配置变更
3. **已有记忆数据不丢失** — 只是注入上下文的数量/长度动态调整
4. **小窗口模型**：L3 检索条数自动减少（top-5 → top-2），L2 摘要截断
5. **大窗口模型**：L3 检索条数自动增加，L2 可注入完整摘要，L4 动态部分展开

#### 示例分配对比

| 层级 | 32k 模型 | 128k 模型 | 256k 模型 | 1M 模型 |
|------|---------|----------|----------|---------|
| 输入预算 | 24k | 96k | 192k | 768k |
| System+L4固定 | ~1.5k | ~1.5k | ~1.5k | ~1.5k |
| L1 最新对话 | 24k×0.30 ≈ 7k | 96k×0.30 ≈ 29k | 192k×0.30 ≈ 58k | 768k×0.30 ≈ 230k |
| L2 滚动摘要 | 24k×0.25 ≈ 6k | 96k×0.25 ≈ 24k | 192k×0.25 ≈ 48k | 768k×0.25 ≈ 192k |
| L3 历史检索 | 24k×0.25 ≈ 6k (top-3) | 96k×0.25 ≈ 24k (top-5) | 192k×0.25 ≈ 48k (top-10) | 768k×0.25 ≈ 192k (top-20) |
| L4 动态画像 | 24k×0.10 ≈ 2.4k | 96k×0.10 ≈ 10k | 192k×0.10 ≈ 19k | 768k×0.10 ≈ 77k |
| 缓冲区 | 24k×0.10 ≈ 2.4k | 96k×0.10 ≈ 10k | 192k×0.10 ≈ 19k | 768k×0.10 ≈ 77k |

**关键洞察**：模型窗口越大，L3 历史检索的条数和 L2 摘要的完整度越高，Agent 的"记忆深度"越强。小窗口模型只保留最核心的少量片段，大窗口模型可以注入大量历史上下文。

#### 降级策略
- **预算不足时**：按 L3 → L2 → L4动态 → L1 顺序缩减
- **L1 不可缩减**：L1 最新 10 条消息是最低保障，不可裁剪
- **L4 固定部分不可缩减**：用户画像核心字段始终注入
- **L3 自适应条数**：`actualTopK = Math.max(1, Math.floor(l3Budget / avgFragmentTokens))`，预算只够1条就只检索1条

---

### Requirement: 长期记忆（L4 用户画像）

系统 SHALL 实现长期记忆，持久化存储用户画像，支持跨会话保留：

#### 数据模型：MemoryProfile 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | UUID |
| userId | text FK → User.id | 用户ID，权限隔离键 |
| scope | text | 权限范围：`personal` / `team` / `enterprise` |
| teamId | text FK → Team.id (nullable) | 团队ID，scope=team 时必填 |
| preferences | jsonb | 用户偏好（板块偏好、信息风格等） |
| frequentStocks | jsonb | 常用股票列表 [{code, name, queryCount, lastQueriedAt}] |
| riskProfile | text | 风险偏好：conservative / moderate / aggressive |
| investmentStyle | text | 投资风格：value / growth / momentum / balanced |
| customNotes | jsonb | 自定义备注 [{key, value, updatedAt}] |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

#### 显式更新场景
- 用户直接表达偏好："我主要关注白酒板块" → 更新 `preferences.sectorFocus`
- 用户声明风险偏好："我是保守型投资者" → 更新 `riskProfile = "conservative"`
- 用户修正偏好："不对，我现在更关注科技股了" → 覆盖 `preferences.sectorFocus`

#### 隐式更新场景
- 用户频繁查询某只股票（同一股票查询 ≥3 次）→ 自动加入 `frequentStocks`
- 用户多次使用同一工具组合 → 记录到 `customNotes` 中的 `preferredToolPatterns`
- 用户纠正 Agent 回答（错题本）→ 更新 `customNotes` 中的 `learnedCorrections`

#### 注入方式
- L4 用户画像始终注入 system prompt 末尾，格式：
```
[用户画像]
- 关注板块：白酒、消费
- 风险偏好：保守型
- 投资风格：价值投资
- 常用股票：招商银行(查询12次)、五粮液(查询8次)
- 注意事项：避免推荐高风险衍生品
```

---

### Requirement: 会话记忆（L2 滚动摘要 + L3 历史检索）

系统 SHALL 实现会话记忆，支持跨会话引用历史结论和数据：

#### 数据模型：MemorySummary 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | UUID |
| conversationId | text FK → Conversation.id | 关联会话 |
| userId | text FK → User.id | 用户ID，权限隔离键 |
| messageRangeStart | integer | 摘要覆盖的起始消息序号 |
| messageRangeEnd | integer | 摘要覆盖的结束消息序号 |
| summary | text | LLM 生成的摘要文本 |
| keyPoints | jsonb | 关键数据点 [{topic, data, conclusion}] |
| tokenCount | integer | 摘要 token 数 |
| createdAt | timestamp | 创建时间 |

#### 数据模型：MemoryFragment 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | UUID |
| userId | text FK → User.id | 用户ID，权限隔离键 |
| scope | text | 权限范围：`personal` / `team` / `enterprise` |
| teamId | text FK → Team.id (nullable) | 团队ID |
| sourceConversationId | text | 来源会话ID |
| sourceType | text | 来源类型：`conclusion` / `data_point` / `tool_pattern` / `correction` |
| content | text | 片段内容 |
| embedding | vector(1024) | 内容向量，用于语义检索 |
| metadata | jsonb | 元数据（股票代码、日期、工具名等） |
| createdAt | timestamp | 创建时间 |

#### 滚动摘要生成流程
1. 每次 `addMessage` 后检查当前会话未摘要的消息数
2. 未摘要消息 ≥ 20 条时，触发摘要生成
3. 调用 LLM 对这 20 条消息生成摘要，提取关键数据点
4. 将摘要存入 `MemorySummary` 表
5. 从摘要中提取重要结论/数据点，存入 `MemoryFragment` 表（含 embedding）

#### L3 历史检索流程
1. 对当前用户 query 生成 embedding
2. 在 `MemoryFragment` 表中按 `userId` 过滤 + 向量相似度检索 top-5
3. 按 scope 权限过滤（个人级仅自己，团队级包含团队成员数据，企业级包含全员数据）
4. 格式化为 `[来源会话 | 日期] 内容` 注入上下文

---

### Requirement: 三级权限隔离

系统 SHALL 对记忆数据实施三级权限隔离：

#### 权限层级定义

| 层级 | 读取权限 | 写入权限 | 适用数据 |
|------|---------|---------|---------|
| **个人级 (personal)** | 仅本人 | 仅本人 | 用户偏好、风险偏好、常用股票、个人笔记 |
| **团队级 (team)** | 团队成员 | 团队长 | 团队共享结论、团队工具模式、团队偏好 |
| **企业级 (enterprise)** | 全员 | 管理员 | 行业知识、通用投资策略、合规规则 |

#### 数据模型：Team 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | UUID |
| name | text | 团队名称 |
| leaderId | text FK → User.id | 团队长用户ID |
| description | text | 团队描述 |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

#### 数据模型：TeamMember 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | UUID |
| teamId | text FK → Team.id | 团队ID |
| userId | text FK → User.id | 用户ID |
| role | text | 角色：`leader` / `member` |
| joinedAt | timestamp | 加入时间 |

#### 权限检查规则
- **个人级记忆**：查询时 `WHERE userId = currentUserId`
- **团队级记忆**：查询时 `WHERE scope = 'team' AND teamId IN (用户所属团队列表)`
- **企业级记忆**：查询时 `WHERE scope = 'enterprise'`
- **写入团队记忆**：仅 `role = 'leader'` 的团队成员可写入
- **写入企业记忆**：仅 `role = 'admin'` 的用户可写入

#### 记忆可见性组装顺序
1. 先加载个人级记忆（L4 用户画像）
2. 再加载团队级记忆（团队共享结论、偏好）
3. 最后加载企业级记忆（行业知识、通用策略）
4. 冲突时优先级：个人 > 团队 > 企业

---

### Requirement: 记忆重合场景

系统 SHALL 支持多种记忆类型同时生效的场景：

#### Scenario: 重合1 - 短期+长期（偏好+上下文）
- **WHEN** 用户在会话A中说"我关注白酒板块"（长期），在会话B中问"帮我分析一下这个板块的龙头"（短期上下文指白酒）
- **THEN** Agent 应同时使用 L4 用户画像（白酒偏好）和 L1 最新对话（当前上下文）

#### Scenario: 重合2 - 短期+跨会话（上下文+历史结论）
- **WHEN** 用户在会话A中得出"五粮液ROE下降"的结论，在会话B中先问"五粮液最新ROE"，再问"和上次比趋势如何"
- **THEN** Agent 应同时使用 L3 历史检索（上次ROE结论）和 L1 最新对话（当前ROE数据）

#### Scenario: 重合3 - 长期+跨会话（偏好+历史数据）
- **WHEN** 用户在会话A中说"我是价值投资者"，在会话B中问"上次分析的五粮液适合我吗"
- **THEN** Agent 应同时使用 L4 用户画像（价值投资偏好）和 L3 历史检索（上次五粮液分析）

#### Scenario: 重合4 - 三种记忆重合
- **WHEN** 用户在会话A中说"我关注白酒板块，偏好价值投资"，在会话B中先问"五粮液最新财报"，再问"结合我的偏好和上次分析，现在适合买入吗"
- **THEN** Agent 应同时使用 L4 用户画像（偏好）、L3 历史检索（上次分析）、L1 最新对话（当前财报数据）

#### Scenario: 重合5 - 短期+长期（修正偏好）
- **WHEN** 用户在会话A中说"我关注白酒板块"，在会话B中说"不对，我现在更关注科技股了"，再问"推荐几只股票"
- **THEN** Agent 应更新 L4 用户画像（偏好从白酒改为科技），L1 最新对话记住修正

---

### Requirement: 上下文组装流程

系统 SHALL 按以下流程组装 LLM 上下文：

```
1. 获取当前模型 maxTokens → 计算自适应 token 预算
2. 加载 L4 用户画像（固定注入 system prompt 末尾）
3. 加载 L1 最近 10 条原始消息（当前会话）
4. 加载 L2 滚动摘要（当前会话，最近 100 条消息的摘要）
5. 加载 L3 历史检索片段（跨会话，top-5 相关片段）
6. 按预算裁剪：
   - L1 不可裁剪（最低保障）
   - L2 超预算时截断摘要
   - L3 超预算时减少检索条数
   - L4 动态部分超预算时精简
7. 组装最终上下文：
   system_prompt + L4_画像 + L3_检索 + L2_摘要 + L1_最新对话 + 当前用户消息
```

---

### Requirement: 错误处理原则

系统 SHALL 遵循以下错误处理原则——**修复根本原因，不隐藏错误**：

#### 原则1：错误必须可见
- 任何步骤失败时，必须记录完整的错误信息和堆栈
- 日志中必须包含：失败步骤名称、错误类型、错误消息、可能的修复建议
- 禁止将错误静默吞掉后标记为"成功"

#### 原则2：修复根本原因
- 当某个步骤报错时，必须分析根本原因并修复，而不是绕过
- 示例：nodejieba webpack 不兼容 → 根本原因是 C++ 原生模块无法被 webpack 编译 → 修复方案是子进程隔离，而不是跳过 BM25 步骤
- 示例：Neo4j 连接失败 → 根本原因是服务未启动 → 修复方案是启动前检查可用性并给出明确提示，而不是吞掉错误

#### 原则3：状态准确反映实际结果
- `completed` 表示所有步骤都成功完成
- `failed` 表示某个步骤失败，错误消息必须说明哪个步骤失败及原因
- 禁止出现"数据都在但状态是失败"或"步骤失败了但状态是成功"的情况

#### 原则4：依赖服务不可用时的处理
- 当可选依赖服务（如 Neo4j）不可用时：
  - 在步骤开始前检查依赖可用性
  - 不可用时输出明确的警告日志，说明跳过原因和修复方法
  - 这是"已知的服务不可用"，不是"未知的错误"
  - 与"服务可用但执行报错"是不同的情况，后者应标记为 failed

#### 原则5：每个步骤的错误必须可追溯
- 每个步骤的日志必须包含步骤编号和名称
- 失败时必须输出：步骤名、错误类型、根因分析、修复建议

---

### Requirement: 文档知识图谱前端预览

系统 SHALL 在文档管理页面提供知识图谱可视化预览功能，让用户直观查看文档提取的实体和关系。

#### 后端 API：获取文档知识图谱数据

新增 API `GET /api/document/graph/[documentId]`：

**请求**：
- `documentId`：文档ID（路径参数）

**响应**：
```json
{
  "success": true,
  "documentId": "xxx",
  "neo4jAvailable": true,
  "nodes": [
    { "id": "格力电器", "label": "格力电器", "type": "Entity" }
  ],
  "edges": [
    { "source": "格力电器", "target": "空调", "relation": "主营产品", "sourceDocId": "xxx" }
  ],
  "stats": {
    "nodeCount": 42,
    "edgeCount": 38,
    "topEntities": [
      { "name": "格力电器", "degree": 15 },
      { "name": "空调", "degree": 8 }
    ]
  }
}
```

**Neo4j 不可用时**：
```json
{
  "success": true,
  "documentId": "xxx",
  "neo4jAvailable": false,
  "nodes": [],
  "edges": [],
  "message": "Neo4j 服务未启动，知识图谱数据不可用。请启动 Neo4j 后重新上传文档。"
}
```

**Cypher 查询逻辑**：
```cypher
// 获取文档的所有关系
MATCH (h:Entity)-[r:RELATION {sourceDocId: $docId}]->(t:Entity)
RETURN h.name AS head, t.name AS tail, r.type AS relation

// 获取实体度数统计
MATCH (e:Entity)-[r:RELATION {sourceDocId: $docId}]-()
RETURN e.name AS name, count(r) AS degree
ORDER BY degree DESC LIMIT 20
```

#### 前端组件：知识图谱可视化

**位置**：在文档管理页面的文档预览面板中，新增第四个 tab「🔗 知识图谱」

**预览 Tab 布局**（现有3个 tab 基础上新增）：
```
📄 原文预览 | ✂️ 切片预览 | 🧮 向量库 | 🔗 知识图谱
```

**图谱可视化方案**：使用 `react-force-graph-2d`（基于 d3-force-2d，轻量、无需 WebGL）

**图谱交互功能**：

| 功能 | 说明 |
|------|------|
| 力导向布局 | 节点自动排列，关系紧密的实体聚拢 |
| 节点拖拽 | 鼠标拖拽节点调整位置 |
| 节点高亮 | 悬停节点时高亮该节点的所有直接关系 |
| 关系标签 | 边上显示关系类型文字 |
| 缩放平移 | 鼠标滚轮缩放，拖拽画布平移 |
| 节点大小 | 按度数（连接数）决定节点大小，度数越大节点越大 |
| 节点颜色 | 按实体类型或社区聚类着色 |

**图谱统计面板**（图谱上方）：
```
📊 实体数: 42 | 关系数: 38 | Top实体: 格力电器(15), 空调(8), 营收(6)
```

**Neo4j 不可用时的展示**：
- 显示明确的提示信息：「Neo4j 服务未启动，知识图谱数据不可用」
- 提供修复建议：「请启动 Neo4j 服务后重新上传文档」
- 不显示空白画布，而是显示带图标的空状态提示

**图谱数据加载流程**：
1. 用户点击「🔗 知识图谱」tab
2. 前端调用 `GET /api/document/graph/[documentId]`
3. 后端先调用 `isNeo4jAvailable()` 检查 Neo4j 可用性
4. 可用 → 查询文档的三元组数据 → 返回 nodes/edges
5. 不可用 → 返回 `neo4jAvailable: false` + 提示信息
6. 前端根据响应渲染图谱或显示提示

#### 依赖
- `react-force-graph-2d`：力导向图可视化库（需新增安装）
- Neo4j 服务：图谱数据存储后端
- 现有 `graph-builder.ts` 中的 `isNeo4jAvailable()` 和 Neo4j driver

---

## MODIFIED Requirements

### Requirement: getRecentMessages 函数
原：简单截断（取最近N条消息，超6000 token截断）
改：返回 L1 最近 10 条原始消息，不再做 token 截断（token 预算由上层自适应分配）

### Requirement: runAgent 函数
原：`lastStockData = null` 每次请求清空
改：
- `lastStockData` 改为按 userId 隔离的 Map 缓存，TTL 30分钟
- 调用 `assembleContext(query, userId, conversationId)` 组装分层记忆
- 将 L4 用户画像注入 system prompt

### Requirement: memory.ts
原：仅提供会话CRUD和短期记忆
改：
- 新增 `assembleContext()` — 分层记忆组装入口
- 新增 `generateRollingSummary()` — L2 滚动摘要生成
- 新增 `retrieveHistoryFragments()` — L3 历史检索
- 新增 `getUserProfile()` / `updateUserProfile()` — L4 用户画像读写
- 新增 `checkAndGenerateSummary()` — 消息写入后检查是否需要生成摘要
- 新增 `extractFragmentsFromSummary()` — 从摘要提取 MemoryFragment

### Requirement: addMessage 函数
原：仅写入 Message 表
改：写入后调用 `checkAndGenerateSummary()`，触发 L2 摘要和 L3 片段提取

## REMOVED Requirements
- `MAX_CONTEXT_MESSAGES = 20` 常量（改为 L1 固定 10 条 + 自适应预算）
- `MAX_CONTEXT_TOKENS = 6000` 常量（改为自适应 token 预算）
- `lastStockData = null` 每次请求清空（改为按 userId 隔离的 Map 缓存）
