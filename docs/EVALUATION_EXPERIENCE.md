# RAG 评估迭代经验总结（V1-V13）

> 本文档总结 V1-V13 评估迭代过程中的好的经验与踩坑经验，为 V14 及后续迭代提供参考。所有经验均来自实际评估数据，非虚构。

---

## 一、迭代历程概览

| 版本 | 综合得分 | 核心变化 | 状态 |
|------|---------|---------|------|
| V1-V10 | 0.6911 | 自研评估器（Jaccard 相似度） | 未达标 |
| V11 | — | 修复评估器、补全知识库、对齐检索管线 | 未达标 |
| V12 | 0.5679 | 切换 RAGAS 思想自实现，LLM-as-Judge | 未达标 |
| V13 | 0.7804 | 评估管线与生产管线对齐（rerank+graph+topK=20） | 差 0.04 达标 |

---

## 二、好的经验（V12→V13 提升 +0.21 的关键）

### 经验 1：评估管线必须与生产管线对齐

**问题**：V12 评估时未启用生产环境的 rerank、graph、parentDoc 等增强能力，导致评估结果失真。

**解决**：V13 重写 [collect-rag-data.ts](../scripts/collect-rag-data.ts)，复刻生产 API 的完整检索流程：
- hybridSearch(topK=20) → graphSearch → 分离精排(doc top5, graph top3)
- 截断传给 reranker 的文档文本至 300 字符（避免 token 超限）

**收益**：Answer Relevancy 从 0.4892 → 0.8192（+0.33），Context Precision 从 0.2953 → 0.6555（+0.36）。

**教训**：评估数据收集脚本必须与生产 API 使用完全相同的检索管线，否则评估结果无法反映系统真实性能。

### 经验 2：RAGAS 思想自实现优于依赖第三方库

**问题**：RAGAS 0.4.3 与 langchain-community 1.x 不兼容，降级 langchain 会破坏主系统。

**解决**：基于 RAGAS 论文思想自实现 [ragas_evaluation.py](../scripts/ragas_evaluation.py)，4 大核心指标（CP/CR/F/AR）全部用 LLM-as-Judge 实现，不依赖 ragas/langchain 库。

**收益**：
- 不影响主系统框架版本
- 可自定义评估 prompt（如增加"不得用自身训练截止时间否定片段"约束）
- 可自定义降级链（与主系统一致）

**教训**：使用第三方框架的"思想"而非"代码"，避免依赖冲突。

### 经验 3：LLM-as-Judge 需要明确约束

**问题**：AGNES 用自身训练截止时间判断 2025 年数据"不存在"，把正确答案判为虚构。

**解决**：在评估 prompt 中增加明确约束：
```
【重要约束】
1. 必须以提供的检索片段为准，不得用自身训练截止时间否定片段中的事实
2. 片段中出现的数值、年份、财务数据（包括 2025 年数据）均视为真实
3. 只关注片段与问题的语义相关性，不基于自身知识判断片段内容真假
```

**收益**：消除了 LLM 因知识截止时间导致的误判。

**教训**：LLM-as-Judge 的 prompt 必须明确约束 LLM 不得用自身知识否定被评估内容。

### 经验 4：拒绝回答场景需走满分逻辑

**问题**：canAnswer=false 时，系统正确拒绝回答，但 CR/F/AR 走满分而 CP 按实际检索打分（通常=0），导致 4 个指标评价标准不一致。

**解决**（V14 待实施）：canAnswer=false 且系统正确拒绝时，4 个指标统一走满分。

**教训**：RAGAS 评估的是端到端回答能力，不是检索器单独能力。检索器的库外识别能力应单独评估。

### 经验 5：分类评估比整体评估更有诊断价值

**问题**：整体得分无法定位是哪类问题差。

**解决**：V13 报告按 L1-L9 九大分类输出分类统计，可精确定位：
- L6 技术指标：CP=0.99, CR=0.99（接近满分）
- L2 跨文档对比：CR=0.13（最差）
- L8/L9：CP=0.1-0.15（评估逻辑问题）

**教训**：评估报告必须包含分类统计，否则无法定位问题。

### 经验 6：知识库补全对评估指标提升明显

**问题**：知识库只有公司年报，没有交易规则/技术指标类文档，qa-golden.json 有 25 条这类问题全部必然检索失败。

**解决**：生成交易规则、技术指标等知识文档，通过 [upload-knowledge-docs-direct.ts](../scripts/upload-knowledge-docs-direct.ts) 上传到 RAG 系统。

