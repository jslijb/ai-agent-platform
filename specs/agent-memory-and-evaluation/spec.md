# Agent 记忆与评估体系 Spec

> 本文档合并自原 `.trae/specs` 中的两个独立 spec：
> - `agent-memory-system`（分层记忆架构 L1-L4）
> - `financial-rag-agent-evaluation`（金融行业 RAG & Agent 评估最佳实践）
>
> 合并原因：记忆系统（L3 历史检索）依赖评估体系的 embedding 基础设施，评估体系依赖记忆系统的用户画像做个性化评估，两者形成双向依赖。

---

## 一、Agent 记忆系统增强

详见 [memory-system.md](./memory-system.md)

核心变更：
- 四层分层记忆架构（L1 原始消息 / L2 滚动摘要 / L3 历史检索 / L4 用户画像）
- 自适应 Token 预算（按模型窗口动态分配）
- 三级权限隔离（个人 / 团队 / 企业）
- 知识图谱前端预览

---

## 二、金融行业 RAG & Agent 评估最佳实践

详见 [evaluation.md](./evaluation.md)

核心变更：
- 金融专用 RAG 评估指标（数值精确度、合规性、幻觉检测、风险提示、时效性）
- 金融专用 Agent 评估指标（工具选择合理性、规划能力、合规性、效率）
- 评估趋势追踪 + 版本管理 + 历史查询评估 + 双轨评估级别
- 开源金融数据集评估（FinEval/CFLUE/FinQA/ConvFinQA）

---

## 依赖关系

- 记忆系统 L3 历史检索 → 复用 RAG 的 dense-retriever 向量检索基础设施
- 评估体系的黄金测试集 → 被 `testing-coverage` 的集成测试引用
- 记忆系统 L4 用户画像 → 为评估提供用户偏好维度的个性化参考
