# 开源轻量化 OA/CRM 自部署方案调研报告

> 调研日期：2026-08-13
> 调研目标：筛选可自部署的开源轻量化 OA/CRM 产品，评估与 AI Agent 平台的集成可行性

---

## 一、开源 OA 系统调研

### 1.1 产品总览

| 产品 | 语言 | GitHub Star | 部署方式 | API 开放度 | 功能覆盖 | 许可证 |
|------|------|------------|---------|----------|---------|--------|
| **O2OA（翱途）** | Java | 4.7k | Docker/原生 | REST API（中等） | 审批/通知/日程/文档/通讯录/考勤/即时通讯 | AGPL-3.0（商用需授权） |
| **Odoo（OA模块）** | Python | 53.7k | Docker | REST API + XML-RPC（优秀） | 全功能ERP+OA（审批/通知/日程/文档/HR/考勤/报销） | LGPL-3.0（Community） |
| **ERPNext（HR模块）** | Python/JS | 10.6k（frappe） | Docker | REST API（自动生成） | 全功能ERP+OA（审批/通知/日程/HR/考勤/报销） | MIT（frappe）/ GPL-3.0（ERPNext） |
| **NocoDB** | TypeScript/Node | 64.5k | Docker | REST API + SDK（优秀） | 数据管理/表单/看板/日历（需自建OA流程） | Sustainable Use License |
| **蓝信** | 闭源 | N/A | SaaS | 无公开API | 企业IM+OA | 商业闭源 |

### 1.2 详细分析

#### O2OA（翱途）⭐ 推荐关注

| 维度 | 详情 |
|------|------|
| **核心功能** | 流程引擎（BPMN 2.0）、表单定制、日程管理、通知公告、通讯录、文档管理、即时通讯、考勤打卡、报销管理、会议管理 |
| **API 开放度** | 有 REST API，支持 HTTP 调用；有 Webhook 机制；支持第三方集成。API 文档在官网 handbook 中，但不如国际产品规范 |
| **部署复杂度** | Docker 部署可行（需自行构建镜像）；最低 4GB 内存；需 Java 11+；自带 H2 数据库（开发用），生产建议 MySQL/PostgreSQL |
| **AI Agent 集成** | API 可调用但文档偏中文、不规范；无官方 SDK；需自行封装 Python/TS 客户端；流程引擎 API 是核心入口 |
| **社区活跃度** | GitHub 4.7k star，17k+ commits，Gitee 上更活跃；国内社区为主；最近持续更新 |
| **许可证** | AGPL-3.0，**内部使用免费，商业转售/闭源分发需购买商用许可** |
| **优势** | 功能最完整的国产开源 OA；流程引擎强大；支持国产信创 |
| **劣势** | Java 技术栈与当前项目不兼容；API 文档质量一般；资源占用较大（4GB+） |

#### Odoo（Community 版）⭐⭐ 强烈推荐

| 维度 | 详情 |
|------|------|
| **核心功能** | Approvals（审批）、Discuss（即时通讯/通知）、Calendar（日程）、Contacts（通讯录）、Documents（文档）、Employees（HR）、Time Off（请假）、Expenses（报销）、Knowledge（知识库） |
| **API 开放度** | **REST API + XML-RPC + JSON-RPC**，所有模型自动生成 API；支持 Webhook（需配置）；有官方 Python SDK（`odoorpc`）；第三方集成生态丰富 |
| **部署复杂度** | Docker 一键部署（`docker compose`）；最低 2GB 内存（仅OA模块）；PostgreSQL 数据库；Python 技术栈 |
| **AI Agent 集成** | **非常友好**：Python SDK 成熟；所有业务对象通过 ORM 自动暴露 API；可创建自定义模型和接口；社区有 AI 集成案例 |
| **社区活跃度** | GitHub 53.7k star，201k+ commits；全球最大开源 ERP 社区；模块市场 30,000+ 应用 |
| **许可证** | LGPL-3.0（Community 版），Enterprise 版商业许可 |
| **优势** | 功能最全面；Python 技术栈匹配；API 最成熟；社区最大；模块化按需安装 |
| **劣势** | 全功能安装较重；社区版部分高级功能缺失（如看板视图、移动端）；需学习 Odoo ORM |

#### ERPNext（Frappe 框架）⭐⭐ 推荐

