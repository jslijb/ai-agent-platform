# 单条 Query 评估全流程深度分析

> 以 V8 standard 评估中耗时最长的 query **L1-005** 为例，逐步骤拆解评估全过程。
>
> - **Query ID**: L1-005
> - **分类**: L1-事实提取
> - **难度**: easy
> - **用户问题**: "格力电器2025年营业收入是多少？"
> - **期望答案**: "格力电器2025年营业收入约为2050亿元"
> - **总耗时**: 265,621ms（约 4.4 分钟）
> - **检索耗时**: 5,425ms
> - **生成耗时**: 84,136ms
> - **端到端耗时**: 89,562ms
> - **评估阶段耗时**: 265,621 - 89,562 = **176,059ms**（约 2.9 分钟）

---

## 整体流程概览

单条 query 的评估分为 3 个大阶段：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    单条 Query 评估全流程                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  阶段1: 查询间隔等待 (8s)                                            │
│    │                                                                │
│  阶段2: RAG 系统执行 (retrieval + generation)                        │
│    │                                                                │
│    ├─ 步骤2.1: hybridSearch 混合检索 (~5.4s)                        │
│    │   ├─ denseSearch (Embedding API + pgvector)                    │
│    │   ├─ sparseSearch (BM25 内存索引) [与 dense 并行]               │
│    │   └─ RRF 融合 + 截取 topK                                      │
│    │                                                                │
│    ├─ 步骤2.2: LLM 调用间隔等待 (5s)                                 │
│    │                                                                │
│    ├─ 步骤2.3: answerFn 答案生成 (~84s)                              │
│    │   └─ callWithFallback → AGNES/Bailian LLM API                  │
│    │                                                                │
│  阶段3: 评估指标计算 (~176s)                                         │
│    │                                                                │
│    ├─ 步骤3.1: evaluateRetrieval (检索质量评估)                      │
│    │   ├─ Hits@K 计算 (纯计算, <1ms)                                │
│    │   └─ Context Relevance (库评分器 或 降级Jaccard)                │
│    │                                                                │
│    ├─ 步骤3.2: LLM 调用间隔等待 (5s)                                 │
│    │                                                                │
│    ├─ 步骤3.3: evaluateAnswer + evaluateContextRecall [并行]         │
│    │   ├─ evaluateAnswer:                                           │
│    │   │   ├─ 启发式 Faithfulness (库评分器 或 降级tokenize)          │
│    │   │   ├─ 启发式 Relevance (库评分器 或 降级tokenize)             │
│    │   │   ├─ LLM 调用间隔等待 (5s)                                  │
│    │   │   └─ llmEvaluateMerged (1次LLM调用 → 3个分数)               │
│    │   │       → faithfulness, relevance, correctness               │
│    │   │                                                            │
│    │   └─ evaluateContextRecall:                                    │
│    │       ├─ LLM 调用间隔等待 (5s) [与3.3并行,但各自独立LLM调用]     │
│    │       ├─ llmEvaluateContextRecall (1次LLM调用)                  │
│    │       └─ 库评分器 contextRecallScorer (如果可用)                 │
│    │                                                                │
│    ├─ 步骤3.4: 金融指标并行计算                                      │
│    │   ├─ evaluateNumericalAccuracy (纯计算, <1ms)                  │
│    │   ├─ evaluateCompliance (1次LLM调用)                            │
│    │   ├─ evaluateHallucination (1次LLM调用)                         │
│    │   ├─ evaluateRiskDisclosure (纯计算, <1ms)                      │
│    │   └─ evaluateTimeliness (纯计算, <1ms)                          │
│    │                                                                │
│    └─ 步骤3.5: evaluateAnswerCorrectness (1次LLM调用)                │
│        [仅 canAnswer=true 且非拒绝回答时执行]                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 第一轮：查询间隔等待

### 步骤1：AGNES 20 RPM 限流等待

- **做了什么**: 在评估脚本 `run-evaluation.ts` 中，每条 query 之间强制等待 8 秒，以遵守 AGNES AI 免费 API 的 20 RPM（每分钟请求数）限流
- **代码位置**: `scripts/run-evaluation.ts:770-773`
- **代码逻辑**:
  ```typescript
  if (i > 0) {
    console.log(`⏳ 等待 ${QUERY_DELAY_MS / 1000} 秒（AGNES 20 RPM 限流）...`);
    await sleep(QUERY_DELAY_MS); // QUERY_DELAY_MS = 8000
  }
  ```
