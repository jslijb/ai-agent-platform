# 项目状态卡（PROJECT_STATE）

> 本文件是项目单一入口。任何任务开始前必读本文件，5分钟内恢复全局认知。
> 最后更新：2026-08-03

---

## A. 当前基线表（每轮评估后必须更新）

| 版本 | 日期 | 评估器 | 综合 | CP | CR | F | AR | 达标 | 报告路径 |
|------|------|--------|------|------|------|------|------|------|---------|
| V12 | 2026-07-27 | 自实现 | 0.5679 | 0.2953 | 0.3929 | 0.9449 | 0.4892 | ❌ | tests/reports/evaluation/ragas-report-v12.json |
| V13 | 2026-07-28 | 自实现 | 0.7804 | 0.6555 | ~0.50 | ~0.97 | 0.8192 | ❌差0.04 | ⚠️JSON报告已丢失(现v13.json是失败轮0分)，需重跑补档 |
| V13-r2 | 2026-07-28 | 自实现 | 0.8238 | - | - | - | - | ✅达标 | tests/reports/evaluation/ragas-eval-data-v13-r2-baseline.json |
| V13-r3 | 2026-07-31 | 自实现 | 0.7699 | 0.5636 | 0.5515 | 0.9939 | 0.8291 | ❌ | tests/reports/evaluation/ragas-report-v13-selfimpl-r3.json |
| V13-r4 | 2026-08-01 | 自实现 | **0.8688** | 0.7273 | 0.7242 | 0.9939 | 0.9345 | ✅综合达标 | tests/reports/evaluation/ragas-report-v13-selfimpl-r4.json |
| V13-r5 | 2026-08-01 | 自实现(qwen3.5) | **0.9009** | 1.0000 | 0.6697 | 0.9773 | 0.9127 | ✅综合达标 | tests/reports/evaluation/ragas-report-v13-selfimpl-r5.json |
| V13-r6 | 2026-08-02 | 自实现(agnes-2.5-flash) | **0.9153** | 0.9455 | 0.7045 | 1.0000 | 0.9509 | ✅综合达标 | tests/reports/evaluation/ragas-report-v13-selfimpl-r6.json |
| V14 | 2026-07-30 | 官方库 | 0.3205 | 0.0 | 0.3333 | 0.5 | 0.0 | ❌ | tests/reports/evaluation/ragas-report-v14-official.json |
| V16 | 2026-09-02 | 自实现V16(商汤软跳过→AGNES judge) | **0.8386** | 0.8545 | 0.6727 | 0.9791 | 0.9318 | ✅综合达标 | tests/reports/evaluation/ragas-report-v16-selfimpl-r1.json（NA=0.5545新增；E2E P95=81.3s；SR=1.0；较V13-r6 -0.0767，V13被高估） |
| V17（未完成） | 2026-09-18 | ~~自实现V17~~ **误用V12老评测器** | ~~0.9183~~ **作废** | 0.9455 | 0.6788 | 1.0000 | 0.9782 | ⚠️口径不可比 | tests/reports/evaluation/ragas-report-v17-selfimpl-r1.json（**误用 ragas_evaluation.py（V12脚本、无NA、权重0.2/0.2/0.3/0.3），与V16的unified_evaluation.py口径不同→综合分虚高，结论作废**；图谱重建对本轮55条贡献≈0，因R001 SQL路由100%命中短路整条检索管线） |
| V17（正确口径） | 2026-09-18 | 自实现V17-unified（复用V16评测器） | **0.8578** | 0.9455 | 0.6364 | 0.9955 | 0.9700 | ✅综合达标（CR/NA/E2E-P95 未过） | tests/reports/evaluation/ragas-report-v17-unified-r1.json（NA=0.5000；E2E P95=9.72s；SR=1.0；较 V16 同口径 **+0.0192**） |
| V17-agnes（判分对照） | 2026-09-29 | 同上，judge 锁定 AGNES | **0.8609** | 0.9818 | 0.6318 | 1.0000 | 0.9527 | ✅综合达标 | tests/reports/evaluation/ragas-report-v17-agnes-r1.json（同输入 judge 敏感性对照：Δ vs sensenova 仅 +0.0031；judge × 136 唯一） |
| V18 | 2026-09-30 | 重采55条（P0单位修复后）+ unified + AGNES judge | **0.8716** | 0.9636 | **0.7303** | 1.0000 | 0.8973 | ✅综合达标（NA 0.5848 未过 0.65 线、E2E-P95 未过） | tests/reports/evaluation/ragas-report-v18-unified-r1.json（NA=0.5848 较 V17-agnes +0.0848，缺口=L3 GT口径14条/人保OCR残差4条/字段漏抽3条；CR +0.098 兑现；P95=8.30s 仍 R033 范围；逐条对账见 financial-metric-unit-mismatch.md §九） |
| V18-full | 2026-09-30 | **全量130条首测**（R032，9类全覆盖） | 0.7844 | 0.8448 | 0.6279 | 0.9861 | 0.7546 | ⚠️首测基线（L5~L9 不设门禁；综合未过 0.82 属预期） | tests/reports/evaluation/ragas-report-v18-unified-full-r1.json（**L2 崩：CR=0.033/AR=0.08，R001 单实体短路跨文档对比无解 → R003 实现的直接证据**；L5 CR=0.784/NA=0.643、L6 CR=0.927/NA=0.712 超预期；L7 弱 CR=0.225（投研/合规语料缺））；E2E mean 19.6s（向量路径 26~33s 检索，P95 51s）；SR=1.0 |
| V18-full-r2 | 2026-10-02 | R003+R013 GT修正+NA结论值口径后重评 | **0.8591** | 0.8450 | **0.7833** | 0.9711 | **0.8712** | ✅综合达标（55条子集 NA=0.6545 过 R031 线） | tests/reports/evaluation/ragas-report-v18-unified-full-r2.json（**L2 复活：CR 0.033→1.000 / AR 0.080→0.987 / NA 0.200→0.767（R003 并行检索）**；L1 NA 0.883、L5 NA 0.917、L6 NA 0.833（GT修正+结论值口径）；L3 NA 0.167 仍最低（计算题另有真错）；L7 CR=0.340（合规语料缺，待补）；E2E mean 19.4s（TTFT 采集已上线，V19 起按新双指标口径） |