| 维度 | 详情 |
|------|------|
| **核心功能** | HR（员工/考勤/请假/报销）、Project（项目管理）、CRM（客户管理）、Calendar（日程）、Notification（通知）、Workflow（审批流） |
| **API 开放度** | **REST API 自动生成**（每个 DocType 自动暴露 CRUD）；支持 Webhook；有 Python API（`frappe.client`）；支持 OAuth2 |
| **部署复杂度** | Docker 部署（`frappe_docker`）；最低 4GB 内存；MariaDB + Redis；Python + JS |
| **AI Agent 集成** | API 友好；Python 后端可深度定制；Frappe 框架支持自定义 API 端点；社区有 AI 集成方案 |
| **社区活跃度** | Frappe 10.6k star，59k+ commits；活跃的印度社区；Frappe Cloud 托管服务 |
| **许可证** | MIT（Frappe 框架）/ GPL-3.0（ERPNext） |
| **优势** | Python 技术栈；低代码框架；API 自动生成；OA+CRM 一体 |
| **劣势** | 资源需求较高（4GB+）；MariaDB 而非 PostgreSQL；学习曲线较陡 |

#### NocoDB（补充推荐——轻量数据管理）

| 维度 | 详情 |
|------|------|
| **核心功能** | 电子表格式数据管理、表单、看板、日历、画廊视图；自动化工作流（Slack/Discord/Email 集成）；权限控制 |
| **API 开放度** | **REST API + SDK**，自动从数据库 schema 生成；支持 JWT/Social Auth；Swagger 文档 |
| **部署复杂度** | Docker 一键部署；最低 1GB 内存；支持 SQLite/PostgreSQL/MySQL |
| **AI Agent 集成** | API 非常友好；有 NocoDB SDK；可直接操作底层数据库 |
| **社区活跃度** | GitHub 64.5k star；非常活跃 |
| **许可证** | Sustainable Use License（非标准开源，商业使用需注意） |
| **优势** | 极轻量；API 自动生成；可连接已有 PostgreSQL |
| **劣势** | 不是完整 OA 系统（无审批流/IM/考勤）；需自建业务逻辑 |

#### 蓝信 / 简道云 / Zotero

| 产品 | 结论 |
|------|------|
| **蓝信** | 闭源商业产品，无自部署能力，**排除** |
| **简道云** | SaaS 低代码平台，无开源版本，**排除** |
| **Zotero+插件** | 文献管理工具，非 OA 系统，**排除** |

---

## 二、开源 CRM 系统调研

### 2.1 产品总览

| 产品 | 语言 | GitHub Star | 部署方式 | API 开放度 | 功能覆盖 | 许可证 |
|------|------|------------|---------|----------|---------|--------|
| **Twenty CRM** | TypeScript | 54.8k | Docker | REST + GraphQL + MCP（极佳） | 客户/联系人/商机/任务/笔记/仪表盘/工作流 | AGPL-3.0 |
| **Odoo（CRM模块）** | Python | 53.7k | Docker | REST + XML-RPC（优秀） | 客户/销售漏斗/商机/合同/报表/邮件营销 | LGPL-3.0 |
| **ERPNext（CRM模块）** | Python/JS | 10.6k | Docker | REST API（自动生成） | 客户/商机/合同/报表/邮件营销/客服工单 | GPL-3.0 |
| **Monica** | PHP | 25.0k | Docker | REST API（中等） | 个人关系管理（联系人/提醒/日记/任务） | AGPL-3.0 |
| **SuiteCRM** | PHP | 5.7k | Docker | REST API + SOAP（中等） | 客户/销售漏斗/商机/合同/报表/工单/营销 | AGPL-3.0 |
| **CiviCRM** | PHP | 763 | 需 CMS | REST API（中等） | 非营利 CRM/捐款/会员/活动/邮件 | AGPL-3.0 |

### 2.2 详细分析

#### Twenty CRM ⭐⭐⭐ 最强烈推荐

| 维度 | 详情 |
|------|------|
| **核心功能** | Companies（客户公司）、People（联系人）、Opportunities（商机/销售漏斗）、Tasks（任务）、Notes（笔记）、Dashboards（仪表盘/报表）、Workflows（自动化工作流）、AI Agents（内置 AI 集成） |
| **API 开放度** | **REST API + GraphQL API**，schema-per-tenant 自动生成；支持 Webhook；支持 OAuth2；**原生 MCP Server**（AI Agent 可直接通过 MCP 协议操作 CRM 数据）；Metadata API 可编程修改数据模型 |
| **部署复杂度** | Docker Compose 一键部署；**最低 2GB 内存**；PostgreSQL + Redis；一键安装脚本 |
| **AI Agent 集成** | **最佳**：原生 MCP Server 支持（Claude/ChatGPT/Cursor 可直接连接）；REST + GraphQL 双 API；API Key 认证；批量操作（60条/请求）；TypeScript 技术栈与前端匹配 |
| **社区活跃度** | GitHub 54.8k star，14k+ commits；Discord 7.1k 成员；2024-2026 快速增长；被法国政府、Bayer、PwC 使用 |
| **许可证** | AGPL-3.0 |
| **优势** | 现代化 UI（类 Notion）；TypeScript 全栈；原生 AI/MCP 支持；API 最开放；轻量部署；可扩展 App 框架 |
| **劣势** | 较新项目（部分功能仍在迭代）；无内置邮件营销；无客服工单；合同管理需自定义 |

