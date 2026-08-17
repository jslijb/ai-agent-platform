# AI Agent Platform - 项目记忆索引

> 本文件是 agent 每次会话的"开机自检清单"。新会话开始时自动读取。
> 最后更新：2026-08-14

## 快速恢复：项目当前状态

- **架构**：Next.js + FastAPI 微服务，nginx(80) 统一入口
- **容器化**：✅ 已完成（7→5容器，postgres/redis 复用 ai_novel）
- **评估基线**：V13-r6 综合 0.9153（达标）
- **80端口**：✅ 可用（nginx→main-service）
- **硬件**：本地 i7/16GB/512SSD，服务器 GPU
- **用户访问方式**：**浏览器访问 nginx 容器（http://localhost:80）**，不是本地 dev
- **用户账号**：jslijb@163.com，userId=69ea0f70-00a0-426b-aa5f-0e198d0f69d3

## 用户反复强调的需求（勿忘！）

1. **浏览器通过 nginx(80) 访问**——不是 localhost:3005，不是 npm run dev
2. **历史对话必须显示**——已报多次，是核心体验
3. **不要反复问用户已说过的事**——重要信息必须写入文档
4. **踩坑必须记录**——会话压缩后不能丢失关键信息

## 文档索引（3类目录）

### 第1类：需求 + 踩坑 + Bug → `docs/1-requirements-bugs/`

| 文档 | 路径 | 用途 |
|------|------|------|
| 踩坑记录 | `1-requirements-bugs/` | 按日期归档（8份） |
| 需求清单 | `1-requirements-bugs/REQUIREMENTS.md` | 全局需求 |
| 改进方案 | `1-requirements-bugs/improvement-plan.md` | 5大改进问题 |
| 评估调研 | `1-requirements-bugs/evaluation-reliability-research.md` | 评估可靠性 |
| 知识图谱方案 | `1-requirements-bugs/knowledge-graph-improvement-plan.md` | 图谱改进 |
| 语义缓存方案 | `1-requirements-bugs/semantic-cache-plan.md` | 缓存方案 |
| CRM/OA接入调研 | `1-requirements-bugs/ai-agent-crm-oa-integration-research.md` | R022调研(SaaS) |
| 开源OA/CRM调研 | `1-requirements-bugs/open-source-oa-crm-research.md` | R022调研(自部署) |
| 框架融合分析 | `1-requirements-bugs/agent-framework-fusion-analysis.md` | R023调研(初版) |
| Harness/Hermes/OpenClaw | `1-requirements-bugs/harness-hermes-openclaw-research.md` | R023调研(纠正版) |
| 多端前端调研 | `1-requirements-bugs/multi-platform-frontend-research.md` | R024调研 |
| JD特征分析 | `1-requirements-bugs/ai-agent-jd-research-2026.md` | R027调研 |
| V3.0升级调研 | `1-requirements-bugs/v3-upgrade-research-report.md` | R026调研 |
| 个人账号限制调研 | `1-requirements-bugs/wecom-dingtalk-feishu-personal-account-research.md` | R022/R028调研 |
| OA/CRM业务测试指南 | `1-requirements-bugs/oa-crm-business-test-guide.md` | R022测试规范 |
| Flutter迁移分析 | `1-requirements-bugs/flutter-migration-feasibility-research.md` | R024补充调研 |
| **V3.0系统使用指南** | **`1-requirements-bugs/v3-system-user-guide.md`** | **端到端测试依据** |
| 开源OA/CRM调研 | `1-requirements-bugs/open-source-oa-crm-research.md` | R022自部署方案 |
| Harness/Hermes/OpenClaw纠正版 | `1-requirements-bugs/harness-hermes-openclaw-research.md` | R023纠正调研 |

### 第2类：技术讨论 + 面试准备 → `docs/2-tech-interview/` ⭐

| 文档 | 路径 | 用途 |
|------|------|------|
| **技术全景+面试** | **`2-tech-interview/agent-tech-and-interview.md`** | **18项技术+5个决策对比+14个问答+量化数据** |
| **Vibe Coding复盘** | **`2-tech-interview/vibe-coding-retrospective.md`** | **8项优势+10项不足+效率模型+成熟度自评** |
| 功能代码索引 | `2-tech-interview/CODE_INDEX.md` | 每个功能的WHAT/WHY/WHERE/HOW |
| 项目全景 | `2-tech-interview/PROJECT_OVERVIEW.md` | 技术栈+选择理由+架构图 |
| 项目状态卡 | `2-tech-interview/PROJECT_STATE.md` | 评估基线+迭代历史 |
| 架构演进 | `2-tech-interview/ARCHITECTURE_EVOLUTION.md` | 架构变更历史 |
| ADR决策记录 | `2-tech-interview/adr/` | 11份技术决策记录 |

### 第3类：开发规范（SDD+TDD） → `docs/3-standards/`

