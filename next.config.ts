import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  serverExternalPackages: ['dxf-parser', '@mlightcad/libredwg-web'],
  outputFileTracingIncludes: {
    '/api/projects/*/import': ['./node_modules/@mlightcad/libredwg-web/wasm/**/*'],
  },
  allowedDevOrigins: ['127.0.0.1'],
}
export default nextConfig
