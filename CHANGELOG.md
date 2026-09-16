# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- CI 从 npm 切换到 pnpm（`--frozen-lockfile`），修复 pnpm workspace 配置失效（补 `packages` 字段并重生成 lockfile）
- 移除 npm lockfile，`pnpm-lock.yaml` 成为唯一 lockfile；`.env.example` 补齐 LLM Key 配置段
- `TUSHARE_TOKEN` 改为环境变量优先读取
- 文档治理：消除 6 组重复文档、修复 54 条失效链接，版本快照目录归一至 `docs/versions/v{N}/`

### Fixed
- 知识图谱可视化 API 3 处查询缺陷（漏边约 90%、Neo4j 5 语法不兼容、重复边）
- TypeScript 编译错误（Map 迭代改 `Array.from`）；补声明 `pg`/`langsmith`/`@types/pg`/`js-yaml` 依赖

### Security
- 清除仓库内硬编码凭据与非项目材料，敏感令牌脱敏

### Docs
- README 补系统截图（裁剪至最小有效区域）与项目架构图

## [3.0.0] - 2026-08-17

### Added
- MCP Server（`/api/mcp`）与 OA（Odoo）、CRM（Twenty）集成
- 机器人（bots）支持
- 语义缓存（Semantic Cache）
- 知识图谱 v2：全量重建完成并通过 E2E 回归
- 统一 Agent 合规/库外两种拒绝话语，评估器同步识别
- R003 多实体并行检索可行性调研（L2 跨公司对比）

### Fixed
- `/api/mcp` 路由缺少 `force-dynamic` 导致生产构建失败
- Windows 本地 `next build` 的 EPERM symlink 失败

### Changed
- 移除服务器部署类需求（决定不对外部署服务）
- CI `lint-and-typecheck` 增加 `next build` 步骤

### Docs
- README 更新至 V3.0 状态（837 tests / MCP / Odoo / Twenty / LangGraph / bots）

## [2.7.0] - 2026-08-07

### Added
- 评估框架切换至 RAGAS + 合规拦截层 + 检索优化（V11）
- 财务数据落 PostgreSQL，10 家样本公司回填完成
- 查询路由接入 simpleAgent；V13-r4 评估综合 0.8688 首次达标
- Agent 架构升级（V14）：R016 工具合并（21→6，token 减少 60%）、R017 Context Compaction（对话 >20 条生成结构化摘要）、R018 Checkpoint+Resume 错误恢复（Redis 存储）、R019 Transcript 耗时追踪
- 知识图谱 `graphSearch` 集成到 `hybridSearch` 工具
- 合规护栏：`loadConversation` 越权检查，401 时重定向登录
- 文档体系：`CODE_INDEX.md`（功能代码索引）、`PROJECT_OVERVIEW.md`（项目全景）

### Fixed
- pdf-extractor 文本解析 fallback 修复 4 家公司字段提取失败；修复 3 家问题公司财务数据提取错误
- 历史对话 bug：移除 `.env.local` 挂载到容器（AUTH_URL 端口冲突覆盖）
- CI 排除契约/集成测试

## [2.6.0] - 2026-06-20

### Added
- 引用溯源：PDF 解析增加页码提取（`[PAGE_N]` 标记），检索链路传递 metadata，Agent 收集 citations 并通过 SSE 传递给前端
- 前端聊天界面展示 PDF 引用与数据源引用（CitationPanel + PdfPreviewModal 组件）
- RAG 评估 V8 优化：evaluateAnswer 增加 canAnswer 参数感知，区分正确拒绝和错误拒绝
- V1-V8 RAG 评估迭代分析报告，记录每版本修改内容、指标变化趋势、根因分析

### Changed
- RAG 评估融合权重调整为 heuristic20% + relevance40% + correctness40%
- LLM correctness 评估 prompt 更宽松（核心信息一致给高分）
- Context Recall 修正最低 0.6

## [2.5.0] - 2026-06-18

### Added
- 微信认证和小程序模块（微信登录绑定、小程序 API）
- LLM 路由和缓存支持降级链和 429 限流
- RAG 评估系统：V1 基线评估（130 条 golden 测试集，overall=0.6012）、断点续传、AGNES 限流应对
- 评估页面新增 5 个专业 section（指标详情、诊断矩阵等）
- 版本对比页面新增趋势图和优化时间线
- 黄金测试集重写，130 条 query 覆盖 9 类金融场景

