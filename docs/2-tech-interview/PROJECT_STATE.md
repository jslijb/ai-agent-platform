# 项目状态卡（PROJECT_STATE）

> 本文件是项目单一入口。任何任务开始前必读本文件，5分钟内恢复全局认知。
> 最后更新：2026-08-03

---

## A. 当前基线表（每轮评估后必须更新）

| 版本 | 日期 | 评估器 | 综合 | CP | CR | F | AR | 达标 | 报告路径 |
|------|------|--------|------|------|------|------|------|------|---------|
| V12 | 2026-07-27 | 自实现 | 0.5679 | 0.2953 | 0.3929 | 0.9449 | 0.4892 | ❌ | tests/reports/evaluation/ragas-report-v12.json |
| V13 | 2026-07-28 | 自实现 | 0.7804 | 0.6555 | ~0.50 | ~0.97 | 0.8192 | ❌差0.04 | ⚠️JSON报告已丢失(现v13.json是失败轮0分)，需重跑补档 |
| V13-r2 | 2026-07-28 | 自实现 | 0.8238 | - | - | - | - | ✅达标 | tests/reports/evaluation/ragas-eval-data-v13-r2-baseline.json |
| V13-r3 | 2026-07-31 | 自实现 | 0.7699 | 0.5636 | 0.5515 | 0.9939 | 0.8291 | ❌ | tests/reports/evaluation/ragas-report-v13-selfimpl-r3.json |
| V13-r4 | 2026-08-01 | 自实现 | **0.8688** | 0.7273 | 0.7242 | 0.9939 | 0.9345 | ✅综合达标 | tests/reports/evaluation/ragas-report-v13-selfimpl-r4.json |
| V13-r5 | 2026-08-01 | 自实现(qwen3.5) | **0.9009** | 1.0000 | 0.6697 | 0.9773 | 0.9127 | ✅综合达标 | tests/reports/evaluation/ragas-report-v13-selfimpl-r5.json |
| V13-r6 | 2026-08-02 | 自实现(agnes-2.5-flash) | **0.9153** | 0.9455 | 0.7045 | 1.0000 | 0.9509 | ✅综合达标 | tests/reports/evaluation/ragas-report-v13-selfimpl-r6.json |
| V14 | 2026-07-30 | 官方库 | 0.3205 | 0.0 | 0.3333 | 0.5 | 0.0 | ❌ | tests/reports/evaluation/ragas-report-v14-official.json |

**达标线**：CP/CR/AR ≥ 0.8，F ≥ 0.85，综合 ≥ 0.82
**当前状态**：V13-r6 综合 0.9153 达标（agnes-2.5-flash 模型 + SQL 结果自然语言格式化）。3/4 指标达标（CP=0.9455, F=1.0, AR=0.9509），CR 单指标未达标（0.7045，受 L3/L4 部分项 CR=0 拖累）。L3 CR 从 r5 的 0.4555 提升到 0.5833，L4 CR 从 0.25 提升到 0.60。

### V13 分类指标详情（基线数据，来自 reference/evaluation-experience.md）

| 分类 | 样本 | CP | CR | F | AR | 诊断 |
|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.7607 | 0.4667 | 0.9889 | 0.9800 | 表格切片丢失数值 |
| L2-跨文档对比 | 15 | 0.5274 | 0.1333 | 1.0000 | 0.3733 | 跨公司检索污染 |
| L3-计算推理 | 15 | 0.6356 | 0.3000 | 0.9778 | 0.6533 | 多数值检索不完整 |
| L4-趋势分析 | 10 | 0.8250 | 0.4500 | 0.9500 | 0.9000 | 同比/环比数据缺失 |
| L5-交易规则 | 15 | 0.8025 | 0.6889 | 0.9667 | 0.8800 | ✅接近达标 |
| L6-技术指标 | 15 | 0.9856 | 0.9867 | 0.9905 | 0.9867 | ✅接近满分 |
| L7-合规风控 | 10 | 0.7349 | 0.4500 | 0.9840 | 0.5500 | 合规答案相关性差 |
| L8-对抗性 | 10 | 0.1533 | 0.8000 | 0.9321 | 0.9400 | CP评估逻辑问题 |
| L9-无法回答 | 10 | 0.1000 | 0.9000 | 0.9750 | 0.9800 | CP评估逻辑问题 |

