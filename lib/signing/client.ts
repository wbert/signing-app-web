import type { ApiErrorEnvelope } from "@/lib/api/types"

type SigningRequestOptions = {
  body?: Record<string, unknown>
  method?: "GET" | "POST"
  signal?: AbortSignal
}

export class SigningApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null

  constructor(options: {
    status: number
    code: string
    message: string
    requestId: string | null
  }) {
    super(options.message)
    this.name = "SigningApiError"
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
  }
}

/**
 * The public signing journey is the only feature that authenticates with a
 * bearer-style credential, and it is deliberately a separate client from
 * `apiRequest`.
 *
 * - `credentials: "omit"` keeps the internal Better Auth cookie out of every
 *   signing request, so an internal user opening a signing link cannot have
 *   their session ride along with an accountless signatory's action.
 * - The token is passed by the caller on each call and never cached here, so
 *   nothing in this module outlives the component that holds it.
 * - `referrerPolicy: "no-referrer"` keeps the `/sign` URL out of any
 *   downstream request, which matters because the page is reached from an
 *   emailed link.
 */
export async function signingRequest<T>(
  token: string,
  path: string,
  options: SigningRequestOptions = {}
): Promise<T> {
  if (!path.startsWith("/api/signing")) {
    throw new Error("The signing token may be sent only to signing endpoints")
  }

  const requestId = crypto.randomUUID()
  const headers = new Headers({
    Authorization: `Signing ${token}`,
    "X-Request-ID": requestId,
  })
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: options.signal,
  })
  const responseRequestId = response.headers.get("X-Request-ID") ?? requestId

  if (!response.ok) {
    const payload = await readJson<Partial<ApiErrorEnvelope>>(response)
    throw new SigningApiError({
      status: response.status,
      code: payload?.error?.code ?? `HTTP_${response.status}`,
      message: payload?.error?.message ?? "The request could not be completed.",
      requestId: responseRequestId,
    })
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * Fetches the short-lived preview object itself. It is a storage URL rather
 * than an API path, so it carries no signing token, no cookie, and no referrer.
 */
export async function fetchPreviewBytes(
  previewUrl: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetch(previewUrl, {
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  })
  if (!response.ok) {
    throw new Error(`The document preview responded ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
