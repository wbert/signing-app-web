import type { AuditCategory, AuditDataValue, AuditEvent } from "@/lib/api/types"

export const auditCategoryLabels: Record<AuditCategory, string> = {
  SECURITY: "Security",
  CONFIGURATION: "Configuration",
  APPROVAL: "Approval",
  SIGNING: "Signing",
  ACCESS: "Access",
}

export const auditCategoryDescriptions: Record<AuditCategory, string> = {
  SECURITY: "Sign-in, account, and access-control events.",
  CONFIGURATION: "Changes to document types, templates, and approval matrices.",
  APPROVAL: "Submissions, approvals, returns, recalls, and reassignments.",
  SIGNING: "Invitations, signatures, declines, and signing-request changes.",
  ACCESS: "Archive views, retrievals, verifications, and exports.",
}

export type AuditFilters = {
  category?: AuditCategory
  eventType?: string
  targetType?: string
  targetId?: string
  actorUserId?: string
  occurredFrom?: string
  occurredTo?: string
}

const filterKeys = [
  "category",
  "eventType",
  "targetType",
  "targetId",
  "actorUserId",
  "occurredFrom",
  "occurredTo",
] as const

const categories: readonly string[] = [
  "SECURITY",
  "CONFIGURATION",
  "APPROVAL",
  "SIGNING",
  "ACCESS",
]

export function auditFiltersToQuery(filters: AuditFilters): URLSearchParams {
  const query = new URLSearchParams()
  for (const key of filterKeys) {
    const value = filters[key]
    if (typeof value === "string" && value.trim().length > 0) {
      query.set(key, value.trim())
    }
  }
  return query
}

export function auditFiltersFromQuery(
  query: URLSearchParams | string
): AuditFilters {
  const parameters =
    typeof query === "string" ? new URLSearchParams(query) : query
  const filters: AuditFilters = {}
  for (const key of filterKeys) {
    const value = parameters.get(key)
    if (value === null || value.trim().length === 0) continue
    if (key === "category") {
      if (categories.includes(value)) filters.category = value as AuditCategory
      continue
    }
    filters[key] = value.trim()
  }
  return filters
}

export function validateAuditFilters(filters: AuditFilters): string | null {
  const { occurredFrom, occurredTo } = filters
  if (!occurredFrom || !occurredTo) return null
  if (new Date(occurredFrom) > new Date(occurredTo)) {
    return "The date range ends before it starts."
  }
  return null
}

/** `approval.step_approved` reads as "Step approved" in a list of many rows. */
export function describeEventType(eventType: string): string {
  const action = eventType.includes(".")
    ? eventType.slice(eventType.indexOf(".") + 1)
    : eventType
  const words = action.replace(/[._]/gu, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function describeDataKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[._]/gu, " ")
    .toLowerCase()
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function formatDataValue(value: AuditDataValue): string {
  if (value === null) return "—"
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

/**
 * The API already narrows audit payloads to primitives and omits IP address and
 * user agent from both list and detail responses. Entries are sorted only so
 * the same event reads identically every time it is opened.
 */
export function orderedData(
  event: AuditEvent
): Array<{ key: string; label: string; value: string }> {
  return Object.keys(event.data)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({
      key,
      label: describeDataKey(key),
      value: formatDataValue(event.data[key] ?? null),
    }))
}
