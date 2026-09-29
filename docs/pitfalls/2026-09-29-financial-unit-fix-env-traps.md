# 2026-09-29 财务单位错配修复过程中的环境地雷

P0 单位错配（`sql-result-formatter.ts` 量级猜单位）的修复过程暴露了三个与修复本身无关、
但会让后来者踩坑的本地环境问题。修复实施记录见 `docs/1-requirements-bugs/financial-metric-unit-mismatch.md` §八。

## 现象
- `node scripts/xxx.mjs`（用 `node_modules/pg` 连库）进程**静默退出**（exit 0、零输出），无报错。
- F3b/F6a/F6b 等基础设施测试在服务健康时反而失败：`could not access file "$libdir/vector"`。
- E2E/健康检查测试门禁被误触发：main-service(:3000) 是 `ai_novel_frontend`、data-service(:8001) 是 `chatbi-gateway` 在应答。

## 根因
1. **pg@7.17.1 在 Node 24 下 connect 静默失败**：`node_modules/pg` 是陈旧传递依赖（2019 年），
   连接失败不报错、事件循环直接清空。本项目 DB 驱动是 **postgres.js**（`src/server/db/client.ts`），
   直连脚本应使用 `postgres` 包（注意 3.4.9 的动态 SQL 是 `sql.unsafe()`，没有 `sql.raw/join`）。
2. **agentdb 实际运行在 `ai_novel_postgres_old` 容器**（compose override 复用 novel 栈、占宿主机 5432，
   见 PROJECT_STATE「Docker 容器化」条目），且该镜像是**纯 postgres:16-alpine，无 pgvector .so**：
   `pg_extension` 目录里有 vector 扩展记录（从 pgvector 镜像迁来的数据），但 `$libdir/vector` 文件缺失，
   一切触碰 `Embedding` 向量列的 SQL 都会失败。
3. **跨项目端口冲突**：Docker Desktop 启动后各项目容器按 restart 策略自启，novel 前端占 3000、
   chatbi 占 8001，导致 `useServiceCheck(["main-service"/"data-service"])` 门禁误判"服务可用"，
   本应跳过的 E2E/基础设施测试对错误服务发起请求后失败。

## 修复/规避
- 直连 DB 的脚本一律用 postgres.js（参考 `scripts/migrate-financial-unit-to-yuan.mjs`）。
- 运行全量测试前停掉占用 3000/8001 的外来容器（`docker stop ai_novel_frontend chatbi-gateway`），
  让门禁回到"服务不可达→优雅跳过"的基线行为。
- agentdb 要恢复向量检索，需把该库迁回 pgvector 镜像（仓库 compose 的 `pgvector/pgvector:pg16`）
  或给现容器安装 pgvector——当前状态下 F3b/F6a 永远过不了，稠密检索不可用。

## 防回归
- 换 DB 镜像/迁移宿主机前，先跑 `SELECT '1'::vector` 验证 pgvector .so 可加载。
- 本地跑 `pnpm test:ci` 前用 `netstat -ano | findstr "3000 8001"` 确认端口没有被外来容器占用。
- 评估/迁移脚本连库失败必须"快速失败+有输出"，禁止静默退出。
