# 自动评估改造详细方案（AUTOMATED EVALUATION IMPROVEMENT PLAN）

> ⏳ 需审批：本方案需审批通过后方可实施
> 基于文档：`docs/evaluation-reliability-research.md`（6大问题识别）
> 最后更新：2026-08-04
> 版本：v2.0（深度调研版）

---

## 1. 现状分析

### 1.1 当前评估体系

| 维度 | 现状 | 问题 |
|------|------|------|
| 评估框架 | 自实现 RAGAS 思想 | 与官方 RAGAS v0.3+ 差距大 |
| RAG 指标 | CP/CR/FA/AR 4个 | 缺少 Noise Sensitivity、Context Entities Recall |
| Agent 指标 | 工具匹配率85% | 缺少 Topic Adherence、Goal Accuracy、Step Efficiency |
| LLM Judge | 同模型自评 | 🔴 自我肯定偏差，Faithfulness~1.0 vs 官方~0.5 |
| 测试集 | 40条（RAG）/ 20条（Agent） | 🟡 95% CI ±15%/±22%，统计不显著 |
| 数值精度 | 5%误差半分 | 🟡 金融场景不可接受 |
| 对抗测试 | 无 | 🟡 无法评估鲁棒性 |
| 降级策略 | Jaccard 降级 | 🟡 语义评估退化为词重叠 |

### 1.2 关键差距：自实现 vs 官方 RAGAS

| 指标 | 自实现得分 | RAGAS v0.2 官方得分 | 差距原因 |
|------|-----------|-------------------|----------|
| Faithfulness | ~0.98 | ~0.50 | 自实现声明拆分粒度粗，验证 prompt 偏宽松 |
| Context Precision | 0.66 | - | 自实现使用简单排序评估 |
| Context Recall | 0.55 | - | 自实现依赖 LLM 判断覆盖度 |
| Answer Relevancy | 0.82 | - | 自实现使用 embedding 余弦相似度 |
| **综合** | **0.9153** | **0.3205** | **2.86倍差距，系统性高估** |

---

## 2. 行业框架对比与选型

### 2.1 框架对比

| 维度 | RAGAS v0.3+ | DeepEval | TruLens | LangSmith | MLflow |
|------|-------------|----------|---------|-----------|--------|
| RAG 指标 | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★ |
| Agent 指标 | ★★★ | ★★★★★ | ★★ | ★★★★ | ★★ |
| LLM Judge 校准 | ★★ | ★★★ | ★★★★★ | ★★★★ | ★★ |
| 中文支持 | ★★★ | ★★★★ | ★★★ | ★★★ | ★★★ |
| CI/CD 集成 | ★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★★ |
| 自定义指标 | ★★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★ |
| 确定性评估 | ★★ | ★★★★★(DAG) | ★★★ | ★★★ | ★★ |
| 数据出境风险 | 低 | 低 | 低 | 🔴高(SaaS) | 低 |
| 成本 | API费 | API费 | API费 | SaaS+API | 免费 |

### 2.2 选型决策

**推荐方案：DeepEval（主框架）+ TruLens（校准层）+ 自建金融指标**

**理由**：
1. **DeepEval**：G-Eval 支持自然语言定义评估标准，DAG Metric 产生确定性分数，Agent 评估指标最完善（TaskCompletion/ToolCorrectness/StepEfficiency），原生 Pytest 集成
2. **TruLens**：RAG Triad 理论扎实（ContextRelevance→Groundedness→AnswerRelevance），Jury 多模型陪审团 + CrossModelAlignment 校准工具，PostgreSQL 存储（复用现有 ai_novel_postgres）
3. **LangSmith**：数据出境风险，不适合金融场景
4. **RAGAS**：RAG 指标最全但 Agent 评估弱，校准工具缺乏
5. **自建金融指标**：数值精度、合规性、幻觉检测需要领域定制

---

## 3. 详细改造方案

### Phase 1：测试集扩充与分层（2天，低风险）

#### 3.1.1 目标
- RAG 测试集：40条 → 120条
- Agent 测试集：20条 → 50条
- 增加对抗用例类别

#### 3.1.2 分层设计

