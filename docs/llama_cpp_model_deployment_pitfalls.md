# llama.cpp 部署 Embedding/Reranker 模型踩坑记录

> 模型：bge-m3-GGUF（Embedding）、bge-reranker-v2-m3-GGUF（Reranker）
> 部署方式：llama.cpp server Docker 镜像
> 耗时：约 1 小时
> 日期：2026-05-26

---

## 一、核心教训

### 1. 永远优先从魔塔社区下载预转换的 GGUF 模型，不要自己转换

**这是本次折腾的根本原因。** 魔塔社区（modelscope.cn）上已经有大量预转换好的 GGUF 格式模型，直接下载即可使用。自己转换模型会遇到各种格式兼容性问题，极其耗时且容易出错。

**正确做法：**
```powershell
# 安装 modelscope CLI
pip install modelscope

# 下载 Embedding 模型（bge-m3 GGUF 格式）
modelscope download --model OllmOne/bge-m3-GGUF --local_dir D:\models\modelscope\models\OllmOne\bge-m3-GGUF

# 下载 Reranker 模型（bge-reranker-v2-m3 GGUF 格式）
modelscope download --model gpustack/bge-reranker-v2-m3-GGUF --local_dir D:\models\modelscope\models\gpustack\bge-reranker-v2-m3-GGUF
```

**错误做法：**
- 下载 HuggingFace 格式（safetensors/pytorch_model.bin）然后自己写脚本转换
- 从非官方渠道搜索模型名称，凭记忆编造模型路径
- 不去魔塔社区官网搜索，只依赖自己的知识库

### 2. 去魔塔社区官网搜索，不要凭记忆

搜索模型时，应该：
1. 打开 https://modelscope.cn
2. 搜索关键词，如 `bge-m3 GGUF`、`bge-reranker GGUF`
3. 确认模型格式、量化级别、文件列表
4. 使用 modelscope CLI 或 SDK 下载

**不要：**
- 凭记忆编造模型名称和路径
- 假设某个模型一定存在 GGUF 版本
- 用搜索引擎替代官网搜索

---

## 二、踩坑全过程

### 坑 1：Embedding 模型路径不一致

**现象：** docker-compose.yml 中配置的模型路径 `D:\models\modelscope\BAAI\bge-m3\*Q4_K_M*` 与实际模型路径 `D:\models\modelscope\models\OllmOne\bge-m3-GGUF\bge-m3-q8_0.gguf` 不一致。

**原因：** 编写 docker-compose.yml 时凭记忆编造了模型路径，没有去实际检查磁盘上的文件。

**修复：**
```yaml
# 错误
volumes:
  - D:\models\modelscope\BAAI\bge-m3:/models:ro
command: --model /models/bge-m3-Q4_K_M.gguf

# 正确
volumes:
  - D:\models\modelscope\models\OllmOne\bge-m3-GGUF:/models:ro
command: --model /models/bge-m3-q8_0.gguf
```

**教训：** 编写配置前，先用 `Get-ChildItem` 确认磁盘上实际的文件路径和文件名。

---

### 坑 2：Reranker 使用了不兼容的 Docker 镜像

**现象：** 最初使用 `csdnai/bge-reranker-v2-m3:latest` 镜像部署 Reranker，拉取时返回 403 Forbidden。

**原因：** 该镜像托管在阿里云镜像仓库，需要认证或已下线。

**修复：** 统一使用 llama.cpp server 镜像部署，Embedding 和 Reranker 使用同一个镜像。

```yaml
# 错误
reranker:
  image: csdnai/bge-reranker-v2-m3:latest  # 403 Forbidden

# 正确
reranker:
  image: ghcr.io/ggml-org/llama.cpp:server  # 与 Embedding 统一
```

**教训：** 同类模型（Embedding/Reranker 都是 BERT 架构）应该用同一套部署方案，不要混用不同镜像。

---

### 坑 3：自己写 GGUF 转换脚本——第一次（格式完全错误）

**现象：** 自定义脚本生成的 GGUF 文件，llama.cpp 报错 `string length 216172782113783808 exceeds maximum`。

**原因：** 手写 GGUF 二进制格式时，元数据写入顺序和字节对齐不正确，导致 llama.cpp 解析时将数据内容误读为字符串长度。

**修复：** 改用 gguf Python 库的 `GGUFWriter` 重写转换脚本。

**教训：** 不要手写 GGUF 二进制格式，必须使用 gguf 库。

---

### 坑 4：自己写 GGUF 转换脚本——第二次（缺少元数据）

**现象：** 使用 gguf 库重写后，llama.cpp 报错 `key not found in model: bert.attention.layer_norm_epsilon`。

**原因：** GGUF 文件中缺少 llama.cpp 要求的 BERT 架构元数据，包括：
- `bert.attention.layer_norm_epsilon`（LayerNorm 的 epsilon 值）
- tokenizer 数据（词表、分词器类型等）
- `bert.pooling_type` 格式不正确（用了 `add_uint32` 而非 `add_pooling_type`）

