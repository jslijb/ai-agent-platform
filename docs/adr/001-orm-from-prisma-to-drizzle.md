# ADR-001: ORM 从 Prisma 迁移到 Drizzle

## 状态：已采纳（2025-05）

## 背景

项目初始使用 Prisma 作为 ORM，在集成 pgvector 向量检索时遇到三个核心问题：

1. **影子库 superuser 权限依赖**：`prisma migrate dev` 需要创建影子数据库执行 `CREATE EXTENSION vector`，生产环境数据库不允许 superuser 权限
2. **Rust 引擎构建慢**：Prisma 的 Rust 查询引擎在 CI/CD 中构建耗时长，影响部署效率
3. **pgvector 兼容性不足**：`$queryRaw` 对 pgvector 的原生支持差，向量查询需要大量原始 SQL 拼接，类型不安全

## 决策

将 ORM 从 Prisma 迁移到 Drizzle ORM。

## 理由

1. **无影子库依赖**：`drizzle-kit migrate` 直接执行 SQL 迁移文件，无需 superuser 权限
2. **原生 pgvector 支持**：Drizzle 的 `vector(1024)` 列类型和 `sql` 模板标签提供类型安全的向量查询
3. **Edge Runtime 兼容**：Drizzle 无 Rust 引擎依赖，可在 Vercel Edge Runtime 运行
4. **轻量级**：Drizzle 是纯 TypeScript 实现，包体积远小于 Prisma

## 后果

### 正面
- 数据库迁移不再需要 superuser 权限
- 向量查询获得类型安全
- CI/CD 构建速度提升约 3 倍
- Schema 定义更贴近 SQL，开发者可直接控制 DDL

### 负面
- Drizzle 社区生态不如 Prisma 成熟，部分高级查询需手写 SQL
- Prisma Studio 等可视化工具不可用，需改用 Drizzle Studio
- 迁移过程中需同步切换认证适配器（`@auth/prisma-adapter` → `@auth/drizzle-adapter`）

### 风险缓解
- 保留 `src/server/trpc/` 目录作为 tRPC 残留，核心 API 已全部迁移到 Route Handlers
- 迁移分步执行：先迁移 Schema 定义，再迁移查询代码，最后清理 Prisma 依赖