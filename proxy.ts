import { NextResponse, type NextRequest } from "next/server"

import {
  createNonce,
  securityHeaders,
  storageOriginsFromEnvironment,
} from "@/lib/security/headers"

/**
 * Applies the Content-Security-Policy and the rest of the security headers to
 * every document response.
 *
 * Next 16 renamed the `middleware` convention to `proxy`. The nonce is minted
 * per request and passed on as `x-nonce`; Next reads it back out of the CSP
 * header and attaches it to the framework and page scripts it emits, which is
 * why every route under `app/layout.tsx` is rendered dynamically — a page built
 * at build time has no request to take a nonce from, and its scripts would be
 * refused by this policy.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce()
  const options = {
    isDevelopment: process.env.NODE_ENV === "development",
    nonce,
    storageOrigins: storageOriginsFromEnvironment(
      process.env.SIGNINGAPP_STORAGE_ORIGINS
    ),
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  for (const [name, value] of securityHeaders(options)) {
    requestHeaders.set(name, value)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  for (const [name, value] of securityHeaders(options)) {
    response.headers.set(name, value)
  }
  return response
}

export const config = {
  matcher: [
    {
      // Only HTML documents need this policy. The backend prefixes are
      // rewritten straight through to the API and return JSON, so matching
      // them would add a middleware invocation — billable and latency-adding
      // on Vercel — to every API call for a header no browser applies to a
      // fetch response. Static assets carry no markup, and prefetches are
      // skipped so a navigation does not mint a nonce twice.
      source:
        "/((?!api/|audit-events|health|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
