## Day 4 任务清单：GraphRAG 知识图谱 + 多跳推理

**前置条件**：
- Neo4j 容器已启动（Day 1 已配置，端口 7687）
- 已安装 `neo4j-driver`（若未安装：`npm install neo4j-driver`）
- Day 3 的文档上传和混合检索基本可用

---

### 第 1 步：安装依赖

```bash
npm install neo4j-driver
```

---
第一步已完成，无需理会。

### 第 2 步：实现实体抽取模块（LLM 生成三元组）

**提示词（后续放入 Trae）**：
```
在 /app/server/rag/graph/entity-extractor.ts 中，实现：
- 函数 extractTriples(text: string): Promise<Array<{head: string, relation: string, tail: string}>>
- 使用阿里百炼模型（callBailian）构造 prompt，要求输出 JSON 格式的实体关系三元组
- Prompt 示例：从以下文本中提取(实体, 关系, 实体)，关系使用预定义类型：生产、竞争、合作、收购、位于、属于...
- 处理多个句子，返回去重后的三元组列表
```

---

### 第 3 步：实现图谱构建模块（写入 Neo4j）

**提示词**：
```
在 /app/server/rag/graph/graph-builder.ts 中，实现：
- 连接 Neo4j 数据库（使用环境变量 NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD）
- 函数 createGraph(docId: string, triples: Array<{head, relation, tail}>): Promise<void>
- 使用 Cypher 语句：MERGE (h:Entity {name: $head}) MERGE (t:Entity {name: $tail}) MERGE (h)-[:RELATION {type: $relation}]->(t)
- 添加文档来源属性（sourceDocId）用于溯源
- 提供删除文档图谱的函数 deleteGraph(docId)
```

---

### 第 4 步：实现多跳检索器（GraphRAG）

**提示词**：
```
在 /app/server/rag/graph/graph-retriever.ts 中，实现：
- 函数 graphSearch(query: string, hops: number = 2): Promise<Array<{text: string, score: number}>>
- 步骤1：从查询中提取实体（可用 LLM 或规则）
- 步骤2：对每个实体，执行 Cypher 查询找到 hops 步以内的关联实体和关系
- 步骤3：将子图序列化为文本（实体列表 + 关系描述）
- 返回序列化文本作为检索结果（可与向量检索融合）
- 可选：使用文本相似度对结果排序，或直接返回
```

---

### 第 5 步：整合到现有检索 API

**提示词**：
```
在 /app/api/rag/search/route.ts 中，修改现有实现：
- 除了调用 hybridSearch，再调用 graphSearch（提取查询中的实体，多跳检索）
- 合并结果（简单拼接或去重）
- 返回时标记每个结果的来源（vector/bm25/graph）
```

---

### 第 6 步：文档上传自动构建图谱

**提示词**：
```
在 /app/api/document/upload/route.ts 中，增加以下逻辑：
- 对提取的文档文本（全文本），调用 extractTriples 得到三元组
- 调用 createGraph 存入 Neo4j
- 记录关联关系（文档ID与图谱节点）
```

---

### 第 7 步：验收测试

1. 启动服务器：`npm run dev`
2. 上传测试文档，内容示例：
   ```
   英伟达生产H100芯片。AMD与英伟达存在竞争关系。AMD生产MI300芯片。
   ```
3. 检查 Neo4j：浏览器打开 `http://localhost:7474`，执行 `MATCH (n) RETURN n LIMIT 25`，应看到实体节点和关系。
4. 调用检索 API：
   ```bash
   curl -X POST http://localhost:3000/api/rag/search -H "Content-Type: application/json" -d '{"query":"英伟达的竞争对手生产什么芯片？"}'
   ```
   应返回包含“MI300”的结果。

---

### 验收标准（Day 4 完成标志）

- [ ] Neo4j 中能根据上传文档自动创建实体节点和关系
- [ ] 实体抽取能正确提取简单三元组（手动验证）
- [ ] 图检索能根据查询中的实体，返回多跳推理结果
- [ ] `/api/rag/search` 返回结果中包含图谱检索得到的文本块
- [ ] 多跳查询效果优于纯向量检索

---
