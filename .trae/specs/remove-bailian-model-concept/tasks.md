# Tasks

- [x] Task 1: 移除 BAILIAN_MODEL 配置项
  - [x] SubTask 1.1: 从 `.env.local` 中删除 `BAILIAN_MODEL=qwen3.6-35b-a3b` 行
  - [x] SubTask 1.2: 从 `config/api_keys.yaml` 的 `llm.bailian` 节点中删除 `BAILIAN_MODEL: BAILIAN_MODEL` 行
- [x] Task 2: 重写 `bailian.ts` 的模型解析逻辑
  - [x] SubTask 2.1: 修改 `resolveModel()` 函数，改为从 `api_keys.yaml` 的 `models` 列表取第一个模型 ID，不再依赖 `BAILIAN_MODEL` 环境变量
  - [x] SubTask 2.2: 确保 `callBailianAPI` 等函数支持外部传入 model 参数
- [x] Task 3: 重写 `router.ts` 的降级链构建逻辑
  - [x] SubTask 3.1: 修改 `getModelChain()` 函数，完全从 `api_keys.yaml` 的 `models` 列表构建降级链
  - [x] SubTask 3.2: 移除对 `process.env.BAILIAN_MODEL` 的引用
  - [x] SubTask 3.3: 更新错误提示信息，引导用户配置 `api_keys.yaml` 的 `models` 列表
- [x] Task 4: 修改 `simpleAgent.ts` 中的兜底默认值
  - [x] SubTask 4.1: 将 `process.env.BAILIAN_MODEL` 替换为从 `models` 列表取第一个模型 ID
- [x] Task 5: 修改 `models/route.ts` 中的默认模型标识
  - [x] SubTask 5.1: 将 `process.env.BAILIAN_MODEL` 替换为从 `models` 列表取第一个模型 ID
- [x] Task 6: 更新测试文件
  - [x] SubTask 6.1: 更新 `tests/tools/test-llm-router.ts` 中的诊断日志，移除 `BAILIAN_MODEL` 引用
- [x] Task 7: 验证测试
  - [x] SubTask 7.1: 启动 Next.js 服务，确认无编译错误
  - [x] SubTask 7.2: 调用 Agent API，确认模型选择和降级链正常工作
  - [x] SubTask 7.3: 确认前端模型选择下拉框默认选中第一个模型

# Task Dependencies
- [Task 2] 依赖 [Task 1]（配置项移除后才能验证代码不依赖 BAILIAN_MODEL）
- [Task 3] 依赖 [Task 2]（router 依赖 bailian provider 的模型解析逻辑）
- [Task 4] 和 [Task 5] 可并行执行
- [Task 7] 依赖 [Task 1-6] 全部完成
