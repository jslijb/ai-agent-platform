# AI Agent Platform 开发路线图

> 基于项目讨论的 13 项 RAG 技术 + Multi-Agent + MCP + DeepWiki + 评估体系，拆分为每天可执行的、有明确验收标准的任务。
>
> **前置条件**：Day 1 已完成（Next.js + Prisma + NextAuth + Docker + tRPC + 基础目录结构）。

---

## Day 2：LangGraph Agent 核心 + 工具调用基础

### 目标

让项目具备运行一个简单 Agent 的能力，并打通与阿里百炼模型的调用。

### 验收标准

- [ ] `curl -X POST http://localhost:3000/api/agent/run -H "Content-Type: application/json" -d '{"query":"35除以7等于多少"}'` 返回正确计算结果
- [ ] Agent 的思考过程（调用 calculator 工具）能在终端日志中看到

### 详细执行步骤

#### 第 1 步：配置阿里百炼模型调用

在 `/app/server/llm/providers/bailian.ts` 中，实现阿里百炼的 LLM 调用函数。

**要求**：
- 使用 OpenAI SDK 兼容模式（`baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1`）
- 阿里百炼的 key 需要可配置，yaml 文件中配置，key 为 python 的变量，value 为环境变量。模型名称也这样设计
- 导出函数 `callBailian(messages, model='qwen-max')`，返回完整的响应内容
- 添加错误处理和超时重试（可选）

#### 第 2 步：开发 Tools

参考 [agent_tools.md](./interview/agent-tools.md) 中定义的金融行业 AI Agent 工具全景，开发对应的 MCP 工具。

#### 第 3 步：创建 LangGraph ReAct Agent

在 `/app/server/agents/simpleAgent.ts` 中，使用 LangGraph.js 创建一个 ReAct Agent。

**要求**：
- 使用上一步的 calculator 工具
- 使用阿里百炼模型（从 `bailian.ts` 导入 `callBailian`）
- 实现标准的 ReAct 循环：思考 -> 行动 -> 观察，直到不需要工具
- 导出 `async function runAgent(query: string): Promise<string>`
- 添加日志输出每一步的思考过程

#### 第 4 步：创建 API 路由

在 `/app/api/agent/run/route.ts` 中，创建一个 POST 接口。

**要求**：
- 接收 JSON body: `{ query: string }`
- 调用 simpleAgent 的 `runAgent` 函数
- 返回 JSON: `{ answer: string, success: boolean }`
- 处理错误，返回 500

#### 第 5 步：环境变量配置

将 `.env.local` 改成 yaml 格式，key 为应用程序变量，value 为用户环境变量。

---

## Day 3：向量检索 + 混合检索（BM25 + 向量 + RRF）

### 目标

实现工业级混合检索管道，支持文档上传、切片、双路召回、RRF 融合。

### 验收标准

- [ ] PostgreSQL 已启用 `vector` 扩展
- [ ] 能上传 PDF 并正确切块、存储向量
- [ ] 能分别调用稠密检索和稀疏检索并得到结果
- [ ] 混合检索（RRF）融合后的 Top-5 结果质量高于单一检索方式（手动验证 3 个查询即可）
- [ ] 所有 API 返回正确的 JSON，无报错

### 详细执行步骤

#### 第 1 步：安装依赖

```bash
npm install pgvector @langchain/community pdf-parse nodejieba
```

- `pgvector`：PostgreSQL 向量扩展（需要数据库支持）
- `@langchain/community`：提供文档加载器、文本分割器等
- `pdf-parse`：解析 PDF 文件内容
- `nodejieba`：中文分词，用于 BM25 关键词检索

> 第一步已完成，无需理会，放在这里是为了项目的完整性。

#### 第 2 步：数据库启用 pgvector

在 PostgreSQL 中启用向量扩展：
```bash
# 进入 PostgreSQL 容器
docker exec -it 60949cc0f2f6  psql -U aiagent -d agentdb

# 在 psql 中执行
CREATE EXTENSION IF NOT EXISTS vector;
```

> 第二步已完成，无需理会，放在这里是为了项目的完整性。

