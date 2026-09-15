# 踩坑记录：2026-09-02 R030 V16 统一评测器

## 坑1：AGNES 评估中途配额 403（质量层中断）

- **现象**：全量 55 条评测跑到 12 条后，AGNES agnes-2.5-flash 返回 403，DashScope 5模型×3key 也全部 403（免费配额耗尽），43 条质量分全 0
- **根因**：评估 LLM 通道全部依赖免费配额，无付费兜底；单轮评测一次需要 ~220 次 LLM 调用（55条×4指标）
- **修复**：checkpoint 已保存 12 条完整结果，配额恢复后重跑同命令自动续传：
  `python scripts/unified_evaluation.py --input tests/reports/evaluation/ragas-eval-data-v13-r6.json --output tests/reports/evaluation/ragas-report-v16-selfimpl-r1.json`
- **预防**：评测前先小批量（--limit 2）验证配额可用；judge 锁定机制已确保中途换模型时报告标记 `judge_degraded=true`，分数不静默混用

## 坑2：GT 中"年份"被数值提取污染（NA 指标）

- **现象**：`numerical_accuracy("约4529.30亿元","中国能建2025年营业收入约为4529.30亿元")` 返回 0 分
- **根因**：GT 中 "2025年" 的 2025 被提取为数值，贪心配对时抢占了 answer 的唯一数值，真实数值反而"无配对"
- **修复**：extract_numbers 排除 1900~2100 整数紧随"年"的年份；排除日期片段（`数字-数字` 前后顾规则，如 2025-12-31）
- **教训**：金融文本数值提取必须处理中文单位（亿/万/千）、千分位、百分比、年份、日期五类边界

## 坑3：旧采集数据 SQL 路由检索延迟恒为 0

- **现象**：ragas-eval-data-v13-r6.json 中 90.9% 的条目 retrievalLatencyMs=0，延迟分解失真
- **根因**：collect-rag-data.ts 中 R001 SQL 命中路径硬编码 `retrievalLatencyMs = 0`
- **修复**：R030-a 已改为记录 `Date.now() - r001Start`（路由识别+SQL查询+格式化耗时）；下次采集生效，旧数据无法修复（报告中以 retrieval_coverage=9.1% 暴露）

## 坑4：V13 口径"正确拒绝四指标满分"是 Goodhart 风险

- L9 类 10 条 canAnswer=false 拒答直接得 CP/CR/F/AR=1.0，抬高综合分约 0.09
- V16 报告强制披露该规则及 SQL 格式化占比（90.9%）等迎合指标，不静默

## 坑5：Windows PowerShell 多行 python -c 直接报错

- `python -c "多行字符串"` 在 PowerShell 中报"只应将 ScriptBlock 指定为 Command 参数值"
- **修复**：写临时 py 脚本执行，用完删除

## 坑6：V13 综合分 0.9153 被高估，V16 修正为 0.8386

- **现象**：V13-r6 综合 0.9153（达标）→ V16 同数据 55 条综合 **0.8386**（-0.0767）
- **根因**（三处高估）：
  1. **NA 数值精度口径过宽**：V13 误差<5% 即满分，V16 收紧为 <0.1%→1/<1%→0.5/≥1%→0，新增 NA 维度 0.5545 直接拉低综合
  2. **L9 拒答四指标满分**（坑4）抬高约 0.09
  3. **judge 单一商汤宽松**：V16 改为商汤软跳过→AGNES 接管，AGNES 判定更严格
- **修复**：V16 报告强制披露 Goodhart 风险 + judge 降级标记 + NA 维度独立呈现
- **教训**：评估口径变更必须用同数据回测，否则"达标"是口径幻觉

## 坑7：商汤 response_format 不兼容（探活通过但评测调用 400）

- **现象**：商汤 `https://token.sensenova.cn/v1` 探活成功（普通对话 OK），但评测调用时 `response_format={"type":"json_object"}` 返回 400
- **根因**：商汤 SenseNova-5 不支持 OpenAI 风格的 response_format 参数
- **临时修复**：transient 软跳过 → AGNES 接管 JSON 模式
- **后续优化（已完成 2026-09-02）**：LLMProvider 新增 `supports_json_mode` 属性，商汤设为 False，调用时不传 response_format 改为在 user prompt 末尾追加 JSON 约束提示
- **教训**：LLM 探活只验最小能力，不等于业务参数全兼容；探活脚本应覆盖 response_format/stream/工具调用三类能力

## 坑8：全链超时雪崩（16 provider × 重试 × 120s = 5760s+）

- **现象**：单次评测理论最大等待 5760s+（1.6 小时），实际跑到 12 条就因配额耗尽中断
- **根因**：16 个 provider 全部串行尝试，每个 MAX_RETRIES+1 次，每次 LLM_TIMEOUT=120s
- **修复**：R030-j 分级策略——商汤 transient 软跳过不拉黑（全链耗尽后循环重试≤2圈），AGNES/百炼 403 永久拉黑（不再重试）
- **预防**：评测前必须跑探活脚本确认通道可用性；配额型 provider（商汤积分/百炼免费）不作为唯一 judge
- **教训**：免费 LLM 配额是"一次性消耗品"，不能作为评测基线的稳定依赖

## 发现：NA 指标能反向暴露 GT 数据错误

L1-002 中国铁建营收：GT=10.3亿元（错误），answer=1.03万亿元（正确），AGNES 也判出"严重逻辑错误"。NA=0 的条目要人工区分"答错"还是"GT错"——这正是 R013 数据治理的活证据。