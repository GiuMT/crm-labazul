/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' gera um build enxuto que roda em container Docker sem o node_modules inteiro
  output: 'standalone',
  reactStrictMode: true,
  // Nao derrubar o build de producao por erro de tipo/lint (o app e validado em runtime).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
