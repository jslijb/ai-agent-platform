# AI Agent 接入 CRM/OA 系统——从问答到流程提交/审批

> ⚠️ **本报告仅覆盖 SaaS API 方案**（飞书/钉钉/企微/Salesforce/HubSpot）。
> **自部署开源产品方案**请查看：**`open-source-oa-crm-research.md`**
> **个人账号限制调研**请查看：**`wecom-dingtalk-feishu-personal-account-research.md`**
> **业务测试指南**请查看：**`oa-crm-business-test-guide.md`**
>
> 最终决策：优先部署 Odoo OA + Twenty CRM（自部署），飞书/钉钉/企微作为备选通道。
> 日期：2026-08-12（初版）| 2026-08-13（添加补充说明）

---

## 一、调研背景与目标

当前平台基于 LangChain/LangGraph，仅支持问答能力。用户期望扩展至：
1. **提交业务流程**（请假、报销、客户跟进记录）
2. **审批流程**（审批请假、审批报销）
3. **查询流程状态**

本报告从 API 能力、集成方案、关键挑战、融合方案、行业案例五个维度展开调研。

---

## 二、主流 CRM/OA 系统 API 能力调研

### 2.1 钉钉（DingTalk）开放平台

| 维度 | 详情 |
|------|------|
| **审批 API** | ✅ 完整。支持发起审批实例（`/processinstance/create`）、获取审批详情、批量获取审批单号、审批状态变化回调通知 |
| **认证方式** | 企业内部应用 access_token（AppKey/AppSecret） |
| **审批模板** | 支持通过 API 获取模板详情（`/process/getbyuserid`），支持 16+ 控件类型（Text/Number/Money/Date/Selector/Contact/File/Table/DateRange/Vacation/Attendance/Location/RelatedApproval/Formula 等） |
| **流程引擎** | 支持 `use_template_approver=1` 使用管理后台配置的审批流程，也支持 `=0` 通过接口指定审批人（会签/或签/依次审批） |
| **回调机制** | ✅ 审批状态变化回调通知（审批通过/拒绝/撤销） |
| **OA 其他** | 考勤打卡、汇报、日程、待办任务、CRM 客户管理 |
| **AI 助理** | 钉钉 AI 助理支持对话式发起审批，通过机器人接收消息→解析意图→调用审批 API |
| **速率限制** | 单接口 QPS 限制，企业级应用一般够用 |
| **集成难度** | ⭐⭐（低），API 文档完善，Python SDK 可用 |

**关键 API 示例（发起审批）：**
```
POST https://oapi.dingtalk.com/topapi/processinstance/create
```
请求体需包含：`process_code`（审批模板ID）、`originator_user_id`（发起人）、`form_component_values`（表单值）、`approver_node_list`（审批节点）。

### 2.2 企业微信（WeCom）API

| 维度 | 详情 |
|------|------|
| **审批 API** | ✅ 完整。提交审批申请（`/oa/applyevent`）、获取审批申请详情、批量获取审批单号、审批状态变化回调 |
| **认证方式** | access_token（CorpID/Secret） |
| **审批模板** | 支持获取审批模板详情（`/oa/gettemplatedetail`），支持 16+ 控件类型 |
| **流程引擎** | 支持 `use_template_approver=0/1`，支持会签/或签/依次审批 |
| **回调机制** | ✅ 审批状态变化回调通知 |
| **OA 其他** | 打卡、汇报、日程、会议、微盘、邮件、人事助手 |
| **CRM 能力** | ✅ 客户联系（获取客户列表/详情、客户群管理、客户朋友圈、获客助手） |
| **速率限制** | 依接口不同，一般 500-2000 次/分钟 |
| **集成难度** | ⭐⭐（低），文档完善，回调签名验证需注意 |

**关键 API 示例（提交审批）：**
```
POST https://qyapi.weixin.qq.com/cgi-bin/oa/applyevent?access_token=ACCESS_TOKEN
```
请求体需包含：`creator_userid`、`template_id`、`use_template_approver`、`apply_data`（表单控件值）、`summary_list`（摘要信息）、可选 `process`（自定义审批人）。

### 2.3 飞书（Feishu/Lark）API