| 文档 | 路径 | 用途 |
|------|------|------|
| 规格说明 | `3-standards/spec.md` | SDD 规格（WHAT） |
| 设计文档 | `3-standards/design.md` | SDD 设计（HOW） |
| 任务文档 | `3-standards/task.md` | SDD 任务（WHEN） |
| 检查清单 | `3-standards/checklists/` | 评估/代码变更/归档门禁 |
| 版本快照 | `3-standards/versions/` | 各版本spec/design/task |

## 容器架构（当前运行）

```
nginx(80) → main-service(3000/映射3005) + rag-service(3001) + data-service(8001)
           + embedding(8011) + reranker(8010) + neo4j(7474/7687)
           + odoo(8069) + twenty(3003)
复用: ai_novel_postgres(5432) + ai_novel_redis(6379)
新增: odoo-db(5432内部) + twenty-db(5432内部)
```

启动命令：`docker compose up -d`（确保 Docker Desktop 运行）

## 关键踩坑速查

1. **Docker构建需host.docker.internal**：Dockerfile build 阶段 DB/Redis 地址必须用 `host.docker.internal`
2. **端口3000被占用**：ai_novel_frontend 占用3000，main-service 用3005
3. **compose override自动加载**：文件名必须是 `docker-compose.override.yml`（不是 .local.yml）
4. **容器内config必须挂载**：main-service 需要 volumes 挂载 `config/api_keys.yaml` 和 `.env.local`
5. **AUTH_URL必须与浏览器访问URL一致**：用户通过80端口访问，AUTH_URL 应为 `http://localhost`
6. **AUTH_SECRET必须全环境一致**：.env.local / .env.docker / docker-compose.yml 三处必须相同
7. **历史对话bug根因**：AUTH_SECRET不一致→JWT验证失败→API返回401→前端静默吞掉→显示"暂无历史对话"
8. **Docker配置变更后必须重建容器**：改了docker-compose.yml或.env.docker后，必须 `docker compose up -d --build`
9. **vitest测试中async工厂函数必须await**：`createBotAdapter`改为async后，测试中调用必须await
10. **DingTalk签名验证**：传了appSecret会走HMAC校验，测试中需传空字符串才能跳过校验
11. **vitest导入DB模块会导致0 tests**：源文件顶层import DB会在测试加载时执行连接，纯函数需拆到独立utils文件
12. **Harness H4上下文感知不能降级**：H3升级后violationCount重置为0，H4会误降级，修复为只升不降
13. **Capacitor未安装时npx cap init失败**：需先pnpm add @capacitor/core @capacitor/cli
14. **vitest环境中window.location可能undefined**：需typeof检查后再访问
15. **Next.js output:export不兼容API路由**：项目有`export const dynamic = "force-dynamic"`的API路由，Capacitor构建需要独立SPA策略而非全站静态导出
16. **Odoo首次启动需初始化数据库**：`docker run --rm odoo:17 -- -i base -d odoo --stop-after-init`，否则ir_module_module表不存在
17. **Twenty CRM镜像阿里云源403**：twentycrm/twenty在阿里云镜像源被拒绝，需直接从Docker Hub拉取
18. **registerAllMCPTools必须async**：内部有await import动态加载Odoo/Twenty/SaaS工具，调用处也必须await
19. **raw-table-search.ts import路径错误**：从`../../db/schema`改为`../db/schema`（文件在src/server/routing/）
20. **JSONRPCRequest.id是optional**：传给createResponse/createErrorResponse时需`id ?? null`
21. **capacitor.config.ts需排除在tsconfig外**：否则Next.js type check报错；同时需改为`import type { CapacitorConfig }`格式
22. **shared-types包需tsconfig paths映射**：`"shared-types": ["./packages/shared-types/src"]`
23. **RegisteredTool接口缺requiredParameters**：mcp-handler引用了但接口没定义，需添加`requiredParameters?: string[]`
24. **Odoo uid === false类型不兼容**：TypeScript严格模式下`number === false`报错，改为`uid === 0`
25. **Windows本地next build报EPERM symlink**：standalone文件追踪会重建pnpm符号链接，Windows无开发者模式时`EPERM: operation not permitted`（Linux/npm无此问题）。已修复：next.config.js在Windows上自动跳过standalone输出（该产物仅Docker用）；如确需本地产出standalone：`NEXT_FORCE_STANDALONE=1 npm run build` 或开启Windows开发者模式（ms-settings:developers）。Capacitor export模式由`OUTPUT_MODE`常量控制（switch-export.cjs/switch-standalone.cjs/cap-build.ts 切换），不受Windows开关影响

## 当前任务

### V14 已完成
- [x] 容器化部署完成
- [x] 容器合并（rag+evaluation → rag-service，llm-gateway → main-service）
- [x] 内存状态迁移Redis（限流/熔断/LLM缓存）
- [x] 本地性能优化（Redis连接池/DB连接池/pgvector HNSW索引）
- [x] R016-R019: Agent架构升级（工具合并/上下文压缩/错误恢复/耗时追踪）
- [x] R020: 知识图谱深度重构（a~g,i,j完成）
- [x] R021: 语义缓存方案A