**达标线**：CP/CR/AR ≥ 0.8，F ≥ 0.85，综合 ≥ 0.82
**当前状态**：**V18 = 0.8716（PASS，历史正确口径新高）**。R031 收益验证完成：P0 单位修复兑现 CR +0.098、NA +0.085，10 条单位错样本 5 条完全恢复、4 条受人保 OCR 残差限制（R035）、2 条受 L3 GT 口径限制；NA 0.5848 未过 R031 验收线 0.65，缺口全部归属已立案事项（R035 + L3 GT 治理 + 字段补抽）。仍卡：NA（0.5848）、E2E-P95（8.30s→R033）。逐条对账见 `financial-metric-unit-mismatch.md` §九。

**同口径逐项对账（V16-unified vs V17-unified，脚本/权重/阈值/judge 全同）**：

| 指标 | 阈值 | V16 | V17 | Δ |
|---|---|---|---|---|
| CP | 0.80 | 0.8545 | 0.9455 | +0.0910 |
| CR | 0.80 | 0.6727 | 0.6364 | −0.0363 |
| F | 0.85 | 0.9791 | 0.9955 | +0.0164 |
| AR | 0.80 | 0.9318 | 0.9700 | +0.0382 |
| NA | 0.85 | 0.5545 | 0.5000 | −0.0545 |
| 综合 | 0.82 | 0.8386 | 0.8578 | **+0.0192** |
| E2E P95 ms | 5000 | 81334.8 | 9722.9 | −71611.9（改善 8.4×） |

**根因（三条已核实，非推测）**：
1. **图谱贡献 = 0**：V17 采集 55/55 全部命中 R001 SQL 路由，`sql_formatted_ratio=1.0`，每题上下文集只有 1 个片段且全部是「【SQL精确查询结果】」文本块 → 向量检索、rerank、图谱检索整条链路被短路，知识图谱 v2 重建未进入任何一条上下文。（V16 侧该比例为 0.9091，有 5 条走向量检索。）
2. **输入已重采，非复用**：V16 报告的 input_path 是 `ragas-eval-data-v13-r6.json`（旧采集），V17 是 `ragas-eval-data-v17.json`（新采集）。全量逐条比对：question/ground_truth/canAnswer/category 55/55 相同，**answer 与 contexts 55/55 全部不同**（V17 补齐了每股收益/毛利率/净利率，删掉两行公式提示，答案改为「加粗数值 + 来源标注」写法）。故 Δ+0.0192 是真实系统差异（含重采与格式化覆盖率 0.9091→1.0），不含图谱。
3. **NA 是产品级硬伤，不是口径问题**：综合 NA=0.5000，其中 L3-计算推理（15 条）NA 仅 **0.0667**（15 条里 1 条对）。SQL 路径对计算类问题返回的数值基本是错的。
4. **延迟根因**：E2E mean 4986.9ms 中生成占 4967.5ms（99.6%），检索仅 19.3ms。要过 5s 门禁只能优化生成侧（流式首字/更小模型），检索侧已无优化空间。

### 评测集与评测口径对照（2026-09-19 核实）

**黄金集真实条数 = 130 条 / 9 类**（`scripts/qa-golden.json`，L1:30 L2:15 L3:15 L4:10 L5:15 L6:15 L7:10 L8:10 L9:10）。
文档里流传的「103 条 / 8 类」是 commit `a7dfbca`（feat(qa-golden): 重写黄金测试集，130条 query 覆盖9类金融场景）**重写前的旧版**，已更正 `docs/archive/project-profile.md`。
各版本实际用的样本：

| 版本 | 样本 | 说明 |
|---|---|---|
| V12 / V13 / V13-r2 | 130 条（全量 9 类） | 黄金集原样 |
| V13-r4 / V13-r6 / V16 / V17 | **55 条子集**（L1:30 + L3:15 + L4:10） | 只留了走得到 SQL 数值路径的三类 |

**两把尺子的字段对照**（同一批数据换尺子，分数差 0.0605）：

| 项 | ragas_evaluation.py（V12 老脚本） | unified_evaluation.py（V16 起，正确口径） |
|---|---|---|
| 报告 version | `V12-RAGAS-SelfImpl` | `V16-unified-selfimpl-r1` |
| 权重 | CP .20 / CR .20 / **F .30 / AR .30** | CP .20 / CR .20 / **F .25 / AR .25 / NA .10** |
| 维度数 | 4（无 NA） | 5（含 NA 数值精度） |
| NA 分级 | 无 | 相对误差 **<0.1%→1.0 / <1%→0.5 / ≥1%→0.0** |
| NA 门禁 | 无 | **0.85**（比 CP/CR/AR 的 0.80 更严） |
| 性能门禁 | 无 | E2E P95 ≤ 5000ms、成功率 ≥ 0.95 |
| 判分模型 | 本次实跑 `dashscope/qwen3.8-flash` | `sensenova/sensenova-6.8-flash-lite`（degraded） |