| 维度 | 详情 |
|------|------|
| **审批 API** | ✅ 最完整。创建审批定义（`/approval/v4/approvals`）、创建审批实例（`/approval/v4/instances`）、获取审批实例详情、批量获取审批实例 ID、审批实例状态变更回调 |
| **认证方式** | tenant_access_token（App ID/App Secret） |
| **审批模板** | 支持 API 创建审批定义（含表单控件、审批节点、抄送人），也支持管理后台创建 |
| **流程引擎** | 支持 AND（会签）/OR（或签）/SEQUENTIAL（依次审批），支持自选审批人、自动审批节点 |
| **回调机制** | ✅ 审批实例状态变更事件订阅 |
| **OA 其他** | 日历、文档、多维表格（Bitable）、消息、机器人 |
| **国际化** | ✅ 原生支持 i18n（zh-CN/en-US/ja-JP） |
| **速率限制** | 创建审批定义 1000次/分钟，创建审批实例 100次/分钟 |
| **集成难度** | ⭐⭐⭐（中低），API 设计最规范，但审批定义创建需谨慎（不可删除） |

**关键 API 示例（创建审批实例）：**
```
POST https://open.feishu.cn/open-apis/approval/v4/instances
```
请求体需包含：`approval_code`、`user_id`/`open_id`、`form`（JSON 数组转义字符串）、可选 `node_approver_user_id_list`（指定审批人）、`uuid`（幂等键）。

### 2.4 泛微（Weaver）OA API

| 维度 | 详情 |
|------|------|
| **API 类型** | RESTful API + WebService（SOAP），生态引擎 E-Builder |
| **流程 API** | ✅ 支持。创建流程、提交审批、获取流程状态、审批动作（同意/拒绝/退回） |
| **认证方式** | Token 认证 / OAuth2.0 |
| **特点** | 传统 OA 巨头，API 偏重内部集成，开放程度不如钉钉/飞书 |
| **集成方式** | 主要通过 E-Bridge/ECology 接口，需要部署中间件 |
| **集成难度** | ⭐⭐⭐⭐（中高），文档分散，版本差异大，需对接方配合 |

### 2.5 致远互联 OA API

| 维度 | 详情 |
|------|------|
| **API 类型** | RESTful API，CAP4 应用定制平台 |
| **流程 API** | ✅ 支持。协同工作 API、公文管理 API |
| **AI 能力** | 已推出 CoMi 智能体家族、CoMi Builder（企业级智能体定制平台）、"边问边办"（AI 问答式驱动全流程） |
| **特点** | 面向政企，信创适配好，AI 集成走在传统 OA 前列 |
| **集成难度** | ⭐⭐⭐⭐（中高），API 开放度有限，多依赖定制开发 |

### 2.6 Salesforce API（国际 CRM 标杆）

| 维度 | 详情 |
|------|------|
| **API 类型** | REST API / SOAP API / Bulk API / Streaming API / GraphQL API |
| **审批 API** | ✅ Approval Process API（`/process/approvals/`），支持提交审批、审批操作（Approve/Reject/Recall） |
| **CRM 核心** | Lead/Contact/Account/Opportunity 全对象 CRUD |
| **认证方式** | OAuth 2.0（Bearer Token） |
| **事件驱动** | ✅ Streaming API（PushTopic/Platform Events/Change Data Events） |
| **AI 能力** | Einstein AI（预测/推荐/对话）、Einstein Copilot |
| **速率限制** | API 请求限制依版本（Enterprise: 100,000/24h） |
| **集成难度** | ⭐⭐（低），文档极完善，生态最成熟 |

### 2.7 HubSpot API

| 维度 | 详情 |
|------|------|
| **API 类型** | REST API，2026-03 起采用日期版本化（`/crm/objects/2026-03/contacts`） |
| **CRM 核心** | Contacts/Companies/Deals/Tickets/Products 全对象 |
| **审批能力** | ❌ 无原生审批流程 API，需通过自定义对象 + Workflow 实现 |
| **认证方式** | OAuth 2.0 / Private App Access Token |
| **事件驱动** | ✅ Webhooks（联系人/交易变更通知） |
| **集成难度** | ⭐⭐（低），API 设计现代，文档完善 |

### 2.8 用友/金蝶 ERP API

| 维度 | 详情 |
|------|------|
| **用友 YonBIP** | Open API 平台，支持财务/供应链/人力等模块，OAuth2.0 认证 |
| **金蝶云星空** | OpenAPI，支持 WebAPI/KSQL 查询，OAuth2.0 认证 |
| **审批能力** | ✅ 两者均支持工作流/审批流 API |
| **特点** | 偏重财务/供应链，审批流是辅助能力 |
| **集成难度** | ⭐⭐⭐⭐（中高），API 开放度有限，多需商务合作 |