然后修改 `prisma/schema.prisma`，添加向量列支持（Prisma 本身不支持 vector 类型，需要使用原始 SQL 或 `@db.Unsupported`）。
或者单独创建一张 `embeddings` 表，字段包括：`id`, `document_id`, `chunk_text`, `embedding vector(1024)`。embedding 模型使用 BGE-M3 模型。本地部署，存储路径：`D:\models\modelscope`

**建议使用原始 SQL 迁移**：在 `prisma/migrations/` 下手动创建 SQL 文件。

#### 第 3 步：实现智能切片模块

在 `/app/server/rag/chunking/semantic-chunker.ts` 中，实现：
- 使用 RecursiveCharacterTextSplitter 或 SemanticChunker 对文档文本进行分块
- 使用 MinerU 2.5-Pro 云端api先对 pdf 文档进行解析，输出 markdown 格式，你需要根据 markdown 格式进行切分。设计合理的切分策略。
- 导出函数 chunkDocument(text: string): Promise<string[]>

#### 第 4 步：实现稠密检索（向量）

在 `/app/server/rag/retrieval/dense-retriever.ts` 中，实现：
- 使用 BGE-M3 模型生成查询和文档块的向量
- 在 PostgreSQL 中使用 pgvector 的余弦相似度（<=>）进行检索
- 函数 denseSearch(query: string, topK: number): Promise<Array<{text: string, score: number}>>

#### 第 5 步：实现稀疏检索（BM25）

在 `/app/server/rag/retrieval/sparse-retriever.ts` 中，实现：
- 使用 nodejieba 对中文文档和查询进行分词
- 实现 BM25 算法（或使用现有库如 bm25）
- 维护倒排索引（可存储在 Redis 或内存中，初期可每次重新计算）
- 函数 sparseSearch(query: string, topK: number): Promise<Array<{text: string, score: number}>>

#### 第 6 步：实现 RRF 融合算法

在 `/app/server/rag/retrieval/hybrid-retriever.ts` 中，实现：
- 导入 denseSearch 和 sparseSearch
- 使用 RRF（Reciprocal Rank Fusion）公式：score = sum(1/(k + rank))
- k 取 60（常用值）
- 融合两路结果，输出最终排序的前 topK 个文档块
- 函数 hybridSearch(query: string, topK: number): Promise<Array<{text: string, score: number}>>

#### 第 7 步：创建文档上传 API

在 `/app/api/document/upload/route.ts` 中，实现：
- 接收 multipart/form-data，字段名 file
- 使用 pdf-parse 提取文本
- 调用 chunkDocument 得到块列表
- 对每个块生成 embedding（调用 dense 模型）
- 将文本和向量存入 PostgreSQL（嵌入向量字段）
- 同时将原始文本存入 BM25 的倒排索引（可先存在内存字典中）
- 返回成功/失败

#### 第 8 步：创建 RAG 搜索 API

在 `/app/api/rag/search/route.ts` 中，实现：
- POST 接口，接收 { query: string }
- 调用 hybridSearch 得到最相关的 top-5 文档块
- 返回 JSON: { results: [{ text, score }] }

#### 第 9 步：验收测试

1. 启动服务器：`npm run dev`
2. 上传一个测试 PDF（或创建假的文本文件）：
   ```bash
   curl -F "file=@test.pdf" http://localhost:3000/api/document/upload
   ```
3. 执行混合检索：
   ```bash
   curl -X POST http://localhost:3000/api/rag/search -H "Content-Type: application/json" -d '{"query":"NVDA 营收"}'
   ```
4. 预期返回相关的文档块，并且排名合理。

---

## Day 4：GraphRAG 知识图谱 + 多跳推理

### 目标

构建实体关系图谱，实现 Cypher 查询和多跳推理检索。

### 验收标准

- [ ] Neo4j 中能根据上传文档自动创建实体节点和关系
- [ ] 实体抽取能正确提取简单三元组（手动验证）
- [ ] 图检索能根据查询中的实体，返回多跳推理结果
- [ ] `/api/rag/search` 返回结果中包含图谱检索得到的文本块
- [ ] 多跳查询效果优于纯向量检索

### 详细执行步骤

