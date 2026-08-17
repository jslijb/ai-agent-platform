# 评估前检查清单（EVALUATION-CHECKLIST）

> **用途**：每次跑 RAGAS 评估前必跑此清单，确保评估数据质量。
> **强制点**：任何一项未通过，不允许启动评估。
> **来源**：V13-r4 踩坑经验提炼（ground_truth 错误、评估标准过严）

---

## 评估前必跑校验

- [ ] 跑 check_ground_truth.py，输出0个问题
  ```bash
  conda run -n agent python scripts/check_ground_truth.py
  ```
  - 检查 query 与 expectedAnswer 是否匹配（query只问A，expectedAnswer不应额外包含B）
  - 检查 expectedAnswer 数值与 originalText 是否一致
  - 检查 expectedAnswer 同比方向与原文是否一致

- [ ] 检查 LLM Provider 可用性
  - AGNES 服务器是否可达
  - 百炼 Token Plan 是否有效（注意旧版API不兼容）
  - 额度是否充足（评估需消耗大量token）

- [ ] 检查 embedding 服务
  - bge-m3 本地服务（端口8011）是否运行
  - reranker 服务是否运行

## 评估中监控

- [ ] 评估脚本无异常退出
- [ ] 每条样本都有评估结果（非全0）
  - 如出现全0：检查 LLM Provider 是否额度耗尽
  - 如出现 CR=0：检查 ground_truth 是否正确
- [ ] 评估报告已保存（按命名规范）

## 评估后回写

- [ ] 更新 PROJECT_STATE.md 基线表
  - 版本、日期、评估器、综合/CP/CR/F/AR、达标状态、报告路径
- [ ] 更新 docs/task.md 历史迭代记录
- [ ] 更新 docs/versions/v{N}/task.md 任务状态
- [ ] 踩坑记录到 docs/pitfalls/（如有）
- [ ] 关键经验提炼到 docs/checklists/（如有）

## 评估数据集维护

- [ ] qa-golden.json 新增样本时：
  - expectedAnswer 必须与 query 严格匹配（不额外补充query未问的内容）
  - 数值类问题的 expectedAnswer 数据来源必须是权威数据源（SQL查询结果/财报表格），不能依赖向量检索结果
  - originalText 必须包含完整上下文（不能截断表头）
- [ ] 新增公司时：
  - 先确认 PostgreSQL 有该公司财务数据
  - 先确认向量库有该公司文档
  - 先跑 check_ground_truth.py 验证新增样本

## 常见问题

| 问题 | 根因 | 解决 |
|------|------|------|
| 评估全0 | LLM Provider 额度耗尽 | 切换降级链，检查Token Plan |
| CR=0但LLM回答正确 | ground_truth 数据错误 | 跑 check_ground_truth.py 修正 |
| CR=0.5（覆盖1/2事实） | expectedAnswer 包含query未问的内容 | 修正 expectedAnswer 只保留query问的内容 |
| CP=0但检索结果正确 | context 格式 LLM 判定不相关（如SQL JSON） | 改为自然语言描述格式 |
