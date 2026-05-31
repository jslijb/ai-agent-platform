# 移除主模型/备用模型概念 Spec

## Why
项目已实现自动模型切换（额度用完自动降级到下一个模型），`BAILIAN_MODEL` 作为"主模型"的概念已过时。当前降级链逻辑中 `BAILIAN_MODEL` 被硬编码为首选模型，与 `api_keys.yaml` 的 `models` 列表功能重叠，增加了维护成本和配置混乱。应统一由 `models` 列表驱动模型选择和降级。

## What Changes
- 从 `.env.local` 中移除 `BAILIAN_MODEL` 环境变量
- 从 `config/api_keys.yaml` 的 `llm.bailian` 节点中移除 `BAILIAN_MODEL` 键
- 重写 `bailian.ts` 的 `resolveModel()`，改为从调用方传入模型 ID（不再自行解析）
- 重写 `router.ts` 的 `getModelChain()`，完全从 `api_keys.yaml` 的 `models` 列表构建降级链，列表顺序即优先级顺序
- 修改 `simpleAgent.ts` 中的兜底默认值，从 `models` 列表取第一个模型
- 修改 `models/route.ts` 中的默认模型标识，从 `models` 列表取第一个模型
- 更新 `test-llm-router.ts` 中的诊断日志

## Impact
- Affected specs: LLM 路由与降级系统
- Affected code:
  - `.env.local` — 移除 `BAILIAN_MODEL`
  - `config/api_keys.yaml` — 移除 `llm.bailian.BAILIAN_MODEL`
  - `src/server/llm/providers/bailian.ts` — 重写 `resolveModel()`
  - `src/server/llm/router.ts` — 重写 `getModelChain()`
  - `src/server/agents/simpleAgent.ts` — 替换兜底默认值
  - `src/app/api/agent/models/route.ts` — 替换默认模型标识
  - `tests/tools/test-llm-router.ts` — 更新诊断日志

## ADDED Requirements

### Requirement: 模型降级链由 models 列表驱动
LLM 路由系统 SHALL 完全从 `api_keys.yaml` 的 `llm.models` 列表构建降级链，列表顺序即调用优先级，第一个模型为默认模型。

#### Scenario: 降级链构建
- **WHEN** `api_keys.yaml` 中 `llm.models` 列表为 `[qwen3.6-max-preview, qwen3.6-35b-a3b, deepseek-v4-pro]`
- **THEN** 降级链为 `["qwen3.6-max-preview", "qwen3.6-35b-a3b", "deepseek-v4-pro"]`

#### Scenario: 默认模型确定
- **WHEN** 前端或 API 需要确定默认模型
- **THEN** 取 `models` 列表的第一个模型的 `id` 作为默认模型

#### Scenario: models 列表为空
- **WHEN** `api_keys.yaml` 中 `llm.models` 列表为空或不存在
- **THEN** 降级链为空，调用 LLM 时抛出明确错误："api_keys.yaml 中 llm.models 列表为空，请配置至少一个模型"

### Requirement: bailian provider 接受外部传入的模型 ID
bailian.ts SHALL 不再自行解析模型 ID，而是由调用方（router）传入要使用的模型 ID。

#### Scenario: router 指定模型调用
- **WHEN** router 决定使用 `qwen3.6-35b-a3b` 模型
- **THEN** 调用 bailian provider 时传入 `model="qwen3.6-35b-a3b"`

#### Scenario: 未指定模型 ID
- **WHEN** 调用 bailian provider 时未传入 model 参数
- **THEN** 从 `api_keys.yaml` 的 `models` 列表取第一个模型 ID

## MODIFIED Requirements

### Requirement: 移除 BAILIAN_MODEL 环境变量
系统 SHALL 不再依赖 `BAILIAN_MODEL` 环境变量确定主模型。所有模型选择逻辑由 `api_keys.yaml` 的 `models` 列表驱动。

## REMOVED Requirements

### Requirement: BAILIAN_MODEL 作为主模型
**Reason**: 已被 models 列表驱动的自动降级机制取代
**Migration**: 将 `.env.local` 中的 `BAILIAN_MODEL=qwen3.6-35b-a3b` 删除，确保 `api_keys.yaml` 的 `models` 列表中包含该模型即可
