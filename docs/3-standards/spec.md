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

### 3.1.1 文档即契约原则（V3.0 新增）

1. **文档里有的，不允许遗漏**：开发前读 task.md 确认任务，读 spec.md 确认约束，读 design.md 确认设计，逐条实现
2. **文档里没有的，不允许新增**：任何不在 spec/design/task 中的功能，必须先走 SDD 流程再开发
3. **开发完必须测试通过**：按 task.md 验收标准逐条验证，按系统使用指南执行端到端测试
4. **开发前检查清单**：
   - [ ] 读取 task.md → 确认当前 Phase 和待办任务
   - [ ] 读取 spec.md → 确认该任务的约束和验收标准
   - [ ] 读取 design.md → 确认该任务的架构设计
   - [ ] 开发代码 → 严格按 design.md 设计实现
   - [ ] 写测试 → 覆盖 spec.md 验收标准
   - [ ] 跑测试 → 全部通过才算完成
   - [ ] 更新 task.md → 标记任务状态
5. **文档有问题时**：不允许自行修改代码绕过，必须先修改 spec→design→task（SDD流程），再按新文档开发

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

## 十、V3.0 大版本升级需求（对外 V3.0.0，内部 V15）

> 版本号策略：双轨体系——对外 SemVer V3.0.0，内部持续递增 V15，映射 `v3.0.0-iter15`
> 升级理论依据：SemVer + Google Canary + 微软 SDL + 华为 IPD
> 详细调研报告：`docs/1-requirements-bugs/v3-upgrade-research-report.md`

### R022：CRM/OA 接入——部署开源轻量化产品 + Agent 集成

**需求**：部署开源轻量化 OA/CRM 产品，让智能体能操作完整业务功能（不仅是审批）。

**约束**：
- **OA 推荐 Odoo Community**（53.7k⭐，Python，审批/通知/日程/HR/考勤/报销，2-3GB）
- **CRM 推荐 Twenty CRM**（54.8k⭐，TypeScript，原生 MCP Server，客户/销售漏斗/商机/合同/报表，2GB）
- **最简方案**：Odoo 单体（OA+CRM 一体，仅3GB）
- OA 功能覆盖：审批流程 + 通知公告 + 日程管理 + 通讯录 + 文档管理 + 考勤 + 报销
- CRM 功能覆盖：客户管理 + 销售漏斗 + 商机管理 + 合同管理 + 报表仪表盘
- Agent 通过 API 操作 OA/CRM：Twenty 原生 MCP Server，Odoo 通过 XML-RPC/REST API
- 流程操作封装为 LangGraph Tool（Function Calling 模式）
- 用户身份通过 JWT + 用户映射表关联 OA/CRM 身份
- 敏感字段必须脱敏（字段级策略）
- 所有操作必须审计追踪（只追加日志）
- 部署加入现有 docker-compose，内存合计约5GB（Twenty 2GB + Odoo 3GB）
- **SaaS 备选通道**（个人账号限制）：
  - **飞书**：免费组织即可用审批全功能+机器人全功能，**个人开发者首选**
  - **钉钉**：手机号创建"团队"即可，审批和机器人基本可用
  - **企微**：未认证可用基础审批，但创建审批模板需认证（需营业执照）
  - **微信服务号**：需企业资质，个人只能注册订阅号（功能极弱）
- **业务测试指南**：必须面向业务任务（非面向测试人员/开发人员），包含企业真实使用案例，端到端测试按测试指南执行
- **系统使用指南**：V3.0 系统使用指南（`v3-system-user-guide.md`）是端到端测试的**唯一依据**，测试人员以终端用户身份按指南操作
- 端到端测试必须覆盖：32个业务场景（OA 6个 + CRM 10个 + Agent交互 8个 + 异常 8个），5级分级（L1冒烟→L5性能）
- 系统使用指南包含53个端到端测试用例，测试必须全部执行

**验收标准**：
- Odoo OA：审批提交/通知发送/日程查询成功
- Twenty CRM：客户创建/商机更新/报表生成成功
- Agent 集成：通过自然语言操作 OA/CRM 成功（MCP + Tool）
- 权限控制：无越权操作
- 审计日志：所有操作可追溯
- 资源占用：OA+CRM 合计≤5GB 内存
- 端到端测试：L1冒烟3个必过，L2功能24个通过，按系统使用指南执行

