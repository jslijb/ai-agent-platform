# 升级路线图（UPGRADE_ROADMAP）

> 从过时的"优化迭代规划.md"剥离，基于V13现状更新。记录后续升级内容。
> 最后更新：2026-07-30
> 注：优化迭代规划.md 基于V10/V11，已过时，以本文件为准

---

## 当前状态

- **评估基线**：V13综合0.7804（差0.04达标），尚未建立全达标基线
- **当前阻塞**：评估达标卡住，升级项暂未启动
- **前置条件**：V13全指标达标（R005）后方可启动升级

---

## 近期升级（评估达标后启动）

### U1：评估"需人工核查"闭环 [P1]
- **问题**：评估报告输出"需人工核查"列表，但核查结果无回流入口
- **方案**：新增 /api/wrong-answers 接口，核查错误写入错题本
- **闭环**：评估→人工核查→错题本→修正测试集/知识库→下一轮评估

### U2：orchestrator timeout统一 [P1]
- **问题**：orchestrator.ts AGENT_TIMEOUT_MS=120000 vs README 240000 不一致
- **方案**：统一为240000，与simpleAgent.ts的300000对齐

### U3：compliance_logs迁移正规化 [P1]
- **问题**：表通过docker exec psql手动创建，不在迁移流程内
- **方案**：生成drizzle migration文件，纳入版本管理

### U4：L4趋势分析专项 [P1]
- **问题**：L4知识库缺同比/环比数据
- **方案**：检查知识库文档"本年比上年增减"列，调整切片策略，QueryExpander增加同义词扩展
- **验收**：L4 AR≥0.75（注：V13已0.9，此项可能已解决，待R005达标后复核）

---

## 中期升级（1-2月）

### U5：文档入库质量校验 [P0]
- 校验chunkText非空、tokenCount>0、embedding非zero向量
- 校验失败标记status="parse_failed"
- 新增 /api/document/quality-report 接口

### U6：合规防护第5-6层 [P0]
- 第5层监管上报：Unsafe级事件按月汇总生成合规报告
- 第6层AML/KYC联动：高风险用户触发KYC重新认证

### U7：A/B测试框架 [P1]
- ab_test表，流量按userId hash分桶
- 评估脚本支持 --ab-test 参数
- 应用场景：chunk size、HyDE、rerank topK对比

### U8：多Agent编排补全 [P1]
- compliance.ts（当前为空）封装合规检查技能
- a2a/protocol.ts（当前为空）实现Agent间通信

### U9：LLM成本治理 [P1]
- 复用LLMUsageLog表，新增预算接口
- 超阈值80%告警，100%降级

### U10：开源数据集评估常态化 [P1]
- CI/CD weekly job跑FinEval/CFLUE/FinQA/ConvFinQA
- 指标退化>5%阻塞部署

### U11：检索链路全链路追踪 [P1]
- 记录dense/sparse/rerank/graph每环召回数和耗时
- 新增 /api/rag/trace/:queryId 接口

---

## 远期升级（3-6月）

### U12：多租户隔离 [P0]
- DB层RLS，应用层tenantId注入，知识库租户隔离

### U13：管理后台
- 合规中心/运营中心/成本中心

### U14：新业务场景扩展
- 信贷审批/保险理赔/反洗钱/投资者教育

### U15：持续改进机制（合规第7层）
- 关键词规则外置配置文件，热更新
- 合规日志定期分析，自动发现新型违规模式

### U16：性能优化
- pgvector HNSW索引调优
- 热点query语义缓存调优
- 评估并行化（按category并行，预期耗时降60%）
- 目标：单query P95<5秒，评估130条<30分钟

### U17：模型国产化与私有化部署
- 接入通义千问本地部署、智谱GLM、DeepSeek
- 私有化方案：BGE-M3+本地LLM，数据不出内网
