
---

## Day 5 任务清单（修改版）：RAG 高级优化（BGE-Reranker + HyDE + 父子文档）


---

### 第 1 步：准备 BGE-Reranker 服务（使用 Docker）

**提示词（放入 Trae）**：
```
在项目根目录创建 `docker-compose.reranker.yml` 文件，内容如下：
- 服务名：bge-reranker
- 镜像：使用 `ghcr.io/huggingface/text-embeddings-inference:86-0.12.0` 或 `csdnai/bge-reranker-v2-m3:latest`（任选一个可用的）
- 端口映射：将容器内的 80 端口映射到宿主机的 8010 端口
- 环境变量：MODEL_ID=BAAI/bge-reranker-v2-m3，REVISION=main
- 如果宿主机有 NVIDIA GPU，添加 `deploy.resources.reservations.devices` 配置；否则去掉 GPU 支持
- 提供启动命令：`docker-compose -f docker-compose.reranker.yml up -d`
- 提供健康检查命令：`curl http://localhost:8010/health`（或 `/`）
```

**执行**： `docker-compose -f docker-compose.reranker.yml up -d`, 这条命令人工执行，你只需要创建好 docker-compose.reranker.yml 文件即可。

---

### 第 2 步：实现重排序模块（调用 BGE-Reranker HTTP 接口）

**提示词（放入 Trae）**：
```
在 `/app/server/rag/reranking/reranker.ts` 中，实现：
- 函数 `rerank(query: string, documents: string[], topK: number = 3): Promise<Array<{text: string, score: number}>>`
- 向 `http://localhost:8010/rerank` 发送 POST 请求
- 请求体 JSON：`{ query, passages: documents, top_k: topK, return_documents: true }`
- 解析响应，提取 `results` 数组，每个元素包含 `relevance_score` 和 `document.text`
- 返回按分数降序排列的对象数组，包含 `text` 和 `score`
- 导出函数供其他模块使用
```

---

### 第 3 步：实现 HyDE 查询改写（不变）

**提示词**：
```
在 `/app/server/rag/query/hyde-transformer.ts` 中，实现：
- 函数 `hydeRewrite(originalQuery: string): Promise<string>`
- 调用阿里百炼 LLM（已有的 callBailian）生成一个假设性答案文档，约 100-200 字
- Prompt 示例：“请根据以下问题，写一段可能出现在相关文档中的答案文本。问题：{query}”
- 返回假设文档文本，用于替代原始查询进行向量检索
```

---

### 第 4 步：实现父子文档合并（不变）

**提示词**：
```
在 `/app/server/rag/chunking/parent-document.ts` 中，实现：
- 定义父块（2000 字符）和子块（500 字符），在索引时建立父子映射
- 函数 `retrieveParentChunks(childChunks: Array<{id, text}>): Promise<string[]>`
- 根据子块 ID 查询对应的父块完整内容
- 集成到检索管道中，在返回最终结果前将子块替换为父块
```

---

### 第 5 步：集成到现有检索 API（修改 `/app/api/rag/search/route.ts`）

**提示词**：
```
修改 `/app/api/rag/search/route.ts`，使检索流程变为：
1. （可选）如果请求参数 `use_hyde` 为 true，调用 hydeRewrite 转换查询
2. 执行混合检索（向量 + BM25 + RRF），得到初始 top-20 结果（每个结果包含 text 和 score）
3. 调用 rerank 函数（从 reranker.ts 导入），传入原始查询和 top-20 的 text 数组，得到精排后的 top-5
4. 对精排后的 top-5 调用 retrieveParentChunks，用父块内容替换子块文本
5. 返回最终结果，同时保留每个块的元数据（文档名、页码等，如果已有）
```

---

### 第 6 步：验收测试

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

### 验收标准（Day 5 完成标志）

- [ ] BGE-Reranker Docker 容器成功运行，`curl http://localhost:8010/health` 返回正常
- [ ] `rerank` 函数能正确调用本地服务并返回排序后的结果
- [ ] HyDE 改写能生成假设文档（可在日志中打印）
- [ ] 父子文档合并后返回的内容包含完整上下文
- [ ] 最终检索结果相关性高于未使用重排序的版本（手动对比验证 3 个查询）

---