**调研报告**：
- `docs/1-requirements-bugs/open-source-oa-crm-research.md`（自部署方案）
- `docs/1-requirements-bugs/ai-agent-crm-oa-integration-research.md`（SaaS API方案）
- `docs/1-requirements-bugs/wecom-dingtalk-feishu-personal-account-research.md`（个人账号限制）
- `docs/1-requirements-bugs/oa-crm-business-test-guide.md`（业务测试指南）

### R023：Agent 框架融合——MCP + LangSmith + LLM 约束控制

**需求**：融入 MCP 协议、LangSmith 可观测性、LLM 约束控制方法论，不引入冗余编排框架。

**约束**：
- **MCP（Model Context Protocol）**：作为 Tool 注册协议，替代当前硬编码工具注册
- **LangSmith**：用于运行时可观测性（trace/metrics），与 LangGraph 原生集成
- **LLM 约束控制**：
  - **Harness 方法论**（AgentWay）：十大约束原则，重构当前合规风控
  - **NeMo Guardrails**（NVIDIA）：主题控制+输出约束+对话流控，P1 优先引入
  - 当前合规风控（拒绝+日志+分级）需升级为结构化 Guardrails
- **Hermes Agent**（Nous Research，22.9万⭐）：借鉴自我学习闭环（Skills 自动创建/改进），不引入完整框架
- **OpenClaw**（38.6万⭐）：参考 Gateway 架构+插件市场设计，不引入完整框架
- **不引入**：CrewAI（与LangGraph重叠）、AutoGen（已维护模式）、Dify（是平台不是库）
- MCP Server 必须支持权限控制（不同用户可见不同工具）
- LangSmith 数据必须可导出（避免供应商锁定）

**验收标准**：
- MCP Server 至少暴露6个核心工具
- LangSmith 追踪覆盖：Agent全链路、RAG管道、LLM调用
- NeMo Guardrails：至少3条 Guardrail 规则生效（合规+主题+输出格式）
- Harness 十大原则至少5条落地到代码
- 可观测性：P50/P95延迟、错误率、Token消耗实时可见
- 不引入任何与 LangGraph 功能重叠的编排框架

**调研报告**：`docs/1-requirements-bugs/agent-framework-fusion-analysis.md`、`docs/1-requirements-bugs/harness-hermes-openclaw-research.md`

### R024：多端前端——小程序 + App + 鸿蒙

**需求**：将 Web 端扩展到微信小程序、安卓/iOS App、鸿蒙 App。

**约束**：
- **微信/支付宝/钉钉小程序**：Taro 4（React/TS 一致性）
- **安卓/iOS MVP**：Capacitor（直接包 Next.js，1-2周出App）
- **安卓/iOS 正式版**：React Native（长期性能更好）
- **鸿蒙**：ArkTS/ArkUI（纯血鸿蒙唯一选择）
- API 层必须统一（Route Handlers → 多端 API Gateway）
- SSE 流式响应必须在所有端可用
- **不选 Flutter**（三大致命理由）：
  1. **小程序缺失**：Flutter 无法编译到微信小程序，金融场景标配入口直接丢失
  2. **SEO 缺失**：Flutter Web Canvas/Wasm 渲染，搜索引擎无法索引，金融合规页面不可接受
  3. **现有代码全部作废**：22个页面+30+Hooks+~15,000行前端代码推倒重来，代码复用率0%
  - 量化对比：Flutter迁移16-24周全量重写 vs 混合方案12-18周增量开发（代码复用率60-80%）
- **不选 uni-app**：Vue 语言壁垒，现有 React/TS 代码全部作废

**验收标准**：
- 微信小程序：核心问答+Agent对话可用
- Capacitor MVP：安卓/iOS 基础功能可用
- 鸿蒙：至少1个页面可运行
- API 复用率≥80%（多端共享同一后端）

**调研报告**：`docs/1-requirements-bugs/multi-platform-frontend-research.md`、`docs/1-requirements-bugs/flutter-migration-feasibility-research.md`

### R025：附注表查询路由优化（BM25+向量→SQL）

**需求**：给附注表元数据建 BM25+向量索引，匹配到表名后直接 SQL 查整表。

