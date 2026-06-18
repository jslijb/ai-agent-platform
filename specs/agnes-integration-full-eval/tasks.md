# Tasks

## 阶段1：AGNES AI Provider 集成

- [x] Task 1: 创建 AGNES AI provider
  - [x] 1.1: 创建 `src/server/llm/providers/agnes.ts`，实现 `callAgnes()` 函数（OpenAI 兼容协议，base_url: `https://apihub.agnes-ai.com/v1`，模型: `agnes-2.0-flash`）
  - [x] 1.2: API Key 读取逻辑：优先 `api_keys.yaml` 的 `llm.AGNES_KEY`，其次环境变量 `AGNES_KEY`
  - [x] 1.3: 支持重试机制（复用百炼的重试逻辑：3次重试、指数退避、超时240s）
  - [x] 1.4: 支持 tool_calls（function calling）
  - [x] 1.5: 编写单元测试 `src/server/llm/providers/__tests__/agnes.test.ts`（TDD：先写测试再实现）

- [x] Task 2: 重构 LLM Router 支持多 provider
  - [x] 2.1: 修改 `src/server/llm/router.ts`，`callWithFallback` 根据模型的 `provider` 属性选择 `callAgnes` 或 `callBailian`
  - [x] 2.2: 降级链支持跨 provider（如 agnes-2.0-flash → qwen-plus）
  - [x] 2.3: 修改 `src/server/llm/cache.ts`，缓存 key 包含 provider 信息
  - [x] 2.4: 编写单元测试 `src/server/llm/__tests__/router.test.ts`（TDD：测试多 provider 路由和降级）

- [x] Task 3: 更新配置文件
  - [x] 3.1: 修改 `config/api_keys.yaml.example`，新增 AGNES 配置段（provider、AGNES_KEY、AGNES_BASE_URL）
  - [x] 3.2: 修改 `config/api_keys.yaml`（实际配置文件），设置 `provider: agnes` 为默认
  - [x] 3.3: models 列表新增 `agnes-2.0-flash`，标记 `provider: agnes`

- [x] Task 4: 修改评估脚本使用 LLM Router
  - [x] 4.1: 修改 `scripts/run-evaluation.ts`，将 `callBailian` 替换为 `callWithFallback`
  - [x] 4.2: 修改 `answerFn` 使用 `callWithFallback`
  - [x] 4.3: 编写集成测试验证评估脚本可使用 AGNES AI

## 阶段2：开源数据集下载与适配

- [x] Task 5: 下载 CFLUE/FinEval/FinQA 数据集
  - [x] 5.1: 编写数据集下载脚本 `scripts/download-datasets.ts`，从魔塔社区下载到 `D:\data\modelscope`
  - [x] 5.2: 下载 CFLUE 数据集到 `D:\data\modelscope\CFLUE`（魔塔社区可用）
  - [x] 5.3: 下载 FinEval 数据集到 `D:\data\modelscope\FinEval`（需从 GitHub 下载）
  - [x] 5.4: 下载 FinQA 数据集到 `D:\data\modelscope\FinQA`（需从 HuggingFace 下载）
  - [x] 5.5: 验证下载的数据文件格式和内容

- [x] Task 6: 适配数据集格式
  - [x] 6.1: 分析魔塔社区下载的数据格式，与现有适配器期望格式对比
  - [x] 6.2: 修改 `src/server/evaluation/adapters/cflue-adapter.ts`，适配实际数据格式
  - [x] 6.3: 修改 `src/server/evaluation/adapters/fineval-adapter.ts`，适配实际数据格式
  - [x] 6.4: 修改 `src/server/evaluation/adapters/finqa-adapter.ts`，适配实际数据格式
  - [x] 6.5: 编写适配器测试（TDD：用下载的真实数据测试适配器）

## 阶段3：扩展评估数据源

- [x] Task 7: 上传新增公司报表文档
  - [x] 7.1: 确认 `D:\Python\ai-agent-platform\data\financial_reports\2025_annual` 中中国能建、中国人保、中国铁建的年报 PDF
  - [x] 7.2: 确认 `D:\Python\ai-agent-platform\data\financial_reports\2026_q1` 中3家公司的季报 PDF
  - [x] 7.3: 通过 API 批量上传3家公司的报表文档（`/api/document/upload`）
  - [x] 7.4: 验证文档上传成功并已建立索引

- [x] Task 8: 预缓存交易数据
  - [x] 8.1: 编写缓存脚本 `scripts/cache-stock-data.ts`，调用 data-service API
  - [x] 8.2: 缓存中国能建（sh601868）2025-06-14 至 2026-06-14 日K线数据
  - [x] 8.3: 缓存中国人保（sh601319）2025-06-14 至 2026-06-14 日K线数据
  - [x] 8.4: 缓存中国铁建（sh601186）2025-06-14 至 2026-06-14 日K线数据
  - [x] 8.5: 同时缓存原有3家公司（格力电器、五粮液、中国长城）的数据
  - [x] 8.6: 验证缓存数据完整性

- [x] Task 9: 扩展黄金测试集
  - [x] 9.1: 在 `scripts/qa-golden.json` 中新增覆盖中国能建的测试用例（5条）
  - [x] 9.2: 新增覆盖中国人保的测试用例（5条）
  - [x] 9.3: 新增覆盖中国铁建的测试用例（5条）
  - [x] 9.4: 验证新增测试用例格式正确

## 阶段4：全量评估执行

- [x] Task 10: 执行全量评估
  - [x] 10.1: 确认 AGNES AI API 可用（curl 测试通过）
  - [x] 10.2: 确认所有数据源就绪（文档索引、交易缓存、数据集下载）
  - [x] 10.3: 执行 `npx tsx scripts/run-evaluation.ts --level full --type rag`
  - [x] 10.4: 监控评估进度和日志
  - [x] 10.5: 验证评估报告生成并保存到数据库

# Task Dependencies
- Task 2 depends on Task 1（router 需要 agnes provider）
- Task 4 depends on Task 2（评估脚本需要 router 支持多 provider）
- Task 6 depends on Task 5（适配器需要知道实际数据格式）
- Task 7 depends on Task 1（文档上传的 vision/OCR 可能使用 AGNES AI）
- Task 9 depends on Task 7, Task 8（测试用例需要文档和交易数据就绪）
- Task 10 depends on Task 4, Task 6, Task 9（全量评估需要所有前置条件就绪）

# Parallelizable Work
- Task 1 和 Task 5 可以并行（AGNES provider 和数据集下载互不依赖）
- Task 7 和 Task 8 可以并行（文档上传和交易缓存互不依赖）
