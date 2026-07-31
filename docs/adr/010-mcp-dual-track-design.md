# ADR-010: MCP 工具协议双轨设计

## 状态：已采纳（2026-06）

## 背景

项目存在两套工具系统：SimpleAgent 内联 21 个工具和 MCP 硬编码 6 个工具。两套系统各自为政，工具重叠，维护困难。

## 决策

采用 MCP + ToolRegistry 双轨设计：内部用 ToolRegistry 高性能调用，外部用 MCP SSE 标准化暴露。

## 理由

1. **统一注册表**：ToolRegistry 统一管理 21+ 金融工具，消除双系统重叠
2. **内部高性能**：ToolRegistry 进程内直接调用，无序列化/反序列化开销
3. **外部标准化**：MCP SSE 端点遵循 MCP 协议标准，外部客户端（如 Claude Desktop）可直接连接
4. **工具描述增强**：`when_to_use` / `when_not_to_use` / `example_calls` + few-shot 注入，提升 LLM 工具选择准确率

## 后果

### 正面
- 工具管理统一，新增工具只需在 ToolRegistry 注册
- 外部客户端可通过 MCP 协议接入
- 工具选择准确率提升

### 负面
- 双轨维护成本（ToolRegistry 定义 + MCP Schema 定义）
- MCP SSE 连接管理增加复杂度

### 风险缓解
- 工具定义以 ToolRegistry 为单一数据源，MCP Schema 从 ToolRegistry 自动生成
- MCP SSE 端点独立部署，故障不影响内部工具调用