**约束**：
- 为 `financial_raw_tables` 的 `table_name` + 表头行构建 BM25 索引
- 为 `table_name` 构建 embedding 向量索引（pgvector）
- 修改 `queryRawTables()`：先 BM25+向量匹配表名，命中后 SQL 查整表
- 评估对比：附注表查询准确率提升

**验收标准**：
- 附注表查询准确率提升≥30%
- 表格结构完整性100%（不再被切片破坏）
- 查询延迟<100ms

### R026：V3.0 升级风险管控

**需求**：按大厂经验制定 V3.0 升级的完整风险管控体系。

**约束**：
- 必须遵循 SemVer 版本规则
- 必须制定：升级路线图、变更影响分析、兼容性矩阵、回滚方案、数据迁移方案
- 灰度发布是底线，自动回滚是生命线
- 升级门禁：每个 Phase 必须通过门禁才能进入下一阶段
- API 版本管理：v1（当前）和 v2（V3.0）共存，v1 标记 deprecated

**验收标准**：
- 升级路线图文档完成
- 风险矩阵（15+风险项）完成
- 回滚方案验证通过（5分钟内回滚）
- 灰度发布方案验证通过（1%→5%→20%→50%→100%）

**调研报告**：`docs/1-requirements-bugs/v3-upgrade-research-report.md`

### R027：JD 调研驱动的能力补齐

**需求**：基于 100+ 份 50k+ JD 调研，补齐市场高需能力。

**约束**：
- 优先补齐：LangGraph 深度使用（78% JD 要求）、MCP 协议（稀缺差异化技能）、Multi-Agent 编排
- 不追求：GPU/CUDA 编程、模型训练、RLHF（需另起项目，Infra 层完全不同）
- 所有新增能力必须有对应的可演示功能

**验收标准**：
- LangGraph：至少3种 Agent 编排模式可演示
- MCP：MCP Server 可对外暴露工具
- Multi-Agent：金融场景多 Agent 协作可演示
- 简历对标：补齐后薪资对标 70-100k

**调研报告**：`docs/1-requirements-bugs/ai-agent-jd-research-2026.md`

### R028：微信/钉钉/飞书机器人——个人账号优先 + 预留接口

**需求**：在微信、钉钉、飞书平台部署 AI Agent 机器人，用户通过平台机器人与 Agent 对话。

**约束**：
- **个人账号优先**：用户没有企业营业执照，只有个人账号
- **飞书机器人**：免费组织即可创建应用机器人，**优先实现**
- **钉钉机器人**：手机号创建"团队"即可创建群机器人+应用机器人，**次优先**
- **企微机器人**：未认证企业可创建群机器人，应用机器人需认证，**预留接口**
- **微信机器人**：
  - 个人号机器人（itchat等）：封号风险极高，**禁止使用**
  - 微信服务号机器人：需企业资质，个人只能注册订阅号（功能极弱），**预留接口**
  - 微信小程序内嵌客服：个人可注册，**可考虑**
- **预留接口设计**：所有平台 Adapter 必须实现统一接口 `BotAdapter`，新增平台只需实现 Adapter 即可
- 不支持个人账号的平台，先预留接口，后续有企业账号后快速接入（≤1天）
- 机器人必须支持：文本消息、SSE 流式响应、图片/文件（可选）

**验收标准**：
- 飞书机器人：用户通过飞书与 Agent 对话，流式响应可用
- 钉钉机器人：用户通过钉钉与 Agent 对话
- 预留接口：企微/微信 BotAdapter 接口定义完成，Mock 测试通过
- 新平台接入：实现新 BotAdapter ≤1天
- 端到端测试：按系统使用指南（`v3-system-user-guide.md`）飞书/钉钉机器人章节执行

**调研报告**：`docs/1-requirements-bugs/wecom-dingtalk-feishu-personal-account-research.md`
**使用指南**：`docs/1-requirements-bugs/v3-system-user-guide.md`

### R029：V3.0 端到端测试策略

**需求**：明确 V3.0 各组件的端到端测试方式，确保可执行、可验证。

**约束**：
- **三层测试策略**：

| 层级 | 测试方式 | 适用组件 | 说明 |
|------|---------|---------|------|
| L1 真实环境 | Docker部署+真实API调用 | Odoo OA、Twenty CRM、Web端 | 能部署的必须真实测试 |
| L2 真实平台 | 真实注册平台账号 | 飞书机器人、钉钉机器人 | 免费可用，必须真实测试 |
| L3 Mock适配器 | Mock实现接口+模拟消息 | 企微机器人、微信机器人 | 需企业资质，Mock测试+接口预留 |

