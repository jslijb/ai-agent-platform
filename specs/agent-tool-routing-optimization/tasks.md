# Agent工具路由优化 - 编码任务规划

> 基于spec.md需求规格和design.md实现方案，按5阶段实施计划拆分
> 总计：5个阶段，18个任务组，67个子任务，覆盖全部需求

---

## 阶段1（1-2天）：修复Tool名称Bug + ToolRegistry加category分组

> **优先级：最高** | 依赖：无 | 产出：别名映射、增强ToolRegistry、工具分组配置

### 1.1 创建工具名称别名映射

- [ ] 创建 `src/server/tools/name-aliases.ts`，定义 `TOOL_NAME_ALIASES` 常量映射表
  - 映射：`getMA→calculateMA`、`getMACD→calculateMACD`、`getRSI→calculateRSI`、`getBollingerBands→calculateBollinger`、`getKDJ→calculateKDJ`、`getFinancialData→getStockFinancial`
  - 导出 `resolveToolName(name, registry)` 函数：先直接匹配registry，再查别名映射，返回解析后的名称
  - 别名命中时输出 `console.warn` 提示旧名已废弃
- [ ] 验收：所有别名映射覆盖design.md中1.3.18节定义的映射关系；`resolveToolName("getMA", registry)` 返回 `"calculateMA"`

### 1.2 扩展RegisteredTool接口增加category字段

- [ ] 修改 `src/server/agents/skills/types.ts`，在 `RegisteredTool` 接口新增 `category: string` 字段（可选，兼容过渡期）
- [ ] 验收：`RegisteredTool` 接口包含 `name`、`description`、`parameters`、`execute`、`category` 五个字段；现有代码不受影响（category可选）

### 1.3 增强ToolRegistry支持category和别名查找

- [ ] 创建 `src/server/tools/enhanced-registry.ts`，实现 `EnhancedToolRegistryClass`
  - 新增 `nameAliases: Map<string, string>` 存储旧名→新名映射
  - `register(tool)` 方法：支持 `category` 字段注册，兼容无category的工具
  - `registerAlias(oldName, newName)` 方法：注册命名别名
  - `get(name)` 方法：先直接查找，失败后查别名映射再查找
  - `has(name)` 方法：支持别名检查
  - `listByGroup(groupId)` 方法：按分组ID筛选工具列表
  - `getEnhancedDescriptions(toolNames?)` 方法：格式化输出增强描述文本（含category信息）
- [ ] 将 `EnhancedToolRegistry` 导出为单例实例，保持与现有 `ToolRegistry` 接口兼容
- [ ] 验收：`EnhancedToolRegistry.get("getMA")` 等价于 `EnhancedToolRegistry.get("calculateMA")`；`listByGroup("market-data")` 返回行情数据组的10个工具

### 1.4 修复technical-analysis.ts中工具名引用Bug

- [ ] 修改 `src/server/agents/skills/definitions/technical-analysis.ts`，将步骤中的工具名修正
  - `getMA` → `calculateMA`
  - `getMACD` → `calculateMACD`
  - `getRSI` → `calculateRSI`
  - `getBollingerBands` → `calculateBollinger`
  - `getKDJ` → `calculateKDJ`
- [ ] 验收：technical-analysis Skill的所有步骤引用的工具名与ToolRegistry中实际注册名一致

### 1.5 为所有现有工具注册添加category归属

- [ ] 遍历 `src/server/mcp/tools/` 下各工具文件（market_data.ts、quant_analysis.ts、compliance.ts、risk_control.ts、simulated_trade.ts、document_analysis.ts），为每个工具的 `register()` 调用添加 `category` 字段
  - market_data.ts 中工具 → `category: "market-data"`
  - quant_analysis.ts 中工具 → `category: "technical-analysis"`
  - compliance.ts 中工具 → `category: "risk-compliance"`
  - risk_control.ts 中工具 → `category: "risk-compliance"`
  - simulated_trade.ts 中工具 → `category: "paper-trading"`
  - document_analysis.ts 中工具 → `category: "knowledge-documents"`
- [ ] 同步修改 `src/server/tools/registry.ts`，使 `ToolRegistryClass` 兼容category字段（或直接替换为 `EnhancedToolRegistryClass`）
- [ ] 验收：所有49个工具均标注category归属；每个工具仅属于一个分组

### 1.6 创建6组工具分组配置

- [ ] 创建 `src/server/routing/types.ts`，定义分组相关类型
  - `GroupResponsibility` 类型：`"data_acquisition" | "data_analysis" | "mixed"`
  - `ToolGroupConfig` 接口：`groupId`、`groupName`、`groupResponsibility`、`tools`、`description`、`priority`
  - `ValidationResult` 接口：`valid`、`errors`、`warnings`
- [ ] 创建 `src/server/routing/group-configs.ts`，定义 `TOOL_GROUP_CONFIGS` 常量数组
  - 行情数据组（market-data）：10个工具，职责data_acquisition，优先级1
  - 基本面数据组（fundamental-data）：8个工具，职责data_acquisition，优先级2
  - 技术分析组（technical-analysis）：10个工具，职责data_analysis，优先级3
  - 风控合规组（risk-compliance）：8个工具，职责data_analysis，优先级4
  - 模拟交易组（paper-trading）：6个工具，职责mixed，优先级5
  - 知识与文档组（knowledge-documents）：7个工具，职责mixed，优先级6
- [ ] 验收：6组配置覆盖49个工具；每组工具数在5-12范围内；每个工具仅出现在一个分组中

### 1.7 创建ToolGroupManager分组管理器

- [ ] 创建 `src/server/routing/tool-group-manager.ts`，实现 `ToolGroupManager` 类
  - `loadGroups(configs)` 方法：加载分组配置，构建工具名→分组ID映射
  - `getGroup(groupId)` 方法：按ID获取分组配置
  - `getGroupForTool(toolName)` 方法：查询工具所属分组
  - `getToolsInGroup(groupId)` 方法：获取分组内所有工具名
  - `getGroupsForTools(toolNames)` 方法：获取多个工具涉及的分组列表
  - `getAllGroups()` 方法：返回所有分组配置
  - `validateConfig()` 方法：校验每个工具仅属于一个组，每组5-12个工具，返回 `ValidationResult`
- [ ] 验收：`getGroupForTool("getStockHistory")` 返回行情数据组；`validateConfig()` 返回 `valid: true`

### 1.8 阶段1单元测试

