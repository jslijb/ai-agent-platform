# 代码改动门禁检查清单（CODE-CHANGE-GATES）

> **用途**：每次代码改动前/后必跑此清单，防功能回归。
> **强制点**：改代码前必须确认基线全绿，改代码后红了必须先恢复。
> **来源**：project_rule.md 第三章 + 踩坑经验提炼

---

## 改动前检查

- [ ] 跑回归测试，确认全绿（记录基线版本）
  ```bash
  # 单元测试
  conda run -n agent python -m pytest tests/unit/ -v
  # 集成测试（按批次跑，避免卡住）
  conda run -n agent python -m pytest tests/integration/ -v --tb=short
  ```
- [ ] Grep 目标文件被谁引用，列影响范围
  ```bash
  # 例：查 pdf_extractor.py 被谁引用
  # 用 Grep 工具搜 "pdf_extractor" 或 "from data_service.pdf_extractor"
  ```
- [ ] 确认改动范围在 design.md/spec.md 约束内
- [ ] 如涉及禁改清单：已获得审批

## 改动后检查

- [ ] 立即跑回归测试
  - 绿了 → 继续
  - 红了 → **必须先恢复到绿基线**，不允许带红继续
- [ ] Grep docs/FUNCTIONS.md 清单功能文件仍存在
  ```bash
  # 用 Grep 工具核对 F001-F016 的关键文件路径
  ```
- [ ] 更新 FUNCTIONS.md（如涉及功能变更）
- [ ] commit 带功能ID/需求ID

## 特殊场景门禁

### 涉及数据库 schema 变更
- [ ] 已新增 ADR 文件记录决策
- [ ] 已备份数据库
- [ ] 已更新 spec.md 禁改清单（如适用）

### 涉及评估流程变更
- [ ] 评估前必跑 check_ground_truth.py
  ```bash
  conda run -n agent python scripts/check_ground_truth.py
  ```
- [ ] 评估报告按命名规范保存
  ```
  ragas-report-v{版本}-{评估器}-r{轮次}.json
  ```

### 涉及模型/框架变更
- [ ] 已获得审批（禁改清单项）
- [ ] 已在 ADR 记录决策
- [ ] 已更新 spec.md 禁改清单状态

## 失败处理

- 同一 bug 修两次未解决：停止，git 回滚到绿基线，重写而非修补
- 回归测试红且无法恢复：git stash 保存当前改动，恢复基线，重新设计
