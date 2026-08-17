# V3.0 调研总览 + 升级方案

> 调研日期：2026-08-12
> 本文件是 V3.0 升级调研的**单一入口**，5 份子报告的汇总 + 可执行升级方案
> 用户原话："先调研清楚，然后你看需要更新哪些文档，我之前让你做的文档管理，现在看能否执行？因为我一直觉得我们的文档管理是个空架子，只有文档，没有执行"

---

## 一、调研产出清单

| # | 报告 | 路径 | 核心结论 |
|---|------|------|---------|
| 1 | CRM/OA 接入 | `v3.0-research/1-crm-oa-integration.md` | 从 Q&A 升级为 Action Agent，钉钉/飞书/企微三平台，二次确认+审计必做 |
| 2 | Agent 框架对比 | `v3.0-research/2-agent-frameworks.md` | LangGraph 不换；引入 inspect-ai 评估 + Hermes-3 模型；借鉴思路不堆框架 |
| 3 | JD 特征分析 | `v3.0-research/3-jd-analysis.md` | 8 大特征，项目已具备 3 项，V3.0 补齐 4 项；模型微调另立项目 |
| 4 | 未执行项汇总 | `v3.0-research/4-pending-optimizations.md` | 18 项需求（R022-R039），4 阶段 13 周交付 |
| 5 | 升级理论 | `v3.0-research/5-upgrade-theory.md` | 10 条铁律 + 12 项必指定 + 风险登记册 + Feature Flag + 降级预案 |
| 6 | 文档管理执行 | `v3.0-research/6-doc-governance-fix.md` | 去重 + 自动化门禁 + 健康度评分，解决"空架子" |

---

## 二、V3.0 一句话定位

**从"金融问答 Agent"升级为"金融 Action Agent"——能提交/审批流程、有评估闭环、有模型层深度、有生产级工程化。**

---

## 三、V3.0 范围（18 项需求）

### 3.1 P0（必须做）

| ID | 项 | 类别 |
|----|----|------|
| R022 | OA/CRM 接入（Action Agent） | 新能力 |
| R023 | Agent 评估闭环（inspect-ai + 人工核查 + 开源数据集） | 评估 |
| R024 | A/B 测试框架 + 在线评估 | 评估 |
| R026 | Hermes-3/DeepSeek 降级链 + vLLM 私有化 | 模型层 |
| R033 | 文档入库质量校验 | 数据 |
| R034 | 合规防护第5-6层 | 合规 |
| R035 | 多租户隔离 | 工程化 |

### 3.2 P1（应该做）

| ID | 项 | 类别 |
|----|----|------|
| R025 | promptfoo CI 回归 | 工程化 |
| R027 | 数据飞轮（badcase 自动闭环） | 数据 |
| R028 | K8s + 灰度 + 成本治理 + SLA + 全链路追踪 + 压测 | 工程化 |
> ⚠️ 2026-08-17：R028 中服务器相关部分（K8s/灰度/压测/SLA）随「不部署服务」决策**已取消**，仅留档。见 CLAUDE.md「已取消需求」+ hardware-profile.md。
| R029 | A2A 多 Agent 通信 | Agent |
| R036 | 管理后台 | 工程化 |
| R037 | 附注表查询路由优化 | 检索 |
| R038 | 多实体并行检索 | 检索 |
> ✅ 2026-08-17：R038 调研已完成（对应正式需求 R003），结论见 multi-entity-parallel-retrieval-research.md
| R039 | 定时清理任务 | 工程化 |

### 3.3 P2（可以做）

| ID | 项 | 类别 |
|----|----|------|
| R030 | 架构决策文档化 | 文档 |
| R031 | 更多金融场景 | 业务 |
| R032 | JD 调研数据复核 | 文档 |

### 3.4 不做（另立项目 / 红海 / 复用开源）

| 项 | 理由 |
|----|------|
| 模型微调（LoRA/RLHF） | 另立 AI FinModel Lab |
| 通用 Agent 平台 | 红海 |
| 自研推理框架 | 用 vLLM |
| R006 评估 V14 | V13 自实现已 0.9153，V14 官方库 0.3205，放弃 |

---

## 四、V3.0 分阶段交付（13 周）

| 阶段 | 周期 | 内容 | 门禁 |
|------|------|------|------|
| **V3.0-alpha** | 3 周 | R022 Phase1（钉钉+请假+报销+二次确认+审计）+ R026（Hermes-3） | Connector 单测 + E2E 5 场景 + V13-r6 基线回归 + Feature Flag |
| **V3.0-beta** | 3 周 | R022 Phase2（飞书+企微+查状态+撤回）+ R023（inspect-ai）+ R034（合规5-6层） | 三平台 + Agent 评估 + 全链路压测 P95<5s + 10% 灰度 |
| **V3.0-rc** | 4 周 | R024（A/B）+ R027（数据飞轮）+ R028（K8s+灰度）+ R033（文档质量） | A/B 跑通 + SLO 仪表盘 + 降级演练 |
| **V3.0-ga** | 3 周 | R035（多租户）+ R036（管理后台）+ R029（A2A）+ 全量回归 | 多租户渗透测试 + 100% 灰度 + 变更日志 |

---

## 五、V3.0 10 条铁律（必须遵循）