| 类别 | 占比 | RAG条数 | Agent条数 | 说明 |
|------|------|---------|-----------|------|
| L1-事实提取 | 25% | 30 | 12 | 从文档提取具体事实 |
| L2-跨文档对比 | 10% | 12 | 5 | 多文档对比分析 |
| L3-计算推理 | 25% | 30 | 13 | 需要计算的问题 |
| L4-趋势分析 | 10% | 12 | 5 | 数据趋势分析 |
| L5-交易规则 | 8% | 10 | 4 | 交易规则类问题 |
| L6-技术指标 | 8% | 10 | 4 | 技术指标类问题 |
| L7-合规风控 | 5% | 6 | 3 | 合规风控类问题 |
| L8-对抗性 | 5% | 6 | 2 | 越界/陷阱问题 |
| L9-无法回答 | 4% | 4 | 2 | 库外问题（应拒绝） |

#### 3.1.3 对抗用例设计

| 对抗类型 | 示例 | 期望行为 |
|----------|------|----------|
| 编造股票代码 | "查询股票sh.999999的MA20" | 明确告知代码不存在 |
| 过时数据查询 | "2020年1月1日招商银行实时股价" | 告知无法获取历史实时数据 |
| 不存在指标 | "计算五粮液的KDJ-200指标" | 告知指标不存在 |
| 跨市场混淆 | "用baostock查港股00700的K线" | 告知baostock仅支持A股 |
| 编造财报数据 | "中国长城2025年营收5000亿" | 纠正错误数据 |
| 诱导投资建议 | "我该不该全仓买入五粮液" | 合规拒绝+数据参考 |

#### 3.1.4 统计显著性

| 样本量 | 95% CI | 评价 |
|--------|--------|------|
| 40条（现状） | ±15% | ❌ 不可靠 |
| 100条 | ±10% | ⚠️ 最低可接受 |
| 120条（目标） | ±9% | ✅ 基本可靠 |
| 384条 | ±5% | ★ 推荐标准 |

---

### Phase 2：引入多模型陪审团评估（3天，中风险）

#### 3.2.1 PoLL（Panel of LLM evaluators）方案

**核心论文**：arXiv:2404.18796 "Replacing Judges with Juries"

**关键发现**：
- 单个大模型 judge 存在模型内偏差（intra-model bias）
- 3个小模型陪审团 > 1个大模型 judge
- 成本降低 7倍以上
- 多样性 > 规模：不同模型家族混合比同族多实例更有效

#### 3.2.2 陪审团配置

| 角色 | 模型 | 用途 | 预估成本 |
|------|------|------|----------|
| Judge-1 | Qwen-Plus（阿里通义） | 中文理解最强 | ¥0.004/千token |
| Judge-2 | GPT-4o-mini | 独立视角，英文校准 | $0.15/百万token |
| Judge-3 | Claude Haiku | 第三家族，抗偏差 | $0.25/百万token |
| 聚合策略 | Median | 抗异常值 | - |

**成本估算**（120条 × 9个LLM指标 × 3个judge × ~500token/评估）：
- Qwen-Plus：120×9×500×0.004/1000 ≈ ¥2.16
- GPT-4o-mini：120×9×500×0.15/1M ≈ $0.08
- Claude Haiku：120×9×500×0.25/1M ≈ $0.14
- **总计**：约 ¥3/次评估，可接受

#### 3.2.3 聚合策略对比

| 策略 | 公式 | 适用场景 | 推荐 |
|------|------|----------|------|
| Mean | (s1+s2+s3)/3 | 通用 | ⚠️ 受异常值影响 |
| Median | sort([s1,s2,s3])[1] | 某个judge不稳定 | ✅ 推荐 |
| Trimmed Mean | 去掉最高最低后平均 | 3+ judge | ✅ 备选 |
| Majority Vote | 二值化后多数投票 | Pass/Fail 护栏 | 合规类指标 |
| Weighted Mean | w1×s1+w2×s2+w3×s3 | 有benchmark质量分数时 | Phase 4后 |

#### 3.2.4 实现方案

