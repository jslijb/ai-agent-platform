# 踩坑：Webpack eval-source-map chunk 截断导致 Chat 页面无法 hydrate

> 日期：2026-08-02
> 影响：/chat 页面无限"正在验证身份..."循环，页面完全不可用
> 根因：webpack eval-source-map 在大型 chunk 中截断最后一个模块的 eval 字符串
> 状态：已修复

## 症状

1. 刷新 /chat 页面或切换会话时，页面停留在"正在验证身份..."无限循环
2. 浏览器控制台报 `SyntaxError: Invalid or unexpected token`
3. 浏览器控制台报 `ChunkLoadError: Loading chunk app/chat/page failed`
4. 浏览器控制台报 `Failed to fetch RSC payload`
5. React hydration 失败，整个页面回退到客户端渲染但卡在 loading 状态

## 根因分析

### 1. eval-source-map 截断 bug

Next.js 14 dev 模式使用 `eval-source-map` 作为 webpack devtool。此格式将每个模块的源码和 sourceMap 内联到 `eval()` 字符串中。当 chunk 超过约 500KB 时，最后一个模块的 eval 字符串会被截断，缺少闭合引号，导致 `SyntaxError: Invalid or unexpected token`。

### 2. chunk 过大的原因

`/chat` 页面直接导入了 `react-markdown` 和 `remark-gfm`，这两个库拉入大量依赖模块（micromark、mdast、character-entities 等约 200+ 个模块），导致页面 chunk 达到 514KB。

### 3. Next.js 14 不允许修改 devtool

尝试通过 `config.devtool = 'cheap-module-source-map'` 修改 devtool，但 Next.js 14 会自动回退到 `eval-source-map`，无法绕过。

### 4. /@vite/client 请求干扰

浏览器安装的 Vite DevTools 扩展会注入 `/@vite/client` 脚本标签。Next.js dev server 默认返回 404 HTML 页面，HTML 作为 JavaScript 加载会导致额外的 `SyntaxError`。

## 修复方案

### 修复 1：将 MarkdownRenderer 拆分为独立组件 + 动态导入

**文件变更**：
- 新建 `src/components/MarkdownRenderer.tsx`：将 Markdown 渲染逻辑（含 react-markdown、remark-gfm 导入）提取为独立组件
- 修改 `src/app/chat/page.tsx`：删除本地 MarkdownRenderer 函数定义，改用 `next/dynamic` 动态导入

**效果**：
- react-markdown + remark-gfm 相关模块被拆分到独立 chunk（markdown.js 206KB + 组件 chunk 25KB）
- /chat 页面 chunk 从 1151 模块减少到 924 模块
- 页面加载时 MarkdownRenderer 按需加载，不阻塞首屏渲染

### 修复 2：webpack splitChunks 强制拆分大 chunk

**文件变更**：`next.config.js`

```javascript
webpack: (config, { dev }) => {
  if (dev) {
    config.optimization.splitChunks = {
      ...config.optimization.splitChunks,
      maxSize: 200000,
      cacheGroups: {
        nextauth: {
          name: 'nextauth',
          test: /[\\/]node_modules[\\/](next-auth|@auth)[\\/]/,
          chunks: 'all',
          priority: 20,
        },
        markdown: {
          name: 'markdown',
          test: /[\\/]node_modules[\\/](react-markdown|remark-gfm|remark|micromark|mdast)[\\/]/,
          chunks: 'all',
          priority: 20,
        },
      },
    };
  }
  return config;
},
```

**效果**：
- nextauth.js chunk（116KB）独立拆出
- markdown.js chunk（206KB）独立拆出
- 各 vendor chunk 进一步拆分

**限制**：`maxSize` 对 Next.js 页面 entry point chunk 不生效，只能拆分共享 chunk。页面本身的代码仍需通过动态导入来减小。

### 修复 3：拦截 /@vite/client 请求

**文件变更**：
- `nginx/local.conf`：添加 location 规则返回空 JS stub
- `next.config.js`：添加 rewrites 规则将 /@vite/client 重写到 API 路由
- 新建 `src/app/api/vite-stub/route.ts`：返回有效的空 JS 响应

### 修复 4：nginx 配置修复

- 移除所有 location 块的尾斜杠（防止 301/308 重定向死循环）
- 开发环境禁用 /_next/static/ 缓存（防止 webpack chunk 更新后浏览器使用旧缓存）

## 验证结果

### Port 3005（直连 dev server）
- 登录：PASS
- /chat 页面加载：PASS（"正在验证身份..."短暂出现后消失）
- 页面刷新：PASS（无无限循环）
- 控制台错误：首次编译时有 transient ChunkLoadError，页面可恢复

### Port 80（通过 nginx）
- 登录：PASS
- /chat 页面加载：PASS（"正在验证身份..."短暂出现后消失）
- 页面刷新：PASS（无无限循环）

## 经验教训

1. **react-markdown 是 chunk 膨胀的大户**：200+ 个依赖模块，必须动态导入
2. **eval-source-map 有大小限制**：约 500KB 以上的 chunk 会触发截断 bug
3. **Next.js 14 devtool 不可修改**：必须通过 chunk 拆分来规避
4. **浏览器扩展可能注入脚本**：Vite DevTools 扩展注入的 /@vite/client 需要拦截
5. **nginx location 尾斜杠会触发重定向循环**：location 块不带尾斜杠
6. **开发环境必须禁用静态资源缓存**：否则 webpack chunk 更新后浏览器使用旧缓存

## 相关文件

- `src/components/MarkdownRenderer.tsx`（新建）
- `src/app/chat/page.tsx`（修改：动态导入 MarkdownRenderer）
- `next.config.js`（修改：splitChunks + rewrites）
- `src/app/api/vite-stub/route.ts`（新建）
- `nginx/local.conf`（修改：@vite/client 拦截 + 缓存禁用 + 尾斜杠移除）
- `src/app/(auth)/login/page.tsx`（修改：setError 移入 useEffect + 重定向到 /chat）