**收益**：L5 交易规则 CP=0.80, CR=0.69；L6 技术指标 CP=0.99, CR=0.99。

**教训**：知识库覆盖度是 RAG 系统的基础，评估前必须确保知识库覆盖测试集的所有可回答问题。

---

## 三、踩坑经验

### 坑 1：LLM Provider 额度耗尽导致评估全 0

**现象**：V13 早期 MD 报告所有指标都是 0.0000，耗时仅 50.5 秒（正常应 3000+ 秒）。

**根因**：AGNES 服务器不可达 + 百炼 API key 额度耗尽，所有 LLM provider 均不可用，评估脚本对每条 query 都返回 0 分。

**解决**：
1. 配置多 provider 降级链（AGNES → 百炼）
2. 评估脚本增加 provider 可用性预检，全不可用时提前报错而非静默返回 0
3. 监控评估耗时，异常短耗时（<100秒）告警

**教训**：评估脚本必须处理 LLM 不可用的情况，不能静默返回 0 分。

### 坑 2：AGNES 服务器不可达（非网络问题）

**现象**：`Test-NetConnection` 返回 False，curl 返回 HTTP_CODE:000。

**根因**：AGNES 原服务器（apihub.agnes-ai.com）不可达。

**解决**：AGNES 已启用国内镜像节点 `https://api.agnes-ai.cn/v1`，模型升级为 `agnes-flash-2.5`。

**教训**：第三方 LLM 服务可能随时变更，需要配置降级链 + 监控服务可用性。

### 坑 3：百炼平台 Token Plan 与旧版 API 不兼容

**现象**：旧 key（sk-开头）用新工作空间 URL 报 `Workspace endpoint access denied`。

**根因**：百炼新版 Token Plan 要求：
- key 必须以 `sk-sp-` 开头
- Base URL 必须用工作空间专属 URL（`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`）
- 旧 key 无法用于新 URL

**解决**：申请新版 Token Plan key，配置到环境变量 `DASHSCOPE_API_KEY2`。

**教训**：云服务商 API 升级时，旧 key 和旧 URL 可能不兼容，需要同步更新。

### 坑 4：reranker token 限制

**现象**：调用 reranker 服务时出现 "input (558 tokens) is too large" 错误。

**根因**：BGE-Reranker 限制 query+doc ≤ 512 tokens，长文档片段超出限制。

**解决**：将传给 reranker 的文档文本截断到 300 字符。

**教训**：使用 reranker 时必须注意 token 限制，对输入文本做截断处理。

### 坑 5：环境变量设置后当前进程读不到

**现象**：用户设置了 `DASHSCOPE_API_KEY2` 环境变量，但 Python 脚本读不到。

**根因**：Windows 用 `setx` 设置环境变量只对新启动的进程生效，当前 shell 和 IDE 进程读不到。

**解决**：重启 Trae IDE（或新开 PowerShell 窗口）让进程重新加载环境变量。

**教训**：Windows 环境变量设置后必须重启相关进程，否则读不到。

### 坑 6：评估数据收集脚本未对齐生产管线

**现象**：V12 评估分数异常低（CP=0.29, CR=0.39），但实际系统表现没那么差。

**根因**：collect-rag-data.ts 未启用 rerank、graph、parentDoc 等生产环境的增强能力，评估数据不代表真实系统性能。

**解决**：V13 重写 collect-rag-data.ts，复刻生产 API 的完整检索流程。

**教训**：评估数据收集脚本必须与生产 API 使用完全相同的检索管线。

### 坑 7：LLM 降级逻辑失效

**现象**：AGNES 超时后无法切换到百炼，整个评估卡死。

**根因**：原 `for` 循环在重试耗尽后无法正确切换到备用 provider。

**解决**：将 `for` 循环改为 `while` 循环，确保在 provider 不可用时能持续选择下一个 provider。

**教训**：降级链逻辑需要用 while 循环，确保能持续尝试下一个 provider。

### 坑 8：AGNES 用训练截止时间否定正确答案

**现象**：AGNES 判断 2025 年年报数据"不存在"，把正确答案判为虚构，导致 Faithfulness 极低。

**根因**：LLM-as-Judge 用自身训练截止时间否定被评估内容。

**解决**：在评估 prompt 中增加明确约束，禁止 LLM 用自身知识否定片段内容。

**教训**：LLM-as-Judge 的 prompt 必须明确约束 LLM 的判断范围。

