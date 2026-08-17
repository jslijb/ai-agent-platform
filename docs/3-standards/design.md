# 全局架构设计（DESIGN）

> **定位**：系统架构总览（C4 模型 Context + Container 层）。版本设计（docs/versions/vN/design.md）继承本文件并补充组件级细节。
> **最后更新**：2026-08-02
> **级联关系**：基线 docs/spec.md，向下级联到 docs/versions/v{N}/design.md

---

## 一、系统上下文（C4 Context）

```
用户
  │
  ├─ Web前端（Next.js App Router）
  │   ├─ RAG问答（流式SSE）
  │   ├─ Agent对话（多轮+工具）
  │   └─ 评估管理（触发/查看报告）
  │
  ├─ 微服务层（4应用服务+6基础设施服务）
  │   ├─ app（主应用，端口3000）
  │   ├─ rag-service（检索服务，端口3001）
  │   ├─ evaluation-service（评估服务，端口3003）
  │   └─ data-service（数据服务，端口8001，PaddleOCR端口8020）
  │
  └─ 外部依赖
      ├─ PostgreSQL（端口5432，pgvector向量库+财务数据表）
      ├─ Neo4j（知识图谱，端口7687）
      ├─ Redis（缓存，端口6379）
      ├─ bge-m3 embedding服务（端口8011）
      ├─ bge-reranker-v2-m3 精排服务
      └─ LLM Provider（AGNES→百炼降级链）
```

## 二、核心架构决策（ADR 索引）

| ADR | 决策 | 状态 |
|-----|------|------|
| [ADR-001](adr/001-orm-from-prisma-to-drizzle.md) | ORM: Prisma→Drizzle | 已采纳 |
| [ADR-002](adr/002-api-from-trpc-to-route-handlers.md) | API: tRPC→Route Handlers+SSE | 已采纳 |
| [ADR-003](adr/003-agent-from-monolith-to-multi-agent.md) | Agent: 单体→多Agent+Skill | 已采纳 |
| [ADR-004](adr/004-rag-hybrid-retrieval-with-separated-reranking.md) | RAG混合检索+分离精排 | 已采纳 |
| [ADR-005](adr/005-vector-database-pgvector-over-milvus.md) | 向量库: pgvector | 已采纳 |
| [ADR-006](adr/006-llm-provider-alibaba-over-openai.md) | LLM: 阿里百炼 | 已采纳 |
| [ADR-007](adr/007-microservice-with-service-adapter.md) | 微服务拆分 | 已采纳 |
| [ADR-008](adr/008-agent-framework-langgraph-over-custom.md) | Agent框架: LangGraph | 已采纳 |
| [ADR-009](adr/009-data-cache-from-sqlite-to-postgresql.md) | 缓存: PostgreSQL | 已采纳 |
| [ADR-010](adr/010-mcp-dual-track-design.md) | MCP双轨设计 | 已采纳 |
| [ADR-011](adr/011-financial-data-to-postgresql.md) | 财务数据落PostgreSQL双轨制 | 已采纳（2026-07-31） |

## 三、分层架构（C4 Container）

### 3.1 RAG 管道
```
用户query → 意图识别（数值/非数值分流）
  ├─ 数值类 → query-router.ts（公司名+指标识别）→ 模板SQL查询PostgreSQL
  │   ├─ SQL命中 → JSON context注入LLM
  │   └─ SQL未命中 → 向量检索fallback
  └─ 非数值类 → hybridSearch（dense+sparse+RRF融合）
       → 分离精排（文档top5+图谱top3）
       → LLM生成（带引用注入+来源追踪）
```

### 3.2 Agent 层
```
多Agent编排（Researcher/Quant/Compliance）
  ├─ 统一工具注册表（ToolRegistry，21+工具）
  ├─ Skill技能层（声明式+并行执行）
  ├─ 四层分层记忆（L1原始/L2摘要/L3检索/L4画像）
  └─ 合规风控（拒绝+日志+分级）
```