- [ ] 创建 `src/server/tools/__tests__/name-aliases.test.ts`：测试别名解析逻辑（直接匹配、别名匹配、未找到）
- [ ] 创建 `src/server/tools/__tests__/enhanced-registry.test.ts`：测试增强ToolRegistry（category筛选、别名查找、增强描述格式化）
- [ ] 创建 `src/server/routing/__tests__/tool-group-manager.test.ts`：测试分组管理器（加载配置、工具归属查询、校验逻辑、跨组查询）
- [ ] 运行全部阶段1测试确保通过
- [ ] 验收：所有测试通过；别名解析正确；分组校验无错误

---

## 阶段2（3-5天）：Skill主动路由层 + 动态参数注入

> **优先级：高** | 依赖：阶段1 | 产出：增强Skill定义、Skill路由、分组路由、增强编排引擎、统一路由入口

### 2.1 定义增强Skill类型系统

- [ ] 创建 `src/server/agents/skills/enhanced-types.ts`，定义增强类型
  - `SkillCategory` 类型：`"investment_analysis" | "risk_compliance" | "comprehensive_diagnosis" | "vision_analysis"`
  - `ErrorRecoveryType` 类型：`"retry" | "fallback" | "abort"`
  - `ErrorRecoveryStrategy` 接口：`type`、`maxRetries?`、`fallbackTool?`
  - `EnhancedSkillStep` 接口（继承 `SkillStep`）：新增 `condition?`、`fallbackTool?`、`timeoutMs?`、`dynamicParamResolver?`
  - `EnhancedSkillDefinition` 接口（继承 `SkillDefinition`）：新增 `applicableScenarios`、`orchestrationSummary`、`typicalQueries`、`relatedTools`、`relatedGroups`、`errorRecovery`、`skillCategory`、`timeoutMs`，steps类型改为 `EnhancedSkillStep[]`
  - `OrchestrationContext` 接口：`skillId`、`currentStepIndex`、`stepResults`、`status`、`errorInfo?`、`initialParams`
- [ ] 验收：类型定义完整覆盖design.md中1.3.1-1.3.2节；与现有 `SkillDefinition` 向后兼容

### 2.2 创建增强SkillRegistry

- [ ] 创建 `src/server/agents/skills/enhanced-registry.ts`，实现 `EnhancedSkillRegistryClass`
  - `skills: Map<string, EnhancedSkillDefinition>` 存储
  - `register(skill)` 方法：注册增强Skill定义
  - `get(name)` 方法：按名称获取
  - `list()` 方法：返回所有Skill列表
  - `listByCategory(category)` 方法：按分类筛选
  - `match(query)` 方法：关键词匹配（复用现有 `SkillRegistry.match` 逻辑并增强）
  - `listEnhancedDescriptions()` 方法：输出增强格式描述列表（含适用场景、编排概要、典型query）
- [ ] 导出 `EnhancedSkillRegistry` 单例实例
- [ ] 验收：`listByCategory("investment_analysis")` 返回投研分析类Skill；`match("分析偿债能力")` 返回debt-solvency-analysis

### 2.3 创建SkillRouterAgent路由决策

- [ ] 创建 `src/server/agents/routing/skill-router.ts`，实现 `SkillRouterAgent` 类
  - 定义 `SkillRouteResult` 接口：`matched`、`skill?`、`confidence`、`routeType`、`relatedGroups?`
  - `CONFIDENCE_THRESHOLD = 0.6` 置信度阈值
  - `route(query)` 方法执行逻辑：
    1. 先用 `EnhancedSkillRegistry.match()` 关键词快速匹配
    2. 关键词无结果时预留语义向量检索接口（阶段3实现）
    3. 置信度低于阈值时降级到 `GroupRouterAgent`（routeType=`group_fallback`）
    4. 匹配成功时自动加载Skill关联的所有工具组（routeType=`skill`）
- [ ] 验收：query="分析五粮液的偿债能力" 匹配到debt-solvency-analysis Skill；query="五粮液今日股价" 降级到分组路由

### 2.4 创建GroupRouterAgent分组路由

- [ ] 创建 `src/server/agents/routing/group-router.ts`，实现 `GroupRouterAgent` 类
  - 定义 `GroupRouteResult` 接口：`matchedGroups`、`routeType`、`mergedToolNames`
  - `route(query, candidateGroups?)` 方法执行逻辑：
    1. 若有 `candidateGroups`（从Skill路由传入），在指定分组内检索
    2. 否则根据query关键词匹配分组（基于分组描述和工具名称的关键词匹配）
    3. 返回匹配分组的合并工具集
    4. 无法匹配时降级到全量工具（routeType=`full_fallback`）
- [ ] 验收：query涉及财务数据时路由到基本面数据组；涉及多个领域时返回多分组合并工具集

### 2.5 增强编排引擎：动态参数注入、条件分支、错误恢复

- [ ] 创建 `src/server/agents/skills/enhanced-orchestrator.ts`，实现 `executeEnhancedSkill` 函数
  - 参数校验：执行前校验Skill所有步骤引用的Tool在ToolRegistry中已注册
  - 初始化 `OrchestrationContext` 上下文
  - 遍历步骤（支持并行组）：
    - 检查 `condition` 条件分支，不满足则跳过
    - 解析动态参数（`paramRefs` + `dynamicParamResolver`）
    - 通过 `resolveToolName()` 解析工具名（支持别名）
    - 执行Tool，失败时按 `errorRecovery` 策略处理（retry重试/fallback备选Tool/abort终止）
    - 存储步骤结果到context
  - 使用 `outputTemplate` 格式化最终输出
  - 支持超时控制（`timeoutMs`）
- [ ] 验收：编排步骤间上下文传递正确；条件分支跳过逻辑正确；错误恢复策略生效

### 2.6 创建RouterFacade统一路由入口

- [ ] 创建 `src/server/agents/routing/router-facade.ts`，实现 `RouterFacade` 类
  - 定义 `RouteDecision` 接口：`routeType`、`matchedSkill?`、`matchedGroups?`、`availableTools`、`enhancedPrompt`
  - 持有 `SkillRouterAgent`、`GroupRouterAgent`、`ToolDescriptionEnhancer`（阶段3）、`FewShotInjector`（阶段3）引用
  - `route(query, images?)` 方法执行逻辑：
    1. 检查是否有图片输入 → 预留视觉Skill匹配接口（阶段5实现）
    2. Skill路由（关键词+预留语义检索接口）
    3. Skill匹配失败 → 工具分组路由
    4. 构建增强Prompt（工具描述+预留few-shot注入接口）