llama.cpp 的 BERT 模型加载器要求非常严格的元数据集合，缺一不可。

**修复：** 补充了 `add_layer_norm_eps(1e-12)`、`add_causal_attention(False)`、`add_pooling_type(RANK)`、tokenizer 数据等。

但即使补全了这些，仍然可能有其他遗漏的元数据。最终放弃自转换，改用魔塔社区预转换的 GGUF 模型。

**教训：** llama.cpp 的 GGUF 格式不是简单的"权重+元数据"，它要求完整的模型架构描述、tokenizer、特殊 token 等信息。自己转换极容易遗漏，应该使用官方 `convert_hf_to_gguf.py` 脚本或直接下载预转换模型。

---

### 坑 5：官方 convert_hf_to_gguf.py 依赖整个 llama.cpp 仓库

**现象：** 尝试单独使用 `convert_hf_to_gguf.py`，但它依赖 `conversion` 模块（llama.cpp 仓库内的包），无法单独运行。

**原因：** `convert_hf_to_gguf.py` 不是独立脚本，它依赖 `gguf-py/` 和 `conversion/` 等仓库内部模块。

**修复：** 需要克隆整个 llama.cpp 仓库。但 GitHub 在国内网络环境下无法访问（`Connection was reset`）。

**教训：** 国内环境下，克隆 GitHub 仓库不可靠。应该优先从魔塔社区下载预转换模型。

---

### 坑 6：Docker 健康检查端口错误

**现象：** Embedding 容器显示 `unhealthy`，但服务实际正常运行。

**原因：** llama.cpp server 的 Docker 镜像内置健康检查默认检查 `http://localhost:8080/health`，但我们把服务端口改成了 8011，导致健康检查一直失败。

**修复：** 在 docker-compose.yml 中添加自定义 healthcheck：
```yaml
healthcheck:
  test: ["CMD", "curl", "-sf", "http://localhost:8011/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

**教训：** 使用非默认端口时，必须覆盖 Docker 镜像内置的健康检查。

---

### 坑 7：Neo4j 健康检查失败

**现象：** Neo4j 容器显示 `unhealthy`。

**原因：** Neo4j 容器内没有 `curl` 命令，健康检查 `curl -sf http://localhost:7474` 失败。

**修复：** 改用 Neo4j 自带的 `cypher-shell`：
```yaml
healthcheck:
  test: ["CMD-SHELL", "cypher-shell -u neo4j -p test1234 'RETURN 1'"]
```

注意：`RETURN 1` 必须作为单个字符串参数传递，不能拆分为 `RETURN` 和 `1` 两个参数。

**教训：** 不同 Docker 镜像内可用的工具不同，健康检查命令必须使用镜像内实际存在的工具。

---

### 坑 8：Reranker 缺少 `--reranking` 参数

**现象：** Reranker 服务启动正常（healthy），但调用 `/rerank` 端点返回 501：`This server does not support reranking. Start it with --reranking`。

**原因：** llama.cpp server 默认不启用 reranking 功能，需要显式添加 `--reranking` 参数。

**修复：**
```yaml
# 错误
command: --model /models/bge-reranker-v2-m3-Q8_0.gguf --pooling rank ...

# 正确
command: --model /models/bge-reranker-v2-m3-Q8_0.gguf --reranking ...
```

**教训：** llama.cpp server 的 `--pooling rank` 和 `--reranking` 是不同的参数。`--reranking` 才是启用 `/rerank` API 端点的正确参数。

---

### 坑 9：Reranker API 请求体字段不兼容

**现象：** 项目代码 `reranker.ts` 发送 `{query, passages, top_k, return_documents}` 但 llama.cpp 的 `/rerank` 端点期望 `{query, documents, top_k}`。

**原因：** 不同 reranker 服务的 API 格式不同。之前代码是为其他 reranker 服务写的，没有适配 llama.cpp 的 API 格式。

**修复：**
```typescript
// 错误
body: JSON.stringify({ query, passages: documents, top_k, return_documents: true })

// 正确
body: JSON.stringify({ query, documents, top_k })
```

同时，llama.cpp 的 `/rerank` 响应不包含 `document.text`，需要用 `index` 回查原文：
```typescript
// 错误
text: item.document?.text || documents[item.index] || ""

// 正确
text: documents[item.index] || ""
```

**教训：** 切换底层服务时，必须验证 API 请求/响应格式的兼容性。

---

### 坑 10：两个 docker-compose 文件未合并

**现象：** 项目中存在 `docker-compose.yml` 和 `docker-compose.reranker.yml` 两个文件。

**原因：** Reranker 服务是后来添加的，直接创建了新文件而没有合并到主文件中。

**修复：** 合并为一个 `docker-compose.yml`，删除 `docker-compose.reranker.yml`。

**教训：** 同一项目的 Docker 服务应该统一在一个 docker-compose.yml 中管理。

---

## 三、最终正确配置

### docker-compose.yml