### 3.3 数据层
```
PostgreSQL
  ├─ 知识库表（documents/chunks，pgvector向量）
  ├─ 财务数据表（五表双轨制，ADR-011）
  │   ├─ financial_income/balancesheet/cashflow（标准化三张表）
  │   ├─ financial_indicators（衍生指标：毛利率/净利率/资产负债率/同比）
  │   ├─ financial_raw_tables（非标准化表格，jsonb）
  │   └─ stock_mapping + indicator_aliases（辅助表）
  ├─ 缓存表（PgCache，取代SQLite）
  ├─ 语义缓存表（semantic_cache，pgvector存储embedding，R021）
  └─ 记忆表（L1-L4分层记忆）

Neo4j（知识图谱，R020重构后）
  ├─ 实体节点（多标签：Entity+Company/Indicator/Amount/Product/Location）
  ├─ 语义关系（有向：HAS_REVENUE/OWNS_SHARE/LOCATED_IN等，替代统一RELATION）
  ├─ 关系属性（value字段存储数值，替代数值节点）
  └─ 别名索引（entity_aliases表，支持归一化检索）
```

### 3.4 评估层
```
评估数据收集（collect-rag-data.ts，对齐生产管线）
  → RAGAS自实现评估（ragas_evaluation.py）
       ├─ Context Precision（CP）：检索片段排序质量
       ├─ Context Recall（CR）：ground_truth事实覆盖率
       ├─ Faithfulness（F）：答案对context的忠实度
       └─ Answer Relevancy（AR）：答案与query相关性
  → 评估报告（ragas-report-v{N}-selfimpl-r{N}.json）
```

## 四、功能清单（F001-F016）

详见 [FUNCTIONS.md](FUNCTIONS.md)。

## 五、版本设计索引

| 版本 | 设计文档 | 状态 |
|------|---------|------|
| V13 | [versions/v13/design.md](versions/v13/design.md) | 当前活跃 |
| V12及更早 | docs/archive/ | 已归档 |

## 六、V14 Agent架构升级设计

### 6.1 工具合并+按需加载（R016）

**合并策略**：

| 合并前（10+工具） | 合并后（5+1工具） | 合并逻辑 |
|-------------------|-------------------|---------|
| calculateMA, calculateRSI, calculateMACD, calculateKDJ, calculateBB | `technicalAnalysis` | 统一入口，params.indicator指定指标 |
| calculateVWAP, calculateSharpeRatio, calculateMaxDrawdown, calculateVolatility, calculateCorrelation, calculateVaR | `riskAnalysis` | 统一入口，params.metric指定指标 |
| getStockHistory | `getStockHistory` | 保留（数据获取是前置依赖） |
| getStockInfo, getFinancialData | `getFinancials` | 合并基本面+行情 |
| searchKnowledge | `searchKnowledge` | 保留（RAG检索） |
| - | `toolSearch` | 新增：按需发现工具详情 |

**Tool Search Tool 设计**：
- Agent首次只看到5个高层工具的名称和简短描述
- 需要细节时调用 `toolSearch({query: "技术指标参数"})` 获取完整参数说明
- 返回结果注入下一轮context，而非全量常驻

**自动获取数据**：`technicalAnalysis`/`riskAnalysis` 无缓存时自动调用 data-service 获取股票数据

### 6.2 Context Compaction（R017）

**压缩流程**：
```
对话消息数 > THRESHOLD(20)
  → 取最近5条消息保留完整
  → 早期消息调用LLM生成结构化摘要
  → 摘要格式：{decisions:[], toolResults:[], userPrefs:[], financialData:{}}
  → 替换早期消息为摘要
  → 记录压缩事件到AgentLog
```

**关键约束**：
- 金融数值不压缩（保留原始精度）
- 压缩在Agent迭代间执行（不阻塞当前轮次）
- 压缩摘要token数 < 原始消息的30%

### 6.3 Agent错误恢复（R018）