---

## 三、AI Agent 与 CRM/OA 集成的技术方案

### 3.1 方案对比总览

| 方案 | 适用场景 | 优势 | 劣势 | 推荐度 |
|------|----------|------|------|--------|
| **Function Calling / Tool Use** | 标准化 API 调用 | 与 LangChain 生态天然契合，开发快 | 需逐一封装，维护成本随系统增长 | ⭐⭐⭐⭐⭐ |
| **MCP（Model Context Protocol）** | 跨平台统一接入 | 标准化协议，一次开发多端复用 | 生态尚在建设，CRM/OA MCP Server 稀缺 | ⭐⭐⭐⭐ |
| **RPA（机器人流程自动化）** | 无 API 或 API 不开放 | 不依赖 API，模拟人工操作 | 脆弱（UI 变更即失效）、速度慢、审计难 | ⭐⭐ |
| **API Gateway + 事件驱动** | 企业级多系统整合 | 解耦、可观测、限流熔断 | 架构复杂度高，需额外基础设施 | ⭐⭐⭐⭐ |

### 3.2 Function Calling / Tool Use 模式（推荐首选）

**原理**：将每个 CRM/OA 操作封装为 LangChain Tool，Agent 通过 Function Calling 选择并执行。

```python
from langchain_core.tools import tool

@tool
def submit_leave_approval(leave_type: str, start_date: str, end_date: str, reason: str) -> str:
    """提交请假审批申请到钉钉/企业微信/飞书
    
    Args:
        leave_type: 请假类型（年假/事假/病假/调休）
        start_date: 开始日期（YYYY-MM-DD）
        end_date: 结束日期（YYYY-MM-DD）
        reason: 请假原因
    """
    platform = get_current_platform()
    client = get_oa_client(platform)
    result = client.create_approval_instance(
        template_code=LEAVE_TEMPLATE_MAP[platform],
        originator_user_id=get_current_user_id(),
        form_data={
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "reason": reason
        }
    )
    return f"请假申请已提交，审批单号：{result['instance_code']}"

@tool
def query_approval_status(instance_code: str) -> str:
    """查询审批流程状态
    
    Args:
        instance_code: 审批单号
    """
    platform = get_current_platform()
    client = get_oa_client(platform)
    result = client.get_approval_instance(instance_code)
    return f"审批状态：{result['status']}，当前节点：{result['current_node']}"
```

**架构图**：
```
用户输入 → LangGraph Agent → Tool Router → OA Tool（钉钉/企微/飞书/...）
                                              ↓
                                         OA API Client
                                              ↓
                                         CRM/OA 系统
```

### 3.3 MCP（Model Context Protocol）模式

**原理**：MCP 是 Anthropic 发起的开放协议，类似"AI 的 USB-C 接口"，标准化 AI 应用与外部系统的连接。

**核心概念**：
- **MCP Server**：暴露数据源和工具（如钉钉审批 MCP Server）
- **MCP Client**：AI 应用侧（如我们的 LangGraph Agent）
- **传输方式**：stdio / SSE / Streamable HTTP

**可行性分析**：
- ✅ 协议已获 Claude、ChatGPT、VS Code、Cursor 等广泛支持
- ✅ 一次开发 MCP Server，多个 AI 客户端可复用
- ⚠️ 目前 CRM/OA 领域的 MCP Server 生态尚不成熟，需自建
- ⚠️ LangChain/LangGraph 对 MCP 的原生支持还在早期阶段

**实现路径**：
```python
# MCP Server 示例（钉钉审批）
from mcp.server import Server

server = Server("dingtalk-approval")

@server.tool("create_approval")
async def create_approval(template_code: str, form_data: dict) -> dict:
    """创建钉钉审批实例"""
    client = DingTalkClient()
    return await client.create_approval(template_code, form_data)

@server.tool("query_approval")
async def query_approval(instance_code: str) -> dict:
    """查询审批状态"""
    client = DingTalkClient()
    return await client.get_approval(instance_code)
```

### 3.4 RPA 模式（备选/兜底）

**适用场景**：目标系统无 API 或 API 不开放（如部分私有化部署的泛微/致远）。

**工具选择**：
- Python: `playwright` / `selenium` / `pyautogui`
- 商业: UiPath / 影刀 / 实在智能

