import type { NextConfig } from 'next'
import path from 'node:path'
const nextConfig: NextConfig = {
  serverExternalPackages: ['dxf-parser'],
  experimental: {
    turbopackAdditionalRoots: {
      cadcraftJs: { path: path.join(process.cwd(), '../craft-apps/cadcraft/js') },
    },
  },
  allowedDevOrigins: ['127.0.0.1'],
}
export default nextConfig