### V13-r4 分类指标详情（数据质量修复后，2026-08-01，仅 L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r3 综合 | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.9333 | 0.9333 | 1.0000 | 0.9600 | +0.18 ✅ | 全指标达标，数据质量修复生效 |
| L3-计算推理 | 15 | 0.1333 | 0.4889 | 0.9778 | 0.8400 | +0.02 | CP 低：SQL JSON context 格式 LLM 判定不相关 |
| L4-趋势分析 | 10 | 1.0000 | 0.4500 | 1.0000 | 1.0000 | +0.15 ✅ | CR 低：同比数据格式问题，CP/AR 满分 |

**V13-r4 关键结论**：
- **综合 0.8688 首次达标（≥0.82）**，较 V13-r3 提升 +0.0989
- L1 全指标达标（CP=CR=0.93, F=1.0, AR=0.96）：数据质量修复（华海药业/中国能建/中国铁建/江苏银行）直接带动 CR 从 0.67→0.93
- F=0.9939（满分）：LLM 完全忠实于 SQL context
- CP/CR 单指标未达标根因：L3 CP=0.1333 极低（SQL JSON context 格式对 CP 评估不友好）
- L4 CR=0.45：同比数据格式问题（revenue_yoy 字段格式）
- 中国人保数据已通过OCR fallback提取（R014完成）：revenue=669,044M, net_profit=63,033M, total_assets=1,766,384M

### V13-r5 分类指标详情（qwen3.5 模型评估，2026-08-01，L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r4 综合 | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 1.0000 | 0.9167 | 0.9667 | 0.9600 | +0.03 ✅ | CP 满分，CR/F/AR 微降（qwen3.5 更严格） |
| L3-计算推理 | 15 | 1.0000 | 0.4555 | 0.9833 | 0.7800 | +0.02 | CP 满分（r4=0.13→r5=1.0），CR 仍低（SQL JSON context） |
| L4-趋势分析 | 10 | 1.0000 | 0.2500 | 1.0000 | 0.9700 | -0.01 | CR 下降（r4=0.45→r5=0.25），CP/AR 高分 |

**V13-r5 关键结论**：
- **综合 0.9009 达标（≥0.82）**，较 V13-r4 提升 +0.0321
- **CP 满分（1.0）**：qwen3.5-122b-a10b 对所有检索片段判定为相关（r4=0.7273→r5=1.0）
- CR 下降（0.7242→0.6697）：qwen3.5 对 ground_truth 覆盖判定更严格，L4 CR 从 0.45→0.25
- F 微降（0.9939→0.9773）：受 L1-005 解析错误影响（qwen3.5 偶发返回字符串列表，已修复）
- AR 微降（0.9345→0.9127）：L3 AR 从 0.84→0.78（qwen3.5 对计算推理答案相关性判定更严格）
- **LLM 降级链**：qwen3.5-plus（超时）→ qwen3.5-flash（403）→ qwen3.5-397b-a17b（超时）→ qwen3.5-plus-2026-02-15（超时）→ **qwen3.5-122b-a10b（实际使用）**
- 评估耗时 8753 秒（约 2.4 小时），qwen3.5 响应慢于旧 qwen-plus（~120s/项 vs ~15s/项）

### V13-r6 分类指标详情（SQL 结果自然语言格式化 + AGNES 模型，2026-08-02，L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r5 综合 | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.9333 | 0.8000 | 1.0000 | 0.9767 | +0.01 ✅ | CR 从 0.9167→0.80（AGNES 更严格），F 满分 |
| L3-计算推理 | 15 | 0.9333 | 0.5833 | 1.0000 | 0.8933 | +0.05 ✅ | CR 从 0.4555→0.5833（SQL 格式化生效），F 满分 |
| L4-趋势分析 | 10 | 1.0000 | 0.6000 | 1.0000 | 0.9600 | +0.08 ✅ | CR 从 0.25→0.60（同比数据格式化生效），CP/F 满分 |

**V13-r6 关键结论**：
- **综合 0.9153 达标（≥0.82）**，较 V13-r5 提升 +0.0144，历史最高
- **核心优化**：SQL 结果自然语言格式化器（sql-result-formatter.ts），将 JSON 格式转为中文自然语言
  - 字段名中文映射（revenue→营业收入、netProfit→净利润等）
  - 货币单位自动检测与转换（元/千元/万元→亿元）
  - 同比字段百分比转换（0.15→增长15.0%）
  - 计算型指标提示（ROE=净利润/净资产×100%）