**前置条件**：
- Neo4j 容器已启动（Day 1 已配置，端口 7687）
- 已安装 `neo4j-driver`（若未安装：`npm install neo4j-driver`）
- Day 3 的文档上传和混合检索基本可用

#### 第 1 步：安装依赖

```bash
npm install neo4j-driver
```

> 第一步已完成，无需理会。

#### 第 2 步：实现实体抽取模块（LLM 生成三元组）

在 `/app/server/rag/graph/entity-extractor.ts` 中，实现：
- 函数 extractTriples(text: string): Promise<Array<{head: string, relation: string, tail: string}>>
- 使用阿里百炼模型（callBailian）构造 prompt，要求输出 JSON 格式的实体关系三元组
- Prompt 示例：从以下文本中提取(实体, 关系, 实体)，关系使用预定义类型：生产、竞争、合作、收购、位于、属于...
- 处理多个句子，返回去重后的三元组列表

#### 第 3 步：实现图谱构建模块（写入 Neo4j）

在 `/app/server/rag/graph/graph-builder.ts` 中，实现：
- 连接 Neo4j 数据库（使用环境变量 NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD）
- 函数 createGraph(docId: string, triples: Array<{head, relation, tail}>): Promise<void>
- 使用 Cypher 语句：MERGE (h:Entity {name: $head}) MERGE (t:Entity {name: $tail}) MERGE (h)-[:RELATION {type: $relation}]->(t)
- 添加文档来源属性（sourceDocId）用于溯源
- 提供删除文档图谱的函数 deleteGraph(docId)

#### 第 4 步：实现多跳检索器（GraphRAG）

在 `/app/server/rag/graph/graph-retriever.ts` 中，实现：
- 函数 graphSearch(query: string, hops: number = 2): Promise<Array<{text: string, score: number}>>
- 步骤1：从查询中提取实体（可用 LLM 或规则）
- 步骤2：对每个实体，执行 Cypher 查询找到 hops 步以内的关联实体和关系
- 步骤3：将子图序列化为文本（实体列表 + 关系描述）
- 返回序列化文本作为检索结果（可与向量检索融合）
- 可选：使用文本相似度对结果排序，或直接返回

#### 第 5 步：整合到现有检索 API

在 `/app/api/rag/search/route.ts` 中，修改现有实现：
- 除了调用 hybridSearch，再调用 graphSearch（提取查询中的实体，多跳检索）
- 合并结果（简单拼接或去重）
- 返回时标记每个结果的来源（vector/bm25/graph）

#### 第 6 步：文档上传自动构建图谱

在 `/app/api/document/upload/route.ts` 中，增加以下逻辑：
- 对提取的文档文本（全文本），调用 extractTriples 得到三元组
- 调用 createGraph 存入 Neo4j
- 记录关联关系（文档ID与图谱节点）

#### 第 7 步：验收测试

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
   应返回包含"MI300"的结果。

---

## Day 5：RAG 高级优化（重排序 + 查询改写 + 父子文档）

### 目标

提升检索精度，减少噪音，增强答案完整性。

### 验收标准

- [ ] BGE-Reranker Docker 容器成功运行，`curl http://localhost:8010/health` 返回正常
- [ ] `rerank` 函数能正确调用本地服务并返回排序后的结果
- [ ] HyDE 改写能生成假设文档（可在日志中打印）
- [ ] 父子文档合并后返回的内容包含完整上下文
- [ ] 最终检索结果相关性高于未使用重排序的版本（手动对比验证 3 个查询）

### 详细执行步骤

#### 第 1 步：准备 BGE-Reranker 服务（使用 Docker）

在项目根目录创建 `docker-compose.reranker.yml` 文件，内容如下：
- 服务名：bge-reranker
- 镜像：使用 `ghcr.io/huggingface/text-embeddings-inference:86-0.12.0` 或 `csdnai/bge-reranker-v2-m3:latest`（任选一个可用的）
- 端口映射：将容器内的 80 端口映射到宿主机的 8010 端口
- 环境变量：MODEL_ID=BAAI/bge-reranker-v2-m3，REVISION=main
- 如果宿主机有 NVIDIA GPU，添加 `deploy.resources.reservations.devices` 配置；否则去掉 GPU 支持
- 提供启动命令：`docker-compose -f docker-compose.reranker.yml up -d`
- 提供健康检查命令：`curl http://localhost:8010/health`（或 `/`）

