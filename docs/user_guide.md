# AI Agent Platform 用户操作手册

---

## 一、系统访问

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端界面 | http://localhost:3000 | 登录、对话、文档管理 |
| 数据服务 | http://localhost:8001 | A股行情数据 API |
| 健康检查 | http://localhost:3000/api/health | 系统状态监控 |
| MCP 端点 | http://localhost:3000/api/mcp/sse | 工具调用协议 |

---

## 二、注册与登录

1. 打开 http://localhost:3000
2. 点击「注册」创建账户（邮箱 + 密码）
3. 注册成功后自动跳转到登录页
4. 输入邮箱和密码登录，进入主界面

---

## 三、RAG 问答

### 3.1 什么是 RAG 问答

RAG（检索增强生成）是一种让 AI 基于你上传的文档内容回答问题的技术。系统会先从文档库中检索相关段落，再让 LLM 基于检索结果生成答案，并标注引用来源。

### 3.2 如何进行 RAG 问答

1. 登录后进入「对话」页面
2. 在输入框中输入问题，例如：
   - "贵州茅台 2025 年营收是多少？"
   - "招商银行的风险控制措施有哪些？"
   - "中国平安的 ROE 趋势如何？"
3. 系统自动执行：问题分析 → 文档检索 → 重排序 → 生成答案 → 标注引用
4. 答案中会标注引用来源（如 `[文档名, 第X页]`），可点击查看原文

### 3.3 RAG 检索模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| hybrid（默认） | 向量检索 + BM25 稀疏检索 + RRF 融合 | 通用场景，推荐使用 |
| dense | 纯向量检索 | 语义相似度高的查询 |
| sparse | 纯 BM25 关键词检索 | 精确关键词匹配 |
| graph | GraphRAG 图谱推理 | 多跳关系推理（如"A公司的子公司有哪些"） |

### 3.4 RAG 问答示例

```
用户: 分析招商银行 2025 年年报中的核心经营指标

系统回答:
根据招商银行 2025 年年报 [招商银行_2025年年度报告.pdf, P.15]:

1. 营业收入: 3,456.78 亿元，同比增长 5.2%
2. 净利润: 1,482.35 亿元，同比增长 6.1%
3. 不良贷款率: 0.95%，较上年下降 0.02 个百分点
4. 拨备覆盖率: 445.32%
5. ROE: 16.28%

引用来源:
[1] 招商银行_2025年年度报告.pdf - 核心经营指标章节
[2] 招商银行_2025年年度报告.pdf - 风险管理章节
```

---

## 四、文档上传

### 4.1 支持的文档格式

| 格式 | 说明 |
|------|------|
| PDF | 年报、研报、公告等（支持表格提取） |
| TXT | 纯文本文件 |
| Markdown | .md 格式文件 |

### 4.2 如何上传文档

1. 登录后进入「控制台」页面
2. 点击「上传文档」按钮
3. 选择本地文件（支持多选）
4. 选择文档类型：
   - **研报** (research_report) — 有效期 90 天
   - **财报** (financial_report) — 有效期 365 天
   - **法规** (regulation) — 永不过期
   - **通用** (general) — 有效期 180 天
5. 点击确认上传

### 4.3 上传后系统自动处理

```
上传文件 → PDF解析 → 智能切片 → 向量化(BGE-M3) → 存入PostgreSQL
                                              ↓
                              实体关系抽取 → 存入Neo4j图谱
                                              ↓
                              BM25索引构建 → 存入内存索引
```

处理完成后，文档内容即可被 RAG 问答检索到。

### 4.4 文档管理

- 在「控制台」页面可查看已上传的文档列表
- 文档状态：processing（处理中）、completed（已完成）、failed（处理失败）
- 过期文档会被自动清理（根据文档类型的有效期）
- 文档更新时，系统自动检测 contentHash 变化，仅更新有变化的部分

### 4.5 批量上传财报

项目提供了财报爬取脚本，可从巨潮资讯网批量下载 A 股财报：

```bash
conda activate agent
python scripts/crawl_financial_reports.py
```

下载的 PDF 文件存放在 `data/financial_reports/` 目录下，可批量上传到系统中。

---

## 五、Agent 用途

### 5.1 Agent 类型

| Agent | 名称 | 用途 | 示例问题 |
|-------|------|------|----------|
| Orchestrator | 主控编排 | 接收用户查询，路由到合适的专项 Agent | 所有问题的入口 |
| Researcher | 研究员 | 投研分析、行业研究、公司基本面分析 | "分析白酒行业竞争格局" |
| Quant | 量化分析师 | 技术指标计算、量化策略、移动平均线/RSI/MACD | "计算贵州茅台的 MA20 和 RSI" |
| Compliance | 合规官 | 交易合规检查、风控审查、持仓限制 | "检查买入 600036 是否合规" |
| General | 通用助手 | 日常问答、文本摘要、信息提取 | "总结这份研报的核心观点" |

