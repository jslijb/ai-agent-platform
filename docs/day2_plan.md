# Day 2 计划：百炼模型接入 + Agent 工具 + ReAct Agent + API 路由

---

## 第一步：配置阿里百炼模型调用

在 `/app/server/llm/providers/bailian.ts` 中，实现阿里百炼的 LLM 调用函数。

**要求**：
- 使用 OpenAI SDK 兼容模式（`baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1`）
- 阿里百炼的 key 需要可配置，yaml 文件中配置，key 为 python 的变量，value 为环境变量。模型名称也这样设计
- 导出函数 `callBailian(messages, model='qwen-max')`，返回完整的响应内容
- 添加错误处理和超时重试（可选）

生成完整的 TypeScript 代码。

---

## 第二步：开发 Tools

参考 [agent_tools.md](./agent_tools.md) 中定义的金融行业 AI Agent 工具全景，开发对应的 MCP 工具。

---

## 第三步：创建 LangGraph ReAct Agent

在 `/app/server/agents/simpleAgent.ts` 中，使用 LangGraph.js 创建一个 ReAct Agent。

**要求**：
- 使用上一步的 calculator 工具
- 使用阿里百炼模型（从 `bailian.ts` 导入 `callBailian`）
- 实现标准的 ReAct 循环：思考 -> 行动 -> 观察，直到不需要工具
- 导出 `async function runAgent(query: string): Promise<string>`
- 添加日志输出每一步的思考过程

生成完整的代码。

---

## 第四步：创建 API 路由

在 `/app/api/agent/run/route.ts` 中，创建一个 POST 接口。

**要求**：
- 接收 JSON body: `{ query: string }`
- 调用 simpleAgent 的 `runAgent` 函数
- 返回 JSON: `{ answer: string, success: boolean }`
- 处理错误，返回 500

生成完整代码。

---

## 第五步：环境变量配置

将 `.env.local` 改成 yaml 格式，key 为应用程序变量，value 为用户环境变量。
