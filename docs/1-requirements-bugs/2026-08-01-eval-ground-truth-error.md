# 踩坑：评估数据集 ground_truth 错误（2026-08-01）

## 现象
V13-r4 评估中 L4-005（中国铁建）和 L4-008（华海药业）CR=0.0，但 LLM 回答实际正确。

## 根因
评估数据集 qa-golden.json 的 ground_truth 数据错误：
- L4-005：向量检索返回"海外营收同比增长15.14%"片段，LLM据此生成expectedAnswer"同比增长15.1%"，但实际总营收同比-3.50%
- L4-008：原文明明是下降10.06%，ground_truth写成增长7.5%

根因是评估数据集生成流程存在循环依赖：用向量检索结果(originalText)生成ground_truth，再用ground_truth评估向量检索质量。

## 影响
- L4 CR 被压低（2个样本从1.0变0.0）
- 评估分数不能真实反映系统质量

## 教训
- ground_truth 数据来源必须是权威数据源（SQL查询结果/财报表格），不能依赖向量检索结果
- 评估前必须跑 check_ground_truth.py 校验

## 改进措施
- 新增 check_ground_truth.py 校验脚本（已创建）
- 新增 evaluation-checklist.md 评估前检查清单（已创建）
- R013：修正 ground_truth 错误 + 建立生成规范

## 关联
- 需求：R013
- 检查清单：docs/checklists/evaluation-checklist.md