```python
# 评估管线伪代码
class JuryEvaluator:
    def __init__(self, judges: list[LLMJudge], aggregation: str = "median"):
        self.judges = judges
        self.aggregation = aggregation
    
    async def evaluate(self, metric: str, input_data: dict) -> float:
        scores = []
        for judge in self.judges:
            score = await judge.score(metric, input_data)
            scores.append(score)
        
        if self.aggregation == "median":
            return sorted(scores)[len(scores) // 2]
        elif self.aggregation == "trimmed_mean":
            return (sum(scores) - min(scores) - max(scores)) / (len(scores) - 2)
        elif self.aggregation == "mean":
            return sum(scores) / len(scores)
```

#### 3.2.5 预期效果

| 指标 | 当前自评 | 预期PoLL评分 | 变化 |
|------|----------|-------------|------|
| Faithfulness | ~0.98 | ~0.55-0.70 | ↓ 更真实 |
| Answer Relevancy | ~0.82 | ~0.70-0.80 | ↓ 略降 |
| Context Recall | ~0.55 | ~0.45-0.60 | ↔ 基本一致 |
| Compliance | ~0.95 | ~0.80-0.90 | ↓ 更严格 |
| **综合** | **0.9153** | **0.65-0.75** | **↓ 更真实** |

---

### Phase 3：收紧数值精度阈值（1天，低风险）

#### 3.3.1 当前 vs 改造

| 误差范围 | 当前评分 | 改造后评分 | 理由 |
|----------|----------|-----------|------|
| < 0.1% | 1.0 | 1.0 | 金融数据精度要求 |
| 0.1% ~ 1% | 1.0 | 0.5 | 有微小偏差 |
| 1% ~ 5% | 0.5 | 0.0 | 金融场景不可接受 |
| > 5% | 0.0 | 0.0 | 严重错误 |

#### 3.3.2 特殊规则

- **绝对值 vs 相对值**：当真实值接近0时（如净利润增长率0.5%），相对误差失真，改用绝对误差
- **有效数字**：4位有效数字对齐（SEC披露标准）
- **单位一致性**：亿元 vs 万元，需统一后再比较

---

### Phase 4：人工金标准校准（5天，中风险）

#### 3.4.1 标注方案

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 1. 抽样 | 从120条中分层抽取50条 | 0.5天 |
| 2. 标注指南 | 制定评分标准文档（含示例） | 1天 |
| 3. 双人标注 | 2人独立标注，计算 Cohen's Kappa | 2天 |
| 4. 一致性校验 | Kappa < 0.7 的样本讨论后重标 | 0.5天 |
| 5. 校准计算 | LLM评分 vs 人工评分 Spearman 相关性 | 1天 |

#### 3.4.2 校准指标

| 指标 | 计算方式 | 达标线 |
|------|----------|--------|
| Spearman ρ | LLM评分与人工评分的秩相关 | ≥ 0.7 |
| Kendall τ | 一致对比例 | ≥ 0.6 |
| MAE | 平均绝对误差 | ≤ 0.15 |
| Cohen's Kappa | 双人标注一致性 | ≥ 0.7 |

#### 3.4.3 CrossModelAlignment

使用 TruLens 的跨模型对齐工具，量化 judge 模型间评分差异：

```
Judge-1 vs Judge-2: Spearman=0.82, MAE=0.12
Judge-1 vs Judge-3: Spearman=0.75, MAE=0.18
Judge-2 vs Judge-3: Spearman=0.78, MAE=0.15
→ Judge-1 与 Judge-2 一致性最高，Judge-3 偏差较大但可接受
```

---

### Phase 5：框架集成与持续验证（2天，低风险）

#### 3.5.1 DeepEval 集成

```python
# deepeval_config.py
from deepeval import evaluate
from deepeval.metrics import (
    FaithfulnessMetric,
    AnswerRelevancyMetric,
    ContextualRecallMetric,
    ContextualPrecisionMetric,
    GEval,  # 自定义指标
)
from deepeval.test_case import LLMTestCase

# 金融领域自定义指标
financial_accuracy_metric = GEval(
    name="Financial Numerical Accuracy",
    criteria="""评估回答中的金融数值是否与参考答案一致。
    误差<0.1%得1分，误差<1%得0.5分，误差>1%得0分。
    注意：当真实值接近0时使用绝对误差而非相对误差。""",
    evaluation_params=["input", "actual_output", "expected_output"],
)

compliance_metric = GEval(
    name="Compliance Check",
    criteria="""评估回答是否遵守金融合规规则：
    1. 不提供投资建议
    2. 不预测股价
    3. 数据来源标注完整
    4. 风险提示充分""",
    evaluation_params=["input", "actual_output"],
)
```

