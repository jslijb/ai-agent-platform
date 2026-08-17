# V13 版本规格（SPEC）

> **基线**: [docs/spec.md](../../spec.md)（全局约束）
> **上一版本**: V12（已归档到 docs/archive/）
> **最后更新**: 2026-08-01
> **关联 ADR**: [ADR-011](../../adr/011-financial-data-to-postgresql.md)
> **关联需求**: R001、R005、R013、R014、R015

---

## 一、V13 变更范围（Delta Spec）

### ADDED（新增）
- **R001 财务数据落 PostgreSQL 双轨制**：
  - 5张财务数据表（income/balancesheet/cashflow/indicators/raw_tables）
  - 2张辅助表（stock_mapping/indicator_aliases）
  - 查询路由（query-router.ts）：数值类走SQL，非数值走向量检索
  - PDF提取器（pdf_extractor.py）：从年报PDF提取三张主表
  - 10家评估样本公司数据回填
- **R008 文档管理体系**（升级为三层版本化体系）：
  - 全局三层（spec/design/task）+ 版本化（versions/vN/）
  - 门禁检查清单（code-change-gates + evaluation-checklist + change-archive-checklist）
  - 踩坑归档（pitfalls/）+ 经验参考（reference/）

### MODIFIED（修改）
- **评估数据集质量治理（R013）**：
  - qa-golden.json 修正L4-005/L4-008 ground_truth错误
  - L4 expectedAnswer 只保留query问的内容
  - 新增 check_ground_truth.py 校验脚本
- **PDF处理工具分工（R014）**：
  - pdf_extractor.py 增加 OCR fallback（PyMuPDF渲染+PaddleOCR识别）
  - 中国人保数据提取（数值不在文本层的特殊PDF）

### REMOVED（移除）
- V12 的 PDF表格切片走向量检索的方案（改为SQL查询）
- V12 的 BM25 预处理删千分位/小数点（数值不再走BM25）

## 二、V13 评估目标

| 指标 | 达标线 | V13-r4 当前 | 目标 |
|------|--------|------------|------|
| CP | 0.8 | 0.7273 | 0.80+ |
| CR | 0.8 | 0.7242 | 0.80+ |
| F | 0.85 | 0.9939 | 0.85+（已达标） |
| AR | 0.8 | 0.9345 | 0.80+（已达标） |
| 综合 | 0.82 | 0.8688 | 0.82+（已达标） |

**当前状态**：综合已达标，CP/CR 单指标未达标（受 L3 CP=0.13 拖累 + L4 CR=0.45 拖累）

## 三、V13 待修复问题

### P0: R013 评估数据集质量治理
- L4-005 中国铁建 ground_truth 错误（海外营收→总营收）
- L4-008 华海药业 ground_truth 错误（下降→增长，方向相反）
- L4 全部10个样本 expectedAnswer 包含query未问的内容

### P0: R015 同比数据来源
- 系统自己计算同比（(本期-上期)/上期），应优先从财报"主要会计数据"表格提取
- 扩展 pdf_extractor.py 提取"主要会计数据"表格

### P0: R014 中国人保 OCR fallback
- 中国人保 PDF 数值不在文本层（281字符全是行标签，无一数字）
- 需 PyMuPDF 渲染图片 + PaddleOCR 识别

### P1: L3 CP 低
- SQL JSON context 格式 LLM 判定不相关
- 改为自然语言描述格式

## 四、V13 约束（继承全局 + 版本特有）

继承 [全局 spec.md](../../spec.md) 全部约束，补充：
- 10家评估样本公司清单：片仔癀、华海药业、江苏银行、东吴证券、格力电器、五粮液、中国长城、中国能建、中国铁建、中国人保
- PostgreSQL 财务表只保留10家，不做A股全量回填
- embedding 库保持10家不变
