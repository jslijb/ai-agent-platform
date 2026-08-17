# 需求池（REQUIREMENTS）

> 记录所有需求（含对话中临时新增），确保不遗漏。开发前必读本文件，按ID逐条核对。
> 最后更新：2026-08-17

---

## 活跃需求

| ID | 需求 | 来源 | 提出时间 | 状态 | 实现版本 | 验证 |
|----|------|------|---------|------|---------|------|
| R001 | 财务指标入PostgreSQL表（五表双轨制），指标清单驱动路由 | 7/29对话 | 2026-07-29 | 已完成 | V13+ | spec.md + ADR-011 审批；7表结构+stock_mapping+indicator_aliases落地，10家样本回填，query-router接入SQL路由 |
| R002 | 统一两种拒绝话语（合规/库外），语气委婉 | 7/29对话 | 2026-07-29 | 待办 | - | - |
| R003 | 多实体并行检索可行性调研 | 7/29对话 | 2026-07-29 | 待办（L2依赖） | - | - |
| R004 | query标准化改写（财务指标统一） | 7/29对话 | 2026-07-29 | 已并入R001 | R001 | indicator_aliases表 |
| R005 | V13所有指标达标，建立第一个全达标基线 | 7/30对话 | 2026-07-30 | 已完成 | V13-r6 | 综合0.9153达标（评估基线），CP/CR/AR/F 全达标 |
| R006 | 评估V14是否值得继续 | 7/30对话 | 2026-07-30 | 待办 | - | - |
| R007 | V13历次迭代评估报告记录到文档 | 7/30对话 | 2026-07-30 | 已完成 | V13-r2 | 已补有效JSON报告 |
| R008 | 文档管理体系建立（PROJECT_STATE+门禁+定时清理） | 7/30对话 | 2026-07-30 | 已完成 | - | 7个文档已建立 |
| R009 | 定时清理任务（每月1日22点，只标记不删除） | 7/30对话 | 2026-07-30 | 待办(Schedule确认超时) | - | - |
| R010 | PDF表格切片修复（保证表格行完整性） | 7/30对话 | 2026-07-30 | 已并入R001 | R001 | 数值不再走向量检索 |
| R011 | BM25预处理修复（不删千分位/小数点/竖线） | 7/30对话 | 2026-07-30 | 已并入R001 | R001 | 数值不再走BM25 |
| R012 | metadata加is_table标记 | 7/30对话 | 2026-07-30 | 已并入R001 | R001 | 数值不再走向量检索 |
| R013 | 评估数据集质量治理（qa-golden.json校验+生成规范） | 8/01对话 | 2026-08-01 | 已完成 | V13 | check_ground_truth.py输出0个问题 |
| R014 | PDF处理工具分工与OCR fallback链路 | 8/01对话 | 2026-08-01 | 已完成 | V13 | 中国人保OCR提取成功（income=8字段, balance=3字段, cashflow=3字段） |
| R015 | 同比数据优先从财报"主要会计数据"表格提取 | 8/01对话 | 2026-08-01 | 已完成 | V13 | 片仔癀/中国铁建/格力电器等验证通过 |
| R016 | 数据库全表缺失审计与市场缓存补齐 | 8/03对话 | 2026-08-03 | 部分完成 | V13 | evaluation_pool/Team/market_cache 已补；minute 真实数据源阻塞 |
| R022 | CRM/OA接入——从问答到流程提交/审批 | 8/12对话 | 2026-08-12 | 部分完成 | V3.0 | Odoo已部署+Agent工具+审计日志+真实E2E 7测试通过；Twenty部署被镜像403阻塞 |
| R023 | Agent框架融合——MCP+LangSmith | 8/12对话 | 2026-08-12 | 已完成 | V3.0 | MCP Server 6核心工具(共注册20)；LangSmith全链路；Guardrails 3类规则 |
| R024 | 多端前端——小程序+App+鸿蒙 | 8/12对话 | 2026-08-12 | 部分完成 | V3.0 | 小程序api-client+Capacitor MVP(R024-e)+鸿蒙ArkTS原型(R024-f)完成；原生构建待做 |
| R025 | 附注表查询路由优化(BM25+向量→SQL) | 8/08对话 | 2026-08-08 | 已完成 | V3.0 | raw-table-search(BM25匹配表名→SQL查整表)+sql-result-formatter实现 |
| R026 | V3.0升级风险管控 | 8/12对话 | 2026-08-12 | 已完成 | V3.0 | 升级路线图+兼容性矩阵+回滚方案(v3-compatibility-matrix-rollback-migration.md) |
| R027 | JD调研驱动的能力补齐 | 8/12对话 | 2026-08-12 | 已完成 | V3.0 | langgraph-patterns 3种编排模式(单Agent/多Agent路由/Supervisor)；MCP Server可用 |
| R028 | 微信/钉钉/飞书机器人(个人账号优先+预留接口) | 8/13对话 | 2026-08-13 | 部分完成 | V3.0 | 四平台适配器+bot-config加载器；飞书真实E2E 7测试通过；App Secret待用户填写 |