- [ ] 验收：统一入口返回正确的 `RouteDecision`；路由降级链路完整

### 2.7 重构orchestrator.ts使用RouterFacade

- [ ] 修改 `src/server/agents/orchestrator.ts`，集成 `RouterFacade`
  - 将现有 `routeQuery` 逻辑替换为 `RouterFacade.route(query)`
  - 根据返回的 `RouteDecision.routeType` 决定执行路径：
    - `skill` → 调用 `executeEnhancedSkill`
    - `group` / `full_fallback` → 调用现有ReAct执行逻辑
  - 保持现有API接口（`/api/agent/run`、`/api/agent/stream`）请求/响应格式不变
  - 保持现有 `reflection-node` 反思评估机制继续正常工作
- [ ] 验收：Agent运行流程不中断；路由决策日志正常输出；API接口兼容

### 2.8 升级现有Skill定义

- [ ] 修改 `src/server/agents/skills/definitions/compliance-check.ts`，升级为 `EnhancedSkillDefinition` 格式（添加 applicableScenarios、orchestrationSummary、typicalQueries、relatedTools、relatedGroups、errorRecovery、skillCategory、timeoutMs）
- [ ] 修改 `src/server/agents/skills/definitions/risk-assessment.ts`，同上升级
- [ ] 修改 `src/server/agents/skills/definitions/comprehensive-diagnosis.ts`，同上升级
- [ ] 修改 `src/server/agents/skills/definitions/technical-analysis.ts`，同上升级（工具名已在1.4修复）
- [ ] 验收：4个现有Skill均兼容 `EnhancedSkillDefinition` 格式；`EnhancedSkillRegistry` 可正常注册

### 2.9 阶段2单元测试

- [ ] 创建 `src/server/agents/routing/__tests__/skill-router.test.ts`：测试Skill路由（关键词匹配、降级逻辑、置信度阈值）
- [ ] 创建 `src/server/agents/routing/__tests__/group-router.test.ts`：测试分组路由（分组匹配、多组路由、全量降级）
- [ ] 创建 `src/server/agents/routing/__tests__/router-facade.test.ts`：测试统一路由入口（路由决策链路、降级链路）
- [ ] 创建 `src/server/agents/skills/__tests__/enhanced-orchestrator.test.ts`：测试增强编排引擎（上下文传递、条件分支、错误恢复、超时控制）
- [ ] 运行全部阶段2测试确保通过
- [ ] 验收：所有测试通过；Skill路由准确率不低于85%（关键词匹配模式）；分组路由降级正确

---

## 阶段3（5-7天）：语义匹配增强 + 多Skill匹配

> **优先级：中** | 依赖：阶段1+阶段2 | 产出：Embedding服务、向量检索、多Skill匹配、描述增强、Few-Shot注入

### 3.1 创建EmbeddingService

- [ ] 创建 `src/server/retrieval/types.ts`，定义检索相关类型
  - `RetrievalResult` 接口：`id`、`score`、`metadata`
  - `SkillVectorEntry` 接口：`skillId`、`embedding`、`metadata`（含relatedTools、applicableScenarios、skillCategory、relatedGroups）
  - `ToolVectorEntry` 接口：`toolName`、`embedding`、`metadata`（含groupId、whenToUse、groupResponsibility）
- [ ] 创建 `src/server/retrieval/embedding-service.ts`，实现 `EmbeddingService` 类
  - `embed(text)` 方法：调用本地bge-m3 embedding服务（`http://localhost:8011`）
  - `embedBatch(texts)` 方法：批量embedding计算
  - 支持通过 `EMBEDDING_SERVICE_URL` 环境变量配置服务地址
  - 错误处理：服务不可用时返回null，触发降级
- [ ] 验收：单条和批量embedding计算正常返回；服务不可用时优雅降级

### 3.2 创建Skill向量检索器

- [ ] 创建 `src/server/retrieval/skill-vector-retriever.ts`，实现 `SkillVectorRetriever` 类
  - `buildIndex(skills)` 方法：为每个Skill生成embedding（名称+描述+适用场景+触发关键词拼接后embedding）
  - `addEntry(skill)` 方法：增量更新，新增Skill时调用
  - `retrieve(query, topK=5, candidateGroups?)` 方法：
    1. 计算query embedding
    2. 余弦相似度计算
    3. 按相关度降序返回top-K
    4. 若有candidateGroups则过滤
  - `isReady()` 方法：检查索引是否已构建
- [ ] 验收：`retrieve("分析偿债能力", 5)` 返回结果中包含debt-solvency-analysis；召回率不低于90%

### 3.3 创建Tool向量检索器

- [ ] 创建 `src/server/retrieval/tool-vector-retriever.ts`，实现 `ToolVectorRetriever` 类
  - `buildIndex(tools)` 方法：为每个工具生成embedding（名称+描述+whenToUse拼接后embedding）
  - `addEntry(tool)` 方法：增量更新
  - `retrieve(query, topK=8, candidateGroups?)` 方法：与分组协同，candidateGroups非空时仅在该分组内检索
  - `isReady()` 方法：检查索引是否已构建
- [ ] 验收：`retrieve("资产负债率", 8)` 返回结果中包含getStockFinancial；组内检索正确过滤

### 3.4 SkillRouterAgent集成语义检索

- [ ] 修改 `src/server/agents/routing/skill-router.ts`，集成 `SkillVectorRetriever`
  - 在 `route()` 方法中，关键词无结果时调用 `SkillVectorRetriever.retrieve(query, topK=5)` 进行语义检索
  - 取最高相关度结果，若score >= CONFIDENCE_THRESHOLD则匹配成功
  - 语义检索也无结果时降级到GroupRouterAgent
  - 索引不可用时降级到关键词匹配
- [ ] 验收：语义检索模式比纯关键词匹配覆盖更多query模式；降级链路完整

### 3.5 GroupRouterAgent集成组内语义检索

- [ ] 修改 `src/server/agents/routing/group-router.ts`，集成 `ToolVectorRetriever`
  - 分组路由命中后，在候选分组内调用 `ToolVectorRetriever.retrieve(query, topK=8, candidateGroups)` 进行组内工具检索
  - 分组路由未命中时，调用全量Tool向量检索
  - 索引不可用时降级到组内全量工具
