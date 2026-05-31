/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  },
};

module.exports = nextConfig;