#### Odoo（CRM 模块）⭐⭐ 强烈推荐

| 维度 | 详情 |
|------|------|
| **核心功能** | Leads（线索）、Opportunities（商机/销售漏斗）、Customers（客户）、Activities（活动）、Quotations（报价/合同）、Reporting（报表/仪表盘）、Email Marketing（邮件营销）、Helpdesk（客服工单） |
| **API 开放度** | REST + XML-RPC + JSON-RPC；Python SDK（`odoorpc`）；所有模型自动暴露 API |
| **部署复杂度** | Docker 一键部署；最低 2GB（仅 CRM）；PostgreSQL |
| **AI Agent 集成** | 非常友好；Python SDK 成熟；CRM 模型完整暴露；可自定义 API 端点 |
| **社区活跃度** | 全球最大开源 ERP 社区；30k+ 模块 |
| **许可证** | LGPL-3.0（Community） |
| **优势** | 功能最完整的 CRM；邮件营销+客服工单+合同管理齐全；Python 技术栈 |
| **劣势** | UI 较传统；全模块安装较重；学习曲线 |

#### Monica

| 维度 | 详情 |
|------|------|
| **核心功能** | 联系人管理、关系定义、提醒（生日等）、活动记录、日记、任务、文档上传、标签 |
| **API 开放度** | 有 REST API；Laravel 后端；无 GraphQL；无 Webhook |
| **部署复杂度** | Docker 部署；最低 1GB；MySQL/MariaDB/PostgreSQL |
| **AI Agent 集成** | API 可用但功能有限；无 SDK；适合个人关系管理，不适合企业 CRM |
| **社区活跃度** | 25k star 但开发放缓（966 commits） |
| **许可证** | AGPL-3.0 |
| **结论** | **定位是个人 PRM，不是企业 CRM**，缺少销售漏斗/商机/合同/报表，**不推荐作为企业 CRM** |

#### SuiteCRM

| 维度 | 详情 |
|------|------|
| **核心功能** | 客户/联系人/商机/合同/报价/报表/工单/营销活动/工作流 |
| **API 开放度** | REST API v8 + SOAP；有 Swagger 文档；但 API 设计较旧 |
| **部署复杂度** | Docker 部署；最低 2GB；PHP + MySQL/MariaDB |
| **AI Agent 集成** | API 可用但较旧；PHP 技术栈不匹配；无现代 SDK |
| **社区活跃度** | 5.7k star，17k+ commits；但活跃度下降；SuiteCRM 8 重写中 |
| **许可证** | AGPL-3.0 |
| **结论** | 功能完整但技术栈老旧（PHP/Legacy），UI 过时，**不推荐** |

#### CiviCRM

| 维度 | 详情 |
|------|------|
| **核心功能** | 捐款管理、会员管理、活动管理、邮件营销、案例管理 |
| **API 开放度** | REST API v4；但需依赖 CMS（Drupal/WordPress/Backdrop） |
| **部署复杂度** | 需先部署 CMS，再安装 CiviCRM 插件；复杂度高 |
| **AI Agent 集成** | API 可用但需通过 CMS 层；集成复杂 |
| **社区活跃度** | 763 star；非营利组织社区 |
| **许可证** | AGPL-3.0 |
| **结论** | **专为非营利组织设计**，不适合商业 CRM 场景，**排除** |

---

## 三、推荐方案

### 3.1 约束条件回顾

- **硬件**：i7/16GB/512SSD，已有 5 容器 + 2 复用 ≈ 6GB 内存占用，**剩余约 10GB**
- **技术栈**：Python（后端）+ TypeScript（前端）+ PostgreSQL + Redis + Docker
- **需求**：OA 覆盖审批+通知+基本功能；CRM 覆盖客户+销售+报表
- **优先级**：轻量化 > API 友好 > 功能完整 > 技术栈兼容

### 3.2 推荐方案

