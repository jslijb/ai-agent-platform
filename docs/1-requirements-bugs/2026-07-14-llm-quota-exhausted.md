# 踩坑：LLM Provider 额度耗尽导致评估全0（2026-07-14）

## 现象
V13 评估所有样本 CP/CR/F/AR 全为0。

## 根因
百炼平台多个版本额度耗尽（2025-07-14/04-28/01-25），评估期间 LLM 调用全部失败，但评估脚本未捕获异常，返回0分。

## 教训
- 评估前必须检查 LLM Provider 可用性和额度
- 评估脚本应有异常检测，全0时报警而非静默通过

## 改进措施
- 新增 evaluation-checklist.md（评估前检查LLM可用性）
- 评估脚本增加全0检测

## 关联
- 检查清单：docs/checklists/evaluation-checklist.md
