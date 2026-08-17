# LLM语义缓存方案

> 日期：2026-08-07
> 状态：⏳ 待审批

---

## 1. 现状分析

### 1.1 当前缓存机制

| 项 | 当前实现 |
|----|---------|
| 文件 | `src/server/llm/cache.ts` |
| 缓存策略 | **精确匹配**（exact match） |
| 缓存键 | `messages内容hash + model + provider` |
| 后端 | Redis + 内存双写（TTL=30min） |
| 调用方 | `orchestrator.ts` + `base.ts`（旧Agent路径） |
| **simpleAgent** | **未使用缓存**（直接调用`callWithFallback`） |

### 1.2 精确匹配缓存的问题

| 场景 | 精确匹配 | 语义缓存 |
|------|---------|---------|
| 用户问"招商银行营收" vs "招商银行营业收入" | ❌ 未命中 | ✅ 语义等价 |
| 同一问题不同轮次（messages不同） | ❌ 未命中 | ✅ 可命中 |
| Agent反思重试（messages追加后） | ❌ 未命中 | ⚠️ 部分命中 |
| 相同问题不同用户 | ❌ 未命中 | ✅ 可命中 |

### 1.3 Agent场景下的缓存命中率分析

| 调用场景 | 调用频率 | 精确命中率 | 语义命中率（预估） |
|----------|---------|-----------|------------------|
| simpleAgent主循环 | 每query 3-5次 | ~0% | ~5-10% |
| 反思节点 | 每query 1次 | ~0% | ~15-20% |
| R001路由 | 每query 1次 | ~0% | ~30%+ |
| entity-extractor | 每文档 1-N次 | ~0% | ~20% |
| graph-retriever实体提取 | 每query 1次 | ~0% | ~40%+ |

**结论**：Agent场景下精确匹配命中率极低（~0%），因为每轮messages都不同。语义缓存对反思/R001/图谱提取等固定prompt场景有较高价值。

---

## 2. 改进方案

### 方案A：分层语义缓存（推荐，2天）

**核心思路**：不同场景使用不同缓存策略，而非一刀切

#### A1: Prompt级缓存（高价值，1天）

**适用场景**：固定prompt模板 + 变量替换的调用（反思节点/R001/entity-extractor/graph-retriever）

**实现**：
```typescript
// 新增 src/server/llm/semantic-cache.ts

interface SemanticCacheEntry {
  promptTemplate: string;  // 如 "reflection-eval" / "entity-extract"
  inputHash: string;       // 输入变量的hash
  embedding: number[];     // 输入的向量表示（用于语义匹配）
  response: BailianResponse;
  createdAt: number;
}

async function semanticCacheGet(
  promptTemplate: string,
  inputText: string,
  similarityThreshold: number = 0.95
): Promise<BailianResponse | null> {
  // 1. 精确匹配（快速路径）
  const exactKey = `semantic:${promptTemplate}:${hash(inputText)}`;
  const exact = await redisGet(exactKey);
  if (exact) return JSON.parse(exact);

  // 2. 语义匹配（使用本地embedding服务）
  const inputEmbedding = await embed(inputText);
  // 从Redis中查找同template下相似度>threshold的条目
  // 使用pgvector的cosine距离查询

  return null;
}
```

**关键设计**：
- 使用本地bge-m3 embedding服务（已有，端口8011）
- 相似度阈值：0.95（高精度，避免误命中）
- 缓存粒度：按promptTemplate分组，避免跨场景误匹配
- TTL：30min（与现有缓存一致）

#### A2: Agent循环缓存优化（中等价值，0.5天）

**适用场景**：simpleAgent主循环中的LLM调用

**实现**：
- 在`callWithFallback`中添加可选缓存参数
- 当`temperature=0`且无工具调用历史时启用缓存
- 缓存键：`systemPrompt hash + 最近3条messages hash + model`
- 命中时直接返回，跳过LLM调用

#### A3: 缓存统计与监控（0.5天）

- 添加缓存命中率指标到 `/api/metrics`
- 区分精确命中/语义命中/未命中
- 按promptTemplate分组统计

### 方案B：GPTCache式全语义缓存（3-4天，复杂度高）

**核心思路**：所有LLM调用都经过语义缓存层

**实现**：
- 使用向量数据库（pgvector）存储所有请求的embedding
- 每次请求先计算embedding，查询最相似的缓存条目
- 相似度>阈值时返回缓存结果

**问题**：
- 延迟增加：每次请求需先调embedding服务（~50ms）
- 误命中风险：Agent场景下messages差异大，语义相似但答案不同
- 维护复杂：需要管理向量索引、过期清理等

### 方案对比

| 维度 | 方案A（分层语义缓存） | 方案B（全语义缓存） |
|------|---------------------|-------------------|
| 工期 | 2天 | 3-4天 |
| 改动范围 | 新增semantic-cache.ts + 修改4个调用方 | 修改callWithFallback全局 |
| 预估命中率 | 反思/R001/图谱: 20-40% | 全场景: 10-15% |
| 延迟影响 | 仅缓存未命中时+50ms(embedding) | 每次请求+50ms |
| 误命中风险 | 低（按template隔离+高阈值） | 中（跨场景可能误匹配） |
| 可维护性 | 高（分层清晰） | 中（全局缓存策略复杂） |

---

## 3. 实施计划（方案A）

| 步骤 | 内容 | 预计耗时 |
|------|------|----------|
| 1 | 新增semantic-cache.ts：embedding调用+Redis/pgvector存储+语义匹配 | 4h |
| 2 | 修改reflection-node.ts：使用语义缓存 | 1h |
| 3 | 修改entity-extractor.ts：使用语义缓存 | 1h |
| 4 | 修改graph-retriever.ts：使用语义缓存 | 1h |
| 5 | 修改query-router.ts：R001意图识别使用语义缓存 | 1h |
| 6 | 添加缓存统计API | 2h |
| 7 | E2E验证：缓存命中率测试 | 2h |
| 8 | 单元测试 | 2h |

**总计**：~14h（2个工作日）

---

## 4. 验证标准

| 指标 | 当前 | 目标 |
|------|------|------|
| 精确缓存命中率 | ~0%（Agent场景） | 保持（精确匹配仍作为快速路径） |
| 语义缓存命中率 | 0%（未实现） | 反思节点20%+ / 图谱提取30%+ |
| LLM调用次数（5个E2E query） | ~20次 | 减少15-25% |
| 缓存查询延迟 | 0ms | <50ms（embedding调用） |
| 误命中率 | 0% | <1%（高阈值保障） |

---

## 5. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| embedding服务不可用 | 低 | 降级为精确匹配缓存 |
| 语义误命中导致错误答案 | 中 | 高阈值(0.95) + 按template隔离 + 缓存结果验证 |
| pgvector索引性能 | 低 | 数据量小（<10K条），HNSW索引足够 |
| 缓存过期导致旧数据 | 低 | TTL=30min + 主动失效机制 |