**0.9183（错口径）→ 0.8578（正确口径）= −0.0605 的分步拆解**（输入完全相同：两份报告都吃 `ragas-eval-data-v17.json`，该文件 09-18 14:11:50 写定后再未改动，两轮分别于 15:12 / 次日 00:17 开跑）：

| 步骤 | 变动 | 贡献 |
|---|---|---|
| 1 | F 权重 0.30→0.25 | −0.05000 |
| 2 | AR 权重 0.30→0.25 | −0.04891 |
| 3 | 新增 NA 维度 0.10 × 0.5000 | +0.05000 |
| 4 | CR 值 0.6788→0.6364（judge 换模型） | −0.00848 |
| 5 | F 值 1.0000→0.9955 | −0.00112 |
| 6 | AR 值 0.9782→0.9700 | −0.00205 |
| | **合计** | **−0.06056**（与实测 −0.06050 差 6e-5，为报告保留 4 位小数的舍入） |

归因：**纯口径改动 −0.0489**（刻度）+ **judge/数据差异 −0.0117**。其中 1+2 是把 F/AR 各挪 0.05 给 NA 的零和搬迁（−0.0989），3 是新增一维满额权重（+0.05）——若 NA 满分，综合分会回到 0.9077。

**judge 逐条分歧（同一份输入，55 条）**：CP 0/55 完全一致、CR 9/55、F 1/55、AR 10/55。AR 的分歧全部是 qwen3.8-flash 给 1.0、sensenova 给 0.85~0.95 → **qwen3.8-flash 判分更宽松**。

> **评估体系说明 + V17 不达标归因 + 指标耦合 + judge 敏感性 → 见 [evaluation-system-and-findings.md](evaluation-system-and-findings.md)**（2026-09-19）
> 要点：CP/CR/F/AR 四项全靠 LLM judge，NA/SR/延迟为纯规则；V17 三项 FAIL（CR 0.6364 / NA 0.5000 / E2E P95 9.72s）已逐条定位根因；spec 要求全量 130 条但实际只跑 55 条，L2/L5~L9 共 75 条从未测过。

### V13 分类指标详情（基线数据，来自 reference/evaluation-experience.md）

| 分类 | 样本 | CP | CR | F | AR | 诊断 |
|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.7607 | 0.4667 | 0.9889 | 0.9800 | 表格切片丢失数值 |
| L2-跨文档对比 | 15 | 0.5274 | 0.1333 | 1.0000 | 0.3733 | 跨公司检索污染 |
| L3-计算推理 | 15 | 0.6356 | 0.3000 | 0.9778 | 0.6533 | 多数值检索不完整 |
| L4-趋势分析 | 10 | 0.8250 | 0.4500 | 0.9500 | 0.9000 | 同比/环比数据缺失 |
| L5-交易规则 | 15 | 0.8025 | 0.6889 | 0.9667 | 0.8800 | ✅接近达标 |
| L6-技术指标 | 15 | 0.9856 | 0.9867 | 0.9905 | 0.9867 | ✅接近满分 |
| L7-合规风控 | 10 | 0.7349 | 0.4500 | 0.9840 | 0.5500 | 合规答案相关性差 |
| L8-对抗性 | 10 | 0.1533 | 0.8000 | 0.9321 | 0.9400 | CP评估逻辑问题 |
| L9-无法回答 | 10 | 0.1000 | 0.9000 | 0.9750 | 0.9800 | CP评估逻辑问题 |

### V13-r4 分类指标详情（数据质量修复后，2026-08-01，仅 L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r3 综合 | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.9333 | 0.9333 | 1.0000 | 0.9600 | +0.18 ✅ | 全指标达标，数据质量修复生效 |
| L3-计算推理 | 15 | 0.1333 | 0.4889 | 0.9778 | 0.8400 | +0.02 | CP 低：SQL JSON context 格式 LLM 判定不相关 |
| L4-趋势分析 | 10 | 1.0000 | 0.4500 | 1.0000 | 1.0000 | +0.15 ✅ | CR 低：同比数据格式问题，CP/AR 满分 |

**V13-r4 关键结论**：
- **综合 0.8688 首次达标（≥0.82）**，较 V13-r3 提升 +0.0989
- L1 全指标达标（CP=CR=0.93, F=1.0, AR=0.96）：数据质量修复（华海药业/中国能建/中国铁建/江苏银行）直接带动 CR 从 0.67→0.93
- F=0.9939（满分）：LLM 完全忠实于 SQL context
- CP/CR 单指标未达标根因：L3 CP=0.1333 极低（SQL JSON context 格式对 CP 评估不友好）
- L4 CR=0.45：同比数据格式问题（revenue_yoy 字段格式）
- 中国人保数据已通过OCR fallback提取（R014完成）：revenue=669,044M, net_profit=63,033M, total_assets=1,766,384M

### V13-r5 分类指标详情（qwen3.5 模型评估，2026-08-01，L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r4 综合 | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 1.0000 | 0.9167 | 0.9667 | 0.9600 | +0.03 ✅ | CP 满分，CR/F/AR 微降（qwen3.5 更严格） |
| L3-计算推理 | 15 | 1.0000 | 0.4555 | 0.9833 | 0.7800 | +0.02 | CP 满分（r4=0.13→r5=1.0），CR 仍低（SQL JSON context） |
| L4-趋势分析 | 10 | 1.0000 | 0.2500 | 1.0000 | 0.9700 | -0.01 | CR 下降（r4=0.45→r5=0.25），CP/AR 高分 |

