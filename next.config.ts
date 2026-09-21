import type { NextConfig } from "next"

const apiOrigin = process.env.SIGNINGAPP_API_URL?.replace(/\/$/u, "")

if (apiOrigin) {
  const parsed = new URL(apiOrigin)
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error(
      "SIGNINGAPP_API_URL must use HTTPS unless it targets localhost"
    )
  }
}

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiOrigin) {
      return []
    }

    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      {
        source: "/audit-events/:path*",
        destination: `${apiOrigin}/audit-events/:path*`,
      },
      { source: "/health/:path*", destination: `${apiOrigin}/health/:path*` },
    ]
  },
}

export default nextConfig
