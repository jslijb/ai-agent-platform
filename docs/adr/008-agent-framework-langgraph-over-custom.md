# ADR-008: Agent 框架选择 LangGraph 而非自研

## 状态：已采纳（2025-05）

## 背景

项目需要 Agent 编排框架，候选方案为自研状态机或使用 LangGraph.js。

## 决策

选择 LangGraph.js 作为 Agent 编排框架。

## 理由

1. **状态图原生支持**：LangGraph 基于有向图定义 Agent 工作流，天然支持条件分支、循环、并行
2. **Function Calling 原生集成**：与 LangChain 生态无缝集成，OpenAI/Qwen Function Calling 开箱即用
3. **Supervisor 模式**：`@langchain/langgraph-supervisor` 提供多 Agent 编排能力
4. **持久化状态**：支持检查点（checkpoint），Agent 执行状态可持久化和恢复

## 后果

### 正面
- Agent 工作流定义清晰，可维护性强
- 多 Agent 编排（Researcher/Quant/Compliance）开箱即用
- 社区活跃，问题可快速找到解决方案

### 负面
- LangGraph.js 版本迭代快，API 不稳定（v0.x → v1.x 有破坏性变更）
- 调试体验不如自研状态机直观
- LangChain 生态依赖较重

### 风险缓解
- 封装 LangGraph 调用，业务代码不直接依赖 LangGraph API
- Agent 执行日志（AgentLog 表）记录完整步骤，辅助调试