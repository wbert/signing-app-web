import type { ApiErrorEnvelope } from "@/lib/api/types"

type ApiErrorPayload = Partial<ApiErrorEnvelope> & {
  code?: unknown
  message?: unknown
}

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null
  idempotencyKey?: string
}

export const SESSION_EXPIRED_EVENT = "signingapp:session-expired"

export class ApiError extends Error {
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
    this.name = "ApiError"
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
  }
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  )
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error("API paths must be same-origin absolute paths")
  }

  const headers = new Headers(options.headers)
  const requestId = crypto.randomUUID()
  headers.set("X-Request-ID", requestId)

  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey)
  }

  let body: BodyInit | null | undefined
  if (options.body == null || isBodyInit(options.body)) {
    body = options.body
  } else {
    headers.set("Content-Type", "application/json")
    body = JSON.stringify(options.body)
  }

  const response = await fetch(path, {
    ...options,
    body,
    headers,
    credentials: "include",
    cache: "no-store",
  })
  const responseRequestId = response.headers.get("X-Request-ID") ?? requestId

  if (!response.ok) {
    const payload = await readJson<ApiErrorPayload>(response)
    const topLevelCode =
      typeof payload?.code === "string" ? payload.code : undefined
    const topLevelMessage =
      typeof payload?.message === "string" ? payload.message : undefined
    const error = new ApiError({
      status: response.status,
      code: payload?.error?.code ?? topLevelCode ?? `HTTP_${response.status}`,
      message:
        payload?.error?.message ??
        topLevelMessage ??
        "The request could not be completed.",
      requestId: responseRequestId,
    })

    if (
      error.status === 401 &&
      typeof window !== "undefined" &&
      !isAuthenticationAttempt(path)
    ) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }

    throw error
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return response as T
  }

  return (await response.json()) as T
}

function isAuthenticationAttempt(path: string): boolean {
  return [
    "/api/auth/sign-in/username",
    "/api/auth/two-factor/verify-totp",
    "/api/auth/two-factor/verify-backup-code",
    "/api/auth/two-factor/verify-otp",
  ].includes(path)
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function userMessageForApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "We could not reach SigningApp. Check your connection and try again."
  }

  if (error.status === 401) {
    return "Your sign-in details or verification code were not accepted."
  }
  if (error.status === 403) {
    return "You do not have permission to complete this action."
  }
  if (error.status === 409) {
    return "This information changed in another session. Refresh before trying again."
  }
  if (error.status === 413) {
    return "The selected file is larger than the 4 MB upload limit."
  }
  if (error.status === 503) {
    return "SigningApp is temporarily unavailable. Please try again shortly."
  }
  if (error.status >= 500) {
    return "The SigningApp service is temporarily unavailable. Please try again shortly."
  }

  return error.message
}

export function errorReference(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null
}
