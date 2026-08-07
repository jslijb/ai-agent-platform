# 硬件配置档案（HARDWARE PROFILE）

> 所有性能优化决策的硬件约束依据
> 最后更新：2026-08-04

---

## 本地开发环境

| 项目 | 配置 | 备注 |
|------|------|------|
| CPU | Intel i7（具体型号待确认） | 4核8线程或6核12线程 |
| 内存 | 16 GB DDR4 | 容器+系统共用 |
| 硬盘 | 512 GB SSD | Docker 镜像+数据 |
| GPU | 无 | embedding/reranker 用 CPU 推理 |
| OS | Windows 11 | Docker Desktop WSL2 后端 |

### 资源分配现状

| 组件 | 内存占用 | CPU 占用 | 磁盘占用 |
|------|----------|----------|----------|
| Docker Desktop WSL2 | ~2GB 基础 | - | - |
| ai_novel_postgres | ~200MB | 低 | ~1GB 数据 |
| ai_novel_redis | ~50MB | 极低 | ~100MB |
| aiagent_neo4j | ~600MB | 低 | ~500MB |
| aiagent_embedding (llama.cpp) | ~300MB | 中（推理时） | ~200MB 模型 |
| aiagent_reranker (llama.cpp) | ~250MB | 中（推理时） | ~150MB 模型 |
| aiagent_main_service (Next.js) | ~200MB | 低 | - |
| aiagent_rag_service (Fastify) | ~100MB | 低 | - |
| aiagent_data_service (FastAPI) | ~150MB | 低 | - |
| aiagent_nginx | ~10MB | 极低 | - |
| **合计** | **~4.1GB** | - | **~2GB** |

### 可用余量

- 内存：16GB - 4.1GB(容器) - 4GB(系统) ≈ **8GB 可用**
- CPU：i7 多核，embedding/reranker 推理时占1-2核，其余核空闲
- 磁盘：512GB - 2GB(容器数据) - ~50GB(Docker镜像) ≈ **460GB 可用**

### 性能瓶颈

1. **CPU 推理**：embedding/reranker 用 llama.cpp CPU 模式，并发时 CPU 瓶颈
2. **LLM API 延迟**：外部 API 调用（通义千问/Agnes），P50=1865ms，不可控
3. **无 GPU**：无法加速模型推理

---

## 服务器环境

| 项目 | 配置 | 备注 |
|------|------|------|
| CPU | 待确认 | 服务器级 |
| 内存 | 待确认 | ≥32GB |
| GPU | 有 | PaddleOCR + 模型推理加速 |
| 硬盘 | 待确认 | SSD |
| OS | Linux | Docker 原生 |

### 服务器独有优化

- PaddleOCR GPU 大参数模式（vs 本地 CPU 小参数）
- embedding/reranker GPU 加速
- 多实例部署 + nginx 负载均衡
- 压测环境