**Checkpoint设计**：
```
每轮迭代结束 → 保存到Redis:
  key: agent:checkpoint:{conversationId}
  value: {
    iteration: N,
    completedTools: [{name, result}],
    pendingStrategy: "当前策略描述",
    error: null
  }
  TTL: 3600s

失败时 → 从checkpoint恢复:
  1. 读取最近checkpoint
  2. 注入错误信息到下一轮context
  3. 跳过已完成的工具调用
  4. 最多重试2次
  5. 最终失败返回部分结果
```

### 6.4 Transcript分析+耗时追踪（R019）

**耗时记录格式**（存AgentLog）：
```json
{
  "type": "agent_step",
  "iteration": 3,
  "timings": {
    "llmCall": 2520,
    "toolCall_calculateMA": 15,
    "toolCall_getStockHistory": 320,
    "total": 2855
  }
}
```

**前端展示**：在Agent过程卡片中显示每步耗时

**Transcript分析工具**（CLI脚本）：
- 输入：conversationId 或时间范围
- 输出：Top5最慢工具、Top5最常失败工具、平均迭代次数、P50/P95总耗时

## 七、R020 知识图谱深度重构设计

### 7.1 实体类型标签化

```
提取三元组后 → 实体分类器 → 添加Neo4j标签
  ├─ Company: 匹配PostgreSQL companies表（stockNameShort/stockNameFull）
  ├─ Indicator: 关键词列表（营业收入/净利润/ROE/毛利率/资产负债率等）
  ├─ Amount: 正则检测（^[0-9\-,.%元万亿]+$）→ 不创建独立节点
  ├─ Product: 匹配产品名库
  └─ Location: 匹配地名库
```

### 7.2 数值内联化

```
当前：(营业收入, 增长, 12.67%)  →  12.67%是独立Entity节点
改进：(五粮液, 营业收入增长, 12.67%)  →  数值存在关系属性value上

MERGE (h:Entity:Company {name: '五粮液'})
MERGE (t:Entity:Indicator {name: '营业收入'})
MERGE (h)-[r:HAS_INDICATOR {type: '增长', value: '12.67%', sourceDocId: $docId}]->(t)
```

### 7.3 实体归一化

```
别名映射表（从PostgreSQL companies表生成）:
  "五粮液" / "宜宾五粮液股份有限公司" / "五粮液集团公司" → canonical: "五粮液"
  "格力" / "格力电器" / "珠海格力电器股份有限公司" → canonical: "格力电器"

提取三元组后 → 查别名映射 → 替换为canonical名 → 写入Neo4j
```

### 7.4 关系语义化

```
当前：统一RELATION标签，type存在属性中
改进：按语义拆分为有向关系类型

关系类型映射:
  营收 → HAS_REVENUE（公司→指标，value存数值）
  利润 → HAS_PROFIT
  持股 → OWNS_SHARE（公司→公司，ratio存比例）
  位于 → LOCATED_IN（公司→地点）
  生产 → PRODUCES（公司→产品）
  合作 → COOPERATES_WITH（公司→公司）
  竞争 → COMPETES_WITH（公司→公司）
  增长/下降 → HAS_INDICATOR（公司→指标，type=增长/下降，value存数值）
```

### 7.5 增量更新

```
文档更新 → 提取新三元组 → 对比旧三元组:
  ├─ 新增三元组 → MERGE写入
  ├─ 删除三元组 → DETACH DELETE
  └─ 不变三元组 → 跳过

断点续传:
  Redis key: graph:progress:{docId}
  value: {processedChunks: N, totalChunks: M, status: 'processing'|'completed'}
  中断后重跑 → 读取progress → 从第N+1个chunk继续
```

### 7.6 提取脚本设计

```
scripts/rebuild-graph.ts（独立可执行脚本）:
  1. 读取所有已上传文档的chunks
  2. 逐文档提取三元组（Agnes AI，agnes-2.5-flash）
  3. 实体分类+归一化+数值内联
  4. 写入Neo4j（带断点续传）
  5. 输出进度日志+统计报告

参数:
  --doc-id: 指定单个文档（测试用）
  --dry-run: 只提取不写入
  --resume: 从断点继续（默认开启）
  --model: 指定LLM模型（默认agnes-2.5-flash）
```