**执行**： `docker-compose -f docker-compose.reranker.yml up -d`，这条命令人工执行，你只需要创建好 docker-compose.reranker.yml 文件即可。

#### 第 2 步：实现重排序模块（调用 BGE-Reranker HTTP 接口）

在 `/app/server/rag/reranking/reranker.ts` 中，实现：
- 函数 `rerank(query: string, documents: string[], topK: number = 3): Promise<Array<{text: string, score: number}>>`
- 向 `http://localhost:8010/rerank` 发送 POST 请求
- 请求体 JSON：`{ query, passages: documents, top_k: topK, return_documents: true }`
- 解析响应，提取 `results` 数组，每个元素包含 `relevance_score` 和 `document.text`
- 返回按分数降序排列的对象数组，包含 `text` 和 `score`
- 导出函数供其他模块使用

#### 第 3 步：实现 HyDE 查询改写

在 `/app/server/rag/query/hyde-transformer.ts` 中，实现：
- 函数 `hydeRewrite(originalQuery: string): Promise<string>`
- 调用阿里百炼 LLM（已有的 callBailian）生成一个假设性答案文档，约 100-200 字
- Prompt 示例："请根据以下问题，写一段可能出现在相关文档中的答案文本。问题：{query}"
- 返回假设文档文本，用于替代原始查询进行向量检索

#### 第 4 步：实现父子文档合并

在 `/app/server/rag/chunking/parent-document.ts` 中，实现：
- 定义父块（2000 字符）和子块（500 字符），在索引时建立父子映射
- 函数 `retrieveParentChunks(childChunks: Array<{id, text}>): Promise<string[]>`
- 根据子块 ID 查询对应的父块完整内容
- 集成到检索管道中，在返回最终结果前将子块替换为父块

#### 第 5 步：集成到现有检索 API（修改 `/app/api/rag/search/route.ts`）

修改 `/app/api/rag/search/route.ts`，使检索流程变为：
1. （可选）如果请求参数 `use_hyde` 为 true，调用 hydeRewrite 转换查询
2. 执行混合检索（向量 + BM25 + RRF），得到初始 top-20 结果（每个结果包含 text 和 score）
3. 调用 rerank 函数（从 reranker.ts 导入），传入原始查询和 top-20 的 text 数组，得到精排后的 top-5
4. 对精排后的 top-5 调用 retrieveParentChunks，用父块内容替换子块文本
5. 返回最终结果，同时保留每个块的元数据（文档名、页码等，如果已有）

#### 第 6 步：验收测试

1. 启动 BGE-Reranker 容器：`docker-compose -f docker-compose.reranker.yml up -d`
2. 启动 Next.js 项目：`npm run dev`
3. 上传一份长文档（如财报 PDF）
4. 测试查询：
   ```bash
   curl -X POST http://localhost:3000/api/rag/search -H "Content-Type: application/json" -d '{"query":"营收增长预期"}'
   ```
5. 观察返回结果：
   - 重排序是否将最相关片段排在前面
   - 父子合并后返回的文本长度是否明显大于原始检索片段
   - 响应时间是否 < 3 秒

---

## Day 6：多模态 RAG（图文混排 + 表格提取 + 答案溯源）

### 目标

让 Agent 能看懂 PDF 中的图片、表格，并生成带引用的答案。

### 验收标准

- [ ] PDF 上传后，能成功提取文本、图片位置和表格内容
- [ ] 对于表格数据，检索能返回结构化的 Markdown 表格或清晰的文本描述
- [ ] 返回的检索结果包含准确的页码和文件名元数据
- [ ] 带引用的答案中，每个关键数据都能追溯到具体的文档和页码
- [ ] 整个流程无报错，响应时间在可接受范围（含 VLM 调用可能稍慢）

### 详细执行步骤

#### 第 1 步：安装多模态相关依赖

```bash
npm install llamaindex @llamaindex/liteparse pdf-parse sharp
```