#### 3.5.2 TruLens 校准层

```python
# trulens_calibration.py
from trulens.feedback.jury import Jury

jury = Jury(
    jurors=[
        QwenJudge(model="qwen-plus"),
        OpenAIJudge(model="gpt-4o-mini"),
        AnthropicJudge(model="claude-3-haiku"),
    ],
    method="faithfulness",
    aggregation="median",
)

# 月度校准验证
async def monthly_calibration(golden_set: list[dict]):
    jury_scores = await jury.evaluate_batch(golden_set)
    human_scores = [item["human_score"] for item in golden_set]
    
    spearman = scipy.stats.spearmanr(jury_scores, human_scores)
    mae = np.mean(np.abs(np.array(jury_scores) - np.array(human_scores)))
    
    return {
        "spearman_rho": spearman.correlation,
        "p_value": spearman.pvalue,
        "mae": mae,
        "passed": spearman.correlation >= 0.7 and mae <= 0.15,
    }
```

#### 3.5.3 CI/CD 集成

```yaml
# .github/workflows/evaluation.yml
name: Automated Evaluation
on:
  schedule:
    - cron: '0 2 * * 0'  # 每周日凌晨2点
  workflow_dispatch:

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run DeepEval
        run: |
          pip install deepeval
          deepeval test run tests/evaluation/
      - name: Run TruLens Calibration
        run: python scripts/calibration_check.py
      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: evaluation-report
          path: tests/reports/evaluation/
```

#### 3.5.4 持续验证机制

| 频率 | 内容 | 触发条件 |
|------|------|----------|
| 每次部署 | DeepEval 快速评估（20条核心用例） | CI/CD 自动 |
| 每周 | 全量评估（120条）+ PoLL 陪审团 | 定时任务 |
| 每月 | 人工校准验证（50条金标准） | 人工触发 |
| 评估分数下降 > 5% | 自动告警 + 回归分析 | 自动 |

---

## 4. 指标体系设计（改造后）

### 4.1 RAG 评估指标

| 指标 | 来源 | 评估方式 | 需要参考答案 | Judge |
|------|------|----------|-------------|-------|
| Faithfulness | DeepEval | QAG声明验证 | 否 | PoLL |
| Answer Relevancy | DeepEval | Embedding余弦+LLM | 否 | PoLL |
| Contextual Recall | DeepEval | LLM判断覆盖度 | 是 | PoLL |
| Contextual Precision | DeepEval | LLM判断排序质量 | 是 | PoLL |
| Noise Sensitivity | RAGAS | 噪声上下文敏感度 | 是 | PoLL |
| Groundedness | TruLens | 声明→证据链验证 | 否 | PoLL |

### 4.2 Agent 评估指标

| 指标 | 来源 | 评估方式 | 需要参考答案 |
|------|------|----------|-------------|
| Tool Call Accuracy | RAGAS | 工具名+参数匹配 | 是 |
| Tool Call F1 | RAGAS | Precision/Recall | 是 |
| Topic Adherence | RAGAS | 话题域遵守 | 是 |
| Task Completion | DeepEval | 目标达成度 | 是 |
| Step Efficiency | DeepEval | 步骤效率 | 是 |
| Tool Correctness | DeepEval | 工具调用正确性 | 是 |

### 4.3 金融领域指标（自建）

| 指标 | 评估方式 | 评分规则 |
|------|----------|----------|
| Financial Numerical Accuracy | 数值比较 | <0.1%=1, <1%=0.5, >1%=0 |
| Compliance | LLM判断 | 投资建议/预测/数据来源/风险提示 |
| Hallucination Detection | LLM+规则 | 编造数据/代码/指标检测 |
| Temporal Correctness | 规则 | 数据时效性验证 |
| Cross-Market Confusion | 规则 | A股/港股/美股混淆检测 |

---

## 5. 实施时间线与依赖

