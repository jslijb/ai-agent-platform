# Tasks

- [x] Task 1: 扩展 RAG 评估器 - 新增金融行业专用指标
  - [x] SubTask 1.1: 在 `rag-evaluator.ts` 中新增数值精确度评估函数 `evaluateNumericalAccuracy`
  - [x] SubTask 1.2: 在 `rag-evaluator.ts` 中新增金融合规性评估函数 `evaluateCompliance`
  - [x] SubTask 1.3: 在 `rag-evaluator.ts` 中新增金融幻觉检测函数 `evaluateHallucination`
  - [x] SubTask 1.4: 在 `rag-evaluator.ts` 中新增风险提示完整性评估函数 `evaluateRiskDisclosure`
  - [x] SubTask 1.5: 在 `rag-evaluator.ts` 中新增数据时效性评估函数 `evaluateTimeliness`
  - [x] SubTask 1.6: 扩展 `EvaluationReport` 接口，新增 `FinancialEvaluationResult` 和 `FinancialEvaluationReport` 类型（含 version、dataSource、evaluationLevel、triggerMode、milestone 字段）
  - [x] SubTask 1.7: 更新 `runFullEvaluation` 函数，集成金融专用指标计算
  - [x] SubTask 1.8: 更新综合评分公式，采用金融行业权重配置

- [x] Task 2: 扩展 Agent 评估器 - 新增金融行业专用指标
  - [x] SubTask 2.1: 新增工具选择合理性评估函数 `evaluateToolSelection`
  - [x] SubTask 2.2: 新增任务规划能力评估函数 `evaluatePlanning`
  - [x] SubTask 2.3: 新增 Agent 合规性评估函数 `evaluateAgentCompliance`
  - [x] SubTask 2.4: 新增多轮对话一致性评估函数 `evaluateConsistency`
  - [x] SubTask 2.5: 新增 Agent 效率评估函数 `evaluateEfficiency`
  - [x] SubTask 2.6: 新增 `AgentEvaluationResult` 接口和 `AgentEvaluationReport` 类型
  - [x] SubTask 2.7: 更新 Agent 测试框架，集成金融专用指标

- [x] Task 3: 扩展金融行业黄金测试集
  - [x] SubTask 3.1: 扩展 RAG 黄金测试集至 100 条，覆盖 8 个金融场景分类
  - [x] SubTask 3.2: 新增投资建议合规测试用例（10条）
  - [x] SubTask 3.3: 新增对抗性测试用例（10条）：诱导违规建议、数据注入、越权查询
  - [x] SubTask 3.4: 新增时效性测试用例（5条）：引用过期数据检测
  - [x] SubTask 3.5: 扩展 Agent 测试用例，新增合规性、规划能力、效率评估场景

- [x] Task 4: 评估配置化
  - [x] SubTask 4.1: 新增评估配置文件 `evaluation-config.yaml`，支持指标权重和阈值配置
  - [x] SubTask 4.2: 新增评估场景预设（合规优先、准确性优先、效率优先）
  - [x] SubTask 4.3: 更新 `run-evaluation.ts` 支持加载配置文件
  - [x] SubTask 4.4: 更新 `rag-evaluator.ts` 支持动态权重

- [x] Task 5: 自动化回归测试框架
  - [x] SubTask 5.1: 新增评估基线保存功能，每次评估自动保存基线
  - [x] SubTask 5.2: 新增回归对比功能，对比当前评估结果与基线
  - [x] SubTask 5.3: 新增退化告警，指标下降超过阈值时标记告警
  - [x] SubTask 5.4: 新增回归测试脚本 `scripts/run-regression-test.ts`

- [x] Task 6: 评估趋势追踪
  - [x] SubTask 6.1: 新增评估历史存储，每次评估结果持久化到数据库（含 version、evaluationLevel、dataSource、milestone、triggerMode 等字段）
  - [x] SubTask 6.2: 新增评估历史查询 API，支持按时间范围、评估级别、数据来源筛选
  - [x] SubTask 6.3: 新增指标趋势计算逻辑，支持计算任意指标在时间区间内的变化趋势
  - [x] SubTask 6.4: 新增优化前后自动对比功能，评估完成后自动与上一次同级别评估对比，生成 Δ 报告
  - [x] SubTask 6.5: 新增里程碑标记功能，支持在评估时标记里程碑事件
  - [x] SubTask 6.6: 新增能力雷达图数据接口，返回各维度能力评分