- `llamaindex`：LlamaIndex TypeScript 核心库
- `@llamaindex/liteparse`：LiteParse 本地 PDF 解析（图文混排、表格提取）
- `sharp`：图像处理（用于处理从 PDF 中提取的图片）

> 第一步已完成，无需理会。

#### 第 2 步：实现图文混排 PDF 解析器

在 `/app/server/rag/multimodal/pdf-parser.ts` 中，实现：
- 函数 parsePDFWithImages(buffer: Buffer): Promise<{ text: string, images: Buffer[], tables: any[] }>
- 使用 @llamaindex/liteparse 解析 PDF，提取文本块、图片位置和表格
- 对于图片，使用 sharp 裁剪并转为 Base64 供 VLM 分析（可选）
- 返回结构化结果，保留页面顺序和元素位置

#### 第 3 步：实现表格提取与结构化

在 `/app/server/rag/multimodal/table-extractor.ts` 中，实现：
- 函数 extractTablesFromPDF(buffer: Buffer): Promise<Array<{ pageNum: number, html: string, markdown: string }>>
- 使用 @llamaindex/liteparse 或自定义规则识别表格区域
- 将表格转换为 Markdown 和 HTML 两种格式
- 存储时保留表格的原始上下文（前后文本）

#### 第 4 步：实现视觉内容描述（可选，VLM集成）

在 `/app/server/rag/multimodal/image-caption.ts` 中，实现：
- 函数 describeImage(imageBase64: string): Promise<string>
- 调用阿里百炼的多模态模型（如 qwen-vl-max）生成图片描述
- 将描述文本作为补充内容存入文档块，便于纯文本检索
- 如果模型不支持，可返回空字符串或使用 OCR 文本

#### 第 5 步：实现答案溯源模块

在 `/app/server/rag/citation/source-tracker.ts` 中，实现：
- 在索引阶段，为每个 chunk 存储元数据：docId, fileName, pageNum, paragraphIndex
- 在检索阶段，保留每个检索结果对应的元数据
- 函数 buildCitation(result: { text: string, metadata: any }): string
- 返回格式：[来源: 《{fileName}》第{pageNum}页]

在 `/app/server/rag/citation/citation-injector.ts` 中，实现：
- 函数 injectCitations(answer: string, citations: string[]): string
- 将引用标注插入到答案中的合适位置（通过后处理或引导 LLM 生成）
- 更可靠的方式：在生成 prompt 中要求 LLM 输出 JSON，包含答案文本和引用的对应关系

#### 第 6 步：修改文档上传和检索流程

**修改 `/app/api/document/upload/route.ts`**：
- 调用 `parsePDFWithImages` 获取文本、图片、表格
- 为每个文本块（包括表格描述、图片描述）生成 embedding
- 存储元数据（pageNum, fileName, 元素类型）

**修改 `/app/api/rag/search/route.ts`**：
- 在检索返回结果时，附带上每个结果的 `sourceMetadata`
- 最终返回结构：
  ```json
  {
    "results": [
      { "text": "...", "score": 0.92, "source": { "fileName": "report.pdf", "pageNum": 5 } }
    ]
  }
  ```

#### 第 7 步：生成带引用的答案 API

创建 `/app/api/rag/answer-with-citation/route.ts`：

创建 POST 接口，接收 { query: string }。
流程：
1. 调用 /api/rag/search 获取 top-3 相关块及其元数据
2. 构造 prompt：基于以下文档片段回答问题，并在每个关键事实后标注 [来源: 文档名, 页码]
3. 调用阿里百炼模型生成答案
4. 返回 { answer: "带有引用的文本", citations: [...] }

#### 第 8 步：验收测试

1. 准备一份包含图片和表格的 PDF（可从网上下载财报样例）。
2. 上传文档：
   ```bash
   curl -F "file=@sample.pdf" http://localhost:3000/api/document/upload
   ```
3. 查询一个涉及表格数据的问题，例如"2024年营收是多少？"
4. 观察返回结果是否包含表格数据（而非"无法解析"）。
5. 调用带引用的接口：
   ```bash
   curl -X POST http://localhost:3000/api/rag/answer-with-citation -H "Content-Type: application/json" -d '{"query":"营收增长趋势"}'
   ```
