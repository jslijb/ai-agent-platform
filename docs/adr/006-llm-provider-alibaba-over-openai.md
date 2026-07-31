# ADR-006: LLM 提供商选择阿里百炼而非 OpenAI

## 状态：已采纳（2025-05）

## 背景

项目需要选择 LLM API 提供商，主要候选为 OpenAI 和阿里百炼（DashScope）。

## 决策

选择阿里百炼（DashScope）作为主要 LLM 提供商。

## 理由

1. **数据合规**：金融行业数据不出境是合规红线，阿里百炼数据中心在国内
2. **中文能力**：Qwen 系列模型中文理解和生成能力优于同级别 GPT 模型
3. **成本优势**：Qwen 系列模型 API 价格显著低于 GPT-4 级别模型
4. **Function Calling 支持**：Qwen-Plus/Qwen-Max 支持 OpenAI 兼容的 Function Calling 格式

## 后果

### 正面
- 数据合规风险消除
- 中文金融场景表现更优
- API 成本降低约 60%

### 负面
- 多模型降级链需自行实现（OpenAI 有官方 fallback 机制）
- 部分 API 特性与 OpenAI 不完全兼容（如 streaming 格式差异）
- 社区生态和文档不如 OpenAI 完善

### 风险缓解
- 实现多模型降级链（agnes-2.0-flash → qwen-plus → qwen-turbo）
- 三状态熔断器保护，304/403 额度耗尽永久排除调度
- LLM 路由层抽象，可随时切换提供商