## 八、R021 语义缓存设计

### 8.1 分层缓存架构

```
LLM调用 → 精确匹配缓存（现有，快速路径）
  ├─ 命中 → 返回（0ms延迟）
  └─ 未命中 → 语义匹配缓存（新增）
       ├─ 计算input embedding（bge-m3，端口8011，~50ms）
       ├─ pgvector cosine相似度查询（同promptTemplate内）
       ├─ 相似度≥0.95 → 返回缓存结果
       └─ 未命中 → 调用LLM → 写入语义缓存
```

### 8.2 缓存存储

```
PostgreSQL表: semantic_cache
  id: UUID
  prompt_template: VARCHAR（如'reflection-eval'/'entity-extract'/'r001-intent'）
  input_text: TEXT
  input_embedding: VECTOR(1024)（bge-m3维度）
  response: JSONB
  model: VARCHAR
  created_at: TIMESTAMP
  hit_count: INT

索引: ivfflat或hnsw（cosine距离）按prompt_template分区
TTL: 30min（通过created_at+定时清理）
```

### 8.3 适用场景

| 场景 | promptTemplate | 预估命中率 |
|------|---------------|-----------|
| 反思节点 | reflection-eval | 20%+ |
| 实体提取 | entity-extract | 30%+ |
| 图谱查询实体提取 | graph-entity-extract | 40%+ |
| R001意图识别 | r001-intent | 30%+ |

## 九、V3.0 大版本升级架构设计

### 9.1 版本号策略

```
对外：V3.0.0（SemVer Major，Breaking Changes）
内部：V15（持续递增）
映射：v3.0.0-iter15

API版本：/api/v1/（当前，deprecated）+ /api/v2/（V3.0新增）
共存期：v1 和 v2 至少共存3个月
```

### 9.2 系统上下文升级（C4 Context）

```
用户
  │
  ├─ Web前端（Next.js App Router）— 保留
  ├─ 微信/支付宝/钉钉小程序（Taro 4）— 新增
  ├─ 安卓/iOS App（Capacitor→React Native）— 新增
  ├─ 鸿蒙 App（ArkTS/ArkUI）— 新增
  │
  ├─ 微服务层
  │   ├─ main-service（端口3000，含LLM Gateway+MCP Server+NeMo Guardrails）— 扩展
  │   ├─ rag-service（端口3001，含评估）— 保留
  │   ├─ data-service（端口8001）— 保留
  │   ├─ crm-oa-adapter（新增，OA/CRM API适配层）
  │   └─ api-gateway（新增，多端统一入口+限流+鉴权）
  │
  ├─ 业务系统（自部署开源产品）
  │   ├─ Odoo Community（OA，端口8069，审批/通知/日程/HR/考勤/报销）— 新增
  │   └─ Twenty CRM（CRM，端口3003，客户/销售/商机/合同/报表，原生MCP）— 新增
  │
  ├─ 基础设施
  │   ├─ PostgreSQL + pgvector — 保留
  │   ├─ Neo4j — 保留
  │   ├─ Redis — 扩展（事件总线+Stream）
  │   ├─ embedding(8011) + reranker(8010) — 保留
  │   └─ LangSmith（可观测性SaaS）— 新增
  │
  └─ 外部系统（SaaS备选通道）
      ├─ 飞书/钉钉/企微 API — 备选
      └─ LLM Provider（AGNES→百炼）— 保留
```

### 9.3 CRM/OA 适配层设计（R022）