6. 验证答案中是否包含类似 `[来源: sample.pdf, 第3页]` 的标记。

---

## Day 7：流式 RAG（增量索引） + Agentic RAG 自适应检索

### 目标

实现文档实时更新索引，Agent 能自主决定是否需要多次检索。

### 验收标准

- [ ] 更新某个文档内容后，无需手动重建索引，几秒内新内容可被检索到
- [ ] 提问"英伟达最新营收是多少？"如果第一次检索没找到，Agent 会自动改写查询并再次检索，最终给出答案
- [ ] 能在日志中看到 Agent 的迭代检索过程

### 详细执行步骤

#### 第 1 步：安装依赖

```bash
npm install pg-ears
npm install --save-dev @types/pg-ears
```

> pg-ears 依赖已安装完成，无需关注。

#### 第 2 步：实现 CDC 监听

在 `/app/server/rag/streaming/cdc-listener.ts` 中，实现：
- 监听 `documents` 表的变更
- 使用 pg-ears 监听 PostgreSQL CDC 事件

#### 第 3 步：实现增量嵌入

在 `/app/server/rag/streaming/incremental-embedder.ts` 中，实现：
- 仅对变更文档重新切片、嵌入、更新向量库
- 区分 insert 和 update 操作

#### 第 4 步：增加 Agent 反思节点

修改 Agent 的 LangGraph 状态机：
- 增加"反思"节点，在生成答案前评估是否信息不足
- 若不足则触发新一轮检索（自适应检索）

在 `/app/server/agents/reflection-node.ts` 中，实现：
- 判断是否需要再检索
- 评估当前检索结果是否足以回答问题
- 生成改写查询

#### 第 5 步：支持 Agent 多轮调用

修改 `/app/api/agent/run/route.ts`：
- 支持 Agent 多轮调用 RAG 工具
- 记录迭代检索过程到日志

---

## Day 8：评估体系 + 可观测性 + DeepWiki MCP 集成

### 目标

建立量化评测 pipeline，集成外部知识源（DeepWiki），准备面试演示。

### 验收标准

- [ ] 运行 `npm run evaluate` 能输出 Hits@5（目标 >85%），Faithfulness（目标 >90%）
- [ ] Agent 能回答"deepwiki 上 next.js 的 app router 怎么用"并能返回准确的结构化信息（依赖 DeepWiki MCP 在线服务）
- [ ] 前端能看到评估趋势图

### 详细执行步骤

#### 第 1 步：安装依赖

```bash
npm install @reaatech/rag-eval-metrics
```

> ragas 依赖已安装完成，无需关注。

#### 第 2 步：准备黄金测试集

创建 `/scripts/qa-golden.json`（至少 50 条 QA，覆盖多跳、表格、专有名词）

#### 第 3 步：实现 RAG 评估器

在 `/app/server/evaluation/rag-evaluator.ts` 中，实现：
- 计算 Hits@K, Faithfulness, Answer Relevance, Context Recall

#### 第 4 步：实现一键评估脚本

在 `/scripts/run-evaluation.ts` 中，实现：
- 一键运行评估，输出报告

#### 第 5 步：实现 DeepWiki MCP 工具

在 `/app/server/agents/tools/deepwiki-tool.ts` 中，实现：
- DeepWiki 知识库查询工具
- 支持查询 GitHub 仓库文档

#### 第 6 步：注册 DeepWiki 工具到 Supervisor Agent

在 Supervisor Agent 中注册该工具，允许 Agent 查询 GitHub 仓库文档

#### 第 7 步：实现前端监控面板

在 `/app/dashboard/evaluation/page.tsx` 中，实现：
- 展示最近评估指标
- 评估趋势图

---

## Day 9（可选，增加竞争力）：ColPali 调研 + 架构图 + 面试问答准备

### 目标

不写代码，但准备口头论述，展示对前沿技术的理解。

### 验收标准

- [ ] 能够在面试中清晰解释 ColPali 与传统 RAG 的差异
- [ ] 能够说出本项目集成 ColPali 的假设步骤

### 任务清单