- **ROE 查询修复**：query-router.ts 联查 financial_income + financial_balancesheet，提供净利润和净资产原始数据
- **3/4 指标达标**：CP=0.9455(✅), F=1.0(✅满分), AR=0.9509(✅)，CR=0.7045(❌差0.0955)
- **L3 CR 大幅提升**：0.4555→0.5833（+28%），SQL 格式化使 LLM 能理解计算型 context
- **L4 CR 大幅提升**：0.25→0.60（+140%），同比数据自然语言格式化覆盖 GT 关键信息
- **CR 未达标根因**：L3-006/015（ROE 查询 CR=0）、L4-002/004/006/009（部分同比 CR=0），GT 与 context 数据源不一致
- **评估模型**：agnes-2.5-flash（AGNES API），DashScope 配额全部耗尽仅 AGNES 可用
- **并发锁机制**：新增 acquire_lock/release_lock 防止多进程同时运行覆盖结果
- **断点续传**：checkpoint 机制确保 LLM 失败后可恢复，本次 0 条失败项
- 评估耗时 863 秒（约 14.4 分钟），AGNES 响应快（~20s/项）

---

## B. 当前评估器与关键约束（禁止擅改，改前审批）

| 项 | 当前配置 | 状态 |
|----|---------|------|
| 主评估路径 | V13 自实现（scripts/ragas_evaluation.py） | ✅可用 |
| 待评估 | V14 官方库（scripts/ragas_official_evaluation.py） | ⚠️embedding违规待修 |
| embedding 模型 | bge-m3 本地服务（llama.cpp，端口8011，POST /embedding） | 🔒禁止擅改 |
| reranker 模型 | bge-reranker-v2-m3 | 🔒禁止擅改 |
| LLM 降级链 | AGNES(agnes-2.5-flash) → 百炼(qwen3.5-plus/flash/397b-a17b/plus-2026-02-15/122b-a10b) | 🔒禁止擅改 |
| 评估器选型 | 自实现 vs 官方库 | 🔒禁止擅改 |
| DB schema | - | 🔒禁止擅改 |
| docker-compose | - | 🔒禁止擅改 |

---

## C. 文档导航索引（按任务类型读对应文档）

> 文档体系已升级为三层（spec/design/task）+ 版本化 + 归档机制。详见 [spec.md](spec.md) 第六章。

| 任务类型 | 必读文档 |
|---------|---------|
| 任务启动 | 本文件 → [spec.md](spec.md) → [REQUIREMENTS.md](REQUIREMENTS.md) → [versions/v13/spec.md](versions/v13/spec.md) |
| 做评估 | [checklists/evaluation-checklist.md](checklists/evaluation-checklist.md) + 本文件基线表 + [reference/evaluation-experience.md](reference/evaluation-experience.md) |
| 改代码 | [checklists/code-change-gates.md](checklists/code-change-gates.md) + [FUNCTIONS.md](FUNCTIONS.md) |
| 新增功能 | [checklists/change-archive-checklist.md](checklists/change-archive-checklist.md)（5步闭环） |
| 改架构 | [adr/](adr/) + [design.md](design.md) |
| 查规则 | [spec.md](spec.md)（全局约束） |
| 查踩坑 | [pitfalls/](pitfalls/) |
| 查需求 | [REQUIREMENTS.md](REQUIREMENTS.md) |
| 查历史快照 | [archive/](archive/) |

---

## D. 最近迭代摘要

- **数据库缺失审计与市场缓存补齐（2026-08-03）**：重新审计 public schema 全表状态。`evaluation_pool` 已导入 `qa-golden.json` 130/130 条，`Team/TeamMember` 已有默认团队（1队3人），`market_cache_entries` 复验 36 条且无 0 记录；新增 `industry/concept/trade_cal` 缓存写入。修复 `data_service/main.py` 中 `trade_cal/industry/concept/minute` 端点未写缓存的问题，新增 `tests/data-service/test_market_cache_endpoints.py` 回归测试 4/4 通过。`minute` 端点缓存逻辑已具备，但真实补齐受上游数据不可用阻塞：efinance 东方财富接口远端断连，mootdx 返回空数据，未写入伪数据。
- **Docker 服务审计（2026-08-02）**：项目 Docker 配置与其他项目合并后全面审计。修复 evaluation-service 缺失问题（添加到 docker-compose.yml + override + .env）、添加 nginx evaluation_service upstream、更新 Prometheus 监控配置（新增 rag/evaluation/data 服务采集）、补充 .env.docker DASHSCOPE_API_KEY 变量、更新 design.md 服务端口和 FUNCTIONS.md 功能清单。13 个服务全部定义完整。
- **V13-r6（2026-08-02）**：SQL 结果自然语言格式化器 + AGNES 模型评估。综合 0.9153 历史最高。L3 CR 0.4555→0.5833（+28%），L4 CR 0.25→0.60（+140%）。新增断点续传 + 多 API Key + 并发锁机制。