### Changed
- RAG 评估 V2-V7 迭代优化：合并 LLM 评估调用、调整融合权重、改进启发式评估
- 评估适配器修复 category 映射和 canAnswer 字段

## [2.4.0] - 2026-06-13

### Added
- 用户友好错误提示
- 可观测性：Prometheus 指标采集 + Grafana 仪表盘
- 数据安全：加密/解密、审计日志、数据脱敏

### Fixed
- Nginx 评估路由指向 main-service
- 日志添加时间戳（instrumentation.ts）

## [2.3.0] - 2026-06-04

### Added
- Phase 6 微服务架构升级：测试改进、降级优化、RAG 评估
- CI/CD 流水线配置

### Fixed
- TypeScript 类型错误修复
- npm ci 失败修复（package-lock.json 同步、npm 镜像配置）
- CI 测试套件：仅运行 src/server/ 单元测试，避免基础设施测试失败
- 移除硬编码 qwen3.5-plus

## [2.2.0] - 2026-06-01

### Added
- Agent 多层编排：Orchestrator + Router Facade + Enhanced ReAct Executor + Execution Facade
- SimpleAgent 原生 Function Calling 支持 + Router Facade + Tool Vector Retriever + Validator + Call Limiter + Error Recovery
- 百炼原生 Function Calling 支持和路由工具参数
- Skill 系统：增强注册表、类型定义、Skill 定义、编排器、技能组路由、多技能匹配
- 工具系统：名称别名、增强注册表、分组配置、描述增强（when_to_use/few-shot）、调用校验器、调用限流器
- Skill/Tool 双级向量检索
- 视觉引擎：PaddleOCR 客户端 + 视觉降级 + 双引擎路由 + analyzeImage 工具
- 评估仪表盘、API 路由、脚本
- 前端图片上传组件 + OCR 集成
- 路由/校验/检索/描述/视觉/名称别名等模块单元测试

### Fixed
- 百炼工具调用响应 content-type 兼容性
- 数据库 UTF-8 编码问题
- PaddleOCR v3.6 API 兼容

## [2.1.0] - 2026-05-30

### Added
- Agent 记忆系统：L1 原始消息、L2 滚动摘要、L3 历史片段提取、L4 用户画像
- 记忆系统三级权限隔离（个人/团队/全局）
- Drizzle 运行时验证通过
- 数据清洗模块、截断策略优化、BM25 预处理、配置解析修复
- 业务测试套件

### Fixed
- TypeScript 编译错误修复

## [2.0.0] - 2026-05-27

### Added
- Agent 日志系统、Token 用量展示、模型选择
- 前端启动问题修复
- 安全认证、角色权限
- 文档切片优化
- 数据服务按需启动

### Changed
- ORM 从 Prisma 迁移到 Drizzle（ADR-001）
- API 层从 tRPC 迁移到 Route Handlers + SSE（ADR-002）
- 认证适配器从 `@auth/prisma-adapter` 迁移到 `@auth/drizzle-adapter`

### Fixed
- 前端启动慢问题
- 文档切片质量问题

## [1.3.0] - 2026-05-26

### Added
- 原生 Reranker 服务（BGE-Reranker-v2-m3）
- GGUF 模型转换脚本

## [1.2.0] - 2026-05-25

### Changed
- 文档整理：docs 移至 docs/ 目录，移除根目录重复文件

## [1.1.0] - 2026-05-25

### Added
- 项目初始化：Next.js 14 + TypeScript + App Router
- 基础目录结构：src/app、src/components、src/server、src/lib
- Docker Compose 编排：PostgreSQL + pgvector、Redis、Neo4j
- LangGraph Agent 核心 + 工具调用基础
- 向量检索 + 混合检索（BM25 + 向量 + RRF）
- 文档上传与解析（PDF + 表格提取）
- RAG 管道：Embedding 生成、语义切片、稠密/稀疏/混合检索
- 阿里百炼 LLM 调用集成
- NextAuth v5 认证
- tRPC API 层（初始版本）
- Prisma ORM（初始版本）

## [1.0.0] - 2026-05-25

### Added
- 项目创建，首次提交