# Tasks

- [x] Task 1: 修改 api_keys.yaml 结构 — 将 tushare/tickflow 提升为顶层节点 + 修正 context/description 值
  - [x] SubTask 1.1: 将 `market_data.tushare` 提升为顶层 `tushare` 节点
  - [x] SubTask 1.2: 将 `market_data.tickflow` 提升为顶层 `tickflow` 节点
  - [x] SubTask 1.3: 修正 models 列表中 context 字段值（qwen3.6-max-preview: 1M→256K, qwen3.6-35b-a3b: 256k→262K, qwen3.7-max-preview: 100M→1M, 其他1M的保持不变）
  - [x] SubTask 1.4: 修正 models 列表中 description 描述（去除"1000万上下文"等错误描述，替换为准确的模型定位）
- [x] Task 2: 修改 Python 端 `_resolve_env_values` — 只对全大写+下划线格式字符串做环境变量替换
  - [x] SubTask 2.1: 添加 `^[A-Z][A-Z0-9_]*$` 正则判断
  - [x] SubTask 2.2: 不符合格式的字符串保留原值
  - [x] SubTask 2.3: 添加 Python 端 `get_raw_config` / `get_raw_value` 函数（与 TS 端 `getRawSection` 对齐）
- [x] Task 3: 修改 TypeScript 端 `resolveEnvVars` — 采用与 Python 端一致的智能解析策略
  - [x] SubTask 3.1: 添加全大写+下划线格式判断
  - [x] SubTask 3.2: 不符合格式的字符串保留原值
- [x] Task 4: 修改 `bailian.ts` — 改用 config 模块读取配置
  - [x] SubTask 4.1: 将 `process.env.DASHSCOPE_API_KEY` 改为 `getConfigValue("llm", "DASHSCOPE_API_KEY")`
  - [x] SubTask 4.2: 将 `process.env.BAILIAN_MODEL` 改为 `getConfigValue("llm", "BAILIAN_MODEL")`
- [x] Task 5: 验证测试
  - [x] SubTask 5.1: 验证 tushare/tickflow 配置路径修复后可正确读取
  - [x] SubTask 5.2: 验证 models 列表的 context/description 等字面量字符串不再被错误解析
  - [x] SubTask 5.3: 验证 bailian.ts 通过 config 模块正确读取 API Key
  - [x] SubTask 5.4: 验证前端模型选择下拉框中 context 值显示正确

# Task Dependencies
- [Task 2] 和 [Task 3] 可并行执行
- [Task 4] 依赖 [Task 3]（需要 config 模块的 resolveEnvVars 修复后才能正确读取 llm section）
- [Task 5] 依赖 [Task 1-4] 全部完成
