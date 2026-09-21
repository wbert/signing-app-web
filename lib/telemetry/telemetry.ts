/**
 * Operational telemetry, constrained by an allow-list.
 *
 * The product handles credentials, signing tokens, signature images, document
 * contents, stated purposes, and short-lived storage URLs. None of those may
 * ever leave the browser as telemetry, so this module works by permitting a
 * fixed set of fields rather than by trying to redact a growing set of
 * forbidden ones: a field nobody has reviewed is dropped, not sent.
 *
 * Nothing is transmitted until a sink is registered, and no sink is registered
 * here. Until the privacy review named in the release gates is complete, this
 * is a measured no-op.
 */

/** The only field names that may be reported, whatever a caller passes. */
export const allowedFields = [
  "route",
  "action",
  "outcome",
  "statusCode",
  "errorCode",
  "durationMs",
  "requestId",
  "attempt",
] as const

export type AllowedField = (typeof allowedFields)[number]

export type TelemetryValue = string | number | boolean

export type TelemetryEvent = {
  name: string
  fields: Partial<Record<AllowedField, TelemetryValue>>
}

/** Values above this length are dropped rather than truncated. */
const MAX_VALUE_LENGTH = 120

/** A run long enough to be a token, hash, or key rather than a word. */
const TOKEN_LIKE = /[A-Za-z0-9_-]{24,}/u
const URL_LIKE = /\b(?:https?:|data:|blob:)/iu
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/u

const allowed: ReadonlySet<string> = new Set(allowedFields)

/**
 * A `requestId` is a UUID, which is exactly the shape the token rule rejects.
 * It is allowed through because it identifies a request, not a person, and it
 * is the one value that makes a support report actionable.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export function isReportableValue(
  field: string,
  value: unknown
): value is TelemetryValue {
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "boolean") return true
  if (typeof value !== "string") return false

  if (value.length === 0 || value.length > MAX_VALUE_LENGTH) return false
  if (URL_LIKE.test(value)) return false
  if (EMAIL_LIKE.test(value)) return false
  if (field === "requestId") return UUID.test(value)
  if (TOKEN_LIKE.test(value)) return false

  return true
}

/**
 * Builds an event containing only allowed fields holding reportable values.
 * Anything else is discarded silently, because a caller should not be able to
 * learn what the filter rejected and work around it.
 */
export function buildTelemetryEvent(
  name: string,
  fields: Record<string, unknown>
): TelemetryEvent {
  const reportable: Partial<Record<AllowedField, TelemetryValue>> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) continue
    if (!isReportableValue(key, value)) continue
    reportable[key as AllowedField] = value
  }

  return { name, fields: reportable }
}

export type TelemetrySink = (event: TelemetryEvent) => void

let sink: TelemetrySink | null = null

/**
 * Registers where events go. Deliberately not called anywhere in the
 * application: a sink is a privacy decision with an accountable owner, not a
 * default.
 */
export function setTelemetrySink(next: TelemetrySink | null): void {
  sink = next
}

export function reportTelemetry(
  name: string,
  fields: Record<string, unknown> = {}
): TelemetryEvent {
  const event = buildTelemetryEvent(name, fields)
  sink?.(event)
  return event
}
