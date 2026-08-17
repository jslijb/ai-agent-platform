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

## 九、注意事项（从踩坑提炼）

- LLM Provider 额度耗尽会导致评估全0，评估前需检查可用性
- AGNES 用训练截止时间否定正确答案，需在 prompt 中明确约束
- PDF 表格切片会丢失数值，数值类查询必须走 SQL
- BM25 预处理不能删千分位/小数点
- 评估数据集 ground_truth 不能依赖向量检索结果（循环依赖）
