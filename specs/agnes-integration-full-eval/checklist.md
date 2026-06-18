# AGNES AI 集成与全量评估 Checklist

## AGNES AI Provider
- [x] `src/server/llm/providers/agnes.ts` 已创建，实现 `callAgnes()` 函数
- [x] AGNES AI API Key 可从 `api_keys.yaml` 和环境变量 `AGNES_KEY` 读取
- [x] 支持重试机制（3次重试、指数退避、超时240s）
- [x] 支持 tool_calls（function calling）
- [x] 单元测试通过：`src/server/llm/providers/__tests__/agnes.test.ts`（20个测试）

## LLM Router 多 Provider
- [x] `callWithFallback` 根据模型 `provider` 属性选择 `callAgnes` 或 `callBailian`
- [x] 降级链支持跨 provider（agnes → dashscope）
- [x] 缓存 key 包含 provider 信息，避免不同 provider 结果混淆
- [x] 单元测试通过：`src/server/llm/__tests__/router.test.ts`（13个测试）+ `cache.test.ts`（4个测试）

## 配置文件
- [x] `config/api_keys.yaml.example` 包含 AGNES 配置段
- [x] `config/api_keys.yaml` 设置 `provider: agnes` 为默认
- [x] models 列表包含 `agnes-2.0-flash`（provider: agnes）和 `qwen-plus`（provider: dashscope）

## 评估脚本
- [x] `scripts/run-evaluation.ts` 使用 `callWithFallback` 替代 `callBailian`
- [x] 评估脚本可通过配置选择 LLM provider

## 数据集下载
- [x] CFLUE 数据集下载脚本已创建（魔塔社区可用）
- [x] FinEval 数据集下载脚本已创建（需从 GitHub 下载）
- [x] FinQA 数据集下载脚本已创建（需从 HuggingFace 下载）
- [x] 下载脚本：`scripts/download-datasets.ts`

## 数据集适配
- [x] CFLUE 适配器支持双路径加载（D:\data\modelscope + tests/datasets/）
- [x] FinEval 适配器支持双路径加载
- [x] FinQA 适配器支持双路径加载
- [x] 适配器测试通过（46个测试）

## 新增公司文档
- [x] 中国能建年报（2025）已上传并索引
- [x] 中国人保年报（2025）已上传并索引
- [x] 中国铁建年报（2025）已上传并索引
- [x] 3家公司季报（2026Q1）已上传并索引

## 交易数据缓存
- [x] 中国能建（sh601868）一年日K线数据已缓存（242条）
- [x] 中国人保（sh601319）一年日K线数据已缓存（242条）
- [x] 中国铁建（sh601186）一年日K线数据已缓存（242条）
- [x] 原有3家公司数据已缓存（235条/家）

## 黄金测试集扩展
- [x] `scripts/qa-golden.json` 包含中国能建测试用例（5条）
- [x] `scripts/qa-golden.json` 包含中国人保测试用例（5条）
- [x] `scripts/qa-golden.json` 包含中国铁建测试用例（5条）
- [x] 新增测试用例格式正确，总用例数133条

## 全量评估
- [x] AGNES AI API 可用（curl 测试通过）
- [x] 全量评估执行成功（133条黄金测试集）
- [x] 评估报告已保存到数据库
- [x] 评估报告已保存到 `tests/reports/evaluation/`

## 评估结果摘要
| 指标 | 值 |
|------|------|
| 总用例数 | 133 |
| 平均 Hits@K | 0.0451 |
| 平均 Context Relevance | 0.3764 |
| 平均 Context Recall | 0.0615 |
| 平均 Faithfulness | 0.2531 |
| 平均 Answer Relevance | 0.3310 |
| 综合得分 | 0.2207 |
| 数值准确率 | 0.1390 |
| 合规性得分 | 0.9724 |
| 幻觉率 | 0.0182 |
| 风险提示得分 | 0.7977 |
| 时效性得分 | 0.4744 |
| 金融综合得分 | 0.4408 |