**V13-r5 关键结论**：
- **综合 0.9009 达标（≥0.82）**，较 V13-r4 提升 +0.0321
- **CP 满分（1.0）**：qwen3.5-122b-a10b 对所有检索片段判定为相关（r4=0.7273→r5=1.0）
- CR 下降（0.7242→0.6697）：qwen3.5 对 ground_truth 覆盖判定更严格，L4 CR 从 0.45→0.25
- F 微降（0.9939→0.9773）：受 L1-005 解析错误影响（qwen3.5 偶发返回字符串列表，已修复）
- AR 微降（0.9345→0.9127）：L3 AR 从 0.84→0.78（qwen3.5 对计算推理答案相关性判定更严格）
- **LLM 降级链**：qwen3.5-plus（超时）→ qwen3.5-flash（403）→ qwen3.5-397b-a17b（超时）→ qwen3.5-plus-2026-02-15（超时）→ **qwen3.5-122b-a10b（实际使用）**
- 评估耗时 8753 秒（约 2.4 小时），qwen3.5 响应慢于旧 qwen-plus（~120s/项 vs ~15s/项）

### V13-r6 分类指标详情（SQL 结果自然语言格式化 + AGNES 模型，2026-08-02，L1/L3/L4 55 条）

| 分类 | 样本 | CP | CR | F | AR | vs V13-r5 综合 | 诊断 |
|------|------|------|------|------|------|------|------|
| L1-事实提取 | 30 | 0.9333 | 0.8000 | 1.0000 | 0.9767 | +0.01 ✅ | CR 从 0.9167→0.80（AGNES 更严格），F 满分 |
| L3-计算推理 | 15 | 0.9333 | 0.5833 | 1.0000 | 0.8933 | +0.05 ✅ | CR 从 0.4555→0.5833（SQL 格式化生效），F 满分 |
| L4-趋势分析 | 10 | 1.0000 | 0.6000 | 1.0000 | 0.9600 | +0.08 ✅ | CR 从 0.25→0.60（同比数据格式化生效），CP/F 满分 |

**V13-r6 关键结论**：
- **综合 0.9153 达标（≥0.82）**，较 V13-r5 提升 +0.0144，历史最高
- **核心优化**：SQL 结果自然语言格式化器（sql-result-formatter.ts），将 JSON 格式转为中文自然语言
  - 字段名中文映射（revenue→营业收入、netProfit→净利润等）
  - 货币单位自动检测与转换（元/千元/万元→亿元）
  - 同比字段百分比转换（0.15→增长15.0%）
  - 计算型指标提示（ROE=净利润/净资产×100%）
- **ROE 查询修复**：query-router.ts 联查 financial_income + financial_balancesheet，提供净利润和净资产原始数据
- **3/4 指标达标**：CP=0.9455(✅), F=1.0(✅满分), AR=0.9509(✅)，CR=0.7045(❌差0.0955)
- **L3 CR 大幅提升**：0.4555→0.5833（+28%），SQL 格式化使 LLM 能理解计算型 context
- **L4 CR 大幅提升**：0.25→0.60（+140%），同比数据自然语言格式化覆盖 GT 关键信息
- **CR 未达标根因**：L3-006/015（ROE 查询 CR=0）、L4-002/004/006/009（部分同比 CR=0），GT 与 context 数据源不一致
- **评估模型**：agnes-2.5-flash（AGNES API），DashScope 配额全部耗尽仅 AGNES 可用
- **并发锁机制**：新增 acquire_lock/release_lock 防止多进程同时运行覆盖结果
- **断点续传**：checkpoint 机制确保 LLM 失败后可恢复，本次 0 条失败项
- 评估耗时 863 秒（约 14.4 分钟），AGNES 响应快（~20s/项）

---

## B. 当前评估器与关键约束（禁止擅改，改前审批）

| 项 | 当前配置 | 状态 |
|----|---------|------|
| 主评估路径 | V13 自实现（scripts/ragas_evaluation.py） | ✅可用 |
| 待评估 | V14 官方库（scripts/ragas_official_evaluation.py） | ⚠️embedding违规待修 |
| embedding 模型 | bge-m3 本地服务（llama.cpp，端口8011，POST /embedding） | 🔒禁止擅改 |
| reranker 模型 | bge-reranker-v2-m3 | 🔒禁止擅改 |
| LLM 降级链 | AGNES(agnes-2.5-flash) → 百炼(qwen3.5-plus/flash/397b-a17b/plus-2026-02-15/122b-a10b) | 🔒禁止擅改 |
| 评估器选型 | 自实现 vs 官方库 | 🔒禁止擅改 |
| DB schema | - | 🔒禁止擅改 |
| docker-compose | - | 🔒禁止擅改 |

---

## C. 文档导航索引（按任务类型读对应文档）

> 文档体系已升级为三层（spec/design/task）+ 版本化 + 归档机制。详见 [3-standards/spec.md](3-standards/spec.md) 第六章。