---

## 需求详情

### R001：财务指标入PostgreSQL表（五表双轨制）
- **背景**：L1/L3/L4数值类问题检索失败，根因是PDF表格切片丢失数值
- **方案**：五表双轨制（4张标准化表 + 1张原始JSON表）+ 指标清单驱动路由
  - 详见 [ADR-011](file:///d:/Python/ai-agent-platform/docs/adr/011-financial-data-to-postgresql.md)
  - 详见 [spec.md](file:///d:/Python/ai-agent-platform/docs/spec.md)
- **合并的需求**：R004（query标准化）、R010（表格切片）、R011（BM25修复）、R012（metadata标记）
- **路由原则**：命中标准化指标走SQL，未命中走向量检索fallback（不假设100%数值都入库）
- **验收**：L1 CR 0.47→0.85+, L3 CR 0.30→0.85+, L4 CR 0.50→0.85+
- **状态**：✅ 已完成（2026-08-17 更新）
  - 阶段1.1 已完成：7张表结构创建（drizzle/0003_tense_warhawk.sql）
  - 阶段1.2 已完成：stock_mapping 表结构+导入（Tushare stock_basic，10家样本公司回填）
  - 阶段1.3 已完成：indicator_aliases 表结构+query-router SQL 路由接入
  - 验收达成：V13-r6 综合 0.9153 达标，L1/L3/L4 数值类问题走 SQL 路由
- **进度（2026-08-17）**：表结构与代码路由全部落地，query-router 已引用 stock_mapping/indicator_aliases

### R002：统一两种拒绝话语
- **背景**：拒绝回答话语不统一（"无法"/"无法基于"/"未包含"），评估困难
- **方案**：
  - 合规拒绝："非常抱歉，您问的问题受国家政策、法规影响，我回答不了，换一个问题。"
  - 库外拒绝："不好意思，您问的问题由于我的大脑知识储备不足，回答不了您的问题，不能影响您的投资决策。后续我会不断充实我的大脑知识储备。"
- **验收**：两类拒绝前缀统一，语气委婉

### R003：多实体并行检索调研
- **背景**：L2跨公司对比一次检索召回混合数据
- **方案待定**：调研同进程多线程隔离检索可行性
- **验收**：输出可行性调研结论

### R004：query标准化改写
- **背景**：用户query中财务指标表述不统一
- **方案**：query改写标准化指标名
- **验收**：待定

### R005：V13所有指标达标
- **背景**：需要一个全达标基线作为后续迭代起点
- **验收**：CP/CR/AR≥0.8, F≥0.85, 综合≥0.82

### R013：评估数据集质量治理（qa-golden.json校验+生成规范）
- **背景**：V13-r4 评估发现 qa-golden.json 存在12个问题：
  - 评估标准过严（10个L4样本）：query只问同比，expectedAnswer额外包含数值，导致CR被扣分
  - ground_truth数据错误（2个样本）：
    - L4-005中国铁建：把"海外营收同比增长15.14%"误当"总营收同比"，实际总营收同比-3.50%
    - L4-008华海药业：原文明明是下降10.06%，ground_truth写成增长7.5%
- **根因**：评估数据集由"向量检索originalText + LLM生成expectedAnswer"构造，存在3类系统性风险：
  1. **获取错误数据**：originalText截取了错误片段（如海外营收而非总营收），LLM基于错误片段生成错误答案
  2. **获取数据不全**：originalText只截取部分文本，LLM无法看到完整上下文，可能遗漏关键限定词
  3. **获取数据过多**：expectedAnswer包含query未问的内容（如query问同比，答案包含数值+同比）
- **泛化性风险**：扩大公司评估时，若沿用现有"向量检索+LLM生成"流程，同样会引入这3类错误，评估分数可能大幅下降
- **修复内容**：
  1. 修正L4-005、L4-008的ground_truth数据错误
  2. 修正L4全部10个样本的expectedAnswer（只保留query问的内容）
  3. 建立qa-golden.json生成规范：expectedAnswer必须与query严格匹配，originalText必须来自权威数据源（财报"主要会计数据"表格或SQL查询结果）
  4. 新增check_ground_truth.py作为评估前必跑校验脚本
- **验收**：check_ground_truth.py输出0个问题

### R014：PDF处理工具分工与OCR fallback链路
- **背景**：中国人保PDF数值不在文本层（281个字符全是行标签，无一数字），pdfplumber无法提取
- **现状**：
  - pdf_extractor.py只用pdfplumber，无OCR fallback
  - PaddleOCR已装在data_service（/api/ocr/analyze），但只接收图片Base64，不能处理PDF
  - PyMuPDF装在bigmodel环境，data_service跑在agent环境，环境不匹配
  - 无PDF转图片能力
- **修复内容**：
  1. 统一环境：在agent环境安装PyMuPDF（或data_service切换到bigmodel环境）
  2. pdf_extractor.py增加OCR fallback：pdfplumber提取到行标签但无数值时，用PyMuPDF渲染页面为图片，调PaddleOCR识别
  3. 工具分工：pdfplumber优先（文本层）→PyMuPDF兜底文本提取→PyMuPDF渲染图片+PaddleOCR（图片型PDF）→Vision模型最终fallback
- **验收**：中国人保10家评估样本数据完整入库

### R015：同比数据优先从财报"主要会计数据"表格提取
- **背景**：系统现在自己计算同比（(本期-上期)/上期），但财报"主要会计数据"表格有现成的同比值
- **问题**：
  - 计算依赖两年数据都正确提取，任一年提取错误会导致同比错误
  - 部分公司财年定义不同，自己计算可能与财报披露不一致
  - 财报已计算好的同比值是权威数据，应优先使用
- **修复内容**：
  1. 扩展pdf_extractor.py，新增"主要会计数据"表格提取
  2. 同比数据优先从财报提取，仅在财报无同比值时才用(本期-上期)/上期计算
  3. 提取的同比值覆盖计算值（source_priority更高）
- **验收**：同比数据与财报"主要会计数据"表格一致

### R016：数据库全表缺失审计与市场缓存补齐
- **背景**：用户要求重新检查所有数据库表当前状态，确认是否仍有缺失；前置任务已完成 `market_cache_entries` 迁移和部分预热。
- **修复内容**：
  1. 审计 public schema 全表行数与关键字段覆盖率。
  2. 确认 `evaluation_pool` 已从 `qa-golden.json` 导入 130/130 条，分类 L1~L9 分布一致。
  3. 确认 `Team/TeamMember` 已有默认团队（1队3人）。
  4. 修复 `data_service/main.py` 中 `trade_cal/industry/concept/minute` 端点未写缓存的问题。
  5. 修复 `efinance_provider.py` 缓存路径权限问题，将 efinance 搜索缓存重定向到项目可写目录。
  6. 更新 `scripts/cache-warmup.py`，分钟线预热在 efinance 后 fallback 到 mootdx。
- **验收**：
  - `market_cache_entries` 最终无 0 记录，已包含 `industry/concept/trade_cal`。
  - `tests/data-service/test_market_cache_endpoints.py` 4/4 通过，`tests/test_pg_cache.py` 通过，`tests/contract/data-service.test.ts` 9/9 通过。
- **剩余阻塞**：
  - `minute` 真实缓存未落库：efinance 东方财富接口远端断连，mootdx 返回空数据。禁止写空列表或伪数据，等待上游恢复或接入 TickFlow/其他可用分钟线数据源。

---

### R022：CRM/OA接入——部署开源轻量化产品 + Agent集成

- **背景**：当前智能体只能做问答，用户希望扩展到完整业务功能（审批+通知+日程+客户+销售+报表）
- **纠正**：不是接SaaS API，而是**部署开源轻量化OA/CRM产品**
- **推荐OA**：Odoo Community（53.7k⭐，Python，审批/通知/日程/HR/考勤/报销，2-3GB）
- **推荐CRM**：Twenty CRM（54.8k⭐，TypeScript，原生MCP Server，客户/销售/商机/合同/报表，2GB）
- **最简方案**：Odoo单体（OA+CRM一体，仅3GB）
- **约束**：Agent通过API操作OA/CRM，JWT+用户映射关联身份，敏感字段脱敏，审计日志只追加
- **验收**：Odoo审批/通知可用，Twenty CRM客户/报表可用，Agent自然语言操作成功
- **调研报告**：`open-source-oa-crm-research.md`、`ai-agent-crm-oa-integration-research.md`
- **进度（2026-08-17）**：Odoo 17 已 Docker 部署并初始化数据库，JSON-RPC 认证成功；`odoo-adapter/twenty-adapter/odoo-tools/twenty-tools/saas-tools/audit-logger` 已实现并注册 MCP 工具；真实 Odoo E2E 7 测试通过。**遗留**：Twenty CRM 镜像拉取被阿里云源 403 阻塞，需从 Docker Hub 直拉后部署

### R023：Agent框架融合——MCP+LangSmith+LLM约束控制

- **背景**：用户关注Harness/Hermes/OpenClaw，需纠正性调研
- **纠正**：Harness是LLM约束控制**方法论**（非框架），Hermes/OpenClaw是Agent框架
- **Harness**（AgentWay）：十大约束原则，实践载体Nexent平台（5823⭐）
- **Hermes**（Nous Research，22.9万⭐）：自我学习闭环Skills机制，与LangGraph互补
- **OpenClaw**（38.6万⭐）：Gateway架构+插件市场，TypeScript生态
- **值得融入**：MCP协议(P0)、LangSmith(P0)、NeMo Guardrails(P1)、Harness原则(P1)、Hermes Skills借鉴(P2)
- **绝对不引入**：CrewAI（重叠）、AutoGen（维护模式）、Dify（平台非库）
- **验收**：MCP Server暴露6个工具，LangSmith全链路追踪，NeMo Guardrails 3条规则生效
- **调研报告**：`harness-hermes-openclaw-research.md`、`agent-framework-fusion-analysis.md`
- **进度（2026-08-17）**：MCP Server 完成（protocol/SSE/message 路由/mcp-handler），核心 6 工具 + OA/CRM/SaaS 工具共注册 20 个；LangSmith 观测路由已实现；Guardrails 自研引擎（金融+OA/CRM主题限制/输出格式/越狱注入防护）已实现（非 NeMo）

### R024：多端前端——小程序+App+鸿蒙

- **背景**：用户希望扩展到安卓/iOS/鸿蒙/小程序
- **方案**：混合方案D——小程序Taro 4、App用Capacitor→RN、鸿蒙用ArkTS
- **不选Flutter/uni-app**：Dart/Vue语言壁垒，现有React/TS代码全部作废
- **优先级**：P0微信小程序→P1 Capacitor MVP→P2 RN正式版→P3鸿蒙
- **验收**：微信小程序核心问答可用，API复用率≥80%
- **调研报告**：`multi-platform-frontend-research.md`
- **进度（2026-08-17）**：R024-e Capacitor MVP（native-bridge + capacitor.config.ts + 依赖安装）完成；R024-f 鸿蒙 ArkTS 原型（ChatPage.ets）完成；小程序 api-client 完成。**遗留**：Capacitor 原生构建（Next.js export 与 API 路由冲突，需独立 SPA 策略）；鸿蒙 App 构建（需 DevEco Studio）

### R025：附注表查询路由优化

- **背景**：当前ILIKE模糊匹配表名不准确，向量检索破坏表格结构
- **方案**：BM25+向量索引匹配表名→SQL查整表JSON
- **验收**：附注表查询准确率提升≥30%，表格结构完整性100%
- **详见**：`improvement-plan.md` 问题6
- **进度（2026-08-17）**：`raw-table-search.ts`（BM25 匹配表名→SQL 查整表 JSON）+ `sql-result-formatter.ts` 已实现并接入查询路由，含单元测试

### R026：V3.0升级风险管控

- **背景**：大版本升级需遵循大厂经验，严控风险
- **方案**：SemVer双轨版本号+4阶段路线+15项风险矩阵+灰度发布+自动回滚
- **验收**：升级路线图完成，回滚5分钟内验证，灰度1%→100%
- **调研报告**：`v3-upgrade-research-report.md`
- **进度（2026-08-17）**：Phase 0 规划完成（升级路线图/兼容性矩阵/回滚方案 `v3-compatibility-matrix-rollback-migration.md`）；灰度发布方案（1%→100%）与监控方案已制定

### R027：JD调研驱动的能力补齐

- **背景**：调研100+份50k+JD，补齐市场高需能力
- **核心发现**：LangGraph(78%JD要求)、MCP(稀缺差异化)、Multi-Agent(金融场景天然适合)
- **不追求**：GPU/CUDA/模型训练/RLHF（Infra层，需另起项目）
- **验收**：3种Agent编排模式可演示，MCP Server可用，薪资对标70-100k
- **调研报告**：`ai-agent-jd-research-2026.md`
- **进度（2026-08-17）**：`langgraph-patterns.ts` 实现 3 种编排模式（单 Agent/多 Agent 路由/Supervisor）+ 错误恢复 callWithFallback；MCP Server 已实现（见 R023）

### R028：微信/钉钉/飞书机器人——个人账号优先+预留接口

- **背景**：用户需要在微信、钉钉、飞书部署AI Agent机器人，但只有个人账号，没有企业营业执照
- **个人账号限制调研结论**：
  - **飞书**：免费组织即可用审批全功能+机器人全功能，**个人开发者首选**
  - **钉钉**：手机号创建"团队"即可，审批和机器人基本可用
  - **企微**：未认证可用基础审批，创建审批模板需认证（需营业执照）
  - **微信个人号机器人**：封号风险极高，**禁止使用**
  - **微信服务号**：需企业资质，个人只能注册订阅号（功能极弱）
- **方案**：飞书优先→钉钉次优先→企微/微信预留接口
- **约束**：所有平台Adapter实现统一BotAdapter接口，新增平台≤1天接入
- **验收**：飞书机器人流式响应可用，钉钉机器人可用，企微/微信接口预留
- **调研报告**：`wecom-dingtalk-feishu-personal-account-research.md`
- **进度（2026-08-17）**：四平台适配器（base/feishu/dingtalk/wecom/wechat）+ `bot-config.ts` 配置加载器 + SaaS 备选通道已实现；飞书真实 E2E 7 测试通过（配置 AppSecret 后自动执行）。**遗留**：App Secret 需用户在 `config/bot-config.yaml` 填写；钉钉真实 E2E 待配置

---

## 已完成需求

（暂无）
