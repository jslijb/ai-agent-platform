# 变更归档检查清单（CHANGE-ARCHIVE-CHECKLIST）

> **用途**：每次变更（新增功能/升级/修复）归档前必跑此清单，确保文档不变成空架子。
> **强制点**：任何一项未打勾，变更不算完成，不允许进入下一轮迭代。
> **使用方法**：复制本清单到变更目录的 `archive-check.md`，逐项打勾并附验证证据。

---

## Step 1: Proposal 检查
- [ ] `proposal.md` 已创建，写明"为什么做"（背景+问题）
- [ ] 写明"改什么"（变更范围）
- [ ] 关联需求ID（REQUIREMENTS.md）

## Step 2: Design 检查
- [ ] `design.md` 已创建，写明技术方案
- [ ] 引用全局 spec 约束（禁改清单、环境约束等）
- [ ] 如涉及框架变更，已新增 ADR 文件

## Step 3: Tasks 检查
- [ ] `tasks.md` 已创建，任务分解到可执行粒度
- [ ] 每个任务有明确的验收标准（可执行脚本/检查项）
- [ ] 任务状态标记完成（附验证证据）

## Step 4: 代码检查
- [ ] 改动前：回归测试全绿（记录基线）
- [ ] 改动后：回归测试全绿
- [ ] 改动后：Grep docs/FUNCTIONS.md 功能文件仍存在
- [ ] 如新增功能：FUNCTIONS.md 已追加新功能ID
- [ ] commit 带功能ID/需求ID

## Step 5: 文档回写检查
- [ ] PROJECT_STATE.md 基线表已更新（如涉及评估）
- [ ] 踩坑已记录到 docs/pitfalls/（如有）
- [ ] 踩坑已提炼到 docs/checklists/（如有可执行检查项）
- [ ] Delta Spec 已回写（ADDED/MODIFIED/REMOVED 标记到主 spec）

## Step 6: 验证证据
- [ ] 回归测试输出（路径/截图）
- [ ] 评估报告路径（如涉及评估）
- [ ] 脚本输出（如 check_ground_truth.py）

---

## 失败处理

任何一项未通过：
1. 停止当前变更归档
2. 补齐缺失的文档/验证
3. 重新跑本清单
4. 同一问题出现2次：升级到 ADR 记录决策