| 需求 | 推荐产品 | 理由 | 部署资源 | 集成难度 |
|------|---------|------|---------|---------|
| **CRM** | **Twenty CRM** | TypeScript 全栈、原生 MCP 支持、REST+GraphQL、轻量2GB、PostgreSQL、现代 UI、AI-first 设计 | 2GB RAM + PostgreSQL + Redis | ⭐极低（MCP 直连） |
| **OA** | **Odoo Community（仅 OA 模块）** | Python 技术栈、功能最完整（审批/通知/日程/HR/考勤/报销）、REST API 成熟、社区最大 | 2-3GB RAM + PostgreSQL | ⭐低（Python SDK） |
| **轻量备选 OA** | **NocoDB + 自建流程** | 极轻量1GB、API 自动生成、可连已有 PG、适合简单数据管理场景 | 1GB RAM | ⭐⭐中（需自建审批逻辑） |

### 3.3 方案对比

| 方案 | 总内存 | 总容器数 | 功能完整度 | 集成难度 | 推荐度 |
|------|--------|---------|----------|---------|--------|
| **Twenty + Odoo** | ~5GB | +3（twenty-server/worker, odoo, odoo-db 可复用 PG） | ⭐⭐⭐⭐⭐ | ⭐极低 | **首选** |
| **Twenty + NocoDB** | ~3GB | +2（twenty, nocodb） | ⭐⭐⭐（OA功能弱） | ⭐低 | 轻量备选 |
| **Twenty + ERPNext** | ~6GB | +3（erpnext, redis, maria-db） | ⭐⭐⭐⭐⭐ | ⭐⭐中 | 功能全但重 |
| **Odoo Only（OA+CRM一体）** | ~3GB | +1（odoo, 复用PG） | ⭐⭐⭐⭐ | ⭐低 | 最简方案 |

### 3.4 最终推荐：Twenty CRM + Odoo OA

**理由**：
1. **Twenty CRM** 是目前 AI 集成最友好的开源 CRM——原生 MCP Server，Agent 可直接用自然语言操作 CRM
2. **Odoo OA** 功能最完整、Python 技术栈匹配、API 成熟、社区最大
3. 两者合计约 5GB 内存，在 16GB 机器上可行
4. 两者都用 PostgreSQL，可与现有 `ai_novel_postgres` 复用或独立部署

---

## 四、与 AI Agent 的集成方案

### 4.1 Agent 操作 CRM（Twenty）

```python
# 方式1：通过 MCP 协议（推荐，最简单）
# Twenty 原生提供 MCP Server，Agent 直接通过 MCP 工具调用
# 无需写任何集成代码，Agent 天然支持

# 方式2：通过 REST API
import httpx

TWENTY_API = "http://twenty-server:3000"
API_KEY = "xxx"

# 创建客户
client.httpx.post(f"{TWENTY_API}/rest/companies", 
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"name": "新客户", "domainName": "example.com"})

# 创建商机
client.httpx.post(f"{TWENTY_API}/rest/opportunities",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"name": "新商机", "amount": 50000, "companyId": "xxx"})

# 查询客户
client.httpx.get(f"{TWENTY_API}/rest/companies?filter[name][eq]=测试",
    headers={"Authorization": f"Bearer {API_KEY}"})

# 方式3：通过 GraphQL（复杂查询推荐）
query = """
query GetCompaniesWithOpportunities {
  companies(filter: { createdAt: { gte: "2026-01-01" } }) {
    edges {
      node { id name domainName opportunities { id name amount } }
    }
  }
}
"""
```

**Agent 可执行的 CRM 操作**：
- 创建/更新/查询客户公司
- 创建/更新商机（销售漏斗阶段变更）
- 添加联系人
- 创建任务和笔记
- 生成报表数据（通过 GraphQL 聚合查询）
- 触发工作流（通过 Webhook）

### 4.2 Agent 操作 OA（Odoo）

```python
# 通过 XML-RPC API（Odoo 官方推荐）
import xmlrpc.client

url = "http://odoo:8069"
db = "odoo"
uid = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common").authenticate(db, "admin", "password", {})
models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")

# 提交审批
models.execute_kw(db, uid, "password", "approval.request", "create", [{
    "name": "AI Agent 提交的审批",
    "category_id": 1,
    "request_owner_id": uid,
}])

# 发送通知（通过 mail.message）
models.execute_kw(db, uid, "password", "mail.message", "create", [{
    "body": "AI Agent 通知：新客户已添加到 CRM",
    "model": "res.partner",
    "res_id": 42,
}])

# 查询日程
meetings = models.execute_kw(db, uid, "password", "calendar.event", "search_read", 
    [[["start", ">=", "2026-08-13"]]], 
    {"fields": ["name", "start", "stop"]})

# 创建报销单
models.execute_kw(db, uid, "password", "hr.expense", "create", [{
    "name": "差旅费",
    "total_amount": 1500,
    "employee_id": 1,
}])
```