1. 阅读 ColPali 论文和 LlamaIndex 的 ColPali 实现文档
2. 修改项目架构图（`/docs/architecture.png`），标注 ColPali 作为可插拔的检索组件位置
3. 准备面试话术："如果未来需要支持海报、扫描件等高密度视觉文档，我会引入 ColPali 风格的多向量检索器，它的核心优势是绕过 OCR 直接在视觉空间做匹配，但计算成本较高，适合离线索引 + 在线重排混合模式。"

---

## P0/P1 优先级改造

> 以下改造基于行业最佳实践分析，每项改造都有明确的业务需求支撑，而非无脑集成。

### P0 改造（必须立即解决）

#### 1. 知识过期机制

**业务驱动**：金融数据有时效性——去年的财报、过期的研报如果和新数据混在一起返回，会直接导致错误的投资决策。这是合规红线。

**改造内容**：
- Prisma Document 模型新增 `validUntil`、`documentType`、`contentHash`、`version`、`updatedAt` 字段
- dense-retriever.ts 的 SQL 查询增加 JOIN Document 过滤过期文档
- 新建 `knowledge-cleanup.ts` 提供 `cleanExpiredDocuments()` 和 `setDefaultExpiry()` 函数
- 文档类型默认有效期：research_report(90天)、financial_report(365天)、regulation(永不过期)、general(180天)

**涉及文件**：
- `prisma/schema.prisma` — Document 模型扩展
- `src/server/rag/retrieval/dense-retriever.ts` — 检索过滤
- `src/server/rag/knowledge-cleanup.ts` — 新建

#### 2. Agent 确定性输出

**业务驱动**：金融分析场景对结果一致性要求极高。temperature=0.7 导致同一问题每次答案不同，用户无法信任系统。

**改造内容**：
- bailian.ts: `DEFAULT_TEMPERATURE` 从 0.7 降为 0，新增 `seed: 42` 参数
- bailian.ts: 重试间隔从固定 1s 改为指数退避（1s → 2s → 4s）
- bailian.ts: `callBailian` 新增可选 `temperature` 参数
- simpleAgent.ts: 新增 `AGENT_TIMEOUT_MS = 120000` 整体超时控制
- reflection-node.ts: 反思评估使用 `temperature=0`

**涉及文件**：
- `src/server/llm/providers/bailian.ts`
- `src/server/agents/simpleAgent.ts`
- `src/server/agents/reflection-node.ts`

#### 3. 限流 + 健康检查

**业务驱动**：百炼 API 有 QPS 限制，无保护会被打爆；Docker 容器编排需要 /health 端点。

**改造内容**：
- 新建 `rate-limiter.ts`：基于 IP 的滑动窗口限流，每分钟 20 次
- agent/run 路由集成限流，被限流返回 HTTP 429
- 新建 `/api/health` 端点：检查数据库、Embedding 服务、LLM 服务连通性

**涉及文件**：
- `src/server/lib/rate-limiter.ts` — 新建
- `src/app/api/agent/run/route.ts` — 集成限流
- `src/app/api/health/route.ts` — 新建

### P1 改造（应尽快解决）

#### 4. 短期记忆（会话管理）

**业务驱动**：金融分析场景中，用户经常追问"刚才那只股票的PE呢？"——没有记忆就无法提供连贯服务。

**改造内容**：
- Prisma 新增 `Conversation` 和 `Message` 模型
- 新建 `memory.ts`：提供 `createConversation`、`addMessage`、`getRecentMessages`、`listConversations`、`deleteConversation`
- simpleAgent.ts: `runAgent` 新增 `conversationId` 参数，自动加载历史消息，保存对话记录
- agent/run 路由：请求/响应新增 `conversationId` 字段

**涉及文件**：
- `prisma/schema.prisma` — 新增模型
- `src/server/agents/memory.ts` — 新建
- `src/server/agents/simpleAgent.ts` — 集成记忆
- `src/app/api/agent/run/route.ts` — API 更新

#### 5. LangGraph 多 Agent 编排

**业务驱动**：当前 simpleAgent 是单体架构，所有工具混在一起。金融场景需要"研究员→量化→合规"的专业化分工。

**改造内容**：
- base.ts: 实现 `BaseAgent` 抽象基类
- orchestrator.ts: 实现基于关键词路由的 ReAct 编排器，支持 quant/compliance/research/general 四种路由
- 编排器集成反思检索、工具调用、超时控制