| 任务类型 | 必读文档 |
|---------|---------|
| 任务启动 | 本文件 → [3-standards/spec.md](3-standards/spec.md) → [1-requirements-bugs/REQUIREMENTS.md](1-requirements-bugs/REQUIREMENTS.md) → [versions/v13/spec.md](versions/v13/spec.md) |
| 做评估 | [checklists/evaluation-checklist.md](checklists/evaluation-checklist.md) + 本文件基线表 + [reference/evaluation-experience.md](reference/evaluation-experience.md) |
| 改代码 | [checklists/code-change-gates.md](checklists/code-change-gates.md) + [FUNCTIONS.md](FUNCTIONS.md) |
| 新增功能 | [checklists/change-archive-checklist.md](checklists/change-archive-checklist.md)（5步闭环） |
| 改架构 | [adr/](adr/) + [3-standards/design.md](3-standards/design.md) |
| 查规则 | [3-standards/spec.md](3-standards/spec.md)（全局约束） |
| 查踩坑 | [pitfalls/](pitfalls/) |
| 查需求 | [1-requirements-bugs/REQUIREMENTS.md](1-requirements-bugs/REQUIREMENTS.md) |
| 查历史快照 | [archive/](archive/) |

---

## D. 最近迭代摘要

- **知识图谱 v2 全量重建（2026-09-18）**：修复图谱模块 4 个 bug（三入口仍调 v1 抽取、deleteGraph 不兼容类型化边、数值尾实体建节点、检索未过滤 Amount），单测 39/39 过。52 篇文档按 v2 全量重建：3223 节点 / 5006 条类型化关系（数值垃圾实体清零、公司归一化）。重建吞吐优化：8 并发打同一模型被 DashScope 限流（单段 5min→30min）→ 6 worker 分模型绑链（LLM_MODEL_CHAIN 进程级覆盖，router.ts）+ 段长 1500→3000 + AGNES 补位器，20h 压缩到 2h。环境修复：bge-m3 GGUF 空壳→硬链接 OllmOne 实体文件。
- **V17 评估首轮口径事故（2026-09-18，结论作废）**：误用 V12 老评测器 `ragas_evaluation.py`（无 NA 维度、权重 0.2/0.2/0.3/0.3）评 V17，得综合 0.9183 并误报"历史新高"；V16 用的是 `unified_evaluation.py`（含 NA=0.10、SR、三维延迟、Goodhart 披露、judge 锁定）。**口径放松而非从严**，两版不可比。李工质询后复核出关键事实：① 55/55 条全部命中 R001 SQL 路由，`collect-rag-data.ts:334-378` 命中即 `contexts=[sqlContext]` 短路整条检索管线 → 向量/图谱/rerank 一次未跑，**图谱重建对本轮分数贡献≈0**；② V17 上下文与 V16 所用 V13-r6 数据几乎逐字相同（输入未变）；③ judge 由 sensenova-6.8-flash-lite 漂移到 qwen3.8-flash。同口径估算约 0.875（+0.036 而非 +0.0797）。**教训：评估前必须先确认评测器版本与权重口径，"用新版本评一版"要指明用哪个评测器。** 正确口径重跑已启动。
- **R030 V16 统一评测器上线（2026-09-02）**：自研评测方法论 V1.0 落地。新增 `scripts/unified_evaluation.py`（质量CP/CR/F/AR复用 + NA数值精度收紧至0.1%/1% + 三维延迟P50/P90/P95 + SR成功率 + Goodhart风险披露 + judge锁定/降级检测 + skip-llm模式），40个单测全绿。性能全量结论（55条）：E2E mean=40.0s/P95=81.3s（生成占93%，检索覆盖率仅9.1%因旧采集SQL路由0值，R030-a已修采集端）；NA=0.5545（L1=0.667/L3=0.30/L4=0.60，收紧口径+GT错误暴露）；SR=1.0。质量层因 AGNES 12/55 后配额403中断（DashScope 3key全403），checkpoint 已存，配额恢复后重跑同命令续传。发现：NA 可反向暴露 GT 数据错误（L1-002 中国铁建营收 GT=10.3亿元错误，答案1.03万亿正确）。
- **R030 V16 统一评测器上线（2026-09-02）**：自研评测方法论 V1.0 落地。新增 `scripts/unified_evaluation.py`（质量CP/CR/F/AR复用 + NA数值精度收紧至0.1%/1% + 三维延迟P50/P90/P95 + SR成功率 + Goodhart风险披露 + judge锁定/降级检测 + skip-llm模式），40个单测全绿。性能全量结论（55条）：E2E mean=40.0s/P95=81.3s（生成占93%，检索覆盖率仅9.1%因旧采集SQL路由0值，R030-a已修采集端）；NA=0.5545（L1=0.667/L3=0.30/L4=0.60，收紧口径+GT错误暴露）；SR=1.0。质量层因 AGNES 12/55 后配额403中断（DashScope 3key全403），checkpoint 已存，配额恢复后重跑同命令续传。发现：NA 可反向暴露 GT 数据错误（L1-002 中国铁建营收 GT=10.3亿元错误，答案1.03万亿正确）。
- **数据库缺失审计与市场缓存补齐（2026-08-03）**：重新审计 public schema 全表状态。`evaluation_pool` 已导入 `qa-golden.json` 130/130 条，`Team/TeamMember` 已有默认团队（1队3人），`market_cache_entries` 复验 36 条且无 0 记录；新增 `industry/concept/trade_cal` 缓存写入。修复 `data_service/main.py` 中 `trade_cal/industry/concept/minute` 端点未写缓存的问题，新增 `tests/data-service/test_market_cache_endpoints.py` 回归测试 4/4 通过。`minute` 端点缓存逻辑已具备，但真实补齐受上游数据不可用阻塞：efinance 东方财富接口远端断连，mootdx 返回空数据，未写入伪数据。
- **Docker 服务审计（2026-08-02）**：项目 Docker 配置与其他项目合并后全面审计。修复 evaluation-service 缺失问题（添加到 docker-compose.yml + override + .env）、添加 nginx evaluation_service upstream、更新 Prometheus 监控配置（新增 rag/evaluation/data 服务采集）、补充 .env.docker DASHSCOPE_API_KEY 变量、更新 design.md 服务端口和 FUNCTIONS.md 功能清单。13 个服务全部定义完整。
- **V13-r6（2026-08-02）**：SQL 结果自然语言格式化器 + AGNES 模型评估。综合 0.9153 历史最高。L3 CR 0.4555→0.5833（+28%），L4 CR 0.25→0.60（+140%）。新增断点续传 + 多 API Key + 并发锁机制。