- [ ] 验收：组内语义检索仅返回候选分组内的工具；全量降级时返回所有工具

### 3.6 创建MultiSkillMatcher多Skill匹配

- [ ] 创建 `src/server/agents/routing/multi-skill-matcher.ts`，实现 `MultiSkillMatcher` 类
  - 定义 `MultiSkillMatchResult` 接口：`primarySkill`、`auxiliarySkills`、`mergedToolGroups`
  - `match(query, allSkills)` 方法：
    1. 当query涉及多个分析维度时（如"分析偿债能力和技术面"），匹配主Skill和辅助Skill
    2. 合并两者的工具分组
    3. 返回null表示不需要多Skill匹配
- [ ] 集成到 `RouterFacade.route()` 中：Skill路由结果为多Skill时，合并工具集
- [ ] 验收：query="分析五粮液偿债能力和技术面" 返回主Skill(debt-solvency-analysis)+辅助Skill(technical-analysis)

### 3.7 创建工具描述增强模块

- [ ] 创建 `src/server/description/types.ts`，定义描述增强类型
  - `ToolExampleCall` 接口：`description`、`parameters`
  - `EnhancedToolDescription` 接口：`name`、`description`、`whenToUse`、`whenNotToUse`、`parameters`、`exampleCalls`、`groupId`
  - `EnhancedSkillDescription` 接口：`name`、`description`、`applicableScenarios`、`orchestrationSummary`、`typicalQueries`、`relatedTools`
- [ ] 创建 `src/server/description/tool-description-enhancer.ts`，实现 `ToolDescriptionEnhancer` 类
  - `load(descriptions)` 方法：加载49个工具的增强描述数据
  - `get(toolName)` 方法：获取单个工具增强描述
  - `formatForPrompt(toolNames)` 方法：格式化为systemPrompt文本（工具名、描述、何时使用、何时不使用、示例）
- [ ] 创建 `src/server/description/tool-enhanced-descriptions.ts`，定义49个工具的增强描述数据
  - 每个工具包含：whenToUse（适用场景）、whenNotToUse（不适用场景，指向正确工具）、exampleCalls（1-2个调用示例）
  - 重点区分容易混淆的工具边界（如getStockFinancial vs getFinancialReport vs hybridSearch）
- [ ] 创建 `src/server/description/skill-description-enhancer.ts`，实现 `SkillDescriptionEnhancer` 类
  - `formatForPrompt(skills)` 方法：格式化为systemPrompt的Skill列表文本
- [ ] 验收：增强描述覆盖全部49个工具；格式化输出包含whenToUse和whenNotToUse；混淆工具互相指向

### 3.8 创建Few-Shot示例注入

- [ ] 创建 `src/server/description/fewshot-injector.ts`，实现 `FewShotInjector` 类
  - 定义 `FewShotExample` 接口：`userQuery`、`toolCalls`（含tool、parameters、reasoning）
  - 定义 `FINANCE_FEW_SHOT_EXAMPLES` 常量：2-3个金融投研典型示例
    - "招商银行MA20是多少？" → getStockHistory → calculateMA
    - "五粮液2025年资产负债率" → getStockFinancial
    - "分析五粮液的偿债能力" → debt-solvency-analysis Skill
  - `inject(systemPrompt, examples?)` 方法：将few-shot示例追加到systemPrompt末尾
- [ ] 验收：注入后systemPrompt末尾包含few-shot示例块；示例格式清晰易读

### 3.9 RouterFacade集成检索和描述增强

- [ ] 修改 `src/server/agents/routing/router-facade.ts`，集成阶段3所有模块
  - 初始化时构建向量索引（`SkillVectorRetriever.buildIndex()`、`ToolVectorRetriever.buildIndex()`）
  - `route()` 方法增强：Skill路由使用语义检索；分组路由使用组内语义检索
  - 构建增强Prompt时注入：增强工具描述 + 增强Skill描述 + few-shot示例
  - 索引构建失败时降级到关键词匹配，记录警告日志
- [ ] 验收：端到端路由流程：query → Skill语义检索 → 分组语义检索 → 增强Prompt构建 → 返回RouteDecision

### 3.10 阶段3集成测试

- [ ] 创建 `src/server/retrieval/__tests__/skill-vector-retriever.test.ts`：测试Skill向量检索（索引构建、检索召回、增量更新）
- [ ] 创建 `src/server/retrieval/__tests__/tool-vector-retriever.test.ts`：测试Tool向量检索（组内检索、全量检索、增量更新）
- [ ] 创建 `src/server/description/__tests__/tool-description-enhancer.test.ts`：测试描述增强（数据完整性、格式化输出）
- [ ] 创建 `src/server/description/__tests__/fewshot-injector.test.ts`：测试Few-Shot注入
- [ ] 创建 `src/server/agents/routing/__tests__/multi-skill-matcher.test.ts`：测试多Skill匹配
- [ ] 端到端测试：完整路由链路（query → Skill检索 → 分组检索 → 增强Prompt → 执行）
- [ ] 验收：Skill检索召回率不低于90%；工具检索召回率不低于90%；描述增强覆盖全部工具

---

## 阶段4（1-2周）：Skill嵌套编排 + 调用校验控制 + 8个投研Skill

> **优先级：中** | 依赖：阶段1+阶段2 | 产出：8个投研Skill、嵌套编排、调用校验、限流缓存、增强ReAct执行器

### 4.1 创建8个投研Skill定义

- [ ] 创建 `src/server/agents/skills/definitions/investment/` 目录
- [ ] 创建 `fundamental-analysis.ts`：基本面综合分析（getStockFinancial → getValuationMetrics → getCompanyProfile → getDividendHistory），skillCategory=`investment_analysis`
- [ ] 创建 `debt-solvency-analysis.ts`：偿债能力分析（getStockFinancial → getValuationMetrics → 计算偿债比率），skillCategory=`investment_analysis`
- [ ] 创建 `valuation-analysis.ts`：估值分析（getStockFinancial → getValuationMetrics → getIndustry），跨fundamental-data和market-data两组
- [ ] 创建 `investment-thesis.ts`：投资论点生成（getStockFinancial → getValuationMetrics → getCompanyProfile → hybridSearch），跨fundamental-data和knowledge-documents两组
- [ ] 创建 `sector-rotation.ts`：板块轮动分析（getFundFlow → getIndustry），skillCategory=`investment_analysis`
- [ ] 创建 `stock-comparison.ts`：股票对比分析（getStockFinancial → getValuationMetrics），跨fundamental-data和technical-analysis两组
- [ ] 创建 `sentiment-analysis.ts`：市场情绪分析（hybridSearch → getFundFlow），跨knowledge-documents和market-data两组
- [ ] 验收：8个投研Skill定义完整，包含增强字段（applicableScenarios、orchestrationSummary、typicalQueries、relatedTools、relatedGroups、errorRecovery、skillCategory、timeoutMs）