- **Mock适配器设计约束**：
  - 所有 BotAdapter 必须实现统一接口
  - MockBotAdapter 记录所有调用（messages数组），测试代码可直接验证
  - Mock适配器测试通过 = 接口设计正确 + 有企业账号后≤1天接入
- **Odoo/Twenty 真实测试约束**：
  - Docker Compose 一键启动 Odoo + Twenty
  - 测试前自动初始化：创建测试用户、审批模板、Pipeline
  - 测试后自动清理：删除测试数据
- **5级测试分级**：
  - L1 冒烟：Mock适配器验证消息收发链路
  - L2 功能：真实Odoo/Twenty验证API调用
  - L3 集成：飞书真实机器人验证端到端对话
  - L4 异常：Mock错误响应验证降级/重试
  - L5 性能：压测工具验证并发/延迟

**验收标准**：
- Odoo/Twenty：Docker部署+E2E测试通过
- 飞书机器人：真实环境对话测试通过
- 钉钉机器人：真实环境对话测试通过
- 企微/微信：Mock适配器测试通过
- 全部53个端到端测试用例通过

### V3.0 已确定但未执行的遗留项

| ID | 需求 | 状态 | 说明 |
|----|------|------|------|
| R020-h | 全量重建 | 待用户执行 | `npx tsx scripts/rebuild-graph.ts --all --resume` |
| E2E回归 | R020+R021 E2E | 待办 | 5个query全通过，LLM调用减少15%+ |
| R002 | 统一拒绝话语 | 待办 | 两类拒绝前缀统一 |
| R003 | 多实体并行检索 | 待办(L2依赖) | 调研报告 |
| R009 | 定时清理任务 | 待办 | 每月1日22点执行 |
| R013 | 评估数据集质量治理 | 部分完成 | check_ground_truth.py |
| 冒烟测试 | V14 Agent | 待办 | 核心流程通过 |
| 评估可靠性 | 调研待审批 | P0 | 影响所有评估结论可信度 |
| 服务器环境 | 负载均衡+压测+GPU | 服务器环境 | P2 |

## 十一、相关文档索引

| 文档 | 用途 |
|------|------|
| [PROJECT_STATE.md](PROJECT_STATE.md) | 项目状态入口（基线表+导航） |
| [design.md](design.md) | 全局架构设计 |
| [task.md](task.md) | 全局任务清单 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 需求池（R001-R028+） |
| [FUNCTIONS.md](FUNCTIONS.md) | 功能锁定清单（F001-F016） |
| [adr/](adr/) | 架构决策记录（ADR-001~011） |
| [checklists/](checklists/) | 可执行检查清单 |
| [versions/v13/](versions/v13/) | V13 版本三层文档 |
| [CRM/OA接入调研](1-requirements-bugs/ai-agent-crm-oa-integration-research.md) | R022 调研报告 |
| [框架融合分析](1-requirements-bugs/agent-framework-fusion-analysis.md) | R023 调研报告 |
| [多端前端调研](1-requirements-bugs/multi-platform-frontend-research.md) | R024 调研报告 |
| [JD特征分析](1-requirements-bugs/ai-agent-jd-research-2026.md) | R027 调研报告 |
| [V3.0升级调研](1-requirements-bugs/v3-upgrade-research-report.md) | R026 调研报告 |
| [个人账号限制调研](1-requirements-bugs/wecom-dingtalk-feishu-personal-account-research.md) | R022/R028 调研 |
| [OA/CRM业务测试指南](1-requirements-bugs/oa-crm-business-test-guide.md) | R022 测试规范 |
| [Flutter迁移分析](1-requirements-bugs/flutter-migration-feasibility-research.md) | R024 补充调研 |
| [V3.0系统使用指南](1-requirements-bugs/v3-system-user-guide.md) | **端到端测试依据** |
| [开源OA/CRM调研](1-requirements-bugs/open-source-oa-crm-research.md) | R022 自部署方案 |
| [Harness/Hermes/OpenClaw纠正版](1-requirements-bugs/harness-hermes-openclaw-research.md) | R023 纠正调研 |