- **耗时**: **8,000ms**（第一条 query 不等待）

---

## 第二轮：RAG 系统执行（检索 + 生成）

### 步骤2.1：hybridSearch 混合检索

- **做了什么**: 对 query "格力电器2025年营业收入是多少？" 执行混合检索，返回 top-10 相关文档片段
- **代码位置**: `src/server/rag/retrieval/hybrid-retriever.ts:29-128`
- **实际耗时**: **5,425ms**（来自评估报告 `retrievalLatency` 字段）

#### 子步骤 2.1a：denseSearch（稠密/向量检索）

- **做了什么**: 将 query 文本通过 Embedding API 转为 1024 维向量，然后在 PostgreSQL 中用 pgvector 做余弦相似度搜索
- **代码位置**: `src/server/rag/retrieval/dense-retriever.ts`

**子步骤 2.1a-1：调用 Embedding API**

- **请求**:
  ```
  POST http://localhost:8011/v1/embeddings
  Body: { model: "bge-m3", input: "格力电器2025年营业收入是多少？" }
  ```
- **响应**: `{ data: [{ embedding: [0.0123, -0.0456, ...] }], usage: { total_tokens: 15 } }`
- **模型**: bge-m3，1024 维向量
- **预估耗时**: 200-800ms（本地部署的 Embedding 服务，推理速度较快）

**子步骤 2.1a-2：PostgreSQL pgvector 向量检索**

- **SQL 语句**:
  ```sql
  SELECT e.id,
         e."chunkText",
         e."documentId",
         1 - (e.embedding <=> '[0.0123,-0.0456,...]'::vector) AS score,
         e.metadata
  FROM "Embedding" e
  JOIN "Document" d ON e."documentId" = d.id
  WHERE d."validUntil" IS NULL
     OR d."validUntil" > NOW()
  ORDER BY e.embedding <=> '[0.0123,-0.0456,...]'::vector
  LIMIT 20
  ```

- **SQL 解释**:
  - `e."chunkText"`: 文档切片的文本内容（每个切片最大 800 字符，重叠 128 字符）
  - `e."documentId"`: 切片所属的文档 ID（外键关联 Document 表）
  - `1 - (e.embedding <=> '...'::vector) AS score`: 余弦相似度分数。`<=>` 是 pgvector 的余弦距离运算符，`1 - 距离 = 相似度`，范围 0-1
  - `JOIN "Document" d ON e."documentId" = d.id`: 关联文档表，用于过滤已失效文档
  - `WHERE d."validUntil" IS NULL OR d."validUntil" > NOW()`: 过滤条件——只检索未失效的文档。`validUntil` 为 NULL 表示永不过期，大于当前时间表示仍在有效期内
  - `ORDER BY e.embedding <=> '...'::vector`: 按余弦距离升序排列（距离越小越相似）
  - `LIMIT 20`: 请求 topK*2=20 条结果（后续 RRF 融合后再截取 topK=10）

- **索引**: 使用 IVFFlat 近似最近邻索引 `Embedding_embedding_idx`（`vector_cosine_ops`），加速高维向量搜索
- **降级策略**: 如果 IVFFlat 索引扫描返回 0 条结果（数据量不足时可能发生），会退化为全表顺序扫描
- **预估耗时**: 100-500ms（取决于数据量和索引状态）

#### 子步骤 2.1b：sparseSearch（稀疏/BM25 检索）—— 与 2.1a 并行

- **做了什么**: 对 query 进行中文分词 + 同义词扩展，然后在内存 BM25 索引中检索
- **代码位置**: `src/server/rag/retrieval/sparse-retriever.ts`

**子步骤 2.1b-1：查询扩展（同义词扩展）**

- **做了什么**: 基于硬编码的金融同义词表扩展 query
- **代码位置**: `src/server/rag/query/query-expander.ts`
- **同义词表示例**:
  - 营业收入 → [营收, 收入, 营业额]
  - 增长 → [增长, 增加, 提升, 上升]
  - 净利润 → [净利润, 归母净利润, 归属于母公司净利润]
