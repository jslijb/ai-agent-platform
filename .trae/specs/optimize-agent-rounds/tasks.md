# Tasks

- [x] Task 1: 修改 parseToolCall 支持解析多个工具调用
  - [x] SubTask 1.1: 将 parseToolCall 返回类型从单个工具改为数组 `parseToolCalls`，返回 `{ name, params }[]`
  - [x] SubTask 1.2: 遍历 LLM 响应中所有 ```json``` 代码块，逐个解析工具调用
  - [x] SubTask 1.3: 保留原 `parseToolCall` 作为内部辅助函数，新增 `parseToolCalls` 作为对外接口
  - [x] SubTask 1.4: 验证：单个工具调用仍正常工作，多个工具调用都能被解析

- [x] Task 2: 修改 Agent 主循环支持同一轮执行多个工具
  - [x] SubTask 2.1: 将 `const toolCall = parseToolCall(...)` 改为 `const toolCalls = parseToolCalls(...)`
  - [x] SubTask 2.2: 当 toolCalls.length > 0 时，按顺序执行所有工具，收集所有工具结果
  - [x] SubTask 2.3: 将多个工具结果合并为一条 observation 消息推入 messages
  - [x] SubTask 2.4: 每个工具调用都通过 pushStep 记录步骤和耗时
  - [x] SubTask 2.5: 当 toolCalls.length === 0 时，走原有的反思/答案逻辑（不变）

- [x] Task 3: 修改 system prompt 引导 LLM 同时输出多个工具调用
  - [x] SubTask 3.1: 修改技术指标计算流程说明，引导 LLM 在一次响应中同时输出 getStockHistory + 计算工具
  - [x] SubTask 3.2: 添加示例格式，展示如何在一次响应中输出两个工具调用

- [x] Task 4: 编译检查和功能测试
  - [x] SubTask 4.1: 运行 `npx tsc --noEmit` 确保无类型错误
  - [x] SubTask 4.2: 运行 `npx tsx scripts/prefetch-data.ts` 预获取数据
  - [x] SubTask 4.3: 运行 `npx tsx scripts/test-21-tools.ts` 测试 21 个 query
  - [x] SubTask 4.4: 验证原来 3 轮的技术指标查询是否降为 2 轮

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1 (prompt 需要和解析能力匹配)
- Task 4 depends on Task 1, 2, 3