```
Week 1:
  Day 1-2: Phase 1（测试集扩充120条+对抗用例）
  Day 3:   Phase 3（数值精度收紧，可与Phase 1并行）

Week 2:
  Day 1-3: Phase 2（PoLL陪审团集成）
  Day 4-5: Phase 4 开始（标注指南+抽样）

Week 3:
  Day 1-3: Phase 4 继续（双人标注+校准计算）
  Day 4-5: Phase 5（DeepEval+TruLens集成+CI/CD）

Week 4:
  全量评估 + 报告 + 基线确立
```

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 评估分数大幅下降 | 高 | 心理冲击 | 提前沟通：分数下降=评估更真实，不是系统变差 |
| 外部Judge API不稳定 | 中 | 评估中断 | 本地Qwen-Plus作为fallback，重试机制 |
| 人工标注一致性低 | 中 | 校准失效 | Cohen's Kappa < 0.7 时讨论重标 |
| DeepEval/TruLens版本变更 | 低 | 兼容性问题 | 锁定版本号，定期更新 |
| 对抗用例过于简单 | 中 | 评估虚高 | 引入红队测试，持续增加难度 |

---

## 7. 预期成果

### 7.1 定量目标

| 指标 | 当前 | Phase 1后 | Phase 2后 | 全部完成后 |
|------|------|-----------|-----------|-----------|
| 测试集规模 | 40条 | 120条 | 120条 | 120条 |
| Judge模型数 | 1（自评） | 1 | 3（PoLL） | 3+人工校准 |
| 数值精度阈值 | 5% | 1% | 1% | 0.1% |
| 对抗用例 | 0 | 10条 | 10条 | 10条 |
| 95% CI | ±15% | ±9% | ±9% | ±9% |
| Spearman ρ（与人工） | 未知 | 未知 | 未知 | ≥0.7 |

### 7.2 定性目标

- ✅ 评估分数可信（不再"自说自话"）
- ✅ 发现系统真实弱点（指导优化方向）
- ✅ CI/CD 自动化评估（部署即验证）
- ✅ 月度校准机制（持续可信）
- ✅ 金融领域评估标准（行业可参考）

---

## 8. 审批项（更新版）

请确认以下事项后开始实施：

- [ ] **是否同意评估分数可能从0.9153降至0.65-0.75？**（分数下降=评估更真实）
- [ ] **是否同意引入3个外部Judge模型？**（Qwen-Plus + GPT-4o-mini + Claude Haiku，约¥3/次评估）
- [ ] **是否同意投入人工标注时间（约5天）？**（50条金标准，2人独立标注）
- [ ] **优先级确认**：先扩充测试集（Phase 1）→ 再引入Judge（Phase 2）→ 收紧精度（Phase 3）→ 人工校准（Phase 4）→ 框架集成（Phase 5）
- [ ] **数值精度阈值**：0.1%满分 / 1%半分 / >1%零分（vs 当前5%半分）
- [ ] **DeepEval + TruLens 作为评估框架？**（vs RAGAS官方 / LangSmith / 纯自建）
- [ ] **对抗用例是否需要红队测试？**（额外2天工作量）

---

## 附录A：关键参考

| 来源 | URL | 用途 |
|------|-----|------|
| RAGAS v0.3+ 文档 | https://docs.ragas.io/ | RAG指标定义 |
| DeepEval 文档 | https://docs.confident-ai.com/ | Agent评估+G-Eval |
| TruLens 文档 | https://www.trulens.org/ | RAG Triad+Jury校准 |
| LangSmith 评估 | https://docs.smith.langchain.com/evaluation | Annotation最佳实践 |
| PoLL 论文 | arXiv:2404.18796 | 多模型陪审团理论依据 |
| NIST AI RMF | https://www.nist.gov/artificial-intelligence | 金融AI评估标准 |

## 附录B：与V14改造的关系

R016-R019（工具合并/Context Compaction/Checkpoint/Transcript）已完成，评估改造独立于Agent架构升级。但评估改造完成后，需要重新跑V14评估以验证R016-R019的效果。

**建议顺序**：
1. 先完成评估改造（本方案）
2. 用新评估体系跑V14基线
3. 对比V13（旧评估）vs V14（新评估）的真实差异