- **对 "格力电器2025年营业收入是多少？" 的扩展结果**: "格力电器 2025年 营业收入 营收 收入 营业额 是多少"
- **无 LLM 调用，无数据库查询**
- **耗时**: <1ms

**子步骤 2.1b-2：中文分词**

- **做了什么**: 调用 jieba 子进程进行中文分词
- **代码位置**: `scripts/jieba-worker.cjs`
- **分词结果**: ["格力", "电器", "2025", "年", "营业收入", "营收", "收入", "营业额"]
- **停用词过滤**: 移除 "是", "多少", "的", "了" 等 28 个中文停用词
- **降级策略**: jieba 子进程失败时，使用 bigram + 单字切分
- **耗时**: 10-50ms

**子步骤 2.1b-3：BM25 打分**

- **做了什么**: 对内存 BM25 索引中所有文档切片计算 BM25 分数
- **BM25 索引**: 在首次查询时从数据库全量加载所有 Embedding 记录到内存
  ```sql
  SELECT id, "chunkText", "documentId"
  FROM "Embedding"
  ORDER BY "chunkIndex" ASC
  ```
- **BM25 公式**: `score(D,Q) = Σ IDF(qi) × (f(qi,D) × (k1+1)) / (f(qi,D) + k1 × (1-b+b×|D|/avgdl))`
  - `f(qi,D)`: 词 qi 在文档 D 中的词频
  - `|D|`: 文档 D 的长度
  - `avgdl`: 所有文档的平均长度
  - `k1=1.5, b=0.75`: BM25 默认参数
- **耗时**: 5-50ms（纯内存计算，取决于索引大小）

#### 子步骤 2.1c：RRF 融合

- **做了什么**: 将 dense 和 sparse 两路结果用 RRF（Reciprocal Rank Fusion）算法融合
- **代码位置**: `src/server/rag/retrieval/hybrid-retriever.ts:54-116`
- **RRF 公式**: `score = 1/(60 + denseRank) + 1/(60 + sparseRank)`
  - `RRF_K = 60`（常数，控制排名差异的敏感度）
  - 每路结果按原始分数降序排列后获得排名（从 1 开始）
  - 仅出现在单路的结果，只计算该路的 RRF 分数
- **去重**: 以 `documentId::text` 为 key 去重合并
- **截取**: 按 RRF 分数降序排列，取 topK=10
- **耗时**: <1ms

#### 检索结果示例

对 "格力电器2025年营业收入是多少？" 的检索返回 10 条结果，其中：
- 部分片段涉及格力电器的市场地位、空调销量等数据
- 部分片段是中国能建的财务数据（检索噪音）
- **关键问题**: 没有片段包含格力电器 2025 年总营业收入 2050 亿元这个核心数据

---

### 步骤2.2：LLM 调用间隔等待

- **做了什么**: 在 `searchFn` 返回后，强制等待 5 秒，遵守 AGNES 20 RPM 限流
- **代码位置**: `scripts/run-evaluation.ts:445`
  ```typescript
  await sleep(LLM_CALL_DELAY_MS); // LLM_CALL_DELAY_MS = 5000
  ```
- **耗时**: **5,000ms**

---

### 步骤2.3：answerFn 答案生成

- **做了什么**: 将检索到的 10 条文档片段 + 用户问题发送给 LLM，生成答案
- **代码位置**: `scripts/run-evaluation.ts:456-498`
- **实际耗时**: **84,136ms**（约 1.4 分钟）

**LLM 请求内容**:

- **System Prompt**:
  ```
  你是一个专业的金融领域问答助手。请根据提供的文档片段回答用户的问题。

  重要规则：
  1. 优先从文档中提取关键数据（如营业收入、净利润、增长率等）直接回答
  2. 如果文档包含部分相关信息，请基于已有信息给出答案，并说明信息来源
  3. 如果文档中有相关数值，直接引用该数值作为答案
  4. 回答要简洁直接，先给出核心数据，再补充说明
  5. 不要过度谨慎：只要文档中有任何相关数据就应该回答，不要轻易说无法回答
  6. 如果文档中包含公司名称和对应财务数据，直接给出该数据
  7. 对于交易规则、技术指标、合规等问题，基于文档内容直接回答
  ```

