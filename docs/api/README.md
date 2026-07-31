# API 文档

> 基础 URL：`http://localhost:3000/api`
> 认证方式：NextAuth v5 Session Cookie（部分端点需认证，标注 🔒）
> 响应格式：JSON（SSE 端点除外）

---

## 一、Agent API

### POST /agent/run

执行 Agent 查询，返回完整结果。

**请求体**：
```json
{
  "query": "贵州茅台2024年营收是多少",
  "conversationId": "可选，会话ID",
  "model": "可选，模型名称"
}
```

**响应**：
```json
{
  "answer": "根据数据...",
  "success": true,
  "conversationId": "conv_xxx",
  "model": "qwen-plus",
  "iterations": 3,
  "totalTokens": 2456
}
```

---

### GET /agent/stream

SSE 流式 Agent 输出。

**查询参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询内容 |
| conversationId | string | 否 | 会话ID |
| model | string | 否 | 模型名称 |

**SSE 事件类型**：
| 事件 | 数据格式 | 说明 |
|------|---------|------|
| `token` | `{ content: string }` | 逐 token 输出 |
| `tool_call` | `{ tool: string, args: object }` | 工具调用 |
| `tool_result` | `{ tool: string, result: object }` | 工具结果 |
| `done` | `{ answer, citations, model, iterations, totalTokens }` | 完成 |
| `error` | `{ message: string }` | 错误 |

**Nginx 超时**：300s，无缓冲

---

### GET /agent/models

获取可用模型列表。

**响应**：
```json
{
  "models": [
    { "id": "agnes-2.0-flash", "provider": "agnes", "functionCalling": true },
    { "id": "qwen-plus", "provider": "dashscope", "functionCalling": true }
  ]
}
```

---

### GET /agent/logs 🔒

获取 Agent 执行日志。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| conversationId | string | 按会话筛选 |
| limit | number | 条数，默认 20 |
| offset | number | 偏移量 |

---

### GET /agent/token-usage 🔒

获取 Token 用量统计。

---

## 二、Document API

### POST /document/upload 🔒

上传文档（PDF/图片），触发解析、切片、向量化、图谱构建。

**请求**：`multipart/form-data`
| 字段 | 类型 | 说明 |
|------|------|------|
| file | File | 文件（PDF/图片） |
| documentType | string | 文档类型：research_report / annual_report / regulation / general |

**响应**：
```json
{
  "documentId": "doc_xxx",
  "fileName": "report.pdf",
  "status": "processing"
}
```

---

### GET /document/list 🔒

获取文档列表。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 按状态筛选 |
| page | number | 页码 |
| pageSize | number | 每页条数 |

---

### GET /document/content/[documentId] 🔒

获取文档原始内容。

---

### GET /document/chunks/[documentId] 🔒

获取文档切片列表。

---

### GET /document/embeddings/[documentId] 🔒

获取文档向量数据。

---

### GET /document/graph/[documentId] 🔒

获取文档知识图谱数据（节点 + 边）。

**响应**：
```json
{
  "nodes": [{ "id": "entity_1", "label": "贵州茅台", "type": "Company" }],
  "edges": [{ "source": "entity_1", "target": "entity_2", "label": "持有" }]
}
```

---

### POST /document/rebuild-graph/[documentId] 🔒

重建文档知识图谱。

---

### POST /document/rebuild-index 🔒

重建文档索引（向量 + BM25）。

---

### GET /document/preview/[...filePath]

文档预览（PDF 在线查看）。

---

### GET /document/uploaded-file/[documentId]

获取已上传文件。

---

### GET /document/reports 🔒

获取文档报告。

---

## 三、RAG API

### POST /rag/search

混合检索。

**请求体**：
```json
{
  "query": "贵州茅台2024年营收",
  "topK": 5,
  "useHyde": false,
  "useGraph": true
}
```

**响应**：
```json
{
  "results": [
    {
      "chunkText": "...",
      "score": 0.92,
      "documentId": "doc_xxx",
      "chunkIndex": 3,
      "metadata": { "pageNum": 12 }
    }
  ],
  "graphResults": [
    {
      "head": "贵州茅台",
      "relation": "2024年营收",
      "tail": "1505.6亿元",
      "score": 0.88
    }
  ]
}
```