**局限性**：
- UI 变更→脚本失效，维护成本高
- 执行速度慢（秒级 vs API 毫秒级）
- 审计追踪困难
- 不推荐作为主方案，仅作 API 不可用时的兜底

### 3.5 API Gateway + 事件驱动模式

**架构**：
```
LangGraph Agent → API Gateway → OA Service Adapter → CRM/OA API
                                      ↑
                                  Event Bus ← CRM/OA 回调
                                      ↓
                                  消息队列 → Agent 回调处理
```

**核心组件**：
1. **API Gateway**：统一入口，限流、熔断、认证、日志
2. **OA Service Adapter**：适配不同 OA 系统的 API 差异
3. **Event Bus**：接收 OA 系统的回调通知（审批状态变更等）
4. **消息队列**：异步处理长流程的回调

---

## 四、关键挑战与解决方案

### 4.1 权限控制：Agent 如何获取用户身份和权限

**挑战**：Agent 不能使用"超级管理员"身份操作，必须以"当前用户"身份发起/审批流程。

**解决方案**：

| 方案 | 描述 | 适用场景 |
|------|------|----------|
| **OAuth2.0 代理** | 用户首次使用时授权 Agent 应用，Agent 获取 user_access_token | 钉钉/飞书/企微均支持 |
| **用户身份映射** | 平台 userId ↔ OA 系统 userId 映射表 | 企业内部系统 |
| **JWT 传递** | 前端将用户 JWT 传给 Agent，Agent 从 JWT 提取身份后调用 OA API | 当前项目已有 JWT 体系 |
| **审批流代理** | OA 系统配置"应用身份"代理发起审批（需管理员授权） | 服务端定时任务场景 |

**推荐方案**：结合当前项目的 JWT 体系，在 Agent 调用 OA Tool 时：
1. 从请求上下文提取 `userId`
2. 查询 `user_oa_mapping` 表获取 OA 系统的 userId
3. 使用 `tenant_access_token` + `originator_user_id` 发起审批

```python
class OAContext:
    def __init__(self, user_id: str):
        self.platform_user_id = self._resolve_oa_user_id(user_id)
        self.access_token = self._get_platform_token()
    
    def _resolve_oa_user_id(self, internal_user_id: str) -> str:
        mapping = db.query("SELECT oa_user_id FROM user_oa_mapping WHERE user_id = ?", internal_user_id)
        return mapping.oa_user_id
```

### 4.2 数据安全：敏感数据脱敏

**挑战**：薪资、客户信息等敏感数据，Agent 不能原样返回给用户或写入日志。

**解决方案**：

1. **字段级脱敏策略**
```python
SENSITIVE_FIELDS = {
    "salary": MaskStrategy.PARTIAL_MASK,      # 12,000 → 1***0
    "phone": MaskStrategy.PHONE_MASK,          # 13812345678 → 138****5678
    "id_card": MaskStrategy.ID_CARD_MASK,      # 110101199001011234 → 110101****1234
    "bank_account": MaskStrategy.FULL_MASK,    # → ****
}

def mask_response(data: dict, user_permissions: list) -> dict:
    for field, strategy in SENSITIVE_FIELDS.items():
        if field in data and field not in user_permissions:
            data[field] = apply_mask(data[field], strategy)
    return data
```

2. **权限矩阵**：基于 RBAC，不同角色看到不同字段
3. **审计日志**：所有 OA 操作记录操作人、时间、数据摘要（不记录原文）
4. **传输加密**：HTTPS + API 签名验证

### 4.3 流程合规：审批流程的审计追踪

**挑战**：审批操作必须有完整的审计链，满足金融监管要求。

**解决方案**：

```python
class ApprovalAuditLog:
    @staticmethod
    async def log(action: str, user_id: str, instance_code: str, details: dict):
        await db.insert("approval_audit_log", {
            "action": action,           # submit/approve/reject/revoke
            "user_id": user_id,
            "instance_code": instance_code,
            "platform": get_current_platform(),
            "details_hash": hash(json.dumps(details)),  # 不存原文
            "timestamp": datetime.utcnow(),
            "ip_address": get_client_ip(),
            "user_agent": get_user_agent(),
        })
```

**审计要求**：
- 不可篡改（写入只追加表）
- 可追溯（操作链完整）
- 可验证（与 OA 系统侧记录可交叉验证）

### 4.4 异步处理：长流程的回调机制