### V3.0 大版本升级（对外V3.0.0，内部V15）
- [x] 8项调研完成（CRM/OA/框架融合/JD/升级理论/多端前端/个人账号限制/Flutter迁移）
- [x] 调研报告：`docs/1-requirements-bugs/` 下9份报告
- [x] spec.md/design.md/task.md/REQUIREMENTS.md 已更新（R022-R028）
- [x] OA/CRM业务测试指南（32个场景，5级分级）
- [x] R024确认不选Flutter（3大致命理由：小程序缺失/SEO缺失/代码复用率0%）
- [x] R028机器人：飞书优先（免费组织可用），钉钉次优先，企微/微信预留
- [x] Phase 0: 规划（升级路线图/兼容性矩阵/回滚方案）
- [x] Phase 1: 基础设施（API Gateway/MCP Server/LangSmith/多端API抽象）
- [x] Phase 2: 核心功能（Odoo OA/Twenty CRM/飞书机器人/钉钉机器人/MCP Tool迁移/微信小程序/附注表路由优化/SaaS备选通道）
- [x] Phase 3: 集成验证（多端联调/E2E/性能/安全审计/OA/CRM业务测试/灰度发布方案）
- [x] Phase 4: 发布（灰度方案/监控/v1 deprecated标记）
- [x] R024-e: Capacitor MVP（native-bridge + capacitor.config.ts）
- [x] R024-f: 鸿蒙ArkTS原型（ChatPage.ets）
- [x] 测试基线：827个测试通过（8个skip是已有it.skip）

### V3.0 真实环境验证（2026-08-14）
- [x] Odoo Docker部署：容器已启动healthy，JSON-RPC认证成功（uid=2）
- [x] Odoo数据库初始化：`docker run --rm odoo:17 -- -i base -d odoo --stop-after-init`
- [x] 飞书AppID配置：cli_aaf7176853b8dd2b（config/bot-config.yaml + .env.docker）
- [x] Bot配置加载器：bot-config.ts（YAML解析+环境变量优先+isBotConfigured检查）
- [x] 真实Odoo E2E测试：odoo-real-e2e.test.ts（7个测试，Docker容器运行时自动执行）
- [x] 真实飞书E2E测试：feishu-real-e2e.test.ts（7个测试，配置AppSecret后自动执行）
- [x] Capacitor依赖安装：@capacitor/core@8.5.0 + @capacitor/cli@8.5.0 + @capacitor/preferences@8.0.1
- [x] capacitor.config.ts修复：JSON格式→TypeScript import type格式
- [x] 代码bug修复：registerAllMCPTools async、raw-table-search路径、mcp-handler id??null、langgraph-patterns callWithFallback类型
- [ ] 飞书App Secret：用户需在config/bot-config.yaml填写（用户操作）

### 已取消需求（2026-08-17，用户决定：不部署服务）
- [x] Twenty CRM Docker部署：~~阿里云镜像源403，需从Docker Hub直拉~~ → 取消，不部署
- [x] Capacitor原生构建：~~Next.js export模式不兼容API路由，需独立SPA策略~~ → 取消，不构建
- [x] 鸿蒙App构建：~~需安装DevEco Studio~~ → 取消，不构建
- [x] 服务器环境（负载均衡、压测、GPU部署）→ 取消

### V3.0 真实环境验证（2026-08-17 续）
- [x] R020-h 全量重建完成：3237 节点 / 4752 关系（基线 460 → 7 倍），4 个 PDF 年报文档（片仔癀/江苏银行/华海药业/东吴证券）补齐 rawContent 后由 `--resume` 重跑成功
- [x] ai_novel_postgres 镜像升级：postgres:16-alpine → pgvector/pgvector:pg16（同卷数据保留），agentdb 启用 vector 扩展 → 修复 semantic_cache/Embedding 全部 pgvector 报错
- [x] 容器网络修复：ai_novel_postgres（别名 postgres）与 ai_novel_redis（别名 redis）接入 aiagent_net → main_service/rag_service 由 unhealthy 恢复 healthy，nginx:80 全栈健康（DB/Redis/Neo4j/embedding 全 up）
- [x] E2E 回归（R020+R021）通过：5/5 query 图谱检索命中；LLM 调用减少 40%（冷启动 5 次 → 缓存轮 3 次，验收 ≥15%）；精确命中 5/5、语义命中 2/5（0.95 阈值）
- [x] 新增回归脚本：`scripts/e2e-r020-r021.ts`（可重复执行）

### 遗留项
- [ ] 冒烟测试（V14 Agent）
- [ ] 评估可靠性调研（需审批）
- [ ] 飞书App Secret配置（用户填写 config/bot-config.yaml）