```
用户消息 → Agent意图识别
  ├─ 问答意图 → 现有RAG/Agent管道
  └─ 业务意图 → CRM/OA Adapter
       ├─ 意图分类（审批/通知/日程/客户/商机/合同/报表/...）
       ├─ 参数提取（从对话中提取业务所需字段）
       ├─ 权限校验（JWT→用户映射→OA/CRM身份→权限）
       ├─ API调用
       │   ├─ Odoo OA: XML-RPC/REST API（审批/通知/日程/考勤/报销）
       │   ├─ Twenty CRM: MCP Server（客户/销售/商机/合同/报表）
       │   └─ 飞书/钉钉/企微: SaaS API（备选通道）
       ├─ 结果返回（成功/失败/待审批）
       └─ 审计日志（只追加，不可篡改）

LangGraph Tool 封装：
  OA Tools:
    - submitLeave(params) → Odoo HR 模块
    - submitExpense(params) → Odoo 报销模块
    - approveProcess(processId, action) → Odoo 审批
    - sendNotification(target, message) → Odoo 通知
    - querySchedule(date) → Odoo 日程
    - queryProcessStatus(processId) → Odoo 审批状态
  CRM Tools:
    - createCustomer(data) → Twenty CRM（MCP）
    - updateOpportunity(id, stage) → Twenty CRM（MCP）
    - generateReport(type, filters) → Twenty CRM（MCP）
    - searchCustomer(query) → Twenty CRM（MCP）

部署架构（docker-compose 新增）：
  odoo: image: odoo:17, ports: 8069, volumes: odoo-data, mem_limit: 3g
  twenty: image: twentycrm/twenty, ports: 3003, volumes: twenty-data, mem_limit: 2g
  odoo-db: image: postgres:15（Odoo 专用 PG）
```

### 9.4 MCP Server + LLM 约束控制设计（R023）

```
MCP Server（main-service 内嵌）
  ├─ Tool 注册（替代硬编码 ToolRegistry）
  │   ├─ RAG Tools: searchKnowledge, queryRawTables
  │   ├─ Finance Tools: technicalAnalysis, riskAnalysis, marketData
  │   ├─ OA Tools: submitLeave, approveProcess, sendNotification, ...
  │   ├─ CRM Tools: createCustomer, updateOpportunity, generateReport, ...
  │   └─ System Tools: toolSearch, getMetrics
  ├─ 权限控制（按用户角色暴露不同工具）
  ├─ 协议：JSON-RPC 2.0 over stdio/SSE
  └─ 与 LangGraph 集成：MCP Tool → LangGraph Tool 适配器

LLM 约束控制层（NeMo Guardrails + Harness 方法论）
  ├─ NeMo Guardrails（NVIDIA）
  │   ├─ 主题 Guardrail：限制对话范围（金融+OA/CRM业务）
  │   ├─ 输出 Guardrail：约束输出格式（JSON/Markdown/自然语言）
  │   ├─ 对话流控：定义合法对话分支
  │   └─ 安全 Guardrail：防止越狱/Prompt注入
  ├─ Harness 十大原则落地
  │   ├─ H1 约束结构：Guardrails 配置即约束结构
  │   ├─ H2 可观测性：LangSmith 追踪 Guardrails 触发
  │   ├─ H3 渐进约束：从宽松到严格的约束梯度
  │   ├─ H4 上下文感知：根据对话阶段调整约束
  │   └─ H5 失败安全：Guardrails 异常时默认拒绝
  └─ 与现有合规风控整合
      ├─ 合规拒绝 → NeMo Guardrails 主题控制
      ├─ 库外拒绝 → NeMo Guardrails 知识边界
      └─ 日志分级 → LangSmith + 审计日志

Hermes/OpenClaw 借鉴（不引入完整框架）
  ├─ Hermes Skills 机制：Agent 自动创建/改进工具技能
  └─ OpenClaw Gateway：插件市场设计参考
```

### 9.5 多端前端架构（R024）

```
API Gateway（统一后端）
  ├─ /api/v1/... — Web端（Next.js Route Handlers）
  ├─ /api/v2/... — 多端统一API
  │   ├─ /chat — SSE流式对话
  │   ├─ /agent — Agent对话
  │   ├─ /tools — MCP工具调用
  │   └─ /workflow — CRM/OA流程
  └─ 鉴权：JWT + 设备类型Header

前端共享层：
  ├─ @agent/shared-types — TypeScript类型定义
  ├─ @agent/shared-hooks — React Hooks（useChat, useAgent, useSSE）
  ├─ @agent/shared-utils — 工具函数
  └─ @agent/api-client — API客户端（自动适配Web/小程序/RN）

各端独立层：
  ├─ Web: Next.js App Router（现有）
  ├─ 小程序: Taro 4 + React
  ├─ App: Capacitor(快速) → React Native(正式)
  └─ 鸿蒙: ArkTS/ArkUI（独立开发）
```