**挑战**：审批流程可能持续数小时甚至数天，Agent 不能阻塞等待。

**解决方案**：

```
方案 A：Webhook 回调（推荐）
┌──────────┐     提交审批      ┌──────────┐
│  Agent   │ ──────────────→ │  OA 系统  │
└──────────┘                  └──────────┘
      ↑                            │
      │  审批状态变更回调           │ 审批中...
      │←───────────────────────────┘
      │
      ↓
  更新对话上下文，通知用户

方案 B：轮询（备选）
Agent 定时查询审批状态（间隔 5-30 分钟），适用于 OA 系统不支持回调的场景
```

**实现**：
```python
# FastAPI 回调端点
@app.post("/api/v1/oa/callback")
async def oa_callback(request: Request):
    event = await parse_oa_event(request)
    
    if event.type == "APPROVAL_STATUS_CHANGE":
        instance = await get_approval_instance(event.instance_code)
        
        # 更新审批状态到数据库
        await update_approval_status(instance)
        
        # 通过 SSE 推送给前端用户
        await notify_user(instance.originator_user_id, {
            "type": "approval_status_changed",
            "instance_code": instance.code,
            "status": instance.status,
        })
        
        # 如果 Agent 有等待中的对话，恢复执行
        await resume_agent_if_waiting(instance.code, instance.status)
    
    return {"code": 0}
```

---

## 五、与当前项目（LangGraph Agent）的融合方案

### 5.1 OA Tool 封装架构

```
langchain-tools/
├── oa/
│   ├── base.py              # OABaseTool（基类，含认证/限流/日志）
│   ├── dingtalk/
│   │   ├── approval.py      # DingTalkApprovalTool
│   │   ├── attendance.py    # DingTalkAttendanceTool
│   │   └── client.py        # DingTalkClient
│   ├── wecom/
│   │   ├── approval.py      # WeComApprovalTool
│   │   └── client.py        # WeComClient
│   ├── feishu/
│   │   ├── approval.py      # FeishuApprovalTool
│   │   └── client.py        # FeishuClient
│   └── adapter.py           # OAAdapter（统一接口，屏蔽平台差异）
├── crm/
│   ├── salesforce/
│   │   └── crm_tool.py      # SalesforceCRMTool
│   └── hubspot/
│       └── crm_tool.py      # HubSpotCRMTool
└── registry.py              # ToolRegistry（动态注册/发现）
```

### 5.2 统一接口设计

```python
from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel

class ApprovalRequest(BaseModel):
    template_code: str
    originator_user_id: str
    form_data: dict
    approvers: Optional[list] = None
    summary: Optional[list] = None

class ApprovalResponse(BaseModel):
    instance_code: str
    status: str
    message: str

class ApprovalStatus(BaseModel):
    instance_code: str
    status: str              # PENDING/APPROVED/REJECTED/REVOKED
    current_node: str
    approvers: list

class OAAdapter(ABC):
    @abstractmethod
    async def submit_approval(self, request: ApprovalRequest) -> ApprovalResponse:
        pass
    
    @abstractmethod
    async def query_approval(self, instance_code: str) -> ApprovalStatus:
        pass
    
    @abstractmethod
    async def approve(self, instance_code: str, user_id: str, comment: str) -> bool:
        pass
    
    @abstractmethod
    async def reject(self, instance_code: str, user_id: str, comment: str) -> bool:
        pass
```

### 5.3 LangGraph 节点扩展

在现有 Agent 图中增加 OA 操作节点：

```python
from langgraph.graph import StateGraph

def build_agent_graph():
    graph = StateGraph(AgentState)
    
    # 现有节点
    graph.add_node("intent_router", intent_router_node)
    graph.add_node("qa_engine", qa_engine_node)
    graph.add_node("tool_executor", tool_executor_node)
    
    # 新增 OA 节点
    graph.add_node("oa_intent_parser", oa_intent_parser_node)      # 解析 OA 操作意图
    graph.add_node("oa_form_collector", oa_form_collector_node)    # 多轮收集表单数据
    graph.add_node("oa_executor", oa_executor_node)                # 执行 OA 操作
    graph.add_node("oa_status_monitor", oa_status_monitor_node)    # 异步状态监控
    
    # 路由逻辑
    graph.add_conditional_edges("intent_router", route_by_intent, {
        "qa": "qa_engine",
        "oa": "oa_intent_parser",
        "tool": "tool_executor",
    })
    
    graph.add_edge("oa_intent_parser", "oa_form_collector")
    graph.add_conditional_edges("oa_form_collector", check_form_complete, {
        "complete": "oa_executor",
        "incomplete": "oa_form_collector",  # 继续收集
    })
    graph.add_edge("oa_executor", "oa_status_monitor")
    
    return graph.compile()
```