### 4.2 更新Skill注册入口

- [ ] 修改 `src/server/agents/skills/definitions/index.ts`，注册8个新投研Skill
  - 导入所有investment/目录下的Skill定义
  - 在 `registerAllSkills()` 中调用 `EnhancedSkillRegistry.register()` 注册
- [ ] 验收：`registerAllSkills()` 执行后，`EnhancedSkillRegistry.list()` 包含12个Skill（4现有+8新增）

### 4.3 创建Skill嵌套编排

- [ ] 创建 `src/server/agents/skills/nested-orchestrator.ts`
  - 定义 `NestedSkillStep` 接口（继承 `EnhancedSkillStep`）：新增 `subSkillId?` 字段
  - 嵌套执行逻辑：若 `step.subSkillId` 存在，递归调用 `executeEnhancedSkill`
  - 实现 comprehensive-diagnosis 嵌套编排：嵌套调用 technical-analysis 和 fundamental-analysis
- [ ] 修改 `src/server/agents/skills/enhanced-orchestrator.ts`，支持嵌套步骤执行
- [ ] 验收：comprehensive-diagnosis执行时自动嵌套调用technical-analysis和fundamental-analysis

### 4.4 创建ToolCallValidator调用校验器

- [ ] 创建 `src/server/validation/types.ts`，定义校验类型
  - `ValidationErrorType` 类型：`"missing" | "invalid_type" | "out_of_range" | "unknown_tool"`
  - `ValidationError` 接口：`field`、`type`、`message`
  - `ValidationResult` 接口：`valid`、`errors`、`suggestion`
- [ ] 创建 `src/server/validation/tool-call-validator.ts`，实现 `ToolCallValidator` 类
  - `validate(toolName, params)` 方法：
    1. 校验工具名存在性（通过 `EnhancedToolRegistry.has()`，支持别名）
    2. 校验必填参数齐全性
    3. 校验参数类型正确性
    4. 校验参数值合理性（范围检查）
    5. 生成修正建议（suggestion字段，供LLM理解）
  - `validateToolName(name)` 私有方法
  - `validateRequiredParams(tool, params)` 私有方法
  - `validateParamTypes(tool, params)` 私有方法
  - `validateParamValues(tool, params)` 私有方法
- [ ] 验收：`validate("unknown_tool", {})` 返回 `valid: false`；`validate("getStockHistory", {code:"600519"})` 返回 `valid: true`

### 4.5 创建CallLimiter和ResultCache

- [ ] 创建 `src/server/validation/call-limiter.ts`，实现 `CallLimiter` 类
  - `CallLimiterConfig` 接口：`maxToolCalls=15`、`validationRetryLimit=3`、`toolExecutionTimeoutMs=30000`
  - `canCall()` 方法：检查调用次数是否未达上限
  - `increment()` 方法：增加调用计数
  - `getConfig()` 方法：获取配置
  - `executeWithLimit(toolName, params, executor)` 方法：
    1. 检查调用次数上限
    2. 检查缓存（相同工具+相同参数复用结果）
    3. 执行工具（带超时控制）
    4. 缓存结果
    5. 增加调用计数
- [ ] 创建 `src/server/validation/result-cache.ts`，实现 `ResultCache` 类
  - `hashKey(toolName, params)` 方法：生成缓存键
  - `get/has/set` 方法：缓存操作
- [ ] 验收：重复调用相同工具+参数时直接复用缓存结果；调用次数达上限时拒绝新调用

### 4.6 创建EnhancedReActExecutor增强ReAct执行器

- [ ] 创建 `src/server/agents/enhanced-react-executor.ts`，实现 `EnhancedReActExecutor` 类
  - `ReActConfig` 接口：`maxIterations=5`、`maxToolCalls=15`、`validationRetryLimit=3`
  - `run(query, availableTools, systemPrompt)` 方法，ReAct循环：
    1. LLM推理 → 生成工具调用或最终答案
    2. 若生成工具调用：`ToolCallValidator.validate()` 校验
    3. 校验失败 → 反馈LLM修正（最多3次）
    4. 校验通过 → `CallLimiter.executeWithLimit()` 执行
    5. 执行结果 → 追加到messages继续推理
    6. 若生成最终答案 → 返回
    7. 超过maxToolCalls → 终止并返回部分结果
- [ ] 验收：校验失败时LLM自动修正重试；调用次数达上限时优雅终止

### 4.7 创建ExecutionFacade执行统一入口

- [ ] 创建 `src/server/agents/execution-facade.ts`，实现 `ExecutionFacade` 类
  - `ExecutionConfig` 接口：`maxToolCalls`、`validationRetryLimit`、`toolTimeoutMs`、`skillTimeoutMs`
  - `execute(decision, query, config)` 方法：
    1. 若 `routeType="skill"` → 调用 `executeEnhancedSkill`
    2. 否则 → 调用 `EnhancedReActExecutor.run`
    3. 执行过程中均经过 `ToolCallValidator` 和 `CallLimiter`
- [ ] 验收：Skill编排和ReAct执行均经过校验和限流

### 4.8 重构orchestrator使用ExecutionFacade

- [ ] 修改 `src/server/agents/orchestrator.ts`，最终重构为使用 `RouterFacade` + `ExecutionFacade`
  - 路由决策：`RouterFacade.route(query)`
  - 执行：`ExecutionFacade.execute(decision, query, config)`
  - 保持现有API接口和反思机制
- [ ] 验收：端到端Agent运行流程完整；API接口兼容；反思机制正常

### 4.9 阶段4端到端测试