**Agent 可执行的 OA 操作**：
- 提交审批请求（approval.request）
- 发送内部通知（mail.message）
- 查询/创建日程（calendar.event）
- 查询通讯录（res.partner）
- 提交报销单（hr.expense）
- 请假申请（hr.leave）
- 查询公告（mail.channel）

### 4.3 部署架构

```yaml
# docker-compose.yml 新增服务（追加到现有配置）

services:
  # ===== Twenty CRM =====
  twenty-server:
    image: twentycrm/twenty:latest
    ports:
      - "3000:3000"  # 注意：与 ai_novel_frontend 冲突，改用 3010
    environment:
      - SERVER_URL=http://localhost
      - PG_DATABASE_URL=postgresql://postgres:xxx@postgres:5432/twenty
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=xxx
    depends_on:
      - postgres
      - redis
    deploy:
      resources:
        limits:
          memory: 1.5G

  twenty-worker:
    image: twentycrm/twenty:latest
    command: ["node", "worker.js"]
    environment:
      - PG_DATABASE_URL=postgresql://postgres:xxx@postgres:5432/twenty
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    deploy:
      resources:
        limits:
          memory: 512M

  # ===== Odoo OA =====
  odoo:
    image: odoo:17
    ports:
      - "8069:8069"
    environment:
      - HOST=postgres
      - USER=postgres
      - PASSWORD=xxx
    volumes:
      - odoo_data:/var/lib/odoo
    depends_on:
      - postgres
    deploy:
      resources:
        limits:
          memory: 2G
    command: -- --database=odoo --db_host=postgres --db_user=postgres --db_password=xxx -i hr,approvals,calendar,contacts,discuss,documents,expenses,knowledge --without-demo=all

volumes:
  odoo_data:
```

### 4.4 Nginx 路由配置

```nginx
# 追加到现有 nginx 配置
location /crm/ {
    proxy_pass http://twenty-server:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /oa/ {
    proxy_pass http://odoo:8069/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### 4.5 内存预算

| 服务 | 内存 |
|------|------|
| 现有容器（5+2复用） | ~6GB |
| Twenty server + worker | ~2GB |
| Odoo | ~2GB |
| **总计** | **~10GB / 16GB** |

剩余 6GB 缓冲，可行。

### 4.6 Agent 集成架构图

```
用户浏览器 → nginx(80) → main-service(AI Agent)
                          ↓
                    ┌─────┴─────┐
                    ↓           ↓
              Twenty CRM     Odoo OA
              (MCP/REST)    (XML-RPC/REST)
              :3000          :8069
                    ↓           ↓
              PostgreSQL (复用或独立)
              Redis (复用)
```

**集成方式**：
1. **Twenty CRM** → 通过 MCP 协议直连（Agent 天然支持），或 REST/GraphQL API
2. **Odoo OA** → 通过 XML-RPC API（Python `xmlrpc.client`），封装为 Agent Tool

---

## 五、实施路线图

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| Phase 0 | Docker 部署 Twenty + Odoo；验证 API 可用性 | 1-2 天 |
| Phase 1 | 封装 Agent Tool：CRM Tool（Twenty REST）、OA Tool（Odoo XML-RPC） | 3-5 天 |
| Phase 2 | 配置 Odoo OA 模块（审批流/通知/日程/HR）；配置 Twenty CRM（客户/商机/漏斗） | 2-3 天 |
| Phase 3 | Agent 对话集成：用户通过对话操作 OA/CRM | 3-5 天 |
| Phase 4 | MCP Server 集成（Twenty 原生支持）；端到端测试 | 2-3 天 |

---

## 六、风险与注意事项

1. **端口冲突**：Twenty 默认 3000 与 ai_novel_frontend 冲突，需改用 3010 或通过 nginx 路由
2. **PostgreSQL 复用**：Twenty 和 Odoo 都需要 PostgreSQL，可在同一 PG 实例创建不同 database
3. **AGPL 许可证**：Twenty 和 O2OA 都是 AGPL，修改代码后必须开源；Odoo Community 是 LGPL，更宽松
4. **Odoo 初始化**：首次部署需通过 Web 界面创建数据库和安装模块，不能纯 API 完成
5. **Twenty 版本**：项目较新，API 可能有 breaking change，建议锁定版本号
6. **内存监控**：10GB/16GB 使用率较高，需监控避免 OOM；可考虑 swap 或降低 worker 内存