### 坑 9：PDF 表格切片丢失数值

**现象**：L1-事实提取 CR=0.4667，检索到了相关片段但片段中不含具体数值。

**根因**：年报 PDF 的财务数据表格在切片时，"营业收入"标签和"4529.30亿元"数值被分到不同 chunk。

**解决**（V14 规划）：优化表格切片策略，保证表格行完整性；或改用 SQL 查询结构化数据。

**教训**：表格切片必须保证行完整性，标签和数值不能分离。

### 坑 10：跨公司检索污染

**现象**：L2 跨文档对比 CR=0.1333，一次检索难以召回多家公司的数据。

**根因**：检索没有按公司名过滤，一次查询返回多家公司的混合数据。

**解决**（V14 规划）：metadata 公司名过滤 + query decomposition。

**教训**：跨公司对比类问题需要按公司名分别检索后合并。

### 坑 14：LLM fallback 降级链不切换（同 name 不同 model 被误判耗尽）

**现象**：百炼配置了 5 个 qwen-plus 版本（2025-07-14/04-28/01-25/09-11/latest），第一个 403 额度耗尽后，不切换到下一个，直接降级到 AGNES，导致评估全 0。用户反复强调 100 遍仍未修复。

**根因**：`LLMCaller._select_provider()` 和 `exhausted.add()` 用 `provider.name` 作唯一标识。5 个百炼模型的 name 都是 "dashscope"，一个 403 → name="dashscope" 加入 exhausted → `_select_provider` 跳过所有 name="dashscope" 的 provider → 5 个百炼模型全被跳过。

**解决**：改用 `f"{provider.name}/{provider.model}"` 作唯一标识。`_select_provider` 判断、3 处 `exhausted.add`、`self.current` 切换判断全部改为 model 维度。

**验证**：2026-07-30 smoke test，qwen-plus-2025-07-14 → 04-28 → 01-25 成功切换，L1-001/002/003 综合 0.95 PASS。

**教训**：
1. 降级链的唯一标识必须细化到 model 级别，不能只用 provider.name
2. 同一 provider 的多个 model 版本是独立额度，一个耗尽不影响其他
3. 用户反复强调的问题必须优先修复，不能忽视

---

## 四、V13 分类指标详情（基线数据）

| 分类 | 样本数 | CP | CR | F | AR | 诊断 |
|------|--------|----|----|---|----|------|
| L1-事实提取 | 30 | 0.7607 | 0.4667 | 0.9889 | 0.9800 | 表格切片丢失数值 |
| L2-跨文档对比 | 15 | 0.5274 | 0.1333 | 1.0000 | 0.3733 | 跨公司检索污染 |
| L3-计算推理 | 15 | 0.6356 | 0.3000 | 0.9778 | 0.6533 | 多数值检索不完整 |
| L4-趋势分析 | 10 | 0.8250 | 0.4500 | 0.9500 | 0.9000 | 同比/环比数据缺失 |
| L5-交易规则 | 15 | 0.8025 | 0.6889 | 0.9667 | 0.8800 | ✅ 接近达标 |
| L6-技术指标 | 15 | 0.9856 | 0.9867 | 0.9905 | 0.9867 | ✅ 接近满分 |
| L7-合规风控 | 10 | 0.7349 | 0.4500 | 0.9840 | 0.5500 | 合规答案相关性差 |
| L8-对抗性 | 10 | 0.1533 | 0.8000 | 0.9321 | 0.9400 | CP 评估逻辑问题 |
| L9-无法回答 | 10 | 0.1000 | 0.9000 | 0.9750 | 0.9800 | CP 评估逻辑问题 |

---

## 五、V14 优化方向

### P0：评估逻辑修复（零风险）

1. **canAnswer=false 正确拒绝时 CP 走满分**：与 CR/F/AR 保持一致
   - 预期 CP 从 0.6555 → 0.77+（L8/L9 共 20 条样本 CP 从 0.1/0.15 → 1.0）

### P0：结构化数据查询（高收益）

2. **L1/L2/L3 数值类问题改用 SQL 查询**：
   - 建立 financial_metrics 表，从年报提取财务数据
   - 用 Text-to-SQL 或意图识别路由处理数值查询
   - 预期 L1 CR 0.47→0.95+, L2 CR 0.13→0.90+, L3 CR 0.30→0.85+

### P1：检索层优化