### 9.6 附注表查询路由优化（R025）

```
用户问"招商银行应收账款账龄分布"
  ↓
BM25/向量检索 → 匹配到 table_name="应收账款账龄分析"（相似度0.85）
  ↓
SQL: SELECT table_data FROM raw_tables
     WHERE stock_code='sh.600036' AND table_name='应收账款账龄分析'
  ↓
返回完整表格JSON（行列结构完整）
```

### 9.7 平台机器人架构（R028）

```
BotAdapter 统一接口：
  interface BotAdapter {
    platform: string                    // 'feishu' | 'dingtalk' | 'wecom' | 'wechat'
    sendMessage(userId, content): void  // 发送消息
    onMessage(callback): void           // 接收消息
    sendStream(userId, stream): void    // 流式响应
  }

平台适配器实现：
  ├─ FeishuBotAdapter — 优先实现（免费组织+应用机器人）
  │   ├─ 事件订阅：im.message.receive_v1
  │   ├─ 消息发送：im/v1/messages
  │   └─ 流式响应：卡片更新模拟
  ├─ DingTalkBotAdapter — 次优先（团队+机器人）
  │   ├─ 群机器人：Outgoing + Webhook
  │   └─ 应用机器人：事件订阅 + 互动卡片
  ├─ WeComBotAdapter — 预留接口（未认证可群机器人）
  │   └─ 群机器人 Webhook（仅发送，无法接收）
  └─ WeChatBotAdapter — 预留接口（需企业资质）
      └─ 服务号消息接口（需认证）

消息路由：
  平台消息 → BotAdapter.onMessage → API Gateway /api/v2/chat
    → Agent 处理 → BotAdapter.sendStream → 平台用户

个人账号限制处理：
  ├─ 飞书：免费组织即可用，无限制
  ├─ 钉钉：手机号创建团队，基本可用
  ├─ 企微：群机器人可用，应用机器人需认证→预留
  └─ 微信：个人号机器人封号风险→禁止，服务号需认证→预留
```

### 9.8 升级阶段路线图

```
Phase 0: 规划（2周）
  ├─ 升级路线图文档
  ├─ 变更影响分析
  ├─ 兼容性矩阵
  └─ 回滚方案

Phase 1: 基础设施（2周）
  ├─ API Gateway 搭建
  ├─ MCP Server 基础框架
  ├─ LangSmith 接入
  └─ 多端 API 层抽象

Phase 2: 核心功能（2周）
  ├─ Odoo OA 部署 + API 适配器
  ├─ Twenty CRM 部署 + MCP 集成
  ├─ 飞书机器人（优先）
  ├─ 钉钉机器人（次优先）
  ├─ MCP Tool 迁移
  ├─ 微信小程序（Taro 4）
  └─ 附注表路由优化

Phase 3: 集成验证（2周）
  ├─ 多端联调
  ├─ E2E测试
  ├─ 性能测试
  └─ 安全审计

Phase 4: 发布（2周）
  ├─ 灰度发布（1%→5%→20%→50%→100%）
  ├─ 监控告警
  ├─ 文档更新
  └─ v1 deprecated 标记
```

## 十、注意事项（从踩坑提炼）

- LLM Provider 额度耗尽会导致评估全0，评估前需检查可用性
- AGNES 用训练截止时间否定正确答案，需在 prompt 中明确约束
- PDF 表格切片会丢失数值，数值类查询必须走 SQL
- BM25 预处理不能删千分位/小数点
- 评估数据集 ground_truth 不能依赖向量检索结果（循环依赖）
