# 全局规格（SPEC）

> **定位**：跨版本通用约束，所有版本规格的基线。版本规格（docs/versions/vN/spec.md）通过 Delta Spec 继承本文件。
> **最后更新**：2026-08-01
> **级联关系**：本文件为根，向下级联到 docs/versions/v{N}/spec.md

---

## 一、环境约束

| 项 | 约束 | 状态 |
|----|------|------|
| Python 环境 | conda activate agent（数据脚本）；conda activate bigmodel（PyMuPDF/PaddleOCR） | 🔒 固定 |
| 模型存储 | D:\models\modelscope（魔塔社区下载） | 🔒 固定 |
| 数据集存储 | D:\data\modelscope | 🔒 固定 |
| 配置方式 | 模型路径必须通过配置文件/环境变量指定，禁止硬编码 | 🔒 强制 |

## 二、关键框架禁止擅改清单（改前必须审批）

| 框架 | 当前配置 | 审批状态 |
|------|---------|---------|
| embedding 模型 | bge-m3 本地服务（llama.cpp，端口8011） | 🔒 禁止擅改 |
| reranker 模型 | bge-reranker-v2-m3 | 🔒 禁止擅改 |
| LLM 降级链 | AGNES→百炼（详见 ADR-006） | 🔒 禁止擅改 |
| 评估器选型 | V13 自实现（scripts/ragas_evaluation.py） | 🔒 禁止擅改 |
| 数据库 schema | PostgreSQL + pgvector（详见 ADR-005/009/011） | 🔒 禁止擅改 |
| docker-compose | 服务编排定义 | 🔒 禁止擅改 |

违反即回滚，并记录到 docs/pitfalls/。

## 三、开发流程约束（SSD+TDD）

### 3.1 代码改动门禁
1. 改代码前：跑回归测试，确认全绿（记录基线）
2. 改代码前：Grep 目标文件被谁引用，列影响范围
3. 改代码后：立即跑回归测试，红了必须先恢复再继续
4. 改代码后：Grep docs/FUNCTIONS.md 清单功能文件仍存在
5. 同一 bug 修两次未解决：停止，git 回滚到绿基线，重写而非修补
6. 每个功能改动：更新 FUNCTIONS.md，commit 带功能 ID

### 3.2 文档管理门禁
1. 任务启动必读：PROJECT_STATE.md → 本 spec.md → REQUIREMENTS.md → 版本 spec
2. 每轮评估结束 → 更新 PROJECT_STATE.md 基线表
3. 关键决策/框架变更 → 新增 docs/adr/ ADR 文件
4. 上下文清理前 → 确认基线已写入 PROJECT_STATE.md
5. 发现文档过时 → 当场标注或更新
6. 新增踩坑经验 → 追加到 docs/pitfalls/ + 提炼到 docs/checklists/
7. 对话出现新需求 → 当场写入 REQUIREMENTS.md 分配 ID

### 3.3 文档健康自检（每轮迭代开头）
- PROJECT_STATE.md 基线表是否最新？
- 当前任务涉及的文档是否标注过时？
- 上一轮变更是否已沉淀到版本文档？

## 四、数据真实性约束

- 调研报告数据必须真实，反对虚构数据
- 示例数据必须明确标注为虚构
- 模型/数据集优先从魔塔社区下载
- 爬虫失效时优先采用合规的半自动+人工方案
- 不允许硬编码，所有答复需要有事实依据

## 五、报告命名规范

```
ragas-report-v{版本}-{评估器}-r{轮次}.json
例：ragas-report-v13-selfimpl-r2.json
失败轮标注 -failed，历次保留不覆盖
```

## 六、文档体系结构（本文件管理的元约束）

```
docs/
├── PROJECT_STATE.md        # 状态入口（每轮评估必更新）
├── spec.md                 # 本文件（全局约束）
├── design.md               # 全局架构设计
├── task.md                 # 全局任务清单+验收
├── REQUIREMENTS.md         # 需求池
├── FUNCTIONS.md            # 功能锁定清单
├── adr/                    # 架构决策记录
├── checklists/             # 可执行检查清单（从踩坑提炼）
├── pitfalls/               # 踩坑归档（只追加不修改）
├── versions/v{N}/          # 版本化三层文档
│   ├── spec.md             #   版本规格（继承全局spec+Delta）
│   ├── design.md           #   版本设计
│   └── task.md             #   版本任务
├── archive/                # 历史快照归档
└── reference/              # 方法论/调研/参考
```

### 版本级联规则
- 版本文件顶部声明：`基线: docs/spec.md` + `上一版本: docs/versions/v{N-1}/spec.md`
- 变更用 Delta Spec 标记：ADDED/MODIFIED/REMOVED
- 归档版本移到 docs/versions/archive/

## 七、V14 Agent架构升级需求

### R016：工具合并+按需加载（ACI优化）

**需求**：将10+细粒度金融工具合并为5个高层工具，并实现Tool Search Tool按需加载机制。

**约束**：
- 高层工具必须封装常用工作流（如"技术分析"工具封装MA/RSI/MACD/KDJ/BB）
- Tool Search Tool仅在Agent需要时加载工具定义，减少token浪费
- 合并后的工具必须向后兼容（已有对话不受影响）
- 禁止硬编码工具列表，工具注册必须可配置

**验收标准**：
- 工具数量从10+减少到≤6（含Tool Search Tool）
- Agent首次调用的token消耗减少≥30%
- 现有评估基线不退化（V13-r6综合≥0.9153）

