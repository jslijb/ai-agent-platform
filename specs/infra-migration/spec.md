# 基础设施迁移与配置修复 Spec

> 本文档合并自以下原始 spec：
> - `chinese-encoding-and-infra-fix`（中文编码 + Nginx 健康检查 + 前端性能）
> - `migrate-prisma-to-drizzle`（ORM 迁移）
> - `fix-api-keys-yaml-config`（API 配置结构修复）
> - `remove-bailian-model-concept`（移除主模型概念）
>
> 合并原因：四者均属基础设施层变更——编码修复、ORM迁移、配置修复、模型概念清理，相互间存在执行顺序依赖（Prisma→Drizzle 迁移必须先于配置修复，编码修复独立于其他三者）。

---

## 一、中文编码与基础设施修复

> 来源：`chinese-encoding-and-infra-fix`
> 状态：已实现并验证

### 核心问题
- PostgreSQL 连接未指定 client_encoding=UTF8，中文数据写入失败
- 前端 JSON 序列化将中文转为 Unicode 转义序列（\uXXXX）
- Nginx 容器健康检查失败（镜像内无 curl）
- 前端首屏加载超时

### 关键修复
1. **数据库中文编码**：PostgreSQL 连接初始化时设置 `client_encoding=UTF8`
2. **前端中文渲染**：JSON 序列化不转义中文字符
3. **Nginx 健康检查**：使用镜像内可用的探测命令，正确透传 Content-Type charset
4. **前端性能**：Nginx 启用 gzip、静态资源缓存、首屏 ≤3s

### 涉及文件
- `src/server/db/client.ts` — 连接编码配置
- `src/app/api/` — JSON 响应编码
- `nginx.conf` / `docker-compose.yml` — Nginx 健康检查和压缩配置

---

## 二、Prisma ORM 迁移至 Drizzle ORM

> 来源：`migrate-prisma-to-drizzle`
> 状态：已实现

### Why
Prisma ORM 存在以下痛点：
1. **影子库权限问题**：`prisma migrate dev` 需要创建影子数据库验证迁移，而 `CREATE EXTENSION vector` 要求 superuser 权限
2. **SQL 透明度低**：Prisma 抽象层厚，对 pgvector 的 `ivfflat` 索引、`$queryRaw` 原始查询等场景支持不友好
3. **包体积重**：Prisma 依赖 Rust 引擎，构建慢、体积大
4. **迁移机制复杂**：影子库、迁移锁、shadow database 等概念增加了开发复杂度

### What Changes
- **BREAKING**：移除 Prisma 相关依赖（`prisma`、`@prisma/client`、`@auth/prisma-adapter`）
- **BREAKING**：删除 `prisma/` 目录
- 新增 Drizzle ORM 依赖（`drizzle-orm`、`drizzle-kit`）
- 新增 Drizzle schema 定义文件（`src/server/db/schema.ts`）
- 重写数据库客户端初始化（`src/server/db/client.ts`）
- 重写 NextAuth 适配器（从 `@auth/prisma-adapter` 切换到 `@auth/drizzle-adapter`）
- 重写所有使用 Prisma 的 14 个文件

### ADDED Requirements

#### Requirement: Drizzle Schema 定义
系统 SHALL 在 `src/server/db/schema.ts` 中使用 Drizzle 的 `pgTable` 语法定义所有数据表。

#### Requirement: Drizzle 数据库客户端
系统 SHALL 使用 Drizzle 的 `drizzle()` 函数初始化数据库客户端，支持开发环境单例模式。

#### Requirement: Drizzle 迁移机制
系统 SHALL 使用 `drizzle-kit` 管理数据库迁移，无需影子数据库和 superuser 权限。

#### Requirement: NextAuth Drizzle 适配器
系统 SHALL 使用 `@auth/drizzle-adapter` 替代 `@auth/prisma-adapter`。

