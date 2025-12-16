/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  outputFileTracingRoot: '/home/soc/soc-dashboard',
  env: {
    STELLAR_CYBER_HOST: process.env.STELLAR_CYBER_HOST,
    STELLAR_CYBER_USER_ID: process.env.STELLAR_CYBER_USER_ID,
    STELLAR_CYBER_REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN,
    STELLAR_CYBER_TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID,
  },
}

export default nextConfig