- [ ] 创建 `src/server/agents/skills/definitions/investment/__tests__/` 目录下各投研Skill测试
- [ ] 创建 `src/server/agents/skills/__tests__/nested-orchestrator.test.ts`：测试嵌套编排（递归执行、上下文传递）
- [ ] 创建 `src/server/validation/__tests__/tool-call-validator.test.ts`：测试校验器（工具名校验、参数校验、修正建议）
- [ ] 创建 `src/server/validation/__tests__/call-limiter.test.ts`：测试限流和缓存
- [ ] 创建 `src/server/agents/__tests__/enhanced-react-executor.test.ts`：测试增强ReAct执行（校验重试、限流终止）
- [ ] 创建 `src/server/agents/__tests__/execution-facade.test.ts`：测试执行入口（Skill编排路径、ReAct路径）
- [ ] 端到端测试：完整Agent运行链路（query → 路由 → 执行 → 结果），覆盖投研Skill编排场景
- [ ] 验收：8个投研Skill编排执行成功；校验器正确拦截无效调用；限流和缓存生效

---

## 阶段5（3-5天）：PaddleOCR-VL-1.6 MCP Server Docker部署 + 3个视觉Skill

> **优先级：中** | 依赖：阶段2 | 产出：PaddleOCR Docker、双引擎路由、3个视觉Skill、环境变量配置

### 5.1 创建PaddleOCR Docker部署配置

- [ ] 创建 `docker/paddleocr-vl/` 目录
- [ ] 创建 `docker/paddleocr-vl/Dockerfile`
  - 基于PaddleOCR官方deploy/paddleocr_vl_docker/构建
  - `FROM python:3.10-slim`
  - 安装 `paddlepaddle`、`paddleocr`、`mcp`
  - 复制 `mcp_server/` 代码
  - 暴露8020端口
  - 非root用户运行（安全约束）
  - CMD启动MCP Server
- [ ] 修改 `docker-compose.yml`，新增 `paddleocr-vl` 服务
  - container_name: `aiagent_paddleocr_vl`
  - 端口映射 `8020:8020`
  - 环境变量 `USE_GPU=false`、`MCP_PORT=8020`、`MODEL_NAME=PP-OCRv4`
  - volumes: `paddleocr_models:/app/models`
  - networks: `aiagent_net`
  - restart: `unless-stopped`
  - healthcheck: curl检查 `/health`，间隔30s，超时10s
  - deploy.resources.limits: cpus=4, memory=8G
- [ ] 验收：`docker-compose up paddleocr-vl` 可正常启动；healthcheck通过；MCP Server就绪

### 5.2 创建PaddleOCR MCP客户端

- [ ] 创建 `src/server/vision/types.ts`，定义视觉分析类型
  - `VisionEngine` 类型：`"paddleocr_vl" | "qwen3.5-plus" | "mineru"`
  - `PaddleOCRResult` 接口：`success`、`text?`、`structuredData?`、`pageCount?`、`error?`、`engineUsed="paddleocr_vl"`、`executionTimeMs`
  - `VisionResult` 接口：`success`、`description?`、`engineUsed="qwen3.5-plus"`、`tokenUsage?`、`executionTimeMs`、`error?`
  - `DualEngineResult` 接口：`success`、`result`、`engineUsed`、`degraded`、`degradationReason?`、`degradationTimeMs?`
- [ ] 创建 `src/server/vision/paddleocr-mcp-client.ts`，实现 `PaddleOCRMcpClient` 类
  - 读取 `PADDLEOCR_MCP_ENABLED` 和 `PADDLEOCR_MCP_ENDPOINT` 环境变量
  - `analyze(imageBase64, prompt?)` 方法：通过MCP协议调用PaddleOCR-VL-1.6
  - `healthCheck()` 方法：检查MCP Server是否就绪
  - `isEnabled()` 方法：检查PADDLEOCR_MCP_ENABLED开关
  - 超时控制：默认30000ms
- [ ] 验收：PADDLEOCR_MCP_ENABLED=true时正常调用；=false时返回disabled；MCP Server不可用时返回错误

### 5.3 改造image-caption.ts为Vision降级客户端

- [ ] 创建 `src/server/vision/vision-fallback-client.ts`，实现 `VisionFallbackClient` 类
  - 读取 `VISION_MODEL`、`DASHSCOPE_API_KEY`、`VISION_FALLBACK_ENABLED` 环境变量
  - `analyze(imageBase64, prompt?)` 方法：复用 `image-caption.ts` 中的 `callVisionModel` 逻辑，调用DashScope OpenAI兼容接口
  - `isAvailable()` 方法：检查VISION_MODEL和API_KEY是否配置
  - `isFallbackEnabled()` 方法：检查VISION_FALLBACK_ENABLED开关
- [ ] 保留 `src/server/rag/multimodal/image-caption.ts` 现有调用逻辑不变（向后兼容），VisionFallbackClient内部调用其逻辑
- [ ] 验收：Vision模型调用成功返回描述文本；VISION_FALLBACK_ENABLED=false时不降级；API_KEY缺失时返回不可用

### 5.4 创建DualEngineRouter双引擎路由

- [ ] 创建 `src/server/vision/dual-engine-router.ts`，实现 `DualEngineRouter` 类
  - 持有 `PaddleOCRMcpClient` 和 `VisionFallbackClient` 实例
  - `analyze(imageBase64, prompt?)` 方法：
    1. 优先调用PaddleOCR主力引擎
    2. PaddleOCR失败时检查VISION_FALLBACK_ENABLED
    3. 降级启用时切换到Vision模型（qwen3.5-plus），记录降级切换耗时
    4. 记录降级事件日志（降级原因、源引擎、目标引擎、切换耗时）
    5. 双引擎均失败时返回错误
- [ ] 验收：PaddleOCR成功时engineUsed=`paddleocr_vl`、degraded=false；降级时engineUsed=`qwen3.5-plus`、degraded=true；降级切换时间<5秒

### 5.5 改造analyzeImage工具使用DualEngineRouter

- [ ] 修改 `src/server/mcp/tools/document_analysis.ts` 中的 `analyzeImage` 工具
  - 将内部实现改为调用 `DualEngineRouter.analyze()`
  - 保持analyzeImage作为统一入口工具的接口不变
  - PaddleOCR MCP Tool调用失败且VISION_FALLBACK_ENABLED=true时自动降级
- [ ] 验收：通过analyzeImage调用走双引擎路由；降级链路完整；现有调用方式不变

### 5.6 创建3个金融视觉Skill定义