### R017：Context Compaction（上下文压缩）

**需求**：长对话自动压缩历史消息，保留关键信息，避免context window溢出。

**约束**：
- 压缩触发条件：对话消息数超过阈值（默认20条）或token接近上限
- 压缩策略：保留最近5条消息完整 + 早期消息压缩为结构化摘要
- 摘要必须包含：关键决策、工具调用结果、用户偏好
- 压缩不可丢失金融数值数据（精度要求）
- 压缩操作必须记录到AgentLog

**验收标准**：
- 50轮对话不出现context溢出错误
- 压缩后关键信息保留率≥90%（通过eval验证）
- 压缩操作延迟<500ms

### R018：Agent错误恢复（Checkpoint+Resume）

**需求**：Agent执行失败时支持checkpoint保存和resume恢复，而非直接终止。

**约束**：
- 每轮迭代结束保存checkpoint（工具调用结果+Agent状态）
- 失败时自动回退到最近checkpoint重试（最多2次）
- 重试时注入错误信息，引导Agent换策略
- Checkpoint存储在Redis（TTL=1小时）
- 最终失败时返回已有部分结果+失败原因

**验收标准**：
- 工具调用临时失败（如网络超时）时Agent自动恢复
- 恢复后不重复已成功的工具调用
- 恢复成功率≥80%（模拟测试）

### R019：Transcript分析+耗时追踪

**需求**：Agent每步执行记录精确耗时，支持自动分析AgentLog找出系统性问题。

**约束**：
- 每轮迭代记录：LLM调用耗时、工具调用耗时（每个工具单独记录）、总耗时
- 前端展示每步耗时（毫秒级）
- Transcript分析工具：自动统计最慢工具、最高失败率工具、平均迭代次数
- 耗时数据存AgentLog表
- E2E测试报告包含完整耗时明细

**验收标准**：
- 前端能看到每步耗时
- Transcript分析工具输出Top5最慢工具+Top5最常失败工具
- E2E测试报告包含：query、每步过程+耗时、最终answer

## 八、R020：知识图谱数据质量深度重构

**需求**：重构知识图谱的实体类型体系、关系语义化、实体归一化、增量更新机制，解决数值作为实体、无类型标签、实体未归一化等核心问题。

**约束**：
- LLM调用必须优先使用Agnes AI模型（agnes-2.5-flash），速度慢可接受
- 必须支持断点续传：中断后不从头重跑，从上次断点继续
- 必须先用少量数据（1-2个文档）测试通过后再全量跑
- 实体类型标签：Company/Location/Product/Indicator/Amount等，禁止硬编码
- 数值内联化：数值作为关系属性而非独立实体节点
- 实体归一化：同一公司不同称呼合并为同一节点（别名映射从PostgreSQL companies表生成）
- 关系类型细化为有向语义关系（如HAS_REVENUE/OWNS_SHARE/LOCATED_IN）
- 增量更新：文档更新时只更新变更的三元组，不重建全图
- 提取脚本独立可执行：用户手动运行，进度可观测

**验收标准**：
- 数值型实体占比从24.6%降至<5%
- 实体类型标签数≥4（Company+Indicator+Amount+Product）
- 公司实体归一化覆盖10家主要公司
- 图谱检索命中率提升30%+
- 断点续传：中断后重跑从断点继续，不重复已处理文档
- 少量数据测试：1-2个文档提取+写入+检索全流程通过

**Agnes AI限流调研结论**（2026-08-07）：
- 可用模型：agnes-2.0-flash, agnes-2.5-flash, agnes-2.5-pro, agnes-2.5-pro-alpha
- 当前无限流：15个请求（2秒间隔）全部成功，无429
- 响应时间：0.4s-85s（波动大），有内置prompt cache（cached_tokens）
- 代码已有429处理：重试3次+指数退避+Retry-After头解析

## 九、R021：LLM语义缓存（Prompt级分层缓存）

**需求**：在精确匹配缓存基础上增加Prompt级语义缓存，提升反思节点/R001路由/图谱提取等固定prompt模板场景的缓存命中率。

**约束**：
- 使用方案A（分层语义缓存），不是全语义缓存
- 语义匹配使用本地bge-m3 embedding服务（端口8011），禁止调用外部embedding API
- 相似度阈值≥0.95（高精度，避免误命中）
- 缓存粒度：按promptTemplate分组，避免跨场景误匹配
- TTL=30min（与现有缓存一致）
- 精确匹配仍作为快速路径（先查精确，再查语义）
- embedding服务不可用时降级为精确匹配缓存

**验收标准**：
- 反思节点语义缓存命中率≥20%
- 图谱提取语义缓存命中率≥30%
- 缓存查询延迟<50ms（embedding调用）
- 误命中率<1%
- LLM调用次数（5个E2E query）减少15-25%

## 十、相关文档索引

| 文档 | 用途 |
|------|------|
| [PROJECT_STATE.md](PROJECT_STATE.md) | 项目状态入口（基线表+导航） |
| [design.md](design.md) | 全局架构设计 |
| [task.md](task.md) | 全局任务清单 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 需求池（R001-R015+） |
| [FUNCTIONS.md](FUNCTIONS.md) | 功能锁定清单（F001-F016） |
| [adr/](adr/) | 架构决策记录（ADR-001~011） |
| [checklists/](checklists/) | 可执行检查清单 |
| [versions/v13/](versions/v13/) | V13 版本三层文档 |
