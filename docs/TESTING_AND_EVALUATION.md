# 测试与评估

本文件详细记录项目的测试体系、评估方法、测评结果和已知问题修复记录。README 中仅保留入口链接。

---

## 测试金字塔

| 层级 | 文件数 | 测试数 | 说明 |
|------|--------|--------|------|
| L1 单元测试 | 17 | 138 | Vitest + vi.mock，覆盖路由/注册/编排/执行/检索/描述/验证 |
| L2 契约测试 | 6 | 45 | 验证微服务 API 输入/输出/错误处理（服务不可用时自动跳过） |
| L3 集成测试 | 14 | 86 | 跨模块路径（Skill→Agent/工具路由/数据降级/模型切换/LLM配置） |
| L4 E2E 测试 | 2 | 14 | 全链路 + 性能基准（含预热） |
| 基础设施 | 2 | 21 | Docker 健康检查 + 数据库连接 |
| **总计** | **40** | **325** | 8 个 LLM 测试跳过，CI 全量通过 |

### 测试目录结构

```
tests/
├── infrastructure/                   # 基础设施测试
│   ├── database-connection.test.ts   #   PostgreSQL/Redis/Neo4j 连接
│   └── docker-health.test.ts         #   Docker Compose 服务健康检查
├── contract/                         # L2 服务契约测试
│   ├── data-service.test.ts          #   数据服务 API 契约
│   ├── rag-service.test.ts           #   RAG 服务 API 契约
│   ├── llm-gateway.test.ts           #   LLM 网关 API 契约
│   ├── embedding-reranker.test.ts    #   Embedding/Reranker 契约
│   ├── main-service.test.ts          #   主服务 API 契约
│   └── evaluation-service.test.ts    #   评估服务 API 契约
├── integration/                      # L3 跨模块集成测试
│   ├── path01-memory-agent.test.ts   #   路径1: 记忆→Agent
│   ├── path02-skill-agent.test.ts    #   路径2: Skill执行→Agent回退
│   ├── path03-tool-routing.test.ts   #   路径3: 工具注册→动态路由
│   ├── path04-data-fallback.test.ts  #   路径4: 数据服务降级链
│   ├── path05-model-switch.test.ts   #   路径5: 模型自动切换
│   ├── path06-llm-config.test.ts     #   路径6: 配置→LLM路由降级
│   ├── path12-execution-facade.test.ts # 路径12: ExecutionFacade统一入口
│   ├── path14-description-llm.test.ts  # 路径14: 描述增强→LLM精度
│   ├── path15-description-enhancer.test.ts # 路径15: 描述增强逻辑
│   ├── path16-validation.test.ts     #   路径16: 验证逻辑
│   ├── path17-name-aliases.test.ts   #   路径17: 别名解析
│   └── service-adapter.test.ts       #   服务适配器测试
├── e2e/                              # L4 端到端测试
│   ├── full-chain.test.ts            #   全链路 E2E
│   └── performance-benchmark.test.ts #   性能基准（含预热）
├── helpers/                          # 测试工具
│   └── service-check.ts              #   服务可用性检查（CI 中自动跳过不可达服务）
├── datasets/                         # 测试数据集
│   ├── CFLUE/                        #   CFLUE 金融理解评测
│   ├── ConvFinQA/                    #   ConvFinQA 对话式数值推理
│   ├── FinEval/                      #   FinEval 金融评测
│   └── FinQA/                        #   FinQA 数值推理
└── reports/                          # 测试报告（自动生成）

src/server/                           # L1 单元测试（与源码同目录）
├── agents/__tests__/                 #   Agent 核心测试
├── agents/routing/__tests__/         #   路由测试
├── agents/skills/__tests__/          #   Skill 测试
├── description/__tests__/            #   描述增强测试
├── lib/__tests__/                    #   通用库测试
├── retrieval/__tests__/              #   检索测试
├── routing/__tests__/                #   路由配置测试
└── __tests__/                        #   其他测试（vision/validation/routing等）
```

### 运行测试

```bash
# 运行全部测试（CI 使用同一命令）
npx vitest run

# 运行仅 src/server/ 单元测试
npx vitest run src/server/

# 运行微服务测试（需要 Docker 服务运行中）
npx vitest run tests/infrastructure/ tests/contract/ tests/integration/ tests/e2e/

# 运行 RAG+Agent 测评（20个query，需要全部服务运行中）
npx tsx scripts/rag-agent-eval.ts

# 运行单个测试文件
npx vitest run tests/contract/data-service.test.ts
```

### CI/CD

GitHub Actions 自动运行 4 个流程：

| 流程 | 说明 | 触发条件 |
|------|------|---------|
| Lint & TypeCheck | ESLint + TypeScript 类型检查 | push/PR |
| Unit Tests | Vitest 全量测试（325 用例） | push/PR |
| Build & Push Docker Images | 构建并推送 Docker 镜像 | push to main（需配置 secrets） |
| Deploy to Server | SSH 部署到服务器 | push to main（需配置 secrets） |

- 契约/集成/E2E 测试在 CI 中自动检测服务可用性，不可达时优雅跳过
- 支持手动触发：Actions → CI/CD Pipeline → Run workflow

---

## RAG + Agent 测评

最新测评报告：[eval-report-2026-06-04.md](../evaluation-reports/eval-report-2026-06-04.md)

### 测评数据

