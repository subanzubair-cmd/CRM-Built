import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@crm/shared', '@crm/database', 'react-big-calendar'],
}

export default nextConfig