### 5.4 多轮表单收集机制

审批流程通常需要多个字段，用户可能一次说不全，需要多轮对话收集：

```python
async def oa_form_collector_node(state: AgentState) -> AgentState:
    intent = state["oa_intent"]          # 如 "submit_leave"
    collected = state.get("oa_form_data", {})
    required_fields = get_required_fields(intent)  # 如 ["leave_type", "start_date", "end_date", "reason"]
    
    missing = [f for f in required_fields if f not in collected]
    
    if not missing:
        state["form_complete"] = True
        return state
    
    # 用 LLM 从用户最新消息中提取字段值
    extracted = await extract_form_values(state["user_message"], missing)
    collected.update(extracted)
    state["oa_form_data"] = collected
    
    # 检查还缺什么
    still_missing = [f for f in required_fields if f not in collected]
    if still_missing:
        state["response"] = f"还需要以下信息：{', '.join(FIELD_LABELS[f] for f in still_missing)}"
        state["form_complete"] = False
    else:
        state["form_complete"] = True
    
    return state
```

### 5.5 需要新增的基础设施

| 基础设施 | 用途 | 优先级 |
|----------|------|--------|
| **OA 配置表**（PostgreSQL） | 存储 OA 平台配置、模板映射、用户映射 | P0 |
| **审批回调端点**（FastAPI） | 接收 OA 系统的审批状态变更通知 | P0 |
| **SSE 推送增强** | 审批状态变更实时推送到前端 | P0 |
| **消息队列**（Redis Stream / Celery） | 异步处理审批回调、重试失败操作 | P1 |
| **审批审计日志表** | 不可篡改的操作记录 | P1 |
| **OA Token 管理** | access_token 缓存与自动刷新 | P0 |
| **字段脱敏中间件** | Agent 响应出站前的脱敏处理 | P1 |
| **MCP Server**（可选） | 标准化 OA 工具暴露 | P2 |

**数据库表设计**：
```sql
-- OA 平台配置
CREATE TABLE oa_platform_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,       -- dingtalk/wecom/feishu/salesforce
    app_id VARCHAR(128),
    app_secret_encrypted TEXT,
    corp_id VARCHAR(128),
    base_url VARCHAR(256),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 用户-OA 身份映射
CREATE TABLE user_oa_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    platform VARCHAR(32) NOT NULL,
    oa_user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, platform)
);

-- 审批模板映射
CREATE TABLE approval_template_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    approval_type VARCHAR(64) NOT NULL,  -- leave/expense/customer_followup
    template_code VARCHAR(256) NOT NULL,
    form_schema JSONB,                   -- 表单结构定义
    enabled BOOLEAN DEFAULT true,
    UNIQUE(platform, approval_type)
);

-- 审批操作审计日志（只追加）
CREATE TABLE approval_audit_log (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(32) NOT NULL,
    user_id UUID NOT NULL,
    platform VARCHAR(32) NOT NULL,
    instance_code VARCHAR(256),
    details_hash VARCHAR(64),
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 审批实例追踪
CREATE TABLE approval_instance_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_code VARCHAR(256) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    approval_type VARCHAR(64) NOT NULL,
    originator_user_id UUID NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING',
    form_snapshot JSONB,
    conversation_id UUID,               -- 关联对话
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(platform, instance_code)
);
```

---

## 六、行业实践案例

### 6.1 微软 Copilot 与 Dynamics 365 的集成

**架构**：Copilot → Semantic Kernel（Function Calling）→ Dynamics 365 API

**核心能力**：
- **自然语言创建记录**："帮我创建一个客户跟进记录，客户是华为，跟进人是张三"
- **审批操作**：Copilot 可直接在对话中执行审批动作
- **数据查询**：自然语言查询 CRM 数据，Copilot 自动生成 FetchXML/SQL
- **上下文关联**：对话上下文自动关联到当前记录

**技术要点**：
- 使用 Semantic Kernel 的 Plugin 机制封装 Dynamics 365 操作
- 通过 Microsoft Graph API 统一认证
- 支持多轮对话收集表单字段

### 6.2 钉钉 AI 助理的流程能力