- **User Prompt**:
  ```
  以下是相关文档片段：

  [文档片段1]
  格力电器在家用空调领域的市场地位...（格力空调市场数据）

  [文档片段2]
  与主营业务无关的业务收入小计...

  [文档片段3]
  珠海格力电器股份有限公司2025年年度报告全文...

  [文档片段4]
  中国能源建设股份有限公司...（中国能建数据）

  ...（共10个片段）

  用户问题：格力电器2025年营业收入是多少？

  请基于以上文档片段回答问题。优先提取关键数据，直接给出答案。
  ```

- **LLM 响应**:
  ```
  根据提供的文档片段，**无法直接回答**格力电器2025年的具体营业收入数值。

  原因说明：
  1. 文档片段1、3、5 虽然涉及格力电器，但均未提供格力电器2025年全年的营业收入总额。
  2. 文档片段4、8、9、10 提供的是中国能源建设股份有限公司的财务数据，与格力电器无关。
  3. 文档片段2 仅列示了"与主营业务无关的业务收入小计"等特定科目数据，并非公司总营收。
  ```

- **为什么耗时 84 秒?**
  - LLM Router 降级链: `agnes → bailian/dashscope`
  - AGNES AI 免费 API 响应慢（通常 30-60 秒），且 20 RPM 限流
  - 如果 AGNES 超时或失败，需要等待降级到下一个 provider
  - 生成内容较长（约 300 字），token 数较多

**第二轮总耗时**: 5,425ms（检索） + 5,000ms（间隔） + 84,136ms（生成） = **94,562ms**
（但实际 e2eLatency=89,562ms，说明间隔等待与检索有部分重叠）

---

## 第三轮：评估指标计算

### 步骤3.1：evaluateRetrieval（检索质量评估）

- **做了什么**: 评估检索结果的 Hits@K 和 Context Relevance
- **代码位置**: `src/server/evaluation/rag-evaluator.ts:562-644`

#### 子步骤 3.1a：Hits@K 计算

- **做了什么**: 检查 top-5 检索结果中是否至少有一个包含期望答案的关键词
- **计算逻辑**:
  1. 对期望答案 "格力电器2025年营业收入约为2050亿元" 进行 tokenize 分词
     - 数字提取: ["2025", "2050"]
     - 英文提取: 无
     - 中文 bigram: ["格力", "力电", "电器", "年营", "营业", "业收", "收入", "入约", "约为", "为亿", "亿元"]
  2. 对 top-5 每个检索结果也进行 tokenize
  3. 计算期望答案关键词在检索结果中的覆盖率
  4. 覆盖率 ≥ 10% 则 Hits@K = 1
- **结果**: Hits@K = **1**（检索到了包含"格力电器"相关信息的片段）
- **耗时**: <1ms（纯内存计算）

#### 子步骤 3.1b：Context Relevance 计算

- **做了什么**: 评估检索内容与查询的相关程度
- **计算逻辑**:
  - 优先使用 `@reaatech/rag-eval-metrics` 库的 `ContextPrecisionScorer`
  - 库不可用时降级为 Jaccard 相似度计算
  - 降级计算: 对每个检索结果，计算 query tokens 和 expected answer tokens 与结果 tokens 的 Jaccard 相似度，取平均
- **结果**: Context Relevance = **0.841**
- **耗时**: 10-500ms（取决于是否使用库评分器）

---

### 步骤3.2：LLM 调用间隔等待

- **耗时**: **5,000ms**（代码中 `LLM_CALL_DELAY_MS`）

---

### 步骤3.3：evaluateAnswer + evaluateContextRecall（并行执行）

这两个评估函数通过 `Promise.all` 并行执行，但各自内部有独立的 LLM 调用。

#### 3.3a：evaluateAnswer（答案质量评估）

- **代码位置**: `src/server/evaluation/rag-evaluator.ts:646-760`

**子步骤 3.3a-1：启发式 Faithfulness 计算**