- **V13-r5（2026-08-01）**：qwen 模型替换为 qwen3.5 系列（plus/flash/397b-a17b/plus-2026-02-15/122b-a10b）。实际使用 qwen3.5-122b-a10b（前 4 个模型超时/403 降级）。综合 0.9009 达标，CP 满分（1.0），CR 下降（0.6697，qwen3.5 更严格）。评估耗时 2.4 小时（qwen3.5 响应慢于旧 qwen-plus）。
- **V13-r4（2026-08-01）**：数据质量修复后重跑 L1/L3/L4 评估。修复华海药业（附注列扫描范围扩大到全部行）、中国能建/中国铁建/江苏银行（V13-r3 已修复）。综合 0.8688 **首次达标**（≥0.82），L1 全指标达标（CP=CR=0.93, F=1.0, AR=0.96）。CP/CR 单指标未达标受 L3 CP=0.13 拖累（SQL JSON context 格式问题）。
- **V13-r3（2026-07-31）**：R001 查询路由上线，L1/L3/L4 重跑评估。R001 路由层 SQL 命中率 90.9%，F=0.99 满分，但 CR 受限于 PostgreSQL 数据质量（中国能建全 null、中国铁建错值、江苏银行 null）。综合 0.7699。
- **V14（2026-07-30）**：切换RAGAS官方库评估，综合0.3205远低于V13。embedding违规改为text-embedding-v3，已识别待修复。结论待评估是否继续。
- **V13（2026-07-28）**：评估管线对齐生产（rerank+graph+topK=20），综合0.7804差0.04达标。CR/L2/L3/L4/L7未达标。
- **V12（2026-07-27）**：RAGAS思想自实现，综合0.5679。

---

## E. 待办与阻塞项

- [已完成] 修复 ragas_official_evaluation.py 的 embedding 违规配置
- [已完成] 修复 LLM fallback 不切换根因（exhausted 用 name→改 name/model）
- [已完成] 重跑 V13 补有效 JSON 报告（V13-r2 综合0.8238）
- [已完成] 文档管理体系建立（PROJECT_STATE+门禁+REQUIREMENTS+FUNCTIONS+ADR-011+spec）
- [已完成-P0] R001 阶段3 查询路由改造（2026-07-31）
  - 阶段3.1 意图识别：classifyIntent（数值/非数值分流，含组合关键词正则）
  - 阶段3.2 公司名+指标识别：identifyCompany（精确+别名匹配）、identifyIndicators（长别名优先）
  - 阶段3.3 模板 SQL 查询：executeSqlQuery（按 standard_table 分组查询）
  - 阶段3.4 接入 simpleAgent：R001 路由预查询 + r001SqlContext 注入 systemPrompt
  - 单元测试：32 个全绿（src/server/rag/query/__tests__/query-router.test.ts）
  - 路由层端到端测试：SQL 命中率 90.9%（55 条 L1/L3/L4，50 条命中 SQL）
    - 报告：tests/reports/evaluation/r001-routing-test.json
    - 未命中 5 条：中国人保数据未入库（4 条）+ L1-030 已修复（新签合同关键词补充）
- [已完成-P0] R001 阶段4 验证与评估（2026-07-31）
  - V13-r3 评估：L1/L3/L4 共 55 条，综合 0.7699
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r3.json
  - 结论：R001 路由工作正常，CR 提升受限于 PostgreSQL 数据质量
- [已完成-P0] PostgreSQL 财务数据质量修复（2026-08-01）
  - 华海药业：2025年数据全NULL（附注列扫描范围仅20行，利润表表头在第28行）→ 扩大扫描到全部行
  - 中国能建/中国铁建/江苏银行：V13-r3 已修复（附注列识别、银行业字段映射、纯整数附注）
  - 9/10 家数据完整，仅中国人保无数据（PDF编码问题）
- [已完成-P0] V13-r4 评估（2026-08-01）
  - 综合 0.8688 **首次达标**（≥0.82）
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r4.json
  - L1 全指标达标（CP=CR=0.93, F=1.0, AR=0.96）
- [已完成-P0] V13-r5 评估 — qwen3.5 模型替换（2026-08-01）
  - qwen 模型替换为 qwen3.5 系列：plus/flash/397b-a17b/plus-2026-02-15/122b-a10b
  - 综合 0.9009 达标，CP 满分（1.0），CR=0.6697（FAIL）
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r5.json
  - 实际使用 qwen3.5-122b-a10b（前 4 个模型超时/403 降级）
  - 修复 Faithfulness 解析错误（qwen3.5 偶发返回字符串列表）
  - 优化评估参数：LLM_TIMEOUT=120s, CALL_DELAY=1s, MAX_RETRIES=2
- [已完成-P0] V13-r6 评估 — SQL 结果自然语言格式化 + AGNES 模型（2026-08-02）
  - SQL 结果自然语言格式化器：字段名中文映射 + 货币单位转换 + 同比百分比 + 计算型指标提示
  - ROE 查询修复：query-router.ts 联查 financial_income + financial_balancesheet
  - 综合 0.9153 历史最高，L3 CR +28%，L4 CR +140%
  - 报告：tests/reports/evaluation/ragas-report-v13-selfimpl-r6.json
  - 新增断点续传 + 多 API Key + 并发锁机制