- [x] Task 7: 评估触发机制
  - [x] SubTask 7.1: 新增评估触发模式配置（手动/自动），默认手动，前端提供切换开关
  - [x] SubTask 7.2: 前端评估页面新增"运行评估"按钮，点击后选择评估级别并触发评估
  - [x] SubTask 7.3: 评估运行期间前端展示进度状态
  - [x] SubTask 7.4: 新增评估触发 API（`POST /api/evaluation/run`），支持指定评估级别
  - [x] SubTask 7.5: 预留自动触发框架（定时触发、部署后触发、文档更新后触发、错误率上升触发），开发阶段不启用，上线后通过前端开关开启
  - [x] SubTask 7.6: 触发模式配置持久化，切换时自动保存，无需重启服务

- [x] Task 8: 评估版本管理与对比
  - [x] SubTask 8.1: 新增评估版本表（evaluation_versions），存储每次评估结果，版本号自增，不可删除不可修改
  - [x] SubTask 8.2: 新增版本列表 API，支持按时间倒序、评估级别、数据来源筛选
  - [x] SubTask 8.3: 前端新增版本列表页面，展示版本号、时间、级别、综合得分
  - [x] SubTask 8.4: 前端新增多版本对比功能，支持选择 2-5 个版本进行逐指标对比（表格 + 趋势图 + Δ 变化值 + ↑↓→ 标识）
  - [x] SubTask 8.5: 新旧指标兼容处理：历史版本中不存在的指标留空显示（标记为"-"），不影响已有指标对比
  - [x] SubTask 8.6: 前端新增版本详情页面，展示完整评估报告

- [x] Task 9: 历史查询评估
  - [x] SubTask 9.1: 新增历史查询采集中间件，在 Chat/Agent 流程中自动记录 query、answer、context、tools_used 到评估数据池，数据持久化保存不可自动清理
  - [x] SubTask 9.2: 新增评估数据池表（evaluation_pool），存储历史查询及元数据
  - [x] SubTask 9.3: 新增历史查询自动构建评估集功能：去重聚类 → 均匀采样 → LLM 自动标注参考答案
  - [x] SubTask 9.4: 新增历史查询评估执行逻辑，使用历史 query 重新调用管线，对比当前 vs 历史回答
  - [x] SubTask 9.5: 新增用户反馈采集接口，支持对历史回答标注"正确/错误/部分正确"

- [x] Task 10: 开源金融数据集评估
  - [x] SubTask 10.1: 新增数据集适配器框架，定义 `DatasetAdapter` 接口（load、transform、validate）
  - [x] SubTask 10.2: 实现 FinEvalAdapter，适配 FinEval 多选题格式，从 `D:\data\modelscope` 加载
  - [x] SubTask 10.3: 实现 CFLUEAdapter，适配 CFLUE 分类/抽取格式
  - [x] SubTask 10.4: 实现 FinQAAdapter，适配 FinQA 数值推理格式
  - [x] SubTask 10.5: 实现 ConvFinQAAdapter，适配 ConvFinQA 多轮对话格式
  - [x] SubTask 10.6: 新增开源数据集评估执行逻辑，集成到全面评估模式
  - [x] SubTask 10.7: 新增数据集子集选择功能，支持按分类、难度、数量筛选

- [x] Task 11: 评估报告增强与 Dashboard
  - [x] SubTask 11.1: 更新评估报告格式，新增金融行业专用指标展示和数据来源标注
  - [x] SubTask 11.2: 新增评估报告对比功能，支持选择多次评估结果进行逐指标对比
  - [x] SubTask 11.3: 新增行业基准参考数据
  - [x] SubTask 11.4: 更新 RAG 评估页面，新增金融专用指标展示 + 趋势曲线 + 雷达图
  - [x] SubTask 11.5: 更新 Agent 评估页面，新增金融专用指标展示 + 趋势曲线
  - [x] SubTask 11.6: 新增评估趋势页面，展示指标随时间变化曲线 + 里程碑标记
  - [x] SubTask 11.7: 新增评估配置界面，支持选择评估级别、数据源、权重配置、触发模式切换

# Task Dependencies

- [Task 2] depends on [Task 1] (Agent 评估器复用 RAG 评估器中的合规性评估逻辑)
- [Task 3] depends on [Task 1] and [Task 2] (测试集需要匹配新增的评估指标)
- [Task 4] depends on [Task 1] (配置化需要基于新增指标的权重)
- [Task 5] depends on [Task 1] and [Task 2] (回归测试需要基于完整的评估指标)
- [Task 6] depends on [Task 1] (趋势追踪需要基于新增指标的数据)
- [Task 7] depends on [Task 1] (触发机制需要评估器就绪)
- [Task 8] depends on [Task 6] (版本管理需要评估历史存储)
- [Task 9] depends on [Task 1] (历史查询评估需要金融专用评估指标)
- [Task 10] depends on [Task 1] (开源数据集评估需要金融专用评估指标)
- [Task 11] depends on [Task 6] and [Task 7] and [Task 8] (Dashboard 需要趋势数据、触发机制和版本管理)