- [ ] 创建 `src/server/agents/skills/definitions/vision/` 目录
- [ ] 创建 `screenshot-to-structured-data.ts`：研报截图结构化提取
  - 编排步骤：extractFromScreenshot(MinerU) → extractFinancialData
  - 上下文传递：`{{steps[0].output.text}}`
  - errorRecovery: { type: "fallback", fallbackTool: "analyzeImage" }
  - skillCategory: `vision_analysis`，timeoutMs: 90000
- [ ] 创建 `chart-pattern-recognition.ts`：K线图表形态识别
  - 编排步骤：analyzeImage(双引擎) → calculateMA → calculateMACD → calculateRSI
  - 跨knowledge-documents和technical-analysis两组
  - skillCategory: `vision_analysis`，timeoutMs: 90000
- [ ] 创建 `financial-statement-ocr.ts`：财报OCR指标计算
  - 编排步骤：analyzeImage(双引擎) → extractFinancialData → 计算财务比率
  - 上下文传递：`{{steps[0].output.text}}`
  - skillCategory: `vision_analysis`，timeoutMs: 90000
- [ ] 验收：3个视觉Skill定义完整；编排步骤上下文传递正确；与Skill路由协同

### 5.7 更新Skill注册入口和环境变量

- [ ] 修改 `src/server/agents/skills/definitions/index.ts`，注册3个视觉Skill
- [ ] 修改 `.env.local`（或创建新增配置），添加视觉相关环境变量：
  - `PADDLEOCR_MCP_ENABLED=true`
  - `PADDLEOCR_MCP_ENDPOINT=http://localhost:8020`
  - `VISION_MODEL=qwen3.5-plus`
  - `VISION_FALLBACK_ENABLED=true`
- [ ] 验收：`EnhancedSkillRegistry.list()` 包含15个Skill（12+3视觉）；环境变量默认值正确

### 5.8 阶段5集成测试

- [ ] 创建 `src/server/vision/__tests__/paddleocr-mcp-client.test.ts`：测试PaddleOCR客户端（启用/禁用、超时、healthCheck）
- [ ] 创建 `src/server/vision/__tests__/vision-fallback-client.test.ts`：测试Vision降级客户端（可用性检查、降级开关）
- [ ] 创建 `src/server/vision/__tests__/dual-engine-router.test.ts`：测试双引擎路由（主力引擎成功、降级切换、双引擎失败）
- [ ] 创建 `src/server/agents/skills/definitions/vision/__tests__/` 目录下各视觉Skill测试
- [ ] 集成测试：双引擎降级+视觉Skill编排端到端
  - PaddleOCR主力引擎正常调用
  - PaddleOCR失败→降级到qwen3.5-plus
  - 降级事件日志记录完整
  - 视觉Skill编排步骤正确执行
- [ ] 验收：双引擎降级成功率不低于98%；视觉Skill整体执行时间不超过90秒；降级切换时间不超过5秒

---

## 最终验收与文档更新

### 6.1 全链路端到端验收

- [ ] 验证路由决策链路完整性：query → Skill路由 → 分组路由 → 全量降级
- [ ] 验证投研Skill编排执行：8个投研Skill均可正常编排执行
- [ ] 验证视觉Skill编排执行：3个视觉Skill均可正常编排执行（PaddleOCR主力+降级）
- [ ] 验证调用校验和限流：无效调用被拦截；重复调用复用缓存；调用上限生效
- [ ] 验证向后兼容：现有API接口格式不变；现有ToolRegistry/SkillRegistry接口兼容；现有Skill正常工作
- [ ] 验证性能指标：Skill路由决策<500ms；动态检索<200ms；工具描述token减少>50%

### 6.2 文档更新

- [ ] 更新项目README或相关文档，说明新增模块和使用方式
- [ ] 更新环境变量文档，说明PADDLEOCR_MCP_ENABLED、VISION_MODEL、VISION_FALLBACK_ENABLED等
- [ ] 更新docker-compose文档，说明paddleocr-vl服务部署方式
- [ ] 更新Skill开发文档，说明EnhancedSkillDefinition规范和新增投研/视觉Skill

### 6.3 配置与部署检查

- [ ] 验证docker-compose.yml中paddleocr-vl服务可正常启动
- [ ] 验证.env.local中所有新增环境变量均有默认值
- [ ] 验证现有docker服务（embedding等）不受新增服务影响

---

## 阶段6（3-5天）：全面测试 + 端到端验证

> **优先级：最高** | 依赖：阶段1-5全部完成 | 产出：全量单元测试、集成测试、端到端测试

### 6.1 修改代码的全量单元测试

- [ ] 梳理所有修改的文件清单（阶段1-5中标记为"修改"的文件）
- [ ] 为每个修改文件编写/更新单元测试：
  - `src/server/tools/name-aliases.ts` → 别名解析、边界case
  - `src/server/tools/enhanced-registry.ts` → category筛选、别名查找、注册兼容
  - `src/server/agents/skills/types.ts` → RegisteredTool新字段兼容
  - `src/server/agents/skills/definitions/technical-analysis.ts` → 工具名引用正确性
  - `src/server/mcp/tools/market_data.ts` → category标注正确
  - `src/server/mcp/tools/quant_analysis.ts` → category标注正确
  - `src/server/mcp/tools/compliance.ts` → category标注正确
  - `src/server/mcp/tools/risk_control.ts` → category标注正确
  - `src/server/mcp/tools/simulated_trade.ts` → category标注正确
  - `src/server/mcp/tools/document_analysis.ts` → analyzeImage双引擎集成
  - `src/server/agents/orchestrator.ts` → RouterFacade+ExecutionFacade集成
  - `src/server/agents/skills/definitions/index.ts` → 新Skill注册完整性
  - `.env.local` → 新环境变量默认值
- [ ] 验收：修改文件100%有对应单元测试；所有测试通过

### 6.2 新增代码的全量单元测试

- [ ] 梳理所有新增的文件清单（阶段1-5中标记为"创建"的文件）
- [ ] 为每个新增文件编写单元测试：
  - `src/server/routing/types.ts` + `tool-group-manager.ts` + `group-configs.ts`
  - `src/server/agents/routing/skill-router.ts` + `group-router.ts` + `router-facade.ts`
  - `src/server/agents/skills/enhanced-types.ts` + `enhanced-registry.ts` + `enhanced-orchestrator.ts` + `nested-orchestrator.ts`
  - `src/server/retrieval/embedding-service.ts` + `skill-vector-retriever.ts` + `tool-vector-retriever.ts`
  - `src/server/description/tool-description-enhancer.ts` + `skill-description-enhancer.ts` + `fewshot-injector.ts`
  - `src/server/agents/routing/multi-skill-matcher.ts`
  - `src/server/validation/tool-call-validator.ts` + `call-limiter.ts` + `result-cache.ts`
  - `src/server/agents/enhanced-react-executor.ts` + `execution-facade.ts`
  - `src/server/vision/paddleocr-mcp-client.ts` + `vision-fallback-client.ts` + `dual-engine-router.ts`
  - `src/server/agents/skills/definitions/investment/` 下8个Skill
  - `src/server/agents/skills/definitions/vision/` 下3个Skill
