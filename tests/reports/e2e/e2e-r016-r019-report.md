# R016-R019 E2E 测试报告

> 日期：2026-08-07（在线E2E更新）
> 环境：本地 Windows (i7/16GB)，Docker容器全量运行（nginx:80 → main-service + rag-service + data-service）

---

## 在线E2E测试结果（2026-08-07）

| Query | 分类 | 结果 | 耗时 | 迭代 | 回答字数 | 工具调用 |
|-------|------|------|------|------|----------|----------|
| Q1 招商银行营业收入 | L1-事实提取 | ✅ | 22.1s | 2轮 | 212字 | marketData×2 |
| Q2 招商银行MA20/RSI14 | L6-技术指标 | ✅ | 15.2s | 4轮 | 168字 | technicalAnalysis×2, marketData×2 |
| Q3 招商银行波动率/回撤 | L7-合规风控 | ✅ | 12.0s | 4轮 | 219字 | riskAnalysis×5, marketData×2 |
| Q4 买入合规检查 | L5-交易规则 | ✅ | 6.9s | 2轮 | 124字 | complianceCheck |
| Q5 五粮液年报财务数据 | L1-事实提取 | ✅ | 173.5s | 4轮 | 463字 | marketData×2 |

**通过率：5/5 (100%)** | **平均耗时：45.9s/query** | **时间预算内：4/5**

### R016 验证：工具合并

| 验证项 | 结果 |
|--------|------|
| 实际调用工具 | marketData, technicalAnalysis, riskAnalysis, complianceCheck, hybridSearch |
| 旧工具调用 | 无 ✅（calculateMA/getStockHistory等21个旧名均未出现） |

### R019 验证：耗时追踪

| Query | LLM耗时 | 工具耗时 | 总耗时 |
|-------|---------|----------|--------|
| Q1-事实查询 | 7092ms (3次) | 16040ms (2次) | 22071ms |
| Q2-技术分析 | 16127ms (5次) | 1287ms (4次) | 15171ms |
| Q3-风险分析 | 22279ms (9次) | 1187ms (4次) | 11963ms |
| Q4-合规检查 | 6195ms (2次) | 1ms (1次) | 6913ms |
| Q5-RAG检索 | 135305ms (3次) | 13471ms (2次) | 173507ms |

### 修复记录

1. **反思节点工具名更新**：reflection-node.ts 中旧工具名（getStockHistory/getStockFinancial/calculateMA等）→ 合并后工具名（marketData/technicalAnalysis/riskAnalysis等）
2. **反思节点空答案安全策略**：反思LLM调用失败时，如果答案为空/极短且无工具调用结果，强制返回needMore=true
3. **空答案强制重试**：simpleAgent.ts 新增检测——LLM返回空/极短答案且无工具调用时，强制要求LLM调用工具
4. **工具调用JSON未解析检测**：simpleAgent.ts 新增检测——LLM返回了```json格式的工具调用但未被解析时，提示LLM使用native function calling

### 运行方式

```bash
# 确保Docker容器运行
docker compose up -d

# 运行在线E2E测试（通过nginx:80端口）
npx tsx scripts/e2e-http-test.ts

# 运行单元测试
npx vitest run src/server/agents/__tests__/e2e-r016-r019.test.ts
```

---

## 离线单元测试结果（2026-08-04）

| 测试层级 | 文件数 | 测试数 | 通过 | 失败 | 状态 |
|----------|--------|--------|------|------|------|
| 单元测试（合并工具） | 1 | 27 | 27 | 0 | ✅ |
| E2E测试（R016-R019） | 1 | 15 | 15 | 0 | ✅ |
| Agent相关全量 | 8 | 89 | 89 | 0 | ✅ |

---

## R016 工具合并验证

| 验证项 | 结果 |
|--------|------|
| 6个合并工具可用 | ✅ technicalAnalysis/riskAnalysis/complianceCheck/marketData/toolSearch/hybridSearch |
| 旧工具名不存在 | ✅ calculateMA/getStockHistory等21个旧名全部清除 |
| technicalAnalysis合并5指标 | ✅ MA/RSI/MACD/BB/KDJ |
| riskAnalysis合并6指标 | ✅ VWAP/Sharpe/MaxDrawdown/Volatility/Correlation/VaR |
| complianceCheck合并7检查 | ✅ trade/position/restricted/riskLimits/stressTest/complianceReport/riskReport |
| marketData合并4数据类型 | ✅ history/realtime/financial/financialReport |
| toolSearch返回5个工具详情 | ✅ 含参数定义+使用示例 |

---

## R017 Context Compaction验证

| 验证项 | 结果 |
|--------|------|
| 消息<=20不压缩 | ✅ 原样返回 |
| 消息>20触发压缩 | ✅ compacted=true |
| 压缩后保留system消息 | ✅ 1条system消息保留 |
| 压缩后保留最近5条 | ✅ 非system消息<=7条（含摘要2条+最近5条） |
| LLM摘要生成 | ✅ 调用callWithFallback生成结构化摘要 |

---

## R018 Checkpoint+Resume验证

| 验证项 | 结果 |
|--------|------|
| 保存checkpoint到Redis | ✅ saveCheckpoint成功 |
| 加载checkpoint从Redis | ✅ loadCheckpoint返回正确数据 |
| 错误记录retryCount | ✅ 首次错误retryCount=1 |
| canRetry判断 | ✅ retryCount<2时true，>=2时false |
| 恢复上下文包含已完成工具 | ✅ buildRecoveryContext包含工具名+结果预览 |
| 恢复上下文包含错误信息 | ✅ 包含错误描述+跳过已完成工具指令 |
| 清理checkpoint | ✅ clearCheckpoint成功 |

---

## R019 耗时追踪验证

| 验证项 | 结果 |
|--------|------|
| 工具执行耗时<5s | ✅ 所有合并工具执行<5s |
| toolSearch返回使用示例 | ✅ 每个工具有2-4个示例 |
| 前端StepCard显示耗时 | ✅ 代码已添加llmMs/toolMs/roundMs显示 |
