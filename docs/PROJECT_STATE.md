# 项目状态卡（PROJECT_STATE）

> 本文件是项目单一入口。任何任务开始前必读本文件，5分钟内恢复全局认知。
> 最后更新：2026-07-31

---

## A. 当前基线表（每轮评估后必须更新）

| 版本 | 日期 | 评估器 | 综合 | CP | CR | F | AR | 达标 | 报告路径 |
|------|------|--------|------|------|------|------|------|------|---------|
| V12 | 2026-07-27 | 自实现 | 0.5679 | 0.2953 | 0.3929 | 0.9449 | 0.4892 | ❌ | tests/reports/evaluation/ragas-report-v12.json |
| V13 | 2026-07-28 | 自实现 | 0.7804 | 0.6555 | ~0.50 | ~0.97 | 0.8192 | ❌差0.04 | ⚠️JSON报告已丢失(现v13.json是失败轮0分)，需重跑补档 |
| V14 | 2026-07-30 | 官方库 | 0.3205 | 0.0 | 0.3333 | 0.5 | 0.0 | ❌ | tests/reports/evaluation/ragas-report-v14-official.json |

**达标线**：CP/CR/AR ≥ 0.8，F ≥ 0.85，综合 ≥ 0.82
**当前目标**：沿 V13 自实现思想把所有指标调到达标线，建立第一个全达标基线

### V13 分类指标详情（基线数据，来自 EVALUATION_EXPERIENCE.md）

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

---

## B. 当前评估器与关键约束（禁止擅改，改前审批）

| 项 | 当前配置 | 状态 |
|----|---------|------|
| 主评估路径 | V13 自实现（scripts/ragas_evaluation.py） | ✅可用 |
| 待评估 | V14 官方库（scripts/ragas_official_evaluation.py） | ⚠️embedding违规待修 |
| embedding 模型 | bge-m3 本地服务（llama.cpp，端口8011，POST /embedding） | 🔒禁止擅改 |
| reranker 模型 | bge-reranker-v2-m3 | 🔒禁止擅改 |
| LLM 降级链 | AGNES(agnes-flash-2.5) → 百炼(qwen-plus多版本) | 🔒禁止擅改 |
| 评估器选型 | 自实现 vs 官方库 | 🔒禁止擅改 |
| DB schema | - | 🔒禁止擅改 |
| docker-compose | - | 🔒禁止擅改 |

---

## C. 文档导航索引（按任务类型读对应文档）

| 任务类型 | 必读文档 |
|---------|---------|
| 做评估 | EVALUATION_EXPERIENCE.md + 本文件基线表 + REQUIREMENTS.md |
| 改架构 | docs/adr/ + project-profile.md |
| 查规则 | .trae/rules/project_rule.md |
| 查升级规划 | UPGRADE_ROADMAP.md |
| 核对功能 | FUNCTIONS.md |
| 查需求 | REQUIREMENTS.md |
| 查历史会话 | docs/session-memory/ |

---

## D. 最近迭代摘要

- **V14（2026-07-30）**：切换RAGAS官方库评估，综合0.3205远低于V13。embedding违规改为text-embedding-v3，已识别待修复。结论待评估是否继续。
- **V13（2026-07-28）**：评估管线对齐生产（rerank+graph+topK=20），综合0.7804差0.04达标。CR/L2/L3/L4/L7未达标。
- **V12（2026-07-27）**：RAGAS思想自实现，综合0.5679。

---

## E. 待办与阻塞项

- [已完成] 修复 ragas_official_evaluation.py 的 embedding 违规配置
- [已完成] 修复 LLM fallback 不切换根因（exhausted 用 name→改 name/model）
- [已完成] 重跑 V13 补有效 JSON 报告（V13-r2 综合0.8238）
- [已完成] 文档管理体系建立（PROJECT_STATE+门禁+REQUIREMENTS+FUNCTIONS+ADR-011+spec）
- [进行中-P0] R001 财务数据落 PostgreSQL（spec已审批通过，进入阶段1实施）
  - ADR-011 已写：docs/adr/011-financial-data-to-postgresql.md
  - spec.md 已审批：docs/spec.md（指标清单驱动路由：命中走SQL，未命中走向量fallback）
  - 表结构已建：drizzle/0003_tense_warhawk.sql（7张财务表）
  - 阶段1.1 已完成：表结构创建 + 4张财务表补加 UNIQUE INDEX（修复 ON CONFLICT）
  - 阶段1.2 已完成：stock_mapping 导入 5534 条公司映射（Tushare stock_basic）
  - 阶段1.3 已完成：indicator_aliases 预置 42 个指标 124 个别名（覆盖4张表）
  - 阶段2.1 已完成：data_service/pdf_extractor.py + main.py 端点 /api/pdf/extract_tables
  - 阶段2.2 已完成：scripts/extract_financial_from_pdf.py（批量处理+DB回填）
    - 修复附注列错位 bug：新增 _identify_skip_columns() 跳过"附注"列
    - 单公司验证：片仔癀2025营收90.01亿、净利率23.81%、营收同比-16.56% 全部正确
    - 依赖：psycopg2-binary 装到 vendor 目录（绕过系统目录权限）
  - 阶段2.3 已完成：10 家样本公司全部回填 PostgreSQL（2026-07-31）
    - ✅ raw_tables 全部入库：10 家共 3052 张原始表格
    - ✅ 标准化指标 8 家三表完整：片仔癀/华海药业/中国长城/中国铁建/中国能建/五粮液/格力电器/东吴证券
    - ⚠️ 部分入库 1 家：江苏银行（income 4条/balance 5条，cashflow 0条，银行业特殊格式）
    - ❌ 标准化指标提取失败 1 家：中国人保（保险行业格式特殊，利润表标题误匹配）
    - 文本解析 fallback 修复（2026-07-31）：
      - 根因：pdfplumber extract_tables() 对部分 PDF 表格线识别失败（格力/五粮液/东吴等）
      - 修复：data_service/pdf_extractor.py 新增 _extract_rows_from_text() 方法
      - 触发条件：extract_tables 行数<5 或 字段映射 0 个 或 字段值全 None
      - 解析逻辑：从 extract_text() 文本行解析，从右向左识别数值，跳过附注列
      - 修复效果：5 家失败公司中 4 家修复（格力/五粮液/东吴/江苏银行部分），仅中国人保未修复
    - find_pdf_by_stock_code 已修复：支持多目录搜索+多格式匹配
    - 华海药业修复：_find_statement_pages 新增全页扫描 fallback
    - 数据规模已锁定 10 家（spec.md 第2/3批已取消，用户决策 2026-07-31）
- [P0] 评估 V14 是否值得继续（R006）
- [P1] 统一两种拒绝话语（R002）
- [P1] 多实体并行检索调研（R003，L2依赖）

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
