# V13 版本任务（TASK）

> **基线**: [docs/task.md](../../task.md)（全局任务）+ [V13 spec.md](spec.md) + [V13 design.md](design.md)
> **最后更新**: 2026-08-03
> **验收门禁**: [change-archive-checklist.md](../../checklists/change-archive-checklist.md)

---

## 一、R001 实施任务（五表双轨制）

### 阶段1：数据库建表 + 数据回填
| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 1.1 | 建5张财务表+2张辅助表 | DDL执行成功，表结构符合spec | ✅完成 |
| 1.2 | 导入stock_mapping（10家样本） | 10家公司精确匹配 | ✅完成 |
| 1.2 | 导入indicator_aliases（指标别名） | 覆盖L1/L3/L4评估指标 | ✅完成 |
| 1.3 | PDF批量提取+回填（10家） | 10家数据完整（中国人保OCR fallback已验证） | ✅完成 |

### 阶段2：PDF提取器
| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 2.1 | pdf_extractor.py 基础提取 | pdfplumber提取三张主表 | ✅完成 |
| 2.2 | 字段映射（含银行/保险业） | INCOME/BALANCE/CASHFLOW_FIELD_MAP覆盖行业专用字段 | ✅完成 |
| 2.3 | 附注列识别 | _identify_skip_columns扫描20行+小整数检测 | ✅完成 |
| 2.4 | OCR fallback（R014） | PyMuPDF渲染+PaddleOCR识别 | ✅完成 |

### 阶段3：查询路由
| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 3.1 | 意图识别 | 数值/非数值分流准确 | ✅完成 |
| 3.2 | 公司名+指标识别 | 精确+模糊匹配 | ✅完成 |
| 3.3 | 模板SQL查询 | 单指标/多指标/整表查询 | ✅完成 |
| 3.4 | R001路由接入simpleAgent | SQL结果注入LLM上下文 | ✅完成 |

### 阶段4：验证与评估
| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 4.1 | 端到端测试 | 10家公司数据完整性验证 | ✅完成（10/10） |
| 4.2 | L1/L3/L4评估重跑 | L1 CR→0.85+, L3 CR→0.85+, L4 CR→0.85+ | ⏳进行中（V13-r6: 综合0.9153达标，CR=0.7045单指标未达标，L3 CR=0.5833/L4 CR=0.60 大幅提升） |

## 二、R013 评估数据集质量治理

| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 2.1 | 修正L4-005中国铁建ground_truth | 总营收同比-3.50%（非海外营收+15.14%） | ✅完成 |
| 2.2 | 修正L4-008华海药业ground_truth | 营收同比-10.06%（下降，非增长7.5%） | ✅完成 |
| 2.3 | 修正L4全部10个样本expectedAnswer | 只保留query问的内容 | ✅完成 |
| 2.4 | 建立qa-golden.json生成规范 | expectedAnswer与query严格匹配 | ✅完成 |
| 2.5 | check_ground_truth.py输出0个问题 | 脚本验证通过 | ✅完成（0个问题） |

## 三、R015 同比数据来源

| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 3.1 | 扩展pdf_extractor提取"主要会计数据"表格 | 识别"主要会计数据/主要财务数据"标题 | ✅完成 |
| 3.2 | 同比优先从财报提取 | 提取值覆盖计算值（priority更高） | ✅完成 |
| 3.3 | 验证同比与财报一致 | 10家公司同比与"主要会计数据"表格一致 | ✅完成（片仔癀/中国铁建/格力电器等验证通过） |

## 四、R014 中国人保 OCR fallback

| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 4.1 | 环境配置 | agent环境PaddleOCR+vendor目录PyMuPDF | ✅完成 |
| 4.2 | pdf_extractor增加OCR fallback | pdfplumber提取不到数值时触发OCR | ✅完成 |
| 4.3 | 中国人保数据提取验证 | 中国人保三张主表数据提取完整 | ✅完成（income=8字段, balance=3字段, cashflow=3字段） |

### R014 实现详情
- **工具链路**: pdfplumber（文本层）→ extract_text fallback → PyMuPDF渲染200DPI图片 + PaddleOCR识别
- **关键方法**: `_combine_ocr_lines()` 合并OCR逐行文本为表格行，`_extract_statement_ocr()` 多页OCR+内存优化
- **内存优化**: 200 DPI（非300）、每页处理后gc.collect()、del pixmap/result、per-page异常捕获
- **中国人保提取结果**: revenue=669,044M, net_profit=63,033M, total_assets=1,766,384M

## 五、V13-r5 评估任务

| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 5.1 | 跑评估前检查清单 | evaluation-checklist全部通过 | ✅完成 |
| 5.2 | 收集评估数据 | collect-rag-data.ts 执行成功 | ✅完成（复用R4数据，55条L1/L3/L4） |
| 5.3 | 跑RAGAS评估 | 评估报告生成 | ✅完成（qwen3.5-122b-a10b，8753s） |
| 5.4 | 验证达标 | CP/CR/AR≥0.8, F≥0.85, 综合≥0.82 | ✅综合达标（0.9009），CP=1.0满分，CR=0.6697未达标 |
| 5.5 | 文档回写 | PROJECT_STATE+task.md更新 | ✅完成 |