3. **metadata 公司名过滤**：根治跨公司污染
4. **表格切片优化**：保证表格行完整性

### P1：生成层优化

5. **Prompt 区分"本公司数据"与"他公司数据"**

---

## 五-B、V13-r3 经验（R001 上线，2026-07-31）

### 背景
R001 财务数据落 PostgreSQL 双轨制上线后，重跑 L1/L3/L4 共 55 条评估。

### 结果

| 分类 | V13-r2 CR | V13-r3 CR | 变化 | F | AR |
|------|-----------|-----------|------|------|------|
| L1-事实提取 | 0.4667 | 0.6667 | +0.20 ✅ | 0.9889 | 0.8267 |
| L3-计算推理 | 0.3000 | 0.4222 | +0.12 ✅ | 1.0000 | 0.8000 |
| L4-趋势分析 | 0.4500 | 0.4000 | -0.05 ⚠️ | 1.0000 | 0.8800 |

综合 0.7699，未达 0.82。

### 好的经验

1. **R001 路由层工作正常**：SQL 命中率 90.9%（55 条中 50 条命中 SQL），路由层端到端测试 PASS
2. **F=0.99~1.0 满分**：LLM 完全忠实于 SQL context，不编造数据
3. **L1/L3 CR 提升**：相比 V13-r2，L1 +0.20，L3 +0.12，证明 SQL 精确查询路径有效
4. **collect-rag-data.ts 集成 R001**：评估脚本支持 --categories 过滤，命中 SQL 时跳过向量检索

### 踩坑经验

1. **PostgreSQL 数据质量是 CR 达标的硬阻塞**：
   - 中国能建：financial_income 全字段 null（回填失败）
   - 中国铁建：revenue="49.0"（PDF 提取字段映射错误，应为 10297.84 亿）
   - 江苏银行：revenue=null（银行业特殊格式）
   - 中国人保：标准化指标提取失败（保险行业格式）
   - 教训：spec 阶段2.3 "8 家三表完整" 判断有误，需逐字段校验数值合理性

2. **SQL JSON context 对 CP 评估不友好**：
   - L3 CP=0.1333 极低，因为 CP 评估的是"检索片段排序质量"
   - SQL 返回的是 JSON 格式，LLM-as-Judge 倾向判定为"不相关片段"
   - 优化方向：把 SQL JSON 转成自然语言描述（如"中国能建2025年毛利率为12.2%"）

3. **LLM 对 null 值的拒绝回答**：
   - SQL 返回 revenue=null 时，LLM 回答"数据为空"
   - 评估器判定为"错误拒绝"（canAnswer=true 但拒绝回答），CR=0
   - 优化方向：null 值时 fallback 到向量检索或 raw_tables

4. **数值关键词覆盖不全**：
   - "新签合同额"最初不在 NUMERIC_KEYWORDS，导致 L1-030 intent 误判为 non_numeric
   - 修复：补充"新签合同"到 NUMERIC_KEYWORDS（覆盖"新签合同额/新签合同/新签订单"）

### 下一步优化方向

1. **P0 修复数据质量**：重新提取中国能建/中国铁建/江苏银行/中国人保的财务数据，人工校验字段映射
2. **P1 优化 context 格式**：SQL JSON → 自然语言描述，提升 CP
3. **P1 null 值 fallback**：SQL 返回 null 时降级到向量检索或 raw_tables

---

## 六、关键文件索引

| 文件 | 用途 |
|------|------|
| [scripts/ragas_evaluation.py](../scripts/ragas_evaluation.py) | RAGAS 评估脚本（Python） |
| [scripts/collect-rag-data.ts](../scripts/collect-rag-data.ts) | 评估数据收集脚本（对齐生产管线） |
| [scripts/qa-golden.json](../scripts/qa-golden.json) | 测试集（130 条，L1-L9 九大分类） |
| [scripts/ragas_report_to_md.py](../scripts/ragas_report_to_md.py) | JSON 报告转 MD 工具 |
| [tests/reports/evaluation/ragas-report-v13.json](../tests/reports/evaluation/ragas-report-v13.json) | V13 评估报告（JSON） |
| [tests/reports/evaluation/ragas-eval-data-v13.json](../tests/reports/evaluation/ragas-eval-data-v13.json) | V13 评估数据（含检索结果） |
| [config/api_keys.yaml](../config/api_keys.yaml) | LLM 模型配置 |
| [docs/优化迭代规划.md](优化迭代规划.md) | 优化迭代规划 |
