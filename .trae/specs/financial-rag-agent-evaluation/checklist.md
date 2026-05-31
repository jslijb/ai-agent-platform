# 金融行业 RAG & Agent 评估最佳实践 - 验收清单

## RAG 评估器扩展

- [x] `evaluateNumericalAccuracy` 函数实现，支持 ±5% 误差容忍
- [x] `evaluateCompliance` 函数实现，检测违规内容（承诺收益、推荐买卖时点、未声明风险等）
- [x] `evaluateHallucination` 函数实现，检测无法溯源的数据点
- [x] `evaluateRiskDisclosure` 函数实现，检查风险提示完整性
- [x] `evaluateTimeliness` 函数实现，基于数据日期计算时效性得分
- [x] `FinancialEvaluationResult` 和 `FinancialEvaluationReport` 类型定义正确（含 version、dataSource、evaluationLevel、triggerMode、milestone 字段）
- [x] `runFullEvaluation` 函数集成所有金融专用指标
- [x] 综合评分公式采用金融行业权重（通用 50% + 金融 50%）
- [x] 所有新增评估函数包含详细日志输出
- [x] 降级策略：LLM 不可用时使用基于规则的评估降级方案

## Agent 评估器扩展

- [x] `evaluateToolSelection` 函数实现，评估工具选择合理性
- [x] `evaluatePlanning` 函数实现，评估任务分解和规划能力
- [x] `evaluateAgentCompliance` 函数实现，检查 Agent 合规约束
- [x] `evaluateConsistency` 函数实现，评估多轮对话一致性
- [x] `evaluateEfficiency` 函数实现，评估迭代轮次、Token 消耗、响应时间
- [x] `AgentEvaluationResult` 和 `AgentEvaluationReport` 类型定义正确
- [x] Agent 测试框架集成所有金融专用指标

## 黄金测试集扩展

- [x] RAG 黄金测试集扩展至 100 条以上
- [x] 覆盖 8 个金融场景分类（A股交易规则、财报数据、技术指标、合规风控、多跳推理、投资建议合规、对抗性测试、时效性测试）
- [x] 投资建议合规测试用例 10 条
- [x] 对抗性测试用例 10 条（诱导违规建议、数据注入、越权查询）
- [x] 时效性测试用例 5 条
- [x] Agent 测试用例扩展，覆盖合规性、规划能力、效率评估场景
- [x] 测试用例包含 expectedFinancialMetrics 字段（期望的数值、合规标记、风险提示项等）

## 评估配置化

- [x] `evaluation-config.yaml` 配置文件创建，支持指标权重和阈值配置
- [x] 评估场景预设实现（合规优先、准确性优先、效率优先）
- [x] `run-evaluation.ts` 支持加载配置文件
- [x] `rag-evaluator.ts` 支持动态权重

## 自动化回归测试

- [x] 评估基线保存功能实现
- [x] 回归对比功能实现，对比当前评估结果与基线
- [x] 退化告警实现，指标下降超过阈值时标记告警
- [x] `scripts/run-regression-test.ts` 脚本实现

## 评估趋势追踪

- [x] 评估历史持久化到数据库，每次评估记录包含 version、evaluationLevel、dataSource、milestone、triggerMode 等字段
- [x] 评估历史查询 API 实现，支持按时间范围、评估级别、数据来源筛选
- [x] 指标趋势计算逻辑实现，支持计算任意指标在时间区间内的变化趋势
- [x] 优化前后自动对比功能实现，评估完成后自动与上一次同级别评估对比，生成 Δ 报告（含 ↑↓→ 标识）
- [x] 里程碑标记功能实现，支持在评估时标记里程碑事件
- [x] 能力雷达图数据接口实现，返回各维度能力评分

## 评估触发机制

- [x] 评估触发模式配置实现（手动/自动），默认手动
- [x] 前端评估页面有"运行评估"按钮，点击后可选择评估级别（日常/标准/全面）并触发评估
- [x] 评估运行期间前端展示进度状态
- [x] 评估触发 API（`POST /api/evaluation/run`）实现，支持指定评估级别
- [x] 自动触发框架预留（定时、部署后、文档更新后、错误率上升），开发阶段不启用
- [x] 前端有触发模式切换开关，切换后自动保存配置，无需重启服务

## 评估版本管理与对比

- [x] 评估版本表（evaluation_versions）创建，版本号自增，不可删除不可修改
- [x] 版本列表 API 实现，支持按时间倒序、评估级别、数据来源筛选
- [x] 前端版本列表页面实现，展示版本号、时间、级别、综合得分
- [x] 前端多版本对比功能实现，支持选择 2-5 个版本进行逐指标对比（表格 + 趋势图 + Δ 变化值 + ↑↓→ 标识）
- [x] 新旧指标兼容处理：历史版本中不存在的指标留空显示（标记为"-"），不影响已有指标对比
- [x] 前端版本详情页面实现，展示完整评估报告

## 历史查询评估

- [x] 历史查询采集中间件实现，在 Chat/Agent 流程中自动记录到评估数据池
- [x] 评估数据池表（evaluation_pool）创建，存储历史查询及元数据
- [x] 历史查询数据持久化保存，不可自动清理
- [x] 历史查询自动构建评估集功能实现：去重聚类 → 均匀采样 → LLM 自动标注参考答案
- [x] 历史查询评估执行逻辑实现，使用历史 query 重新调用管线，对比当前 vs 历史回答
- [x] 用户反馈采集接口实现，支持对历史回答标注"正确/错误/部分正确"

## 开源金融数据集评估

- [x] `DatasetAdapter` 接口定义正确（load、transform、validate）
- [x] FinEvalAdapter 实现，适配 FinEval 多选题格式，从 `D:\data\modelscope` 加载
- [x] CFLUEAdapter 实现，适配 CFLUE 分类/抽取格式
- [x] FinQAAdapter 实现，适配 FinQA 数值推理格式
- [x] ConvFinQAAdapter 实现，适配 ConvFinQA 多轮对话格式
- [x] 开源数据集评估执行逻辑集成到全面评估模式
- [x] 数据集子集选择功能实现，支持按分类、难度、数量筛选

## 双轨评估级别

- [x] 日常级别评估实现：黄金测试集 + 最近 50 条历史查询，10 分钟内完成
- [x] 标准级别评估实现：黄金测试集 + 历史查询采样，20 分钟内完成
- [x] 全面级别评估实现：黄金测试集 + 历史查询 + 开源数据集，30-60 分钟完成
- [x] `run-evaluation.ts` 支持 `--level` 参数选择评估级别

## 评估报告增强与 Dashboard

- [x] 评估报告格式包含金融行业专用指标和数据来源标注
- [x] 评估报告对比功能实现，支持选择多次评估结果进行逐指标对比
- [x] 行业基准参考数据提供
- [x] RAG 评估页面展示金融专用指标 + 趋势曲线 + 雷达图
- [x] Agent 评估页面展示金融专用指标 + 趋势曲线
- [x] 评估趋势页面实现，展示指标随时间变化曲线 + 里程碑标记
- [x] 评估配置界面实现，支持选择评估级别、数据源、权重配置、触发模式切换

## 向后兼容性

- [x] 现有 RAG 评估功能（5 个通用指标）保持不变
- [x] 现有 Agent 评估功能（工具调用验证）保持不变
- [x] 现有评估报告格式向后兼容
- [x] 现有 Dashboard 页面不破坏
- [x] 现有黄金测试集（qa-golden.json）保持可用
