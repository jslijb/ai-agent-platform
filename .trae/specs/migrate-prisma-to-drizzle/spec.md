# Prisma ORM 迁移至 Drizzle ORM Spec

## Why
Prisma ORM 在项目中存在以下痛点：
1. **影子库权限问题**：`prisma migrate dev` 需要创建影子数据库验证迁移，而 `CREATE EXTENSION vector` 要求 superuser 权限，普通用户 `aiagent` 无法完成
2. **SQL 透明度低**：Prisma 抽象层厚，对 pgvector 的 `ivfflat` 索引、`$queryRaw` 原始查询等场景支持不友好，项目中已有大量 `$queryRaw` 和 `$executeRaw` 调用
3. **包体积重**：Prisma 依赖 Rust 引擎，构建慢、体积大
4. **迁移机制复杂**：影子库、迁移锁、shadow database 等概念增加了开发复杂度

Drizzle ORM 是纯 TypeScript 实现的轻量级 ORM，原生支持 pgvector、无影子库机制、SQL-like 语法更直观。

## What Changes
- **BREAKING**：移除 Prisma 相关依赖（`prisma`、`@prisma/client`、`@auth/prisma-adapter`）
- **BREAKING**：删除 `prisma/` 目录（schema.prisma 和所有迁移文件）
- 新增 Drizzle ORM 依赖（`drizzle-orm`、`drizzle-kit`）
- 新增 Drizzle schema 定义文件（`src/server/db/schema.ts`）
- 重写数据库客户端初始化（`src/server/db/client.ts`）
- 重写 NextAuth 适配器（从 `@auth/prisma-adapter` 切换到 `@auth/drizzle-adapter`）
- 重写 tRPC context 中的数据库注入
- 重写所有使用 Prisma 的 14 个文件，将 Prisma 查询语法改为 Drizzle 查询语法
- 将所有 `$queryRaw` / `$executeRaw` 调用改为 Drizzle 的 `sql` 模板标签或 `db.execute`
- 新增 Drizzle 迁移配置文件（`drizzle.config.ts`）
- 更新 `.env.example` 中的数据库相关说明

## Impact
- Affected specs: 数据库层、认证层、RAG 检索层、文档管理、会话管理
- Affected code:
  - `src/server/db/client.ts` — 数据库客户端（完全重写）
  - `src/lib/auth.ts` — NextAuth 适配器（重写 adapter）
  - `src/server/trpc.ts` — tRPC context（修改注入方式）
  - `src/server/routers/user.ts` — tRPC 路由（查询语法重写）
  - `src/server/agents/memory.ts` — 会话管理（查询语法重写）
  - `src/server/rag/retrieval/dense-retriever.ts` — 向量检索（$queryRaw 重写）
  - `src/server/rag/retrieval/sparse-retriever.ts` — BM25 检索（查询语法重写）
  - `src/server/rag/streaming/incremental-embedder.ts` — 增量嵌入（查询语法重写）
  - `src/server/rag/knowledge-cleanup.ts` — 知识清理（查询语法重写）
  - `src/server/rag/citation/source-tracker.ts` — 引用追踪（$queryRaw 重写）
  - `src/app/api/health/route.ts` — 健康检查（$queryRaw 重写）
  - `src/app/api/document/upload/route.ts` — 文档上传（查询语法重写）
  - `src/app/api/auth/register/route.ts` — 用户注册（查询语法重写）
  - `src/app/api/rag/answer-with-citation/route.ts` — 带引用答案（$queryRaw 重写）
  - `prisma/schema.prisma` — 删除，由 Drizzle schema 替代
  - `prisma/migrations/` — 删除，由 Drizzle 迁移替代

## ADDED Requirements

### Requirement: Drizzle Schema 定义
系统 SHALL 在 `src/server/db/schema.ts` 中使用 Drizzle 的 `pgTable` 语法定义所有数据表，包括 User、Document、Embedding、Conversation、Message 五张表，字段类型和约束必须与现有 Prisma schema 完全一致。

#### Scenario: Schema 定义完整性
- **WHEN** 开发者查看 `src/server/db/schema.ts`
- **THEN** 能找到 User、Document、Embedding、Conversation、Message 五张表的定义
- **AND** 每张表的字段名、类型、默认值、约束与原 Prisma schema 一致
- **AND** Embedding 表的 `embedding` 字段使用 Drizzle 的 `vector(1024)` 类型

