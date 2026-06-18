# AGNES AI 集成与全量评估 Spec

## Why
当前系统仅支持阿里百炼（DashScope）作为 LLM 提供者，且评估数据源有限（仅3家公司年报+103条黄金测试集）。需要集成 AGNES AI 作为默认 LLM 提供者（免费无限期），保留百炼作为备选，同时扩展评估数据源（新增3家公司+3个开源金融数据集），实现全量评估。

## What Changes
- 新增 AGNES AI LLM provider（OpenAI 兼容协议，base_url: `https://apihub.agnes-ai.com/v1`，模型: `agnes-2.0-flash`）
- 重构 LLM 调用层，支持多 provider 切换（AGNES / 百炼），默认 AGNES
- 修改 `api_keys.yaml` 配置结构，支持多 provider 配置
- 修改 LLM router，根据配置选择 provider
- 下载 CFLUE/FinEval/FinQA 完整数据集到 `D:\data\modelscope`
- 适配数据集格式（根据魔塔社区实际数据格式调整适配器）
- 新增3家公司（中国能建、中国人保、中国铁建）的年报/季报文档上传和索引
- 预缓存3家公司的交易数据（一年，到 2026-06-14）
- 扩展黄金测试集，覆盖新增公司
- 用 AGNES AI 执行全量评估（黄金测试集 + 开源数据集）

## Impact
- Affected specs: `agent-memory-and-evaluation`, `microservice-upgrade`
- Affected code:
  - `src/server/llm/providers/bailian.ts` — 重构为通用 OpenAI 兼容 provider
  - `src/server/llm/providers/` — 新增 `agnes.ts`
  - `src/server/llm/router.ts` — 支持多 provider 路由
  - `src/server/llm/cache.ts` — 适配多 provider
  - `config/api_keys.yaml.example` — 新增 AGNES 配置段
  - `src/server/evaluation/adapters/cflue-adapter.ts` — 适配魔塔社区数据格式
  - `src/server/evaluation/adapters/fineval-adapter.ts` — 适配魔塔社区数据格式
  - `src/server/evaluation/adapters/finqa-adapter.ts` — 适配魔塔社区数据格式
  - `scripts/run-evaluation.ts` — 支持选择 LLM provider
  - `src/server/vision/vision-fallback-client.ts` — 支持 AGNES vision 模型
  - `src/app/api/document/upload/route.ts` — 支持批量上传新公司报表

---

## ADDED Requirements

### Requirement: AGNES AI Provider
系统 SHALL 提供 AGNES AI 作为 LLM provider，使用 OpenAI 兼容协议。

#### Scenario: 默认使用 AGNES AI
- **WHEN** `api_keys.yaml` 中 `llm.provider` 为 `agnes` 或未设置（默认）
- **THEN** 所有 LLM 调用使用 AGNES AI API（`https://apihub.agnes-ai.com/v1`），模型 `agnes-2.0-flash`
- **AND** API Key 从 `AGNES_KEY` 环境变量或 `api_keys.yaml` 的 `llm.AGNES_KEY` 读取

#### Scenario: 切换到百炼
- **WHEN** `api_keys.yaml` 中 `llm.provider` 设置为 `dashscope`
- **THEN** 所有 LLM 调用使用百炼 API，行为与当前一致

#### Scenario: AGNES AI 不可用时降级到百炼
- **WHEN** AGNES AI 调用失败（网络错误、额度耗尽等）
- **THEN** LLM router 自动降级到百炼 provider
- **AND** 日志记录降级事件

### Requirement: 多 Provider 配置
系统 SHALL 支持在 `api_keys.yaml` 中配置多个 LLM provider。

#### Scenario: 配置文件格式
- **WHEN** `api_keys.yaml` 包含以下结构：
  ```yaml
  llm:
    provider: agnes  # 默认 provider，可选: agnes, dashscope
    AGNES_KEY: YOUR_ANNES_KEY
    AGNES_BASE_URL: https://apihub.agnes-ai.com/v1
    DASHSCOPE_API_KEY: YOUR_DASHSCOPE_API_KEY
    DASHSCOPE_BASE_URL: https://dashscope.aliyuncs.com/compatible-mode/v1
    models:
      - id: agnes-2.0-flash
        provider: agnes
        functionCalling: true
      - id: qwen-plus
        provider: dashscope
        functionCalling: true
  ```
- **THEN** 系统根据 `provider` 字段和每个模型的 `provider` 属性选择对应的 API

### Requirement: 开源金融数据集下载与适配
系统 SHALL 支持从魔塔社区下载 CFLUE、FinEval、FinQA 完整数据集，并适配数据格式。

#### Scenario: 数据集下载
- **WHEN** 执行数据集下载脚本
- **THEN** CFLUE、FinEval、FinQA 数据集下载到 `D:\data\modelscope` 对应子目录
- **AND** 优先从魔塔社区（modelscope.cn）下载

#### Scenario: 数据格式适配
- **WHEN** 下载的数据格式与现有适配器期望格式不一致
- **THEN** 适配器 SHALL 根据实际数据格式进行转换
- **AND** 转换后的数据符合 `UnifiedTestItem` 接口

### Requirement: 扩展评估数据源
系统 SHALL 支持新增3家公司的财务数据用于评估。

#### Scenario: 新增公司文档
- **WHEN** 中国能建、中国人保、中国铁建的年报（2025）和季报（2026Q1）PDF 放入对应目录
- **THEN** 系统上传并索引这些文档，使其可用于 RAG 检索

#### Scenario: 交易数据预缓存
- **WHEN** 执行缓存脚本
- **THEN** 3家新公司（中国能建 sh601868、中国人保 sh601319、中国铁建 sh601186）的一年交易数据（2025-06-14 至 2026-06-14）通过 data-service API 预缓存
- **AND** 缓存数据包含日K线历史行情

#### Scenario: 黄金测试集扩展
- **WHEN** 新公司文档已索引
- **THEN** 黄金测试集新增覆盖新公司的测试用例（每家公司至少5条）

### Requirement: 全量评估执行
系统 SHALL 支持使用 AGNES AI 执行全量评估。

#### Scenario: 全量评估
- **WHEN** 执行 `npx tsx scripts/run-evaluation.ts --level full`
- **THEN** 评估使用 AGNES AI 作为 LLM provider
- **AND** 评估包含黄金测试集（103+条）+ CFLUE + FinEval + FinQA 数据集
- **AND** 评估结果保存到数据库和报告文件

---

## MODIFIED Requirements

### Requirement: LLM Router 降级链
原要求：降级链从 `api_keys.yaml` 的 `models` 列表顺序读取，全部走百炼 API。
修改为：降级链支持跨 provider，每个模型有 `provider` 属性，router 根据属性选择对应的 API endpoint 和 key。

### Requirement: 评估脚本 LLM 选择
原要求：评估脚本硬编码使用 `callBailian`。
修改为：评估脚本使用 `callWithFallback`（LLM router），自动根据配置选择 provider。

---

## REMOVED Requirements
无移除的需求。