- 年报数据：五粮液/格力电器/中国长城 2025年年报 + 2026年一季度报
- 行情数据：近一年交易数据（baostock + efinance 双源）
- 财务数据：利润表/资产负债表/现金流量表（efinance 源）

### 测评结果

| 类别 | Query数 | 通过率 | 平均耗时 | 典型工具组合 |
|------|---------|--------|---------|-------------|
| 1个tool | 5 | 100% | 13.2秒 | getStockRealtime / hybridSearch |
| 2个tools | 5 | 100% | 19.3秒 | getStockHistory+calculateMA |
| 3个tools | 5 | 100% | 28.9秒 | getStockFinancial+hybridSearch+calculateRSI |
| 3+个tools | 5 | 100% | 36.6秒 | 6~10个工具联合调用 |
| **总计** | **20** | **100%** | **24.5秒** | 工具匹配率85% |

### 财报表格专项测试

| Query | 考察点 | 结果 |
|-------|--------|------|
| Q5: 搜索五粮液2025年报中的营收数据 | RAG检索财报核心数据 | ✅ 成功 |
| Q9: 五粮液2025年营收同比增长率 | 财务数据+计算 | ✅ 成功 |
| Q14: 五粮液利润表营业利润+营业利润率 | 利润表取值+计算 | ✅ 成功 |
| Q19: 五粮液利润表营收/成本/净利润+毛利率+净利率 | 多指标取值+多步计算 | ✅ 成功 |

---

## RAGAS 评估（V13）

基于 RAGAS 思想自实现的 RAG 评估框架，4 大核心指标：

| 指标 | V13 分数 | 优秀线 | 状态 | 说明 |
|------|----------|--------|------|------|
| Context Precision | 0.6555 | 0.80 | ❌ FAIL | 检索结果排序质量 |
| Context Recall | 0.5510 | 0.80 | ❌ FAIL | 检索内容覆盖率 |
| Faithfulness | 0.9777 | 0.85 | ✅ PASS | 答案忠实度 |
| Answer Relevancy | 0.8192 | 0.80 | ✅ PASS | 答案相关性 |
| **综合得分** | **0.7804** | 0.82 | ❌ FAIL | 距达标线差 0.04 |

- 评估脚本：[scripts/ragas_evaluation.py](../scripts/ragas_evaluation.py)
- 评估数据收集：[scripts/collect-rag-data.ts](../scripts/collect-rag-data.ts)
- 测试集：[scripts/qa-golden.json](../scripts/qa-golden.json)（130 条金融问题，L1-L9 九大分类）
- 评估报告：[tests/reports/evaluation/ragas-report-v13.md](../tests/reports/evaluation/ragas-report-v13.md)

### 评估集分类体系（L1-L9）

| 分类 | 说明 | V13 表现 |
|------|------|----------|
| L1-事实提取 | 从文档提取具体事实（型号/规格/价格） | CP=0.76, CR=0.47 |
| L2-跨文档对比 | 多文档对比分析 | CP=0.53, CR=0.13（最差） |
| L3-计算推理 | 需要计算的问题 | CP=0.64, CR=0.30 |
| L4-趋势分析 | 数据趋势分析 | CP=0.83, CR=0.45 |
| L5-交易规则 | 交易规则类问题 | CP=0.80, CR=0.69 |
| L6-技术指标 | 技术指标类问题 | CP=0.99, CR=0.99（接近满分） |
| L7-合规风控 | 合规风控类问题 | CP=0.73, CR=0.45 |
| L8-对抗性 | 越界问题测试 | CP=0.15, CR=0.80 |
| L9-无法回答 | 库外问题（应拒绝回答） | CP=0.10, CR=0.90 |

---

## 已知问题与修复记录

| 问题 | 根因 | 修复 |
|------|------|------|
| 中国长城向量召回为0 | IVFFlat索引损坏，部分分区返回空结果 | 重建为HNSW索引；dense-retriever增加顺序扫描降级 |
| 403额度耗尽仍重试3次 | callBailian内部catch块对不可重试错误继续重试 | 403/401错误立即throw，不再重试；强制熔断5倍半开周期 |
| 模型降级链为空 | resolveEnvVars把模型ID当环境变量解析为空 | 智能环境变量解析：仅全大写+下划线格式视为环境变量引用 |
| 精排返回所有chunk | reranker未截取topK | 增加 .slice(0, topK) |
| 图谱三元组挤掉文档chunk | 短文本三元组在精排中排名高于长文本chunk | 分离精排：文档chunk top5 + 图谱三元组 top3 |
| 技术指标日期错误 | 返回结果缺少最新交易日 | 所有工具返回latestTradeDate，prompt强制使用 |
| 切片以标点开头 | 512字符硬截断破坏断句边界 | 文本清洗层 + 边界修正 + 800字符切片 + 多级断点优先级 |
| PDF二进制utf-8解码失败 | incremental-embedder对Buffer调用toString("utf-8") | Buffer直接传入chunkDocument + rawContent fallback |
| Agent重复调用不输出答案 | 无重复检测，8轮迭代后超时 | toolCallHistory + duplicateCallCount，连续2轮重复强制输出 |
| Agent工具失败时幻觉编造数据 | 无数据真实性检查 | 规则15数据真实性原则 + 工具结果成功性检查 |
| tushare/tickflow配置找不到 | 嵌套在market_data下，代码用顶层section名访问 | 提升为顶层节点 |
