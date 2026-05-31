# 修复 api\_keys.yaml 配置结构问题 Spec

## Why

api\_keys.yaml 中 `tushare`/`tickflow` 嵌套在 `market_data` 下，但代码用顶层 section 名访问，导致永远找不到配置；`_resolve_env_values` 将所有字符串当环境变量名，models 列表的字面量字符串字段会被解析为 None/空串；Python/TS 两端环境变量未找到时行为不一致；`context` 字段值与模型实际上下文窗口不匹配；`description` 描述与模型实际能力不符。

## What Changes

* 将 `tushare` 和 `tickflow` 从 `market_data` 下提升为顶层节点，与代码 `get_value("tushare", ...)` / `get_value("tickflow", ...)` 的调用方式一致

* 修改 Python 端 `_resolve_env_values`，只对符合全大写+下划线格式的字符串做环境变量替换，其他字符串保留原值

* 修改 TypeScript 端 `resolveEnvVars`，采用与 Python 端一致的策略

* 统一 Python/TS 两端环境变量未找到时的行为：保留原始字符串值而非返回 None/空串

* 修正 `context` 字段值，使其准确反映模型实际上下文窗口大小

* 修正 `description` 描述，使其准确反映模型实际能力定位

* 修正 `bailian.ts`，使其通过 config 模块读取配置而非直接访问 `process.env`

## Impact

* Affected specs: 配置加载系统

* Affected code:

  * `config/api_keys.yaml` — 结构调整 + context/description 修正

  * `data_service/config.py` — `_resolve_env_values` 逻辑修改

  * `src/server/lib/config.ts` — `resolveEnvVars` 逻辑修改

  * `src/server/llm/providers/bailian.ts` — 改用 config 模块

## ADDED Requirements

### Requirement: 智能环境变量解析

配置系统 SHALL 只对符合全大写+下划线格式（正则 `^[A-Z][A-Z0-9_]*$`）的字符串值做环境变量替换，其他字符串保留原值。

#### Scenario: 全大写字符串视为环境变量引用

* **WHEN** 配置值为 `"DASHSCOPE_API_KEY"`（全大写+下划线）

* **THEN** 系统从 `os.environ` / `process.env` 查找对应环境变量并替换

#### Scenario: 非全大写字符串保留原值

* **WHEN** 配置值为 `"1M"` 或 `"qwen3.6-max-preview"` 或 `"能力与成本均衡"`

* **THEN** 系统保留原始字符串值，不做环境变量查找

#### Scenario: 环境变量未找到时保留占位符

* **WHEN** 配置值为 `"TUSHARE_TOKEN"`（符合全大写格式）但环境变量中不存在

* **THEN** Python 端返回 `None`，TypeScript 端返回空字符串 `""`（保持各自现有行为，仅对符合格式的字符串生效）

### Requirement: 配置结构与代码访问路径一致

YAML 配置的层级结构 SHALL 与代码中的 `get_value(section, key)` 调用路径一致。

#### Scenario: tushare 配置可被正确读取

* **WHEN** 代码调用 `get_value("tushare", "TUSHARE_TOKEN")`

* **THEN** 能正确获取到 tushare 的 API Token 值

#### Scenario: tickflow 配置可被正确读取

* **WHEN** 代码调用 `get_value("tickflow", "TICKFLOW_API_KEY")`

* **THEN** 能正确获取到 tickflow 的 API Key 值

### Requirement: context 字段值准确

models 列表中每个模型的 `context` 字段 SHALL 准确反映模型的实际上下文窗口大小，统一使用大写 K/M 后缀格式。

#### Scenario: context 值与模型实际规格一致

* **WHEN** 模型实际上下文窗口为 262,144 tokens

* **THEN** context 字段值应为 `"262K"`（而非 `"1M"` 或 `"256k"`）

#### Scenario: context 值格式统一

* **WHEN** 多个模型使用相同量级的上下文窗口

* **THEN** 使用统一的格式（大写 K/M 后缀，如 `"262K"`、`"1M"`）

### Requirement: description 描述准确

models 列表中每个模型的 `description` SHALL 准确反映模型的实际能力定位，不得包含错误信息。

#### Scenario: description 与模型实际能力一致

* **WHEN** 模型为 qwen3.6-max-preview（闭源旗舰，256K上下文，支持思考+工具调用）

* **THEN** description 应描述为"闭源旗舰，256K上下文，思考模式+工具调用"而非"100万上下文"

## MODIFIED Requirements

### Requirement: bailian.ts 配置读取方式

bailian.ts SHALL 通过 config 模块的 `getConfigValue("llm", "DASHSCOPE_API_KEY")` 读取配置，而非直接访问 `process.env.DASHSCOPE_API_KEY`。

## REMOVED Requirements

（无）

***

## 附录：各模型实际上下文窗口与能力核实

基于官方文档和第三方评测，各模型的准确参数如下：

| 模型ID                    | 上下文窗口 | thinking | functionCalling | 准确 description            |
| ----------------------- | ----- | -------- | --------------- | ------------------------- |
| qwen3.6-max-preview     | 256K  | true     | true            | 闭源旗舰，256K上下文，思考模式+工具调用    |
| qwen3.6-35b-a3b         | 262K  | true     | true            | 开源MoE旗舰，262K上下文，思考模式+工具调用 |
| deepseek-v4-pro         | 1M    | true     | true            | 深度求索旗舰，1M上下文，思考模式+工具调用    |
| qwen3.7-max-2026-05-17  | 1M    | false    | false           | 闭源旗舰，1M上下文，Agent工作流基座     |
| qwen3.7-max-preview     | 1M    | false    | false           | 闭源旗舰，1M上下文，Agent工作流基座     |
| qwen3.7-max-2026-05-20  | 1M    | false    | false           | 闭源旗舰，1M上下文，Agent工作流基座     |
| qwen3.6-27b             | 262K  | false    | false           | 开源稠密模型，262K上下文，旗舰级编程能力    |
| kimi-k2.6               | 256K  | false    | false           | 月之暗面旗舰，256K上下文，智能体编程      |
| qwen3.5-plus-2026-04-20 | 1M    | false    | false           | 千问3.5 Plus，1M上下文，生产级API模型 |
| qwen3.6-plus-2026-04-02 | 1M    | false    | false           | 千问3.6 Plus，1M上下文，生产级API模型 |