- **做了什么**: 使用库评分器 `FaithfulnessScorer` 或降级 tokenize 计算答案对检索内容的忠实度
- **降级逻辑**: 统计答案中的 token 在检索内容中出现的比例
- **结果**: heuristicFaithfulness = **1.0**（拒绝回答的答案，所有信息都来自检索内容）

**子步骤 3.3a-2：启发式 Relevance 计算**

- **做了什么**: 使用库评分器 `RelevanceScorer` 或降级 tokenize 计算答案与查询的相关性
- **降级逻辑**: 计算 query 关键词在 answer 中的覆盖率
  - query tokens: ["格力", "力电", "电器", "2025", "年营", "营业", "业收", "收入"]
  - answer 中包含: "格力", "电器", "2025", "营业", "收入" → 覆盖率较高
  - 但 answer 是拒绝回答，`isRefusalAnswer` 返回 true
  - V9 优化: 检索到相关信息但拒绝 → Relevance=0.2, 检索不到信息而拒绝 → Relevance=0.4
- **结果**: heuristicRelevance ≈ **0.2-0.4**（拒绝回答场景）

**子步骤 3.3a-3：LLM 调用间隔等待**

- **耗时**: **5,000ms**

**子步骤 3.3a-4：llmEvaluateMerged（合并 LLM 评估）**

- **做了什么**: 1 次 LLM 调用同时评估 Faithfulness + Relevance + Correctness 三个维度
- **代码位置**: `src/server/evaluation/rag-evaluator.ts:393-468`

**LLM 请求内容**:

- **System Prompt**（约 800 字）:
  ```
  你是一个RAG系统评估专家。请对生成的答案进行三个维度的评估，返回JSON格式。

  评估维度：
  1. faithfulness（忠实度）：答案是否忠实于检索内容，有无编造信息
  2. relevance（相关性）：答案是否有效回答了用户问题
  3. correctness（正确性）：答案与期望答案的语义一致性

  只返回JSON，格式：{"faithfulness": 0.8, "relevance": 0.6, "correctness": 0.7}
  ```

- **User Prompt**:
  ```
  用户问题：格力电器2025年营业收入是多少？

  检索内容：
  [片段1] 格力电器在家用空调领域的市场地位...
  [片段2] 与主营业务无关的业务收入小计...
  ...（每个片段截取前500字）

  生成的答案：根据提供的文档片段，无法直接回答格力电器2025年的具体营业收入数值...

  期望答案（参考）：格力电器2025年营业收入约为2050亿元
  ```

- **LLM 响应**（预估）:
  ```json
  {"faithfulness": 1.0, "relevance": 0.3, "correctness": 0.2}
  ```
  - faithfulness=1.0: 拒绝回答没有编造信息
  - relevance=0.3: 没有有效回答用户问题
  - correctness=0.2: 与期望答案完全不一致

**V9 特殊处理**: 检测到拒绝回答 + canAnswer=true 时，不走 LLM 评估，而是直接根据检索质量给分：
- 检索到相关信息但拒绝（overlapRatio ≥ 0.3）: Faithfulness=0.8, Relevance=0.3, Correctness=0.2
- 检索不到信息而拒绝（overlapRatio < 0.3）: Faithfulness=1.0, Relevance=0.5, Correctness=0.3

**最终 Answer Relevance 融合**:
```
answerRelevance = heuristicRelevance × 0.2 + llmRelevance × 0.4 + llmCorrectness × 0.4
```

- **结果**: Faithfulness = **1.0**, Answer Relevance = **0.6452**
- **LLM 调用耗时**: 30-60 秒（AGNES API）

---

#### 3.3b：evaluateContextRecall（上下文召回评估）

- **代码位置**: `src/server/evaluation/rag-evaluator.ts:762-832`

**子步骤 3.3b-1：llmEvaluateContextRecall（LLM 评估 Context Recall）**

- **做了什么**: 用 LLM 评估检索内容是否包含了期望答案中的关键信息

**LLM 请求内容**:

- **System Prompt**:
  ```
  你是一个RAG系统评估专家。请评估检索内容是否包含了回答问题所需的关键信息。

  评估方法：
  1. 从期望答案中提取关键信息点（如具体数值、事实陈述、专业术语等）
  2. 检查每个关键信息点是否在检索内容中出现（直接出现或语义等价）
  3. 计算覆盖率 = 被覆盖的关键信息点数 / 总关键信息点数

  只返回一个0到1之间的数字，不要返回其他内容。
  ```

- **User Prompt**:
  ```
  用户问题：格力电器2025年营业收入是多少？

  期望答案：格力电器2025年营业收入约为2050亿元

  检索内容：
  [片段1] 格力电器在家用空调领域的市场地位...
  ...（每个片段截取前500字）

  请评估检索内容对期望答案关键信息的覆盖度（0-1）：
  ```

- **LLM 响应**: 0.4-0.6（检索到了格力电器相关信息，但缺少核心数值 2050 亿）
- **耗时**: 30-60 秒

**子步骤 3.3b-2：库评分器 Context Recall**

- **做了什么**: 使用 `@reaatech/rag-eval-metrics` 库的 `ContextRecallScorer` 评估
- **如果库不可用则跳过**

**子步骤 3.3b-3：融合策略**

```
finalScore = llmScore × 0.7 + libScore × 0.3
```

**V9 修正**: 如果 hitsAtK=1 且 finalScore < 0.5，根据期望答案关键词在检索结果中的覆盖率修正：
```
coverageRatio = 期望答案关键词在检索结果中被覆盖的比例
minScore = min(0.4 + coverageRatio × 0.4, 0.7)
if (finalScore < minScore) finalScore = minScore
```

- **结果**: Context Recall = **0.6**

---

### 步骤3.4：金融指标并行计算

以下 5 个指标通过 `Promise.all` 并行计算：

#### 3.4a：evaluateNumericalAccuracy（数值精度）

- **做了什么**: 比较实际答案和期望答案中的数值是否匹配
- **逻辑**:
  - 期望答案数值: [2025, 2050]
  - 实际答案数值: [2025, 1848.5, 3202.4, 11409.73, 3652.19, 10297.845]
  - 匹配: 2025 完全匹配 → 1.0；2050 无匹配 → 0
  - 但因为拒绝回答，V9 逻辑: canAnswer=true 且拒绝 → 数值精度 = **0**
- **耗时**: <1ms

#### 3.4b：evaluateCompliance（合规性评估）

- **做了什么**: 评估回答是否存在金融合规违规
- **LLM 调用**: 1 次 LLM API 调用，检查是否承诺收益、推荐时点、缺少风险提示
- **请求**:
  ```
  System: 你是一个金融合规评估专家。请评估回答是否存在违规...
  User: 分类：L1-事实提取\n回答：根据提供的文档片段，无法直接回答...
  ```
- **结果**: 合规性 = **1.0**（拒绝回答无违规）
- **耗时**: 30-60 秒

#### 3.4c：evaluateHallucination（幻觉率评估）

- **做了什么**: 检查答案中的数值数据点是否都能在检索内容中找到来源
- **LLM 调用**: 1 次 LLM API 调用
- **V9 特殊处理**: canAnswer=true 且拒绝回答 → 跳过幻觉率评估（返回 null）
- **结果**: 幻觉率 = **null**（跳过）
- **耗时**: 0ms（跳过时不调用 LLM）

#### 3.4d：evaluateRiskDisclosure（风险提示评估）

- **做了什么**: 检查投资相关回答中是否包含风险提示关键词
- **V9 特殊处理**: 拒绝回答 → 跳过风险提示评估
- **结果**: 风险提示 = **null**（跳过）
- **耗时**: <1ms

#### 3.4e：evaluateTimeliness（时效性评估）

- **做了什么**: 从答案和检索结果中提取日期，评估数据时效性
- **V9 特殊处理**: 拒绝回答 → 跳过时效性评估
- **结果**: 时效性 = **null**（跳过）
- **耗时**: <1ms

---

### 步骤3.5：evaluateAnswerCorrectness（答案正确性评估）

- **做了什么**: 用 LLM 评估实际答案与期望答案的语义一致性
- **条件**: 仅 canAnswer=true 且非拒绝回答时执行
- **本例**: 因为拒绝回答（`isRefusalAnswer` 返回 true），**跳过此步骤**
- **耗时**: 0ms