**架构**：用户消息 → AI 助理 → 意图识别 → 调用审批 API → 返回结果

**核心能力**：
- **对话式发起审批**："帮我请一天假，明天，事假"→ 自动填充表单提交
- **审批状态查询**："我的请假审批了吗？"→ 查询并返回状态
- **智能推荐审批人**：根据组织架构自动推荐审批人
- **审批提醒**：主动推送待审批消息

**技术要点**：
- 钉钉 AI 助理基于通义千问大模型
- 通过钉钉开放平台 API 调用审批接口
- 机器人消息接收→意图解析→API 调用的闭环

### 6.3 飞书 My AI 的审批能力

**架构**：用户消息 → My AI → 飞书开放平台 API → 审批系统

**核心能力**：
- **自然语言发起审批**：对话中直接发起，自动填充表单
- **审批卡片交互**：在聊天中直接审批（快速审批功能）
- **审批数据洞察**：统计审批效率、瓶颈分析
- **多语言支持**：原生 i18n，中英日三语

**技术要点**：
- 飞书审批 API 最完整（支持创建审批定义 + 实例）
- 审批卡片（Card）可在消息中直接操作
- 事件订阅机制实现审批状态实时通知

---

## 七、技术可行性评估

### 7.1 各平台 API 成熟度评分

| 平台 | 审批 API | CRM API | 回调机制 | 文档质量 | SDK | 综合评分 |
|------|----------|---------|----------|----------|-----|----------|
| **钉钉** | 9/10 | 7/10 | 9/10 | 8/10 | 7/10 | **8.0** |
| **企业微信** | 9/10 | 8/10 | 8/10 | 7/10 | 6/10 | **7.6** |
| **飞书** | 10/10 | 6/10 | 9/10 | 9/10 | 8/10 | **8.4** |
| **泛微** | 6/10 | 5/10 | 5/10 | 4/10 | 3/10 | **4.6** |
| **致远** | 6/10 | 5/10 | 5/10 | 4/10 | 3/10 | **4.6** |
| **Salesforce** | 9/10 | 10/10 | 9/10 | 10/10 | 9/10 | **9.4** |
| **HubSpot** | 5/10 | 9/10 | 8/10 | 9/10 | 8/10 | **7.8** |
| **用友/金蝶** | 6/10 | 7/10 | 5/10 | 5/10 | 4/10 | **5.4** |

### 7.2 与当前项目融合的可行性

| 维度 | 评估 | 说明 |
|------|------|------|
| **架构兼容** | ✅ 高 | LangGraph 天然支持 Tool 扩展，新增 OA Tool 无需改动核心架构 |
| **认证体系** | ✅ 可行 | 当前 JWT 体系可扩展，增加 OA 用户映射即可 |
| **异步处理** | ⚠️ 需新增 | 需增加回调端点 + 消息队列，当前项目已有 Redis + Celery |
| **前端展示** | ✅ 可行 | SSE 推送审批状态，审批卡片可嵌入对话界面 |
| **数据安全** | ⚠️ 需新增 | 需增加脱敏中间件 + 审计日志 |
| **多轮对话** | ✅ 可行 | LangGraph 状态机天然支持多轮表单收集 |

---

## 八、推荐方案

### 8.1 推荐技术路线

**主方案：Function Calling + API Gateway + 事件驱动**

理由：
1. 与 LangChain/LangGraph 生态最契合，开发效率最高
2. API Gateway 层屏蔽多平台差异，后续扩展新平台只需加 Adapter
3. 事件驱动处理异步审批回调，不阻塞 Agent 执行

**长期演进：MCP 标准化**

当 MCP 生态成熟后，将 OA Tool 迁移为 MCP Server，实现跨 AI 客户端复用。

### 8.2 推荐平台优先级

**国内场景**：
1. **飞书**（API 最完善，设计最规范）→ 首选
2. **钉钉**（用户量最大，审批场景最丰富）→ 必接
3. **企业微信**（微信生态，客户管理强）→ 必接
4. 泛微/致远（按客户需求，定制化对接）

**国际场景**：
1. **Salesforce**（CRM 标杆，API 最成熟）→ 首选
2. **HubSpot**（中小企业友好，API 现代）→ 次选

---

## 九、实施路线图

### Phase 1：基础能力（4 周）

**目标**：实现单一平台（飞书）的审批提交和查询

