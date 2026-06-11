import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@ablework/shared-constants', '@ablework/shared-types', '@ablework/shared-schemas'],
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
}

export default nextConfig