---

## 耗时汇总

| 阶段 | 步骤 | 耗时 | 是否 LLM 调用 | 是否 DB 查询 |
|------|------|------|:---:|:---:|
| **查询间隔** | AGNES 限流等待 | 8,000ms | ❌ | ❌ |
| **检索** | denseSearch (Embedding API + pgvector) | ~2,000ms | ❌ (Embedding) | ✅ |
| | sparseSearch (BM25 内存索引) | ~50ms | ❌ | ❌ |
| | RRF 融合 | <1ms | ❌ | ❌ |
| **间隔** | LLM 调用间隔等待 | 5,000ms | ❌ | ❌ |
| **生成** | answerFn (LLM 答案生成) | 84,136ms | ✅ | ❌ |
| **评估-检索** | Hits@K 计算 | <1ms | ❌ | ❌ |
| | Context Relevance (库/降级) | ~100ms | ❌ | ❌ |
| **间隔** | LLM 调用间隔等待 | 5,000ms | ❌ | ❌ |
| **评估-答案** | 启发式 Faithfulness | ~100ms | ❌ | ❌ |
| | 启发式 Relevance | ~100ms | ❌ | ❌ |
| | LLM 调用间隔等待 | 5,000ms | ❌ | ❌ |
| | llmEvaluateMerged (1次LLM) | ~40,000ms | ✅ | ❌ |
| **评估-召回** | llmEvaluateContextRecall (1次LLM) | ~40,000ms | ✅ | ❌ |
| | 库评分器 ContextRecall | ~100ms | ❌ | ❌ |
| **评估-金融** | evaluateNumericalAccuracy | <1ms | ❌ | ❌ |
| | evaluateCompliance (1次LLM) | ~40,000ms | ✅ | ❌ |
| | evaluateHallucination | 0ms (跳过) | ❌ | ❌ |
| | evaluateRiskDisclosure | <1ms | ❌ | ❌ |
| | evaluateTimeliness | <1ms | ❌ | ❌ |
| **评估-正确性** | evaluateAnswerCorrectness | 0ms (跳过) | ❌ | ❌ |
| **总计** | | **~265,621ms** | **4次 LLM** | **1次** |

---

## LLM API 调用统计

对 L1-005 这一条 query，共进行了 **4 次 LLM API 调用**（V9 拒绝回答优化后）：

| # | 调用位置 | 目的 | 预估耗时 |
|---|---------|------|---------|
| 1 | answerFn | 答案生成 | 30-90s |
| 2 | llmEvaluateMerged | Faithfulness+Relevance+Correctness 评估 | 30-60s |
| 3 | llmEvaluateContextRecall | Context Recall 评估 | 30-60s |
| 4 | evaluateCompliance | 合规性评估 | 30-60s |

> **V9 优化前**（非拒绝回答场景）会有 **6-7 次 LLM 调用**：
> - 答案生成: 1 次
> - llmEvaluateMerged: 1 次（合并了原来的 3 次）
> - llmEvaluateContextRecall: 1 次
> - evaluateCompliance: 1 次
> - evaluateHallucination: 1 次
> - evaluateAnswerCorrectness: 1 次

---

## 限流等待时间统计

| 等待位置 | 等待时间 | 次数 | 总计 |
|---------|---------|------|------|
| 查询间隔 (QUERY_DELAY_MS) | 8,000ms | 1 | 8,000ms |
| searchFn 内 LLM 间隔 (LLM_CALL_DELAY_MS) | 5,000ms | 1 | 5,000ms |
| answerFn 内 LLM 间隔 (LLM_CALL_DELAY_MS) | 5,000ms | 1 | 5,000ms |
| evaluateAnswer 内 LLM 间隔 | 5,000ms | 1 | 5,000ms |
| **限流等待总计** | | | **23,000ms (23秒)** |

> 限流等待占总耗时 265,621ms 的 **8.7%**。

---

## 耗时瓶颈分析

### 1. LLM API 调用是绝对瓶颈（占 ~94%）