| 任务 | 周期 | 交付物 |
|------|------|--------|
| OA 配置表 + 用户映射表设计 | 1天 | DDL + 迁移脚本 |
| 飞书 API Client 封装 | 3天 | `feishu/client.py` |
| 审批 Tool 封装（提交/查询） | 3天 | `feishu/approval.py` |
| LangGraph OA 节点集成 | 3天 | `oa_intent_parser_node` + `oa_form_collector_node` |
| 审批回调端点 | 2天 | FastAPI endpoint |
| 前端审批状态展示 | 2天 | SSE 推送 + 审批卡片组件 |
| 单元测试 + 冒烟测试 | 2天 | 测试报告 |

### Phase 2：多平台扩展（4 周）

**目标**：支持钉钉 + 企业微信，统一接口

| 任务 | 周期 | 交付物 |
|------|------|--------|
| OAAdapter 统一接口抽象 | 2天 | `oa/adapter.py` |
| 钉钉 API Client + 审批 Tool | 5天 | `dingtalk/` |
| 企业微信 API Client + 审批 Tool | 5天 | `wecom/` |
| 平台自动识别 + 路由 | 2天 | `oa/router.py` |
| 消息队列（Redis Stream）集成 | 3天 | 异步回调处理 |
| 审计日志 + 脱敏中间件 | 3天 | 安全层 |
| 回归测试 | 2天 | 测试报告 |

### Phase 3：高级能力（4 周）

**目标**：审批操作、CRM 集成、MCP 探索

| 任务 | 周期 | 交付物 |
|------|------|--------|
| 审批操作 Tool（同意/拒绝/转审） | 3天 | 多平台审批操作 |
| Salesforce CRM Tool | 5天 | `salesforce/` |
| 审批数据洞察 | 3天 | 统计 API + 前端图表 |
| MCP Server 原型 | 5天 | `mcp/oa_server.py` |
| E2E 测试 | 3天 | 端到端测试报告 |
| 性能测试 + 压测 | 2天 | 性能报告 |

### Phase 4：生产化（2 周）

| 任务 | 周期 | 交付物 |
|------|------|--------|
| 容器化部署（Docker） | 2天 | Dockerfile + compose |
| 监控告警 | 2天 | Prometheus metrics |
| 文档完善 | 2天 | API 文档 + 运维手册 |
| 安全审计 | 2天 | 安全报告 |
| 上线 | 2天 | 生产环境部署 |

---

## 十、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| OA 系统 API 变更 | 中 | 高 | Adapter 模式隔离变更，版本化 API Client |
| 审批回调丢失 | 低 | 高 | 消息队列持久化 + 重试机制 + 定时对账 |
| 用户身份映射错误 | 中 | 高 | 双重验证（userId + 手机号），操作前确认 |
| 敏感数据泄露 | 低 | 极高 | 脱敏中间件 + 审计日志 + 权限矩阵 |
| OA 系统 Token 过期 | 高 | 低 | Token 自动刷新 + 缓存 |
| 多轮表单收集体验差 | 中 | 中 | 智能预填充 + 表单确认卡片 |

---

## 附录 A：各平台审批 API 快速对照

| 操作 | 钉钉 | 企业微信 | 飞书 |
|------|------|----------|------|
| 获取审批模板 | `/process/getbyuserid` | `/oa/gettemplatedetail` | `/approval/v4/approvals/{approval_code}` |
| 发起审批 | `/processinstance/create` | `/oa/applyevent` | `/approval/v4/instances` |
| 获取审批详情 | `/processinstance/get` | `/oa/getapprovalinfo` | `/approval/v4/instances/{instance_code}` |
| 批量获取审批单号 | `/processinstance/listids` | `/oa/getapprovalinfo` | `/approval/v4/instances` |
| 审批状态回调 | ✅ 回调事件 | ✅ 回调事件 | ✅ 事件订阅 |
| 审批操作（同意/拒绝） | ❌ 不支持 API 审批 | `/oa/approval` | `/approval/v4/tasks/{task_id}` |

## 附录 B：参考资源

- 钉钉开放平台：https://open.dingtalk.com/document/orgapp/overview-of-group-apis
- 企业微信开发者中心：https://developer.work.weixin.qq.com/document/
- 飞书开放平台：https://open.feishu.cn/document/home/index
- MCP 协议：https://modelcontextprotocol.io/introduction
- Salesforce REST API：https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
- HubSpot API：https://developers.hubspot.com/docs/api/overview