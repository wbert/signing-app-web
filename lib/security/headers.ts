/**
 * Response headers applied to every document request by `proxy.ts`.
 *
 * The policy is built here rather than inline so it can be unit-tested: a CSP
 * that silently loses a directive is indistinguishable from one that works,
 * until the day it is needed.
 */

export type SecurityOptions = {
  /** Development needs `unsafe-eval` because React uses it for stack recovery. */
  isDevelopment: boolean
  nonce: string
  /**
   * Origins the browser fetches document bytes from. Preview and retrieval URLs
   * are issued by the API but point at object storage, and the signing and
   * approval viewers fetch those bytes directly.
   */
  storageOrigins: readonly string[]
}

/**
 * Directives are deliberately explicit rather than relying on `default-src`,
 * so a reviewer can see what each resource type is allowed to do.
 */
export function buildContentSecurityPolicy(options: SecurityOptions): string {
  const storage = options.storageOrigins.filter(
    (origin) => origin.trim().length > 0
  )

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        `'nonce-${options.nonce}'`,
        // Lets Next's own nonced loader bring in the bundles it needs without
        // naming each one, while still refusing anything a page injects.
        "'strict-dynamic'",
        ...(options.isDevelopment ? ["'unsafe-eval'"] : []),
      ],
    ],
    // Next's development overlay and hot-reloaded styles are injected without
    // a nonce. Keep stylesheet nonces enforced in production.
    [
      "style-src",
      [
        "'self'",
        options.isDevelopment ? "'unsafe-inline'" : `'nonce-${options.nonce}'`,
      ],
    ],
    // Element sizing is computed from PDF page geometry and applied as a style
    // attribute, which CSP treats separately from stylesheets.
    ["style-src-attr", ["'unsafe-inline'"]],
    // `data:` carries the signature preview the signatory just drew or chose;
    // `blob:` carries the assembled export before it is saved.
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    // pdf.js runs its parser in a worker served from this origin, and falls
    // back to a blob worker where a bundler cannot provide one.
    ["worker-src", ["'self'", "blob:"]],
    ["connect-src", ["'self'", ...storage]],
    ["media-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["manifest-src", ["'self'"]],
  ]

  const rendered = directives.map(
    ([name, values]) => `${name} ${values.join(" ")}`
  )

  // Upgrading would break plain-HTTP local development, where there is no
  // certificate to upgrade to.
  if (!options.isDevelopment) rendered.push("upgrade-insecure-requests")

  return rendered.join("; ")
}

export function securityHeaders(
  options: SecurityOptions
): Array<[string, string]> {
  const headers: Array<[string, string]> = [
    ["Content-Security-Policy", buildContentSecurityPolicy(options)],
    // The signing page is reached from an emailed link; no outbound request
    // should ever carry that address, fragment or not.
    ["Referrer-Policy", "no-referrer"],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    [
      "Permissions-Policy",
      [
        "accelerometer=()",
        "camera=()",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "payment=()",
        "usb=()",
      ].join(", "),
    ],
  ]

  if (!options.isDevelopment) {
    headers.push([
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    ])
  }

  return headers
}

/** Origins the browser may fetch document bytes from, from configuration. */
export function storageOriginsFromEnvironment(
  value: string | undefined
): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(toOrigin)
    .filter((entry): entry is string => entry !== null)
}

function toOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function createNonce(): string {
  return btoa(crypto.randomUUID())
}
