/** @type {import('next').NextConfig} */

// 输出模式：standalone（Docker 部署）| export（Capacitor SPA 构建，由 scripts/switch-*.cjs / cap-build.ts 切换）
const OUTPUT_MODE = 'standalone';

// Windows 本地构建：standalone 文件追踪会重建 pnpm 符号链接 → EPERM(operation not permitted)。
// standalone 产物仅 Docker 镜像使用（Linux/npm 构建无此问题），故 Windows 本地构建自动跳过。
// 如确需本地产出 standalone：设置 NEXT_FORCE_STANDALONE=1，或开启 Windows 开发者模式（ms-settings:developers）。
const isWindowsBuild =
  process.platform === 'win32' && process.env.NEXT_FORCE_STANDALONE !== '1';

const nextConfig = {
  reactStrictMode: true,
  output:
    OUTPUT_MODE === 'export'
      ? 'export'
      : isWindowsBuild
        ? undefined
        : 'standalone',
  poweredByHeader: false,
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  experimental: {
    optimisticClientCache: true,
    instrumentationHook: true,
  },
  // 修复 webpack eval-source-map 在大型 chunk 中截断最后一个模块的问题
  // eval-source-map 将每个模块的源码+sourceMap 内联到 eval() 字符串中，
  // 当 chunk 过大（>500KB）时，最后一个模块的字符串会被截断，
  // 导致 SyntaxError: Invalid or unexpected token → ChunkLoadError → 页面无法 hydrate
  // Next.js 14 不允许修改 devtool（自动回退），改用 splitChunks 强制拆分大 chunk
  webpack: (config, { dev }) => {
    if (dev) {
      // 强制拆分大于 200KB 的 chunk，避免 eval 字符串过长被截断
      config.optimization = config.optimization || {};
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        maxSize: 200000,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
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
  // 拦截浏览器扩展注入的 /@vite/client 请求
  // 返回空 JS stub 而非 404 HTML，避免 SyntaxError 阻止页面 hydrate
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/@vite/client',
          destination: '/api/vite-stub',
        },
      ],
    };
  },
};

module.exports = nextConfig;
