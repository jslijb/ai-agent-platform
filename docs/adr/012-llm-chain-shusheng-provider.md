# ADR-012: LLM 降级链新增书生开放平台（shusheng）备用 Provider

日期：2026-10-05
状态：已采纳（用户 2026-10-05 提供书生配置并指示接入）

## 背景

R030 LLM 降级链（spec §二 禁止擅改清单项）原构成为：商汤 sensenova（链首 transient）→ 阿里百炼 10 模型（主力）→ AGNES agnes-3.0-flash（兜底）。实践暴露两个脆弱点：

1. 2026-10-05 AGNES API 连接故障期间，L3 专项评测的 judge 四指标全灭（RAGAS_JUDGE_CHAIN=agnes 单链无后备）；
2. 百炼每模型 1M token 额度在批量任务（图谱重建/全量评测）下消耗快，额度全灭后仅剩单点 AGNES。

## 决策

用户提供的书生开放平台（上海AI实验室 InternAI）配置接入为备用 provider：

- 接口：OpenAI 兼容，`https://discovery-api.intern-ai.org.cn/v1`
- 鉴权：环境变量 `SHUSHENG_KEY`（兼容 `SHUSHENG_TOKEN`）
- 限流：rpm=30、单 key 并发 5
- 额度：墨点双窗口（每 5h 10 点 + 每 7 天 50 点，1 墨点≈5000w token），7 模型共享
- 模型与链内顺序（省墨点优先）：deepseek-v4-flash-0731 → deepseek-v4-flash-vision → qwen3.8-27b → kimi-k2.6 → minimax-m3 → glm-5.3 → deepseek-v4-pro-0813

**链位置**：百炼之后、AGNES 之前（AGNES 保持最后兜底）。评测链（ragas_evaluation.py）同步：sensenova → 百炼 → 书生 → AGNES；新增 `RAGAS_JUDGE_CHAIN=shusheng` 锁定模式。

**降级语义不变**：链内循环降级，一个模型不可用（403/429/超时/空内容）自动换下一个，可用的不切换。

## 实测验证（2026-10-05）

| 项 | 结果 |
|---|---|
| GET /v1/models | 200，10 模型在线 |
| 7 模型逐一 chat 实测 | 全部 200 可用（0.66s~46.9s，deepseek-v4-flash-0731 首次冷启动 46.9s） |
| callShusheng 直连 | glm-5.3 正常应答 |
| 真实链路（熔断百炼+AGNES 全部） | 自动走到 shusheng/deepseek-v4-flash-0731 ✓ |
| 书生内循环（前两个书生模型熔断） | 自动换 qwen3.8-27b ✓ |
| 评测判分链 | 38 provider（sensenova 1 + 百炼 30 + 书生 6 + AGNES 1），判分调用成功 |

## 注意事项

- deepseek-v4-flash-0731 为 reasoning 模型：短 max_tokens 调用可能只产出 reasoning_content 而无 content（生产调用不设 max_tokens，无影响）；provider 对空内容按失败处理，自动降级。
- 生产路由的 `LLM_MODEL_CHAIN` 环境变量覆盖只支持 agnes/dashscope 前缀映射，书生模型无法经该覆盖强制指定（仅影响调试手段，不影响配置链）。
- 熔断器状态在 Next.js 长驻进程写 Redis 持久化；短生命周期 tsx 进程在 Redis 连接建立前 forceOpen 仅落内存（本次测试验证，无生产副作用）。

## 影响

- `src/server/llm/providers/shusheng.ts`（新增）、`src/server/llm/router.ts`（getCallFunction + case）、`config/api_keys.yaml`（llm.models 插入 7 模型 + SHUSHENG_KEY/BASE_URL 配置键）
- `scripts/ragas_evaluation.py`（评测判分链新增书生段 + shusheng 锁定模式）、`tests/unit/test-llm-fallback-r030j.py`（链构成断言更新）
