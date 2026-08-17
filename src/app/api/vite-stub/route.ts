/**
 * Vite Client Stub
 *
 * 浏览器扩展（如 Vite DevTools）可能注入 /@vite/client 脚本标签。
 * Next.js dev server 默认返回 404 HTML 页面，HTML 作为 JS 加载会导致
 * SyntaxError: Invalid or unexpected token，阻止 React hydration。
 *
 * 此路由返回空 JS stub，通过 next.config.js 的 rewrite 规则拦截
 * /@vite/client 请求，确保在所有端口（3005 直连 / 80 nginx）都返回有效 JS。
 */
export function GET() {
  return new Response("// vite client stub", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=UTF-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
