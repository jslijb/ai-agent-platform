# Tasks

- [x] Task 1: 数据库 Schema 扩展
  - [x] SubTask 1.1: 新增 MemoryProfile 表（userId, scope, teamId, preferences, frequentStocks, riskProfile, investmentStyle, customNotes）
  - [x] SubTask 1.2: 新增 MemorySummary 表（conversationId, userId, messageRangeStart, messageRangeEnd, summary, keyPoints, tokenCount）
  - [x] SubTask 1.3: 新增 MemoryFragment 表（userId, scope, teamId, sourceConversationId, sourceType, content, embedding, metadata）
  - [x] SubTask 1.4: 新增 Team 表（name, leaderId, description）
  - [x] SubTask 1.5: 新增 TeamMember 表（teamId, userId, role）
  - [x] SubTask 1.6: 执行数据库迁移（drizzle-kit push）— 5张新表已创建

- [x] Task 2: L4 用户画像（长期记忆）
  - [x] SubTask 2.1: 实现 getUserProfile(userId) — 读取用户画像，含权限过滤
  - [x] SubTask 2.2: 实现 updateUserProfile(userId, updates) — 更新用户画像
  - [x] SubTask 2.3: 实现显式偏好提取 — extractAndApplyPreferences（板块/风格/风险）
  - [x] SubTask 2.4: 实现隐式偏好提取 — trackStockQuery 统计股票查询频率
  - [x] SubTask 2.5: 实现画像注入 — formatUserProfileForPrompt 格式化注入

- [x] Task 3: L2 滚动摘要
  - [x] SubTask 3.1: 实现 checkAndGenerateSummary(conversationId) — ≥20条触发生成
  - [x] SubTask 3.2: 实现 generateRollingSummary — 调用 callWithFallback 生成摘要
  - [x] SubTask 3.3: 实现 extractFragmentsFromSummary — 从摘要提取 MemoryFragment
  - [x] SubTask 3.4: 修改 addMessage — 写入后异步调用 checkAndGenerateSummary
  - [x] SubTask 3.5: 实现 getL2Summary(conversationId, tokenBudget) — 按 token 预算返回摘要

- [x] Task 4: L3 历史检索（跨会话记忆）
  - [x] SubTask 4.1: 实现 getL3Fragments(query, userId, tokenBudget) — 从 MemoryFragment 加载
  - [x] SubTask 4.2: 实现权限过滤 — getScopedFragments 支持个人/团队/企业级
  - [x] SubTask 4.3: 实现片段格式化 — `[来源会话 | 日期 | scope] 内容`

- [x] Task 5: 自适应 Token 预算
  - [x] SubTask 5.1: 实现 calculateTokenBudget(modelMaxTokens) — L1:30%/L2:25%/L3:25%/L4:10%/Buffer:10%
  - [x] SubTask 5.2: 实现 assembleContext(query, userId, conversationId, modelMaxTokens) — 分层记忆组装
  - [x] SubTask 5.3: 实现预算裁剪 — 各层按 tokenBudget 截取
  - [x] SubTask 5.4: 修改 runAgent — 替换 getRecentMessages 为 assembled.l1Messages ✅

- [x] Task 6: 三级权限隔离
  - [x] SubTask 6.1: 实现 resolveMemoryScope(userId, scope, teamId) — 权限检查
  - [x] SubTask 6.2: 实现 Team/TeamMember CRUD — createTeam/addTeamMember/removeTeamMember
  - [x] SubTask 6.3: 在 getScopedFragments 中注入权限过滤条件
  - [x] SubTask 6.4: 实现冲突优先级 — 权限不足时降级到个人级

- [x] Task 7: lastStockData 缓存改造
  - [x] SubTask 7.1: 将 `lastStockData = null` 改为按 userId 隔离的 Map 缓存
  - [x] SubTask 7.2: 实现 TTL 30分钟自动过期清理 + 容量限制100用户

- [x] Task 8: 记忆重合场景测试
  - [x] SubTask 8.1: 编写短期+长期重合测试（2个query）— 白酒+科技
  - [x] SubTask 8.2: 编写短期+跨会话重合测试（1个query）— ROE趋势
  - [x] SubTask 8.3: 编写长期+跨会话重合测试（1个query）— 价值投资+五粮液
  - [x] SubTask 8.4: 编写三种记忆重合测试（1个query）— 偏好+历史+当前
  - [x] SubTask 8.5: 运行所有测试，输出测试报告 — 43/43 PASSED

- [x] Task 9: 前端记忆管理界面
  - [x] SubTask 9.1: 新增 /dashboard/memories 页面，展示用户画像和记忆片段
  - [x] SubTask 9.2: 支持编辑/删除单条记忆
  - [x] SubTask 9.3: 支持全部导出/全部删除
  - [x] SubTask 9.4: 团队管理页面 — 创建团队、邀请成员、管理团队记忆

- [x] Task 10: 文档知识图谱前端预览
  - [x] SubTask 10.1: 新增 API `GET /api/document/graph/[documentId]` — 已存在
  - [x] SubTask 10.2: Neo4j 不可用时返回 `neo4jAvailable: false` — 已实现
  - [x] SubTask 10.3: 安装 `react-force-graph-2d` 依赖 — 已安装
  - [x] SubTask 10.4: 在文档预览面板新增「🔗 知识图谱」tab — 已实现
  - [x] SubTask 10.5: 实现力导向图可视化组件 — 已实现
  - [x] SubTask 10.6: 实现图谱统计面板 — 已实现
  - [x] SubTask 10.7: Neo4j 不可用时显示明确提示 — 已实现

# Task Dependencies
- [Task 2] depends on [Task 1] ✅
- [Task 3] depends on [Task 1] ✅
- [Task 4] depends on [Task 1, Task 3] ✅
- [Task 5] depends on [Task 2, Task 3, Task 4] ✅
- [Task 6] depends on [Task 1] ✅
- [Task 7] depends on nothing ✅
- [Task 8] depends on [Task 2, Task 3, Task 4, Task 5, Task 6] ✅
- [Task 9] depends on [Task 2, Task 6] ✅
- [Task 10] depends on [Task 2, Task 6] ✅

# All Tasks Completed ✅