**Nginx 超时**：120s，路由到 rag-service:3001

---

### POST /rag/answer-with-citation

带引用的答案生成。

**请求体**：
```json
{
  "query": "贵州茅台2024年营收是多少",
  "topK": 5
}
```

**响应**：
```json
{
  "answer": "贵州茅台2024年营收为1505.6亿元[1]",
  "citations": [
    { "index": 1, "documentId": "doc_xxx", "chunkIndex": 3, "pageNum": 12, "chunkText": "..." }
  ]
}
```

---

## 四、Evaluation API

### POST /evaluation/run 🔒 (admin)

触发评估。

**请求体**：
```json
{
  "level": "daily | standard | full",
  "type": "rag | agent",
  "milestone": "可选，里程碑标记",
  "preset": "可选，compliance_first | accuracy_first | efficiency_first"
}
```

**Nginx 超时**：600s

---

### GET /evaluation/config

获取评估配置（权重、阈值、触发规则）。

---

### PATCH /evaluation/config 🔒 (admin)

更新评估配置。

---

### GET /evaluation/results

获取最新评估结果。

---

### GET /evaluation/versions

获取评估版本列表。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| evaluationType | string | rag / agent |
| evaluationLevel | string | daily / standard / full |
| limit | number | 条数 |

---

### GET /evaluation/versions/[id]

获取评估版本详情。

---

### GET /evaluation/compare

多版本对比。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| versionIds | string | 逗号分隔的版本ID |

---

### GET /evaluation/trend

指标趋势数据。

---

### GET /evaluation/radar

雷达图数据。

---

### GET /evaluation/milestones

里程碑列表。

---

## 五、MCP API

### GET /mcp/sse

MCP SSE 端点，供外部客户端（如 Claude Desktop）连接。

**协议**：MCP (Model Context Protocol) over SSE

**可用工具**：calculator, compliance, document_analysis, graph_query, market_data, quant_analysis, risk_control, simulated_trade, sql, web_search

---

## 六、Auth API

### POST /auth/register

用户注册。

**请求体**：
```json
{
  "email": "user@example.com",
  "name": "用户名",
  "password": "密码"
}
```

---

### POST /auth/wechat/login

微信登录。

---

### POST /auth/wechat/bind 🔒

微信账号绑定。

---

### GET /auth/[...nextauth]

NextAuth v5 认证端点（登录/登出/回调）。

---

## 七、Conversations API

### GET /conversations 🔒

获取会话列表。

---

## 八、Memories API

### GET /memories 🔒

获取记忆数据。

---

## 九、Wrong Answers API

### GET /wrong-answers 🔒

获取错题本列表。

---

## 十、Teams API

### GET /teams 🔒

获取团队列表。

---

## 十一、Health API

### GET /health

健康检查。

**响应**：
```json
{
  "status": "ok",
  "checks": {
    "database": true,
    "neo4j": true,
    "embedding": true,
    "reranker": true,
    "llm": true
  }
}
```

**Nginx 超时**：10s

---

## 十二、Metrics API

### GET /metrics

Prometheus 指标端点。

---

## 十三、Miniapp API

小程序专用 API 端点。

| 端点 | 方法 | 说明 |
|------|------|------|
| /miniapp/chat | POST | 小程序聊天 |
| /miniapp/search | POST | 小程序检索 |
| /miniapp/documents | GET | 小程序文档列表 |
| /miniapp/conversations | GET | 小程序会话列表 |
| /miniapp/evaluation/latest | GET | 小程序最新评估 |
| /miniapp/user/profile | GET | 小程序用户信息 |

---

## 通用错误响应

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限（非 admin 访问 admin 端点） |
| 404 | 资源不存在 |
| 429 | 请求限流（每 IP 每分钟 20 次） |
| 500 | 服务器内部错误 |
| 503 | 服务不可用（LLM 熔断） |