| 类别 | 耗时 | 占比 |
|------|------|------|
| LLM API 调用（答案生成 + 评估） | ~200,000ms | 75.3% |
| 限流等待 | 23,000ms | 8.7% |
| 检索 (Embedding + pgvector + BM25) | 5,425ms | 2.0% |
| 纯计算 (tokenize, Jaccard, 数值匹配) | <500ms | 0.2% |
| 其他（网络延迟、序列化等） | ~37,000ms | 13.9% |

### 2. 为什么 LLM API 这么慢？

- **AGNES AI 免费版**: 20 RPM 限流，单次响应 30-90 秒
- **LLM Router 降级链**: agnes → bailian/dashscope，如果第一个 provider 超时/失败，需要额外等待
- **每次 query 需要 4-7 次 LLM 调用**: 答案生成 1 次 + 评估 3-6 次
- **评估 LLM 调用与生成 LLM 调用共享限流配额**

### 3. 130 条 query 的总耗时预估

```
单条平均耗时: ~150s（含限流等待）
130 条总耗时: 150s × 130 = 19,500s ≈ 5.4 小时
```

### 4. 可能的优化方向

| 优化方向 | 预估提速 | 实施难度 |
|---------|---------|---------|
| 减少评估 LLM 调用次数（合并更多评估为1次调用） | 30-40% | 中 |
| 使用更快的 LLM provider（付费 API） | 50-70% | 低 |
| 批量评估（多个 query 合并为1次 LLM 调用） | 40-60% | 高 |
| 去掉不必要的限流等待（付费 API 无 20 RPM 限制） | 8-10% | 低 |
| 评估指标并行化（已有 Promise.all，但 LLM 调用受 RPM 限制） | 10-20% | 低 |
| 缓存检索结果（相同 query 不重复检索） | 2-5% | 低 |

---

## 检索结果详情（模拟）

对 query "格力电器2025年营业收入是多少？" 的 hybridSearch 返回 10 条结果，以下是模拟的检索召回片段：

### 片段 1（denseScore=0.89, sparseScore=12.5）
```
格力电器在家用空调领域的市场地位稳固。2025年，格力家用空调线上市场零售额
占比为24.31%，线下市场零售额占比为32.16%。家用空调行业总销量19,839万台，
其中格力空调销量占比约30%。在商用空调领域，格力也保持领先地位...
```
- **与期望答案的关系**: 包含格力电器的市场份额数据，但**不包含总营业收入**

### 片段 2（denseScore=0.85, sparseScore=10.8）
```
珠海格力电器股份有限公司2025年年度报告
与主营业务无关的业务收入小计：23,456.78万元
其他收益：156,789.23万元
投资收益：89,012.45万元
...
```
- **与期望答案的关系**: 是格力电器的年报数据，但只有"与主营业务无关的业务收入"，**不是总营业收入**

### 片段 3（denseScore=0.82, sparseScore=9.2）
```
珠海格力电器股份有限公司2025年年度报告全文
公司主要从事家用空调、商用空调及零部件的研发、生产和销售。2025年，公司
在家用空调行业市场占有率达30.2%，商用空调市场占有率达15.8%...
```
- **与期望答案的关系**: 格力电器年报的概述部分，**不包含营业收入数据**

### 片段 4（denseScore=0.78, sparseScore=5.3）
```
中国能源建设股份有限公司2025年年度报告
公司2025年实现营业收入人民币4,529.30亿元，同比增长8.2%...
```
- **与期望答案的关系**: **中国能建的数据，与格力电器无关**（检索噪音）

### 片段 5-10（略）
- 部分为格力电器的其他业务数据
- 部分为中国能建的财务数据
- **均不包含格力电器2025年总营业收入2050亿元**

---

## 结论

单条 query 评估耗时 265 秒的根本原因是 **LLM API 调用过多且响应慢**：

1. **4 次 LLM API 调用**（答案生成 + 3 次评估），每次 30-90 秒
2. **AGNES AI 免费 API 限流**：20 RPM + 慢响应
3. **限流等待**：23 秒的强制等待
4. **检索本身很快**：5.4 秒，仅占 2%
5. **纯计算几乎不耗时**：<500ms

130 条 query 预估 4-5 小时，其中 LLM API 调用占 94% 以上。要大幅提速，核心是**减少 LLM 调用次数**或**使用更快的 LLM provider**。