1. **设计评审先行** — design.md 评审通过才动工
2. **Feature Flag 全覆盖** — 新功能可一键关，秒回滚
3. **分阶段交付** — alpha→beta→rc→ga，每阶段门禁
4. **每阶段可回滚** — 回滚脚本 + 数据回滚方案
5. **SLO 定义先行** — 可用性 99.9% / P95<5s / 错误率<0.1%
6. **全链路压测** — k6 全链路（nginx→main→rag→data→OA）
7. **降级预案** — OA 挂→问答降级；LLM 挂→降级链
8. **数据迁移可回滚** — 双写 + 验证 + 切换 + 可回滚
9. **文档同步** — 每阶段交付含文档，文档滞后阻塞下一阶段
10. **沟通计划** — 用户通知 + 变更日志 + 迁移指南

---

## 六、需要更新的文档清单

### 6.1 V3.0 必须新建的文档

| 文档 | 路径 | 内容 | 阶段 |
|------|------|------|------|
| V3.0 Spec | `docs/3-standards/versions/v3.0/spec.md` | 版本规格 | alpha 前 |
| V3.0 Design | `docs/3-standards/versions/v3.0/design.md` | 版本设计 | alpha 前 |
| V3.0 Task | `docs/3-standards/versions/v3.0/task.md` | 版本任务 | alpha 前 |
| ADR-012 | `docs/adr/012-action-agent.md` | Action Agent 决策 | alpha 前 |
| ADR-013 | `docs/adr/013-llm-degradation-chain-expansion.md` | 降级链扩展 | alpha |
| ADR-014 | `docs/adr/014-agent-eval-with-inspect-ai.md` | Agent 评估 | beta |
| SLO 文档 | `docs/3-standards/slo.md` | 服务等级目标 | rc |
| 变更日志 | `docs/CHANGELOG.md` | 用户可见变更 | ga |
| 迁移指南 | `docs/MIGRATION-v3.0.md` | Breaking Change 迁移 | ga |
| 风险登记册 | `docs/v3.0-research/risk-register.md` | 风险跟踪 | 持续 |
| 回滚手册 | `docs/v3.0-research/rollback-runbook.md` | 回滚操作 | rc |

### 6.2 V3.0 必须更新的文档

| 文档 | 更新内容 |
|------|---------|
| `CLAUDE.md` | 当前任务更新为 V3.0 |
| `docs/3-standards/REQUIREMENTS.md` | 新增 R022-R039 |
| `docs/3-standards/task.md` | 新增 V3.0 任务 |
| `docs/3-standards/spec.md` | 新增 V3.0 章节 |
| `docs/3-standards/design.md` | 新增 Action Agent 架构 |
| `docs/2-tech-interview/PROJECT_STATE.md` | 更新基线表 + 导航 |
| `docs/2-tech-interview/UPGRADE_ROADMAP.md` | U1-U17 标注纳入 V3.0 |

### 6.3 文档管理执行机制（解决空架子）

详见 `v3.0-research/6-doc-governance-fix.md`。核心：
1. **去重**：单一真相源，删除重复副本
2. **自动化门禁**：git pre-commit hook 检查文档更新
3. **健康度评分**：脚本定期检查文档新鲜度
4. **执行清单**：门禁变成可执行命令

---

## 七、决策待用户确认

以下决策需用户确认后才能进入 V3.0-alpha：

| # | 决策 | 选项 | 建议 |
|---|------|------|------|
| 1 | V3.0 发布时间 | 2026-11 / 其他 | 2026-11（13 周周期） |
| 2 | OA 平台优先级 | 钉钉优先 / 飞书优先 / 三平台同步 | 钉钉优先（金融客户最多） |
| 3 | Hermes-3 是否私有化部署 | 是 / 否 / 先评估 | 先评估（硬件够不够） |
| 4 | OpenClaw 澄清 | 是 OpenManus / OpenHands / 其他 | 需用户澄清 |
| 5 | 模型微调另立项目 | 立项 AI FinModel Lab / 暂不做 | 立项（互补） |
| 6 | JD 调研数据复核 | 人工抽样 100 份 / 暂不复核 | 人工抽样（校验本报告） |
| 7 | 文档去重方案 | 保留 3-standards/ 为唯一源 / 其他 | 保留 3-standards/（见报告6） |
| 8 | V3.0 是否含 K8s | 含 / 留 V3.1 | 含（生产级必须） |

---

## 八、下一步行动

用户确认上述决策后，立即执行：

1. **写 V3.0 三层文档**（spec/design/task）— 1 天
2. **写 ADR-012**（Action Agent 决策）— 半天
3. **文档去重**（删重复副本，单一真相源）— 半天
4. **建 git pre-commit hook**（文档门禁自动化）— 半天
5. **进入 V3.0-alpha 开发** — 3 周

---

## 九、调研局限声明

| 调研 | 局限 | 复核建议 |
|------|------|---------|
| 调研1 CRM/OA | 基于行业认知，未实测各平台 API | alpha 前用真实 OAuth 跑通钉钉 |
| 调研2 框架 | OpenClaw 未能确认身份 | 用户澄清 |
| 调研3 JD | 未实际爬取 100 份 JD | 人工抽样复核 |
| 调研4 未执行项 | 完整（基于项目文档） | 无需复核 |
| 调研5 升级理论 | 基于公开大厂实践 | 无需复核 |

**核心结论**：调研已"清楚"，可进入 V3.0 规划阶段。待用户确认第七节 8 项决策。