- **V13-r5（2026-08-01）**：qwen 模型替换为 qwen3.5 系列（plus/flash/397b-a17b/plus-2026-02-15/122b-a10b）。实际使用 qwen3.5-122b-a10b（前 4 个模型超时/403 降级）。综合 0.9009 达标，CP 满分（1.0），CR 下降（0.6697，qwen3.5 更严格）。评估耗时 2.4 小时（qwen3.5 响应慢于旧 qwen-plus）。
- **V13-r4（2026-08-01）**：数据质量修复后重跑 L1/L3/L4 评估。修复华海药业（附注列扫描范围扩大到全部行）、中国能建/中国铁建/江苏银行（V13-r3 已修复）。综合 0.8688 **首次达标**（≥0.82），L1 全指标达标（CP=CR=0.93, F=1.0, AR=0.96）。CP/CR 单指标未达标受 L3 CP=0.13 拖累（SQL JSON context 格式问题）。
- **V13-r3（2026-07-31）**：R001 查询路由上线，L1/L3/L4 重跑评估。R001 路由层 SQL 命中率 90.9%，F=0.99 满分，但 CR 受限于 PostgreSQL 数据质量（中国能建全 null、中国铁建错值、江苏银行 null）。综合 0.7699。
- **V14（2026-07-30）**：切换RAGAS官方库评估，综合0.3205远低于V13。embedding违规改为text-embedding-v3，已识别待修复。结论待评估是否继续。
- **V13（2026-07-28）**：评估管线对齐生产（rerank+graph+topK=20），综合0.7804差0.04达标。CR/L2/L3/L4/L7未达标。
- **V12（2026-07-27）**：RAGAS思想自实现，综合0.5679。

---

## E. 待办与阻塞项

- [已完成] 修复 ragas_official_evaluation.py 的 embedding 违规配置
- [已完成] 修复 LLM fallback 不切换根因（exhausted 用 name→改 name/model）
- [已完成] 重跑 V13 补有效 JSON 报告（V13-r2 综合0.8238）
- [已完成] 文档管理体系建立（PROJECT_STATE+门禁+REQUIREMENTS+FUNCTIONS+ADR-011+spec）
- [已完成-P0] R001 阶段3 查询路由改造（2026-07-31）
  - 阶段3.1 意图识别：classifyIntent（数值/非数值分流，含组合关键词正则）
  - 阶段3.2 公司名+指标识别：identifyCompany（精确+别名匹配）、identifyIndicators（长别名优先）
  - 阶段3.3 模板 SQL 查询：executeSqlQuery（按 standard_table 分组查询）
  - 阶段3.4 接入 simpleAgent：R001 路由预查询 + r001SqlContext 注入 systemPrompt
  - 单元测试：32 个全绿（src/server/rag/query/__tests__/query-router.test.ts）
  - 路由层端到端测试：SQL 命中率 90.9%（55 条 L1/L3/L4，50 条命中 SQL）
    - 报告：tests/reports/evaluation/r001-routing-test.json
    - 未命中 5 条：中国人保数据未入库（4 条）+ L1-030 已修复（新签合同关键词补充）
- [已完成-P0] R001 阶段4 验证与评估（2026-07-31）
  - V13-r3 评估：L1/L3/L4 共 55 条，综合 0.7699
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r3.json
  - 结论：R001 路由工作正常，CR 提升受限于 PostgreSQL 数据质量
- [已完成-P0] PostgreSQL 财务数据质量修复（2026-08-01）
  - 华海药业：2025年数据全NULL（附注列扫描范围仅20行，利润表表头在第28行）→ 扩大扫描到全部行
  - 中国能建/中国铁建/江苏银行：V13-r3 已修复（附注列识别、银行业字段映射、纯整数附注）
  - 9/10 家数据完整，仅中国人保无数据（PDF编码问题）
- [已完成-P0] V13-r4 评估（2026-08-01）
  - 综合 0.8688 **首次达标**（≥0.82）
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r4.json
  - L1 全指标达标（CP=CR=0.93, F=1.0, AR=0.96）
- [已完成-P0] V13-r5 评估 — qwen3.5 模型替换（2026-08-01）
  - qwen 模型替换为 qwen3.5 系列：plus/flash/397b-a17b/plus-2026-02-15/122b-a10b
  - 综合 0.9009 达标，CP 满分（1.0），CR=0.6697（FAIL）
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r5.json
  - 实际使用 qwen3.5-122b-a10b（前 4 个模型超时/403 降级）
  - 修复 Faithfulness 解析错误（qwen3.5 偶发返回字符串列表）
  - 优化评估参数：LLM_TIMEOUT=120s, CALL_DELAY=1s, MAX_RETRIES=2