- [已完成-P0] Docker 服务审计与修复（2026-08-02）
  - 修复 evaluation-service 缺失：添加到 docker-compose.yml（含依赖、健康检查、环境变量）
  - 更新 docker-compose.override.local.yml：evaluation-service 在本地开发时排除容器化
  - 更新 nginx/default.conf：添加 evaluation_service upstream
  - 更新 monitoring/prometheus.yml：新增 rag/evaluation/data 服务 metrics 采集
  - 更新 .env.docker：添加 EVALUATION_SERVICE_PORT + DASHSCOPE_API_KEY 变量
  - 更新 .env.local：添加 EVALUATION_SERVICE_URL
  - 更新 design.md：修正服务端口和微服务层描述
  - 更新 FUNCTIONS.md：新增 F022（SQL 格式化）+ F023（评估微服务）
  - 13 个服务全部定义完整，验证通过
- [已完成-P0] 数据库缺失审计与市场缓存补齐（2026-08-03）
  - `evaluation_pool`：130/130 条，分类 L1~L9 分布与 `qa-golden.json` 一致
  - `Team/TeamMember`：默认团队已存在，1 队 3 人
  - `market_cache_entries`：36 条，无 0 记录；已有 `basic/financial/financial_report/history/index/realtime/industry/concept/trade_cal`
  - 修复 `trade_cal/industry/concept/minute` 端点未写缓存；新增回归测试 `tests/data-service/test_market_cache_endpoints.py`
  - 验证：新增缓存端点测试 4/4、`tests/test_pg_cache.py`、`tests/contract/data-service.test.ts` 9/9 通过
- [阻塞-P1] `minute` 缓存真实数据补齐
  - 缓存逻辑已修复，但真实数据未落库：efinance 东方财富接口远端断连，mootdx 返回空数据
  - 禁止写入空列表/伪数据；待上游恢复或接入 TickFlow/可用分钟线数据源后补齐
- [阻塞-P1] 中国人保 PDF 数据提取（数值不在文本层，需 PyMuPDF 或 OCR）
  - 更新（2026-09-19）：R014 OCR 已提取入库，但存的是「百万元」而格式化器猜成「千元」→ 再错 1000 倍；且还原后与 GT 仍差 19%（营收）/189%（净利）。需单独核源。详见 `docs/1-requirements-bugs/financial-metric-unit-mismatch.md`
- [P0-已完成 2026-09-29] **财务指标单位错配（方案A 全链落地）**（2026-09-19 立项，原「按量级猜单位，硬门槛 1e9」）
  - `financial_income/_balancesheet/_cashflow` 存量 25 行已迁移为「元」口径（千元×1000：能建/铁建/江苏银行；百万元×1e6：人保），迁移脚本带 dry-run 锚点校验 + JSONL 备份 + 单事务
  - 展示层 `sql-result-formatter.ts` 删启发式、固定 ÷1e8；抽取层 `pdf_extractor.py` 按「单位：」声明落库前归一（比率/每股字段排除）
  - 回归锚点：铁建 2025 营收 1,029,784,460,000 元 → 10,297.84 亿 ✅ 与 GT 一致；TS 18/18 + Python 16/16
  - 实施记录：`docs/1-requirements-bugs/financial-metric-unit-mismatch.md` §八
  - 遗留：人保 OCR 数值与 GT 残差（19%/189%）仍需核源；NA 收益需 V18 重采后体现
- [P1-新增 2026-09-19] 评估集 GT 未标注「数值应落在哪张表/哪个口径」→ 评估器分不清「库里没有」与「抽取漏了」
- [P1-新增 2026-10-02] **L3 计算题低分三层根因（V18-full-r2 后逐题归因，13 条失败样本）**
  - ① **operating_cost 列口径不一致（5 条毛利率题全错，最大头）——✅ 已修复（2026-10-05）**：抽取时部分公司取了「营业总成本」而非「营业成本」。PDF 原文逐家验证后修正 4 家：能建 4371.18→3977.11 亿（年报 MD&A 明文）、华海 81.46→34.22 亿（合并利润表 3,421,513,359.52）、片仔癀 68.05→57.23 亿（分产品成本 572,250.41 万元）、格力 1375.49→1196.41 亿（合并利润表 119,641,353,216.21）；同时重算 `financial_income.gross_margin`（注意：毛利率路由实际读 income 表的 gross_margin 列，非 indicators 表）与 `net_margin`（定义式重算，东吴 0→39.55% 修复）。**L3 NA 0.167→0.500**（L3-001/007/012/013/014 五条转满分；L3 专项报告 ragas-report-v18-l3-r3，judge 层因 AGNES 供应商连接故障当日不可用，NA 为纯规则指标不受影响）
  - ② ROE/净利率口径差（4 条）：库算「期末净资产」口径 vs GT 用「年报披露加权平均/归母」，差 1.2%~6%，全部踩 NA 1% 断崖归 0（L3-002/006/011/015）
  - ③ GT 依据值错（1 条）——✅ 已修正（2026-10-05）：L3-013 能建资产负债率 GT 依据值「总负债 4668.11 亿」与库/PDF 的 7319.79 亿不符（GT 自身引用的总资产 9415.97 亿与库一致，负债系旧年报数）→ GT 改为 77.74%（依据 7319.79/9415.97），重评后 NA 1.0
  - 另：`financial_indicators` 存储的是小数（0.1962=19.62%），格式化器已正确转换，非 bug