### Requirement: Drizzle 数据库客户端
系统 SHALL 在 `src/server/db/client.ts` 中使用 Drizzle 的 `drizzle()` 函数初始化数据库客户端，连接方式使用 `postgres` 驱动（`postgres.js`），支持开发环境单例模式防止热重载时创建多个连接。

#### Scenario: 客户端初始化
- **WHEN** 应用启动
- **THEN** Drizzle 客户端成功初始化并连接到 PostgreSQL
- **AND** 开发环境下全局缓存客户端实例，避免热重载重复创建

### Requirement: Drizzle 迁移机制
系统 SHALL 使用 `drizzle-kit` 管理数据库迁移，配置文件为 `drizzle.config.ts`，迁移文件输出到 `drizzle/` 目录。迁移命令为 `drizzle-kit generate` 和 `drizzle-kit migrate`，无需影子数据库和 superuser 权限。

#### Scenario: 迁移执行
- **WHEN** 开发者运行 `drizzle-kit migrate`
- **THEN** 迁移直接在目标数据库上执行，无需创建影子数据库
- **AND** 不需要 superuser 权限（vector 扩展已预装）

### Requirement: NextAuth Drizzle 适配器
系统 SHALL 使用 `@auth/drizzle-adapter` 替代 `@auth/prisma-adapter`，确保用户认证流程（登录、注册、JWT、Session）功能不受影响。

#### Scenario: 用户登录
- **WHEN** 用户使用已注册的邮箱和密码登录
- **THEN** NextAuth 通过 Drizzle 适配器查询用户表验证身份
- **AND** 返回有效的 JWT token 和 session

### Requirement: pgvector 原始查询迁移
系统 SHALL 将所有 Prisma 的 `$queryRaw` 和 `$executeRaw` 调用迁移为 Drizzle 的 `sql` 模板标签或 `db.execute`，包括：
- 向量相似度搜索（`<=>` 操作符）
- 向量数据插入（`::vector` 类型转换）
- 健康检查（`SELECT 1`）
- 引用元数据查询

#### Scenario: 向量检索
- **WHEN** 用户发起 RAG 检索请求
- **THEN** 系统使用 Drizzle `sql` 模板标签执行向量相似度搜索
- **AND** 返回结果与原 Prisma `$queryRaw` 一致

## MODIFIED Requirements

### Requirement: tRPC Context 数据库注入
tRPC context 中的 `prisma` 字段 SHALL 替换为 `db` 字段，类型为 Drizzle 实例。所有 tRPC 路由中通过 `ctx.prisma.xxx` 的调用 SHALL 改为 `ctx.db` 配合 Drizzle 的 query API。

### Requirement: 数据库查询语法
所有 Prisma 查询语法 SHALL 替换为 Drizzle 等价语法：
- `prisma.user.findUnique({ where: { email } })` → `db.query.user.findFirst({ where: eq(users.email, email) })`
- `prisma.user.findMany()` → `db.query.user.findMany()`
- `prisma.user.create({ data: ... })` → `db.insert(users).values(...).returning()`
- `prisma.document.update({ where: { id }, data: ... })` → `db.update(documents).set(...).where(eq(documents.id, id))`
- `prisma.embedding.deleteMany({ where: { documentId } })` → `db.delete(embeddings).where(eq(embeddings.documentId, documentId))`
- `prisma.$queryRaw` → `db.execute(sql`...`)`
- `prisma.$executeRaw` → `db.execute(sql`...`)`

## REMOVED Requirements

### Requirement: Prisma ORM
**Reason**: 迁移至 Drizzle ORM，消除影子库权限问题和 Prisma Rust 引擎依赖
**Migration**: 所有 Prisma 相关代码已重写为 Drizzle 等价代码，`prisma/` 目录和 `@prisma/client` 依赖已移除

### Requirement: Prisma Shadow Database
**Reason**: Drizzle 不使用影子数据库机制，迁移直接在目标库执行
**Migration**: 移除 `SHADOW_DATABASE_URL` 环境变量配置需求
