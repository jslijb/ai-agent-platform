# 需求池（REQUIREMENTS）

> 记录所有需求（含对话中临时新增），确保不遗漏。开发前必读本文件，按ID逐条核对。
> 最后更新：2026-08-03

---

## 活跃需求

| ID | 需求 | 来源 | 提出时间 | 状态 | 实现版本 | 验证 |
|----|------|------|---------|------|---------|------|
| R001 | 财务指标入PostgreSQL表（五表双轨制），指标清单驱动路由 | 7/29对话 | 2026-07-29 | 实施中-阶段1.2 | - | spec.md + ADR-011 已审批通过 |
| R002 | 统一两种拒绝话语（合规/库外），语气委婉 | 7/29对话 | 2026-07-29 | 待办 | - | - |
| R003 | 多实体并行检索可行性调研 | 7/29对话 | 2026-07-29 | 待办（L2依赖） | - | - |
| R004 | query标准化改写（财务指标统一） | 7/29对话 | 2026-07-29 | 已并入R001 | R001 | indicator_aliases表 |
| R005 | V13所有指标达标，建立第一个全达标基线 | 7/30对话 | 2026-07-30 | 进行中 | V13-r2 | 综合0.8238达标，CP/CR未达标 |
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
- **状态**：spec已审批通过（2026-07-31），进入阶段1实施
  - 阶段1.1 已完成：7张表结构创建（drizzle/0003_tense_warhawk.sql）
  - 阶段1.2 进行中：导入 stock_mapping（Tushare stock_basic）
  - 阶段1.3 待办：预置 indicator_aliases（30+ 常见指标）

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

## 已完成需求

（暂无）