- [已完成 2026-10-02] **法规语料清理重制 + R034 全量入库**
  - 发现：`证券期货投资者适当性管理办法`/`证券投资咨询管理暂行办法` 两文档的 rawContent+chunks 均为网页爬取残留 + UTF-8 双重编码损坏，正文从未入库（前判「LLM 在乱码上幻觉」有误——实为 rebuild-graph 参数笔误（--docId 应为 --doc-id）导致误处理了五粮液摘要，无幻觉、无数据污染）
  - 清理：旧 chunks 67 条、Neo4j 乱码关系 19 条已删
  - 重制：从证监会官网/百度百科提取完整条文（43 条/38 条），源文件 `data/regulations/*.txt` 已重写
  - 入库：适当性办法 12 chunks + 12 embeddings + **242 三元组/209 节点**；咨询办法 9 chunks + 9 embeddings + **70 三元组/70 节点**（Regulation/Article/Authority 类型 + HAS_ARTICLE/REQUIRES/REGULATES/SUPERVISES 关系，R034 条款中心提示词生效）
- [已完成 2026-09-19] 判分模型统一 AGNES（`RAGAS_JUDGE_CHAIN=agnes`，`RAGAS_CALL_DELAY` 自适应；修 judge 字段自相矛盾 bug）
- [已完成 2026-09-29] AGNES 全量判分续传完成（`ragas-report-v17-agnes-r1`，55/55，judge 锁定 agnes × 136 唯一判分）
  - 结果：CP=0.9818 / CR=0.6318 / F=1.0 / AR=0.9527 / NA=0.5000 / **综合=0.8609 (PASS)**；耗时 2048s
  - judge 敏感性结论：同输入同口径下 AGNES(0.8609) vs sensenova-degraded(0.8578) Δ=+0.0031，判分模型更换影响可忽略，跨轮对比口径可信
  - 过程：3s 间隔撞 AGNES 免费档 429 速率限制（非 403 配额），`RAGAS_CALL_DELAY=10`（≈6rpm）跑通
  - 注：本轮判的是 V17 旧采集数据（隔离 judge 变量的对照实验）；P0 单位修复的 NA 收益需 V18 重采后体现
- [P0] 评估 V14 是否值得继续（R006）
- [P1] 优化 L3 CP：SQL JSON context → 自然语言描述（预期 CP 从 0.13→0.80+）
- [P1] 优化 L4 CR：同比数据格式问题
- [P1] 统一两种拒绝话语（R002）
- [P1] 多实体并行检索调研（R003，L2依赖）
- [已完成-P0] Docker 容器化部署（2026-08-04）
  - 5个应用容器：main-service/rag-service/data-service/embedding/reranker + nginx
  - 复用 ai_novel_postgres 和 ai_novel_redis（通过 aiagent_net 网络别名）
  - 更新（2026-09-29）：**PostgreSQL 不再复用其他项目容器**——agentdb 全量数据（含 5190 条向量）已合并至本项目 `aiagent_postgres`（pgvector/pgvector:pg16），宿主机端口改 **5433**（5432 让给其他项目，避免冲突）；`.env`/`.env.local`/`.env.docker` 的 `DATABASE_URL`/`PG_PORT` 已同步。完整备份：`backups/agentdb-full-20260929.dump`（46MB）。redis 仍复用 ai_novel_redis（未在本次范围）。旧容器内的 agentdb 副本待其他项目侧自行清理
  - 更新（2026-09-30，用户明确授权）：**`ai_novel_postgres_old` 已停止并删除**（容器+`postgres:16-alpine` 镜像）。删除前验证：agentdb 23/23 张非向量表逐行一致（向量表 3 张在 old 上因缺 pgvector .so 不可读，由救援副本→dump→恢复证据链保证，行数 5190/1171/182 与救援实例实测一致）；其数据卷 `ai_novel_pg_data` **保留**——该卷同时被他们的现役容器 `ai_novel_postgres` 挂载使用。old 上其他项目数据库已全部备份：`backups/ai_novel-old.dump`、`backups/rag_pdf-old-full.dump`（经救援实例完整导出）、`backups/mutilrag-old.dump`
  - docker-compose.override.yml 排除 postgres/redis/evaluation-service/llm-gateway/prometheus/grafana
  - 80端口验证通过，API健康检查全部UP
  - 踩坑记录：docs/pitfalls/2026-08-04-docker-containerization.md
- [P1] 容器合并：rag+evaluation → rag-service，llm-gateway → main-service（见 docs/improvement-plan.md）
- [P1] 内存状态迁移Redis（限流/熔断/缓存/任务状态）（见 docs/improvement-plan.md）
- [⏳需审批] 评估可靠性调研（见 docs/evaluation-reliability-research.md）

---

## F. 当前阻塞与决策点（需用户确认）

### R001 spec 审批（已通过，2026-07-31）
spec.md 已审批通过，进入阶段1实施：
- [x] 五表双轨制架构（4张标准化表 + 1张原始JSON表）
- [x] 2张辅助表（stock_mapping + indicator_aliases）
- [x] 数据源优先级 PDF > Tushare > BaoStock
- [x] 指标清单驱动路由（命中走SQL，未命中走向量fallback）
- [x] 分批实施：先 10 家验证再全量
- [x] 不做 Text-to-SQL（首期模板 SQL）
- [x] 不处理 L2（R003 另行规格）
- [x] 表结构字段确认（用户确认开始写代码）
