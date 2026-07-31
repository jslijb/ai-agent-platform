# 项目状态卡（PROJECT_STATE）

> 本文件是项目单一入口。任何任务开始前必读本文件，5分钟内恢复全局认知。
> 最后更新：2026-07-31

---

## A. 当前基线表（每轮评估后必须更新）

| 版本 | 日期 | 评估器 | 综合 | CP | CR | F | AR | 达标 | 报告路径 |
|------|------|--------|------|------|------|------|------|------|---------|
| V12 | 2026-07-27 | 自实现 | 0.5679 | 0.2953 | 0.3929 | 0.9449 | 0.4892 | ❌ | tests/reports/evaluation/ragas-report-v12.json |
| V13 | 2026-07-28 | 自实现 | 0.7804 | 0.6555 | ~0.50 | ~0.97 | 0.8192 | ❌差0.04 | ⚠️JSON报告已丢失(现v13.json是失败轮0分)，需重跑补档 |
| V13-r2 | 2026-07-28 | 自实现 | 0.8238 | - | - | - | - | ✅达标 | tests/reports/evaluation/ragas-eval-data-v13-r2-baseline.json |
| V13-r3 | 2026-07-31 | 自实现 | 0.7699 | 0.5636 | 0.5515 | 0.9939 | 0.8291 | ❌ | tests/reports/evaluation/ragas-report-v13-selfimpl-r3.json |
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

### V13-r3 分类指标详情（R001 上线后，2026-07-31，仅 L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r2 CR | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.7000 | 0.6667 | 0.9889 | 0.8267 | +0.20 ✅ | 数据质量限制（中国能建/铁建/江苏银行 null 或错值） |
| L3-计算推理 | 15 | 0.1333 | 0.4222 | 1.0000 | 0.8000 | +0.12 ✅ | CP 低：SQL JSON context 格式 LLM 判定不相关 |
| L4-趋势分析 | 10 | 0.8000 | 0.4000 | 1.0000 | 0.8800 | -0.05 ⚠️ | 同比字段依赖 revenue，revenue null 连带失败 |

**V13-r3 关键结论**：
- R001 路由层工作正常：SQL 命中率 90.9%（55 条中 50 条命中 SQL）
- F=0.99~1.0（满分）：LLM 忠实于 SQL context
- CR 未达 0.85 根因：**PostgreSQL 数据质量问题**（非路由问题）
  - 中国能建：financial_income 全字段 null（回填失败）
  - 中国铁建：revenue="49.0"（PDF 提取字段映射错误，应为 10297.84 亿）
  - 江苏银行：revenue=null（银行业特殊格式提取失败）
  - 中国人保：标准化指标提取失败（保险行业格式特殊）
- 次要原因：SQL JSON context 格式对 CP 评估不友好（L3 CP=0.13）

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
- [阻塞-P0] PostgreSQL 财务数据质量问题（阻塞 V13-r3 CR 达标）
  - 中国能建：financial_income 全字段 null（回填失败，需重新提取）
  - 中国铁建：revenue="49.0"（PDF 提取字段映射错误，应为 10297.84 亿）
  - 江苏银行：revenue=null（银行业特殊格式提取失败）
  - 中国人保：标准化指标提取失败（保险行业格式特殊）
  - 修复方向：重新跑 extract_financial_from_pdf.py 并人工校验字段映射
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