### 5.2 Agent 使用方式

在对话界面直接输入问题，系统自动路由到合适的 Agent：

**量化分析示例：**
```
用户: 计算招商银行的 MA20 和 MACD
Agent: [调用 calculate_ma 工具] [调用 calculate_rsi 工具]
结果: MA20 = 35.62 元, MACD = -0.23 (死叉状态)
```

**合规检查示例：**
```
用户: 买入 1000 股 600036 是否合规？
Agent: [调用 check_trade_compliance 工具]
结果: 合规检查通过。600036(招商银行) 不在受限股票名单中，买入数量在持仓限制范围内。
```

**风控计算示例：**
```
用户: 计算我持仓组合的 VaR
Agent: [调用 calculate_var 工具]
结果: 95% 置信度下，1日 VaR = 2.35%，即最大单日损失约 4,700 元
```

### 5.3 多轮对话

系统支持多轮对话，Agent 会记住上下文：

```
第1轮: 用户: "贵州茅台的最新股价是多少？"
       Agent: "贵州茅台(600519)最新股价为 1,856.00 元..."

第2轮: 用户: "它的 PE 呢？"  ← 不需要重复说明股票
       Agent: "贵州茅台当前市盈率(PE-TTM)为 28.5..."
```

### 5.4 MCP 工具列表

Agent 可调用的工具（通过 MCP 协议）：

| 工具 | 功能 | 参数 |
|------|------|------|
| hybrid_search | RAG 混合检索 | query, topK, mode |
| calculate_ma | 移动平均线 | code, period, start_date, end_date |
| calculate_rsi | RSI 相对强弱指标 | code, period, start_date, end_date |
| check_trade_compliance | 交易合规检查 | code, action, quantity |
| calculate_var | VaR 在险价值 | portfolio, confidence, horizon |
| get_market_data | A股行情数据 | endpoint, body |

---

## 六、系统健康检查

访问 http://localhost:3000/api/health 可查看系统各组件状态：

```json
{
  "status": "up",
  "checks": {
    "database": { "status": "up" },
    "embedding": { "status": "up", "latency": 45 },
    "reranker": { "status": "up", "latency": 12 },
    "llm": { "status": "up", "latency": 230 }
  }
}
```

| 状态 | 说明 |
|------|------|
| up | 服务正常 |
| degraded | 部分服务不可用，核心功能仍可用 |
| down | 服务不可用 |

---

## 七、Docker 服务管理

### 启动所有服务

```bash
docker compose up -d
```

### 查看服务状态

```bash
docker ps --filter "name=aiagent"
```

### 查看服务日志

```bash
docker logs aiagent_embedding --tail 50
docker logs aiagent_reranker --tail 50
docker logs aiagent_neo4j --tail 50
```

### 重启某个服务

```bash
docker restart aiagent_embedding
```

### 服务端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Neo4j HTTP | 7474 | 图数据库管理界面 |
| Neo4j Bolt | 7687 | 图数据库连接端口 |
| Embedding | 8011 | BGE-M3 向量化服务 |
| Reranker | 8010 | BGE-Reranker 重排序服务 |
| 数据服务 | 8001 | Python FastAPI 行情数据 |
| Next.js | 3000 | 前端 + API 服务 |

---

## 八、常见问题

### Q: RAG 问答返回"未找到相关文档"

**原因**: 系统中没有上传过相关文档，或文档已过期。

**解决**: 上传相关文档后重试。确认文档状态为 `completed`。

### Q: Agent 回答"服务不可用"

**原因**: LLM 服务（阿里百炼）API Key 未配置或额度用尽。

**解决**: 检查 `.env.local` 中的 `DASHSCOPE_API_KEY` 是否正确。

### Q: 实时行情返回空数据

**原因**: 非交易时段（A股交易时间：工作日 9:30-11:30, 13:00-15:00）。

**解决**: 在交易时段重试，或使用历史行情接口。

### Q: 文档上传后处理失败

**原因**: PDF 文件可能是扫描件（图片型 PDF），无法提取文本。

**解决**: 使用文字型 PDF 文件。扫描件需要先进行 OCR 处理。

### Q: Docker 容器显示 unhealthy

**原因**: 模型加载需要时间，或端口冲突。

**解决**:
1. 等待 2-3 分钟后重新检查
2. 检查端口是否被占用：`netstat -ano | findstr "8011"`
3. 查看容器日志：`docker logs aiagent_embedding --tail 30`