- [已完成-P0] V13-r6 评估 — SQL 结果自然语言格式化 + AGNES 模型（2026-08-02）
  - SQL 结果自然语言格式化器：字段名中文映射 + 货币单位转换 + 同比百分比 + 计算型指标提示
  - ROE 查询修复：query-router.ts 联查 financial_income + financial_balancesheet
  - 综合 0.9153 历史最高，L3 CR +28%，L4 CR +140%
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r6.json
  - 新增断点续传 + 多 API Key + 并发锁机制
- [已完成-P0] Docker 服务审计与修复（2026-08-02）
  - 修复 evaluation-service 缺失：添加到 docker-compose.yml（含依赖、健康检查、环境变量）
  - 更新 docker-compose.override.local.yml：evaluation-service 在本地开发时排除容器化
  - 更新 nginx/default.conf：添加 evaluation_service upstream
  - 更新 monitoring/prometheus.yml：新增 rag/evaluation/data 服务 metrics 采集
  - 更新 .env.docker：添加 EVALUATION_SERVICE_PORT + DASHSCOPE_API_KEY 变量
  - 更新 .env.local：添加 EVALUATION_SERVICE_URL
  - 更新 design.md：修正服务端口和微服务层描述
  - 更新 FUNCTIONS.md：新增 F022（SQL 格式化）+ F023（评估微服务）
  - 13 个服务全部定义完整，验证通过
- [已完成-P0] 数据库缺失审计与市场缓存补齐（2026-08-03）
  - `evaluation_pool`：130/130 条，分类 L1~L9 分布与 `qa-golden.json` 一致
  - `Team/TeamMember`：默认团队已存在，1 队 3 人
  - `market_cache_entries`：36 条，无 0 记录；已有 `basic/financial/financial_report/history/index/realtime/industry/concept/trade_cal`
  - 修复 `trade_cal/industry/concept/minute` 端点未写缓存；新增回归测试 `tests/data-service/test_market_cache_endpoints.py`
  - 验证：新增缓存端点测试 4/4、`tests/test_pg_cache.py`、`tests/contract/data-service.test.ts` 9/9 通过
- [阻塞-P1] `minute` 缓存真实数据补齐
  - 缓存逻辑已修复，但真实数据未落库：efinance 东方财富接口远端断连，mootdx 返回空数据
  - 禁止写入空列表/伪数据；待上游恢复或接入 TickFlow/可用分钟线数据源后补齐
- [阻塞-P1] 中国人保 PDF 数据提取（数值不在文本层，需 PyMuPDF 或 OCR）
- [P0] 评估 V14 是否值得继续（R006）
- [P1] 优化 L3 CP：SQL JSON context → 自然语言描述（预期 CP 从 0.13→0.80+）
- [P1] 优化 L4 CR：同比数据格式问题
- [P1] 统一两种拒绝话语（R002）
- [P1] 多实体并行检索调研（R003，L2依赖）
- [已完成-P0] Docker 容器化部署（2026-08-04）
  - 5个应用容器：main-service/rag-service/data-service/embedding/reranker + nginx
  - 复用 ai_novel_postgres 和 ai_novel_redis（通过 aiagent_net 网络别名）
  - docker-compose.override.yml 排除 postgres/redis/evaluation-service/llm-gateway/prometheus/grafana
  - 80端口验证通过，API健康检查全部UP
  - 踩坑记录：docs/pitfalls/2026-08-04-docker-containerization.md
- [P1] 容器合并：rag+evaluation → rag-service，llm-gateway → main-service（见 docs/improvement-plan.md）
- [P1] 内存状态迁移Redis（限流/熔断/缓存/任务状态）（见 docs/improvement-plan.md）
- [⏳需审批] 评估可靠性调研（见 docs/evaluation-reliability-research.md）

---

## F. 当前阻塞与决策点（需用户确认）

### R001 spec 审批（已通过，2026-07-31）
spec.md 已审批通过，进入阶段1实施：
- [x] 五表双轨制架构（4张标准化表 + 1张原始JSON表）
- [x] 2张辅助表（stock_mapping + indicator_aliases）
- [x] 数据源优先级 PDF > Tushare > BaoStock
- [x] 指标清单驱动路由（命中走SQL，未命中走向量fallback）
- [x] 分批实施：先 10 家验证再全量
- [x] 不做 Text-to-SQL（首期模板 SQL）
- [x] 不处理 L2（R003 另行规格）
- [x] 表结构字段确认（用户确认开始写代码）