**涉及文件**：
- `src/server/agents/base.ts` — 重写
- `src/server/agents/orchestrator.ts` — 重写

#### 6. MCP Server

**业务驱动**：项目的金融工具能力通过 MCP Server 标准化暴露后，可以被 Claude Desktop、Cursor 等外部 MCP 客户端直接调用——这是产品化路径。

**改造内容**：
- server.ts: 实现工具注册框架（`registerTool`/`listTools`/`callTool`/`registerAllTools`）
- 注册 6 个 MCP 工具：hybrid_search、calculate_ma、calculate_rsi、check_trade_compliance、calculate_var、get_market_data
- /api/mcp/sse: GET 返回工具列表 SSE 流，POST 处理 tools/list 和 tools/call

**涉及文件**：
- `src/server/mcp/server.ts` — 重写
- `src/app/api/mcp/sse/route.ts` — 重写

#### 7. 熔断器 + 模型降级链

**业务驱动**：LLM 服务持续不可用时，3 次重试只会加剧压力；qwen-max 挂了整个系统就瘫痪。

**改造内容**：
- circuit-breaker.ts: 三状态熔断器（closed → open → half-open），3 次失败触发熔断，30 秒后半开
- router.ts: 模型降级链 qwen-max → qwen-plus → qwen-turbo，每个模型独立熔断
- cache.ts: LLM 语义缓存，temperature=0 时启用，TTL 30 分钟，最大 500 条
- redis.ts: Redis 客户端封装，动态导入，不可用时自动降级

**涉及文件**：
- `src/server/lib/circuit-breaker.ts` — 新建
- `src/server/llm/router.ts` — 重写
- `src/server/llm/cache.ts` — 重写
- `src/server/lib/redis.ts` — 重写

#### 8. 知识版本 + CDC 补全

**业务驱动**：文档更新后图谱和 BM25 索引不同步，导致检索返回过时结果。

**改造内容**：
- incremental-embedder.ts: 拆分 insert/update 为独立分支
- update 时增加图谱同步（先删后建）和 BM25 索引重建
- embedDocument 中增加 contentHash 检查，内容未变则跳过重建
- sparse-retriever.ts: 新增 `rebuildBM25Index()` 导出函数

**涉及文件**：
- `src/server/rag/streaming/incremental-embedder.ts` — 修改
- `src/server/rag/retrieval/sparse-retriever.ts` — 追加导出

### 部署注意事项

1. 执行 `npx prisma migrate dev` 同步新的数据库模型（Document 扩展字段 + Conversation/Message 表）
2. 执行 `npx prisma generate` 生成新的 Prisma Client 类型
3. 可选安装 `npm install redis`（未安装时自动降级为内存缓存）

---

## 总结

| 天数 | 核心主题 | 关键技术点 | 验收标准 |
|------|---------|-----------|---------|
| Day 1 ✅ | 基础设施 | Next.js + Prisma + Docker + tRPC | 已通过 |
| Day 2 | LangGraph Agent 基础 | ReAct Agent + 工具调用 | Agent 能计算 |
| Day 3 | 混合检索 + RRF | 向量 + BM25 + 融合 | 上传文档能搜到 |
| Day 4 | GraphRAG | 实体抽取 + Neo4j + 多跳推理 | 实体关系查询准确 |
| Day 5 | 高级优化 | Rerank + HyDE + 父子文档 | Top-3 准确率提升 |
| Day 6 | 多模态 + 答案溯源 | 图文混排解析 + 表格提取 + 引用 | 带引用的答案 |
| Day 7 | 流式 RAG + Agentic RAG | 增量索引 + 自适应检索 | 实时更新 + 迭代检索 |
| Day 8 | 评估 + DeepWiki | Ragas 指标 + MCP 工具 | 量化报告 + 外部知识 |
| Day 9 (选) | ColPali 理论 | 架构图 + 面试准备 | 口头讲解清楚 |
| P0/P1 | 行业最佳实践改造 | 知识过期 + 确定性 + 限流 + 记忆 + 编排 | 生产级可用 |
