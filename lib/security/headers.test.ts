import { describe, expect, it } from "vitest"

import {
  buildContentSecurityPolicy,
  createNonce,
  securityHeaders,
  storageOriginsFromEnvironment,
} from "@/lib/security/headers"

const base = {
  isDevelopment: false,
  nonce: "test-nonce",
  storageOrigins: ["https://api.cloudinary.com"],
}

function directive(policy: string, name: string): string | null {
  const found = policy
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry === name || entry.startsWith(`${name} `))
  return found ?? null
}

describe("buildContentSecurityPolicy", () => {
  it("allows no inline script and no third-party script origin", () => {
    const policy = buildContentSecurityPolicy(base)
    const scripts = directive(policy, "script-src") ?? ""

    expect(scripts).toContain("'nonce-test-nonce'")
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("*")
    expect(scripts).not.toMatch(/https?:\/\//u)
  })

  it("grants unsafe-eval only in development", () => {
    expect(buildContentSecurityPolicy(base)).not.toContain("'unsafe-eval'")
    expect(
      buildContentSecurityPolicy({ ...base, isDevelopment: true })
    ).toContain("'unsafe-eval'")
  })

  it("lets pdf.js run its worker from this origin", () => {
    expect(directive(buildContentSecurityPolicy(base), "worker-src")).toBe(
      "worker-src 'self' blob:"
    )
  })

  it("permits document bytes to be fetched from configured storage only", () => {
    const policy = buildContentSecurityPolicy(base)
    expect(directive(policy, "connect-src")).toBe(
      "connect-src 'self' https://api.cloudinary.com"
    )
    expect(
      directive(
        buildContentSecurityPolicy({ ...base, storageOrigins: [] }),
        "connect-src"
      )
    ).toBe("connect-src 'self'")
  })

  it("allows the signature preview and the export blob as images", () => {
    expect(directive(buildContentSecurityPolicy(base), "img-src")).toBe(
      "img-src 'self' data: blob:"
    )
  })

  it("confines inline styles to element attributes", () => {
    const policy = buildContentSecurityPolicy(base)
    expect(directive(policy, "style-src")).not.toContain("'unsafe-inline'")
    expect(directive(policy, "style-src-attr")).toBe(
      "style-src-attr 'unsafe-inline'"
    )
  })

  it("allows development overlay styles while requiring nonces in production", () => {
    expect(
      directive(
        buildContentSecurityPolicy({ ...base, isDevelopment: true }),
        "style-src"
      )
    ).toBe("style-src 'self' 'unsafe-inline'")
    expect(directive(buildContentSecurityPolicy(base), "style-src")).toBe(
      "style-src 'self' 'nonce-test-nonce'"
    )
  })

  it("refuses framing, plugins, and base-tag rewriting", () => {
    const policy = buildContentSecurityPolicy(base)
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(directive(policy, "frame-src")).toBe("frame-src 'none'")
    expect(directive(policy, "object-src")).toBe("object-src 'none'")
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'")
    expect(directive(policy, "form-action")).toBe("form-action 'self'")
  })

  it("upgrades insecure requests outside development only", () => {
    expect(buildContentSecurityPolicy(base)).toContain(
      "upgrade-insecure-requests"
    )
    expect(
      buildContentSecurityPolicy({ ...base, isDevelopment: true })
    ).not.toContain("upgrade-insecure-requests")
  })
})

describe("securityHeaders", () => {
  it("sends no referrer, which the emailed signing link depends on", () => {
    const headers = new Map(securityHeaders(base))
    expect(headers.get("Referrer-Policy")).toBe("no-referrer")
  })

  it("sets the remaining hardening headers", () => {
    const headers = new Map(securityHeaders(base))
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(headers.get("X-Frame-Options")).toBe("DENY")
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
    expect(headers.get("Permissions-Policy")).toContain("camera=()")
  })

  it("adds HSTS only where there is TLS to pin", () => {
    expect(
      new Map(securityHeaders(base)).has("Strict-Transport-Security")
    ).toBe(true)
    expect(
      new Map(securityHeaders({ ...base, isDevelopment: true })).has(
        "Strict-Transport-Security"
      )
    ).toBe(false)
  })
})

describe("storageOriginsFromEnvironment", () => {
  it("reduces configured URLs to bare origins", () => {
    expect(
      storageOriginsFromEnvironment(
        "https://api.cloudinary.com/v1_1/demo, https://res.cloudinary.com"
      )
    ).toEqual(["https://api.cloudinary.com", "https://res.cloudinary.com"])
  })

  it("ignores anything that is not a URL", () => {
    expect(
      storageOriginsFromEnvironment("not a url, , https://ok.test")
    ).toEqual(["https://ok.test"])
    expect(storageOriginsFromEnvironment(undefined)).toEqual([])
  })
})

describe("createNonce", () => {
  it("is unpredictable and unique per call", () => {
    const first = createNonce()
    expect(first).not.toBe(createNonce())
    expect(first.length).toBeGreaterThan(16)
  })
})