### V13-r5 评估详情
- **模型替换**: qwen-plus 系列 → qwen3.5 系列（plus/flash/397b-a17b/plus-2026-02-15/122b-a10b）
- **实际使用模型**: qwen3.5-122b-a10b（前4个模型超时/403降级）
- **评估数据**: 复用 V13-r4 数据（55条 L1/L3/L4），仅替换评估 LLM
- **综合分数**: 0.9009（较R4提升+0.0321）
- **分类表现**:
  - L1-事实提取: CP=1.0, CR=0.9167, F=0.9667, AR=0.96（全指标达标）
  - L3-计算推理: CP=1.0, CR=0.4555, F=0.9833, AR=0.78（CP满分，CR/AR未达标）
  - L4-趋势分析: CP=1.0, CR=0.25, F=1.0, AR=0.97（CP/F/AR达标，CR极低）
- **修复**: Faithfulness 解析错误（qwen3.5 偶发返回字符串列表而非对象列表）
- **优化**: LLM_TIMEOUT=120s, CALL_DELAY=1s, MAX_RETRIES=2（适配 qwen3.5 较慢响应）
- **报告**: tests/reports/evaluation/ragas-report-v13-selfimpl-r5.json

## 六、V13-r6 评估任务（SQL 结果自然语言格式化 + AGNES 模型）

| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 6.1 | 实现 SQL 结果自然语言格式化器 | sql-result-formatter.ts 单元测试通过 | ✅完成 |
| 6.2 | 修复 ROE 查询联查 financial_income + balancesheet | query-router.ts 回归测试 32/32 通过 | ✅完成 |
| 6.3 | 更新 simpleAgent.ts + collect-rag-data.ts | 使用格式化器输出自然语言 context | ✅完成 |
| 6.4 | 重新收集评估数据 | 55 条 L1/L3/L4 数据含自然语言 context | ✅完成 |
| 6.5 | 跑 RAGAS 评估 | 评估报告生成，综合 ≥ 0.82 | ✅完成（agnes-2.5-flash，863s） |
| 6.6 | 验证达标 | CP/CR/AR≥0.8, F≥0.85, 综合≥0.82 | ✅综合达标（0.9153），3/4 指标达标 |
| 6.7 | 文档回写 | PROJECT_STATE+task.md 更新 | ✅完成 |
| 6.8 | 并发锁机制 | acquire_lock/release_lock 防止多进程覆盖 | ✅完成 |

### V13-r6 评估详情
- **核心优化**: SQL 结果自然语言格式化器（src/server/rag/query/sql-result-formatter.ts）
  - 字段名中文映射（revenue→营业收入等 30+ 字段）
  - 货币单位自动检测与转换（元/千元/万元→亿元）
  - 同比字段百分比转换（yoy 字段 0.15→增长15.0%）
  - 计算型指标提示（ROE=净利润/净资产×100%）
- **ROE 查询修复**: query-router.ts 联查 financial_income + financial_balancesheet
- **评估模型**: agnes-2.5-flash（AGNES API，DashScope 配额全部耗尽）
- **综合分数**: 0.9153（较 R5 提升 +0.0144，历史最高）
- **分类表现**:
  - L1-事实提取: CP=0.9333, CR=0.80, F=1.0, AR=0.9767（CR/F 达标）
  - L3-计算推理: CP=0.9333, CR=0.5833, F=1.0, AR=0.8933（CR 从 0.4555→0.5833，+28%）
  - L4-趋势分析: CP=1.0, CR=0.60, F=1.0, AR=0.96（CR 从 0.25→0.60，+140%）
- **CR 未达标根因**: L3-006/015（ROE CR=0）、L4-002/004/006/009（部分同比 CR=0），GT 与 context 数据源不一致
- **并发锁**: 新增文件锁机制防止多进程同时运行覆盖结果（V13-r6 评估中被旧进程覆盖过一次）
- **断点续传**: checkpoint 机制 0 条失败项，评估完成后自动清理
- **报告**: tests/reports/evaluation/ragas-report-v13-selfimpl-r6.json

## 七、数据库缺失审计与市场缓存补齐

| 步骤 | 内容 | 验收标准 | 状态 |
|------|------|---------|------|
| 7.1 | 重新审计 public schema 全表行数 | 输出所有表行数与关键业务表分布 | ✅完成 |
| 7.2 | 补齐 evaluation_pool | `qa-golden.json` 130 条全部入库 | ✅完成（130/130） |
| 7.3 | 补齐 Team/TeamMember | 至少存在默认团队与成员关系 | ✅完成（1队3人） |
| 7.4 | 修复 market_cache_entries 缺失类型 | `industry/concept/trade_cal` 可通过预热写入缓存 | ✅完成 |
| 7.5 | 修复 minute 端点缓存逻辑 | 端点具备 cache get/set 与回归测试 | ✅完成（真实数据源阻塞，未写伪数据） |

### 7.x 审计结果（2026-08-03）
- `market_cache_entries` 最终 36 条，无 0 记录：`basic/financial/financial_report/history/index/realtime/industry/concept/trade_cal`。
- `minute` 未落真实缓存：efinance 东方财富接口远端断连，mootdx 返回空数据。缓存逻辑已修复，等待可用分钟线数据源后补齐。
- 新增测试：`tests/data-service/test_market_cache_endpoints.py`，覆盖 `trade_cal/industry/concept/minute` 首次写缓存、二次命中缓存。
- 验证命令：`python tests/data-service/test_market_cache_endpoints.py`（4/4）、`python tests/test_pg_cache.py`、`npm test -- tests/contract/data-service.test.ts`（9/9）。