```yaml
services:
  neo4j:
    image: neo4j:5
    container_name: aiagent_neo4j
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/test1234
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_server_memory_pagecache_size: 256M
      NEO4J_server_memory_heap_initial__size: 512M
      NEO4J_server_memory_heap_max__size: 512M
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    networks:
      - docker_default
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p test1234 'RETURN 1'"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s

  embedding:
    image: ghcr.io/ggml-org/llama.cpp:server
    container_name: aiagent_embedding
    ports:
      - "8011:8011"
    volumes:
      - D:\models\modelscope\models\OllmOne\bge-m3-GGUF:/models:ro
    command: >
      --model /models/bge-m3-q8_0.gguf
      --port 8011
      --host 0.0.0.0
      --embedding
      --pooling cls
      -c 8192
      -t 4
    networks:
      - docker_default
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8011/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  reranker:
    image: ghcr.io/ggml-org/llama.cpp:server
    container_name: aiagent_reranker
    ports:
      - "8010:8010"
    volumes:
      - D:\models\modelscope\models\gpustack\bge-reranker-v2-m3-GGUF:/models:ro
    command: >
      --model /models/bge-reranker-v2-m3-Q8_0.gguf
      --port 8010
      --host 0.0.0.0
      --reranking
      -c 8192
      -t 4
    networks:
      - docker_default
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8010/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s

volumes:
  neo4j_data:
  neo4j_logs:

networks:
  docker_default:
    external: true
```

### 模型下载命令

```powershell
# Embedding 模型（bge-m3，Q8_0 量化，约 1.2GB）
modelscope download --model OllmOne/bge-m3-GGUF --local_dir D:\models\modelscope\models\OllmOne\bge-m3-GGUF

# Reranker 模型（bge-reranker-v2-m3，Q8_0 量化，约 606MB）
modelscope download --model gpustack/bge-reranker-v2-m3-GGUF --local_dir D:\models\modelscope\models\gpustack\bge-reranker-v2-m3-GGUF
```

### API 验证命令

```powershell
# 验证 Embedding 服务
conda run -n agent python -c "
import requests
r = requests.post('http://localhost:8011/v1/embeddings', json={'model':'bge-m3','input':'hello'}, timeout=30)
print(r.status_code, len(r.json()['data'][0]['embedding']), 'dim')
"

# 验证 Reranker 服务
conda run -n agent python -c "
import requests
r = requests.post('http://localhost:8010/rerank', json={
    'query': 'Apple revenue',
    'documents': ['Apple revenue is 100B', 'Weather is sunny']
}, timeout=60)
print(r.status_code, r.json()['results'])
"
```

---

## 四、llama.cpp server 关键参数速查

| 参数 | 说明 | Embedding 用法 | Reranker 用法 |
|------|------|---------------|--------------|
| `--embedding` | 启用 embedding 模式 | ✅ 必须加 | ❌ 不加 |
| `--pooling cls` | CLS 池化（Embedding） | ✅ 必须加 | ❌ 不加 |
| `--reranking` | 启用 reranking 模式 | ❌ 不加 | ✅ 必须加 |
| `--pooling rank` | Rank 池化 | ❌ 不需要（`--reranking` 已包含） | ❌ 不需要 |
| `-c` | 上下文长度 | 8192 | 8192 |
| `-t` | 线程数 | 4 | 4 |
| `--port` | 服务端口 | 8011 | 8010 |

### API 端点

| 端点 | 服务 | 说明 |
|------|------|------|
| `GET /health` | 两者 | 健康检查 |
| `POST /v1/embeddings` | Embedding | OpenAI 兼容 embedding API |
| `GET /v1/models` | Embedding | 模型列表 |
| `POST /rerank` | Reranker | 重排序 API |

### Reranker 请求格式

```json
{
  "query": "查询文本",
  "documents": ["文档1", "文档2", "文档3"],
  "top_k": 3
}
```

### Reranker 响应格式

```json
{
  "model": "bge-reranker-v2-m3-Q8_0.gguf",
  "results": [
    {"index": 0, "relevance_score": 5.14},
    {"index": 2, "relevance_score": -11.03},
    {"index": 1, "relevance_score": -11.03}
  ]
}
```

注意：响应中**不包含** `document.text`，需要用 `index` 回查原始文档列表。

---

## 五、决策原则总结

| 场景 | 正确做法 | 错误做法 |
|------|---------|---------|
| 需要 GGUF 模型 | 从魔塔社区下载预转换版本 | 自己写脚本转换 |
| 搜索模型 | 去 modelscope.cn 官网搜索 | 凭记忆编造模型名和路径 |
| 部署同类模型 | 统一用同一套方案（llama.cpp） | 混用不同镜像 |
| 编写配置 | 先检查磁盘实际文件再写路径 | 凭记忆写路径 |
| API 对接 | 先验证 API 格式再写代码 | 假设 API 格式通用 |
| 健康检查 | 使用镜像内实际存在的工具 | 假设所有镜像都有 curl |
| Docker 编排 | 一个 docker-compose.yml | 多个文件分散管理 |
