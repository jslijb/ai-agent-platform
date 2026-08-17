# Docker 容器化踩坑记录

> 日期：2026-08-04
> 场景：将 ai-agent-platform 从宿主机运行迁移到 Docker 容器化

---

## 坑1：Dockerfile build 阶段 DB/Redis 不可达

**现象**：`next build` 静态页面生成时尝试连接 Redis/PostgreSQL，容器内 `localhost` 指向容器自身，连接被拒绝，导致构建超时失败。

**根因**：Next.js 在 build 时执行 `getStaticProps()`，其中代码尝试连接数据库和 Redis。

**解决**：在 Dockerfile 的 build 阶段设置环境变量指向 `host.docker.internal`：
```dockerfile
FROM base AS build
ENV DATABASE_URL="postgresql://aiagent:aiagent_secret@host.docker.internal:5432/agentdb"
ENV REDIS_URL="redis://host.docker.internal:6379"
```
同时在 docker-compose.yml 中添加 `extra_hosts: ["host.docker.internal:host-gateway"]`。

---

## 坑2：docker-compose.override 文件名

**现象**：`docker-compose.override.local.yml` 中的 profile 排除配置不生效，compose 仍然尝试启动 postgres/redis 容器。

**根因**：Docker Compose V2 自动加载的文件名是 `docker-compose.override.yml`，不是 `.local.yml`。

**解决**：重命名为 `docker-compose.override.yml`。

---

## 坑3：端口 6379/5432 冲突

**现象**：`docker compose up` 报错 `Bind for 0.0.0.0:6379 failed: port is already allocated`。

**根因**：ai_novel 项目已有 `ai_novel_redis`(6379) 和 `ai_novel_postgres`(5432) 在运行。

**解决**：在 `docker-compose.override.yml` 中将 postgres 和 redis 标记为 `profiles: ["full"]`，默认不启动。复用 ai_novel 的容器（已在 aiagent_net 网络中，别名分别为 `postgres` 和 `redis`）。

---

## 坑4：容器内 config/api_keys.yaml 不存在

**现象**：main-service 容器启动后 LLM 调用失败，报错 `api_keys.yaml 中 llm.models 列表为空`。

**根因**：main-service 的 Dockerfile 使用 Next.js standalone 输出，不包含 config 目录。需要在 docker-compose.yml 中添加 volumes 挂载。

**解决**：
```yaml
volumes:
  - ./config/api_keys.yaml:/app/config/api_keys.yaml:ro
  - ./.env.local:/app/.env.local:ro
```

---

## 坑5：Docker Desktop 引擎不稳定

**现象**：Docker Desktop 引擎多次停止，无法连接 Docker API。

**根因**：笔记本硬件资源有限（16GB内存），Docker Desktop WSL2 后端偶尔崩溃。

**解决**：手动重启 Docker Desktop，或执行 `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`。

---

## 坑6：AUTH_URL 必须与浏览器访问 URL 一致

**现象**：用户通过 80 端口访问，但 AUTH_URL 设为 `http://localhost:3005`，导致 JWT cookie 设置失败。

**根因**：NextAuth v5 的 AUTH_URL 决定 cookie 的 domain 和 path，必须与浏览器实际访问的 URL 一致。

**解决**：AUTH_URL 设为 `http://localhost`（用户通过 nginx 80 端口访问）。