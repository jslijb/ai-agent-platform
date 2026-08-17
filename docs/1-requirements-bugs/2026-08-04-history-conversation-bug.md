# 历史对话不显示 Bug 修复记录

> 日期：2026-08-04 ~ 2026-08-05
> 状态：已修复（需重建容器+重新登录）

## 问题描述

用户多次反馈"浏览器没有历史对话"，侧边栏显示"暂无历史对话"。用户通过 **Docker nginx 容器（http://localhost:80）** 访问。

## 根因分析

排查发现 8 个 bug，其中 **BUG8 是真正的根因**：

### BUG8（致命）：.env.local 挂载覆盖 Docker 环境变量
- **文件**：`docker-compose.yml:236`（`.env.local:/app/.env.local:ro`）
- **问题**：.env.local 中 `AUTH_URL=http://localhost:3005` 被挂载到容器内，**覆盖了** docker-compose.yml 中正确设置的 `AUTH_URL=http://localhost`。Next.js 启动时 .env.local 优先级高于 environment 变量。
- **后果**：NextAuth 在容器内读到 AUTH_URL=3005，但用户通过 80 端口访问。Cookie 设置的 domain/port 基于 AUTH_URL=3005，浏览器不会发送这些 cookie 给 80 端口的请求。auth() 读不到 session → 返回 401。
- **修复**：移除 .env.local 挂载，改用 env_file 指向 .env.docker

### BUG1（严重）：fetchConversations 静默吞 401
- **文件**：`src/app/chat/page.tsx`
- **问题**：API 返回 401 时 `data.success=false`，代码不设置 conversations 也不提示用户
- **修复**：增加 401 判断，重定向到登录页

### BUG2（严重）：AUTH_SECRET 不一致
- **文件**：`.env.local` vs `.env.docker` vs `docker-compose.yml`
- **问题**：三个文件 AUTH_SECRET 各不相同
- **修复**：统一为 `.env.local` 的值

### BUG3（严重）：AUTH_URL 配置混乱
- **文件**：`.env.local`(3005) / `.env.docker`(3000→localhost) / `docker-compose.yml`(localhost)
- **问题**：AUTH_URL 决定 cookie 域和回调 URL，不一致导致 session 丢失
- **修复**：Docker 环境统一为 `http://localhost`（用户通过 80 端口访问）

### BUG4（中等）：addMessage 不更新 conversations.updatedAt
- **修复**：addMessage 中增加 `db.update(conversations).set({ updatedAt: new Date() })`

### BUG5（中等）：无窗口聚焦重获取
- **修复**：添加 `visibilitychange` 和 `focus` 事件监听

### BUG6（中等）：loadConversation 不验证对话归属
- **修复**：增加 `history.userId !== userId` 检查返回 403

### BUG7（低）：miniapp handleConversationClick 不传 ID
- **修复**：`Taro.setStorageSync` + `useDidShow` 读取

## 故障链路

```
用户通过 nginx(80) 访问 /chat
  → 浏览器发送请求到 http://localhost:80/api/conversations
  → 容器内 NextAuth 读到 AUTH_URL=http://localhost:3005（来自被挂载的 .env.local）
  → Cookie 的 domain/port 基于 3005 设置
  → 浏览器不会把 3005 端口的 cookie 发给 80 端口的请求
  → auth() 读不到 session → 返回 401
  → 前端 fetchConversations 收到 401 → 静默吞掉 → 显示"暂无历史对话"
```

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `docker-compose.yml` | **BUG8: 移除 .env.local 挂载，改用 env_file .env.docker** |
| `src/app/chat/page.tsx` | BUG1: 401→重定向登录; BUG5: visibilitychange/focus监听 |
| `src/server/agents/memory.ts` | BUG4: addMessage更新updatedAt; BUG6: ConversationWithMessages增加userId |
| `src/app/api/conversations/route.ts` | BUG6: 越权检查 |
| `.env.docker` | BUG2+3: 统一AUTH_SECRET和AUTH_URL |
| `miniapp/src/pages/conversations/index.tsx` | BUG7: setStorageSync传递ID |
| `miniapp/src/pages/chat/index.tsx` | BUG7: useDidShow读取pendingConversationId |
| `CLAUDE.md` | 更新踩坑记录和用户需求 |

## 用户操作步骤

修复代码后，用户需要：
1. **重建 Docker 容器**：`docker compose up -d --build`
2. **清除浏览器 cookie**（或重新登录）——旧的 JWT cookie 是用旧 AUTH_URL/AUTH_SECRET 生成的，无法被新配置验证

## 教训

1. **不要在 Docker 容器中挂载 .env.local**——.env.local 是本地开发配置，AUTH_URL/端口等与容器环境不兼容，会覆盖 docker-compose.yml 的正确设置
2. **AUTH_URL 必须与浏览器实际访问URL一致**——这是 NextAuth cookie 生效的前提
3. **AUTH_SECRET 必须全环境一致**——否则跨环境 JWT 验证失败
4. **API 调用必须处理错误状态码**——401 时应重定向登录，不能静默吞掉
5. **子表插入后要更新父表时间戳**——否则排序失效
6. **API 必须验证资源归属**——防止水平越权
7. **用户反复强调的需求必须写入文档**——不能每次都问