- [ ] 验收：新增文件100%有对应单元测试；测试覆盖率不低于80%

### 6.3 集成测试（模块间交互）

- [ ] 路由链路集成测试：RouterFacade → SkillRouter → GroupRouter → 降级
- [ ] Skill编排集成测试：executeEnhancedSkill → ToolCallValidator → CallLimiter → Tool执行
- [ ] 描述增强集成测试：RouterFacade → ToolDescriptionEnhancer → FewShotInjector → Prompt构建
- [ ] 视觉分析集成测试：DualEngineRouter → PaddleOCRMcpClient → VisionFallbackClient → 降级
- [ ] 向后兼容集成测试：现有Agent API（/api/agent/run、/api/agent/stream）请求/响应格式不变
- [ ] 验收：所有集成测试通过；模块间交互无死锁/内存泄漏

### 6.4 端到端测试（真实数据，真实LLM调用）

> 测试数据：中国长城(000066)、五粮液(000858)、格力电器(000651)
> 已缓存：1年交易数据；已上传：2025年财报、2026Q1季报

#### 6.4.1 单工具调用端到端

- [ ] 行情数据组：`getStockHistory(code="000858")` → 返回五粮液K线数据
- [ ] 基本面数据组：`getStockFinancial(code="000858")` → 返回五粮液财报数据
- [ ] 技术分析组：`calculateMA(code="000858", period=20)` → 返回MA20结果
- [ ] 风控合规组：`checkTradeCompliance(...)` → 返回合规检查结果
- [ ] 知识文档组：`hybridSearch(query="五粮液资产负债率")` → 返回RAG检索结果
- [ ] 验收：每组至少1个工具真实调用成功，返回结构正确

#### 6.4.2 Skill编排端到端

- [ ] `technical-analysis`：query="五粮液技术面分析" → 5步编排执行成功，输出技术指标汇总
- [ ] `fundamental-analysis`：query="格力电器基本面分析" → 4步编排执行成功，输出基本面评估
- [ ] `debt-solvency-analysis`：query="五粮液2025年资产负债率是多少？分析偿债能力" → 3步编排执行成功，输出偿债指标
- [ ] `valuation-analysis`：query="中国长城估值分析" → 编排执行成功，输出PE/PB对比
- [ ] `investment-thesis`：query="五粮液投资论点" → 编排执行成功，输出看多/看空理由
- [ ] `sector-rotation`：query="白酒板块轮动分析" → 编排执行成功
- [ ] `stock-comparison`：query="五粮液vs格力电器对比" → 编排执行成功
- [ ] `sentiment-analysis`：query="五粮液市场情绪" → 编排执行成功
- [ ] 验收：8个投研Skill端到端执行成功，输出内容合理

#### 6.4.3 路由决策端到端

- [ ] Skill命中：query="分析五粮液偿债能力" → 路由到debt-solvency-analysis Skill
- [ ] 分组路由：query="五粮液今日股价" → 路由到market-data分组
- [ ] 多Skill匹配：query="五粮液偿债能力和技术面分析" → 主Skill+辅助Skill
- [ ] 全量降级：query="帮我写一首诗" → 无法匹配Skill和分组 → 全量降级
- [ ] 验收：路由决策准确率不低于85%；降级链路完整无中断

#### 6.4.4 视觉分析端到端（如PaddleOCR Docker可用）

- [ ] PaddleOCR主力：上传财报截图 → PaddleOCR-VL-1.6解析 → 返回结构化数据
- [ ] 降级切换：停止PaddleOCR容器 → 上传截图 → 自动降级到qwen3.5-plus → 返回结果
- [ ] 视觉Skill编排：上传K线截图 → chart-pattern-recognition Skill → 输出技术形态+量化信号
- [ ] 验收：PaddleOCR主力成功；降级切换正常；视觉Skill编排成功

#### 6.4.5 校验与限流端到端

- [ ] 参数校验：发送无效工具调用 → ToolCallValidator拦截 → LLM修正重试 → 最终成功
- [ ] 调用上限：连续调用超过15次 → 优雅终止并返回部分结果
- [ ] 结果缓存：重复调用getStockHistory(000858) → 第2次直接复用缓存
- [ ] 验收：校验拦截生效；限流终止正常；缓存命中率>0

### 6.5 回归测试（确保现有功能不受影响）

- [ ] 原有RAG问答流程正常（hybridSearch → LLM → 回答）
- [ ] 原有Agent对话流程正常（/api/agent/run → ReAct → 回答）
- [ ] 原有PDF解析流程正常（上传PDF → MinerU → 分块 → 向量化）
- [ ] 原有模拟交易流程正常（下单 → 查持仓 → 查委托）
- [ ] 中文编码问题修复验证（新对话标题"新对话"正确写入数据库，前端正确显示）
- [ ] 验收：原有功能全部正常，无回归问题

### 6.6 性能基准测试

- [ ] 路由决策延迟：Skill路由 < 500ms，分组路由 < 300ms，全量降级 < 200ms
- [ ] 动态检索延迟：向量检索 < 200ms
- [ ] Skill编排延迟：5步编排 < 30s（含LLM调用）
- [ ] Prompt token优化：增强描述+分组路由后，systemPrompt token减少 > 50%
- [ ] 视觉分析延迟：PaddleOCR CPU < 30s/页，云端降级切换 < 5s
- [ ] 验收：所有性能指标满足spec.md 4.1节定义

### 6.7 测试报告生成

- [ ] 运行全量测试套件，生成测试报告（通过/失败/跳过统计）
- [ ] 生成覆盖率报告（行覆盖率、分支覆盖率）
- [ ] 生成性能基准报告（各模块延迟、token消耗对比）
- [ ] 端到端测试报告（3只股票×所有Skill的执行结果矩阵）
- [ ] 验收：测试报告完整；所有P0级测试通过；无阻塞性失败