#### Requirement: pgvector 原始查询迁移
系统 SHALL 将所有 Prisma 的 `$queryRaw` 和 `$executeRaw` 调用迁移为 Drizzle 的 `sql` 模板标签或 `db.execute`。

### REMOVED Requirements
- Prisma ORM 及其 Shadow Database 机制

---

## 三、api_keys.yaml 配置结构修复

> 来源：`fix-api-keys-yaml-config`
> 状态：已实现

### Why
- `tushare`/`tickflow` 嵌套在 `market_data` 下，但代码用顶层 section 名访问
- `_resolve_env_values` 将所有字符串当环境变量名，models 列表字面量被误解析
- `context` 字段值与模型实际上下文窗口不匹配

### ADDED Requirements

#### Requirement: 智能环境变量解析
配置系统 SHALL 只对符合全大写+下划线格式（正则 `^[A-Z][A-Z0-9_]*$`）的字符串值做环境变量替换，其他字符串保留原值。

#### Requirement: 配置结构与代码访问路径一致
YAML 配置的层级结构 SHALL 与代码中的 `get_value(section, key)` 调用路径一致。

#### Requirement: context 字段值准确
models 列表中每个模型的 `context` 字段 SHALL 准确反映模型的实际上下文窗口大小。

#### Requirement: description 描述准确
models 列表中每个模型的 `description` SHALL 准确反映模型的实际能力定位。

### 附录：各模型实际上下文窗口与能力核实

| 模型ID | 上下文窗口 | thinking | functionCalling | 准确 description |
|--------|-----------|----------|-----------------|-----------------|
| qwen3.6-max-preview | 256K | true | true | 闭源旗舰，256K上下文，思考模式+工具调用 |
| qwen3.6-35b-a3b | 262K | true | true | 开源MoE旗舰，262K上下文，思考模式+工具调用 |
| deepseek-v4-pro | 1M | true | true | 深度求索旗舰，1M上下文，思考模式+工具调用 |
| qwen3.7-max-2026-05-17 | 1M | false | false | 闭源旗舰，1M上下文，Agent工作流基座 |
| qwen3.7-max-preview | 1M | false | false | 闭源旗舰，1M上下文，Agent工作流基座 |
| qwen3.6-27b | 262K | false | false | 开源稠密模型，262K上下文，旗舰级编程能力 |
| kimi-k2.6 | 256K | false | false | 月之暗面旗舰，256K上下文，智能体编程 |
| qwen3.5-plus-2026-04-20 | 1M | false | false | 千问3.5 Plus，1M上下文，生产级API模型 |
| qwen3.6-plus-2026-04-02 | 1M | false | false | 千问3.6 Plus，1M上下文，生产级API模型 |

---

## 四、移除主模型概念

> 来源：`remove-bailian-model-concept`
> 状态：已实现

### Why
项目已实现自动模型切换（额度用完自动降级到下一个模型），`BAILIAN_MODEL` 作为"主模型"的概念已过时。应统一由 `models` 列表驱动模型选择和降级。

### ADDED Requirements

#### Requirement: 模型降级链由 models 列表驱动
LLM 路由系统 SHALL 完全从 `api_keys.yaml` 的 `llm.models` 列表构建降级链，列表顺序即调用优先级，第一个模型为默认模型。

#### Requirement: bailian provider 接受外部传入的模型 ID
bailian.ts SHALL 不再自行解析模型 ID，而是由调用方（router）传入要使用的模型 ID。

### REMOVED Requirements
- `BAILIAN_MODEL` 环境变量：已被 models 列表驱动的自动降级机制取代

---

## 执行顺序

1. **Prisma → Drizzle 迁移**（二）— 基础，其他改动依赖新 ORM
2. **中文编码修复**（一）— 独立于 ORM 迁移，可并行
3. **api_keys.yaml 配置修复**（三）— 依赖新 ORM 客户端
4. **移除主模型概念**（四）— 依赖配置修复完成
