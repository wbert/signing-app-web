import type { ArchiveVerifyResponse, RetentionStatus } from "@/lib/api/types"

/** `archivePurposeSchema` accepts 3 to 500 trimmed characters. */
export const MIN_PURPOSE_CHARACTERS = 3
export const MAX_PURPOSE_CHARACTERS = 500

export function validatePurpose(purpose: string): string | null {
  const trimmed = purpose.trim()
  if (trimmed.length < MIN_PURPOSE_CHARACTERS) {
    return `Describe why you need this record, in at least ${MIN_PURPOSE_CHARACTERS} characters.`
  }
  if (trimmed.length > MAX_PURPOSE_CHARACTERS) {
    return `A purpose may be at most ${MAX_PURPOSE_CHARACTERS} characters.`
  }
  return null
}

/**
 * Filters that may appear in the page URL. Every one is an identifier, a date,
 * or an enum the API already exposes — none carries a document hash, a
 * retrieval URL, a purpose, or anything about a record's contents.
 */
export type ArchiveFilters = {
  clientAccountId?: string
  documentTypeId?: string
  senderUserId?: string
  signatory?: string
  workerFileId?: string
  completedFrom?: string
  completedTo?: string
  retentionStatus?: RetentionStatus
}

const filterKeys = [
  "clientAccountId",
  "documentTypeId",
  "senderUserId",
  "signatory",
  "workerFileId",
  "completedFrom",
  "completedTo",
  "retentionStatus",
] as const

export function filtersToQuery(filters: ArchiveFilters): URLSearchParams {
  const query = new URLSearchParams()
  for (const key of filterKeys) {
    const value = filters[key]
    if (typeof value === "string" && value.trim().length > 0) {
      query.set(key, value.trim())
    }
  }
  return query
}

/** Reads only known keys, so an unexpected query parameter cannot reach the API. */
export function filtersFromQuery(
  query: URLSearchParams | string
): ArchiveFilters {
  const parameters =
    typeof query === "string" ? new URLSearchParams(query) : query
  const filters: ArchiveFilters = {}
  for (const key of filterKeys) {
    const value = parameters.get(key)
    if (value === null || value.trim().length === 0) continue
    if (key === "retentionStatus") {
      if (value === "ACTIVE" || value === "REVIEW_DUE") {
        filters.retentionStatus = value
      }
      continue
    }
    filters[key] = value.trim()
  }
  return filters
}

export function hasFilters(filters: ArchiveFilters): boolean {
  return filterKeys.some((key) => filters[key] !== undefined)
}

/** The API rejects a range whose end precedes its start. */
export function validateFilters(filters: ArchiveFilters): string | null {
  const { completedFrom, completedTo } = filters
  if (!completedFrom || !completedTo) return null
  if (new Date(completedFrom) > new Date(completedTo)) {
    return "The completion range ends before it starts."
  }
  return null
}

/** A date input's `YYYY-MM-DD` as the offset-aware timestamp the API requires. */
export function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`
}

export function endOfDayIso(date: string): string {
  return `${date}T23:59:59.999Z`
}

export function dateFromIso(value: string | undefined): string {
  return value ? value.slice(0, 10) : ""
}

export type AuthenticityResult = "verified" | "mismatch" | "unavailable"

/**
 * The server compares the stored hash against the stored bytes and returns its
 * own verdict. This only names that verdict; it never recomputes or guesses
 * one, so a mismatch can never be presented as a pass.
 */
export function authenticityResult(
  verification: ArchiveVerifyResponse | null
): AuthenticityResult {
  if (verification === null) return "unavailable"
  return verification.authentic ? "verified" : "mismatch"
}

export const authenticityHeadings: Record<AuthenticityResult, string> = {
  verified: "Authentic",
  mismatch: "Does not match",
  unavailable: "Could not be checked",
}

export const authenticityMessages: Record<AuthenticityResult, string> = {
  verified:
    "The stored document still matches the hash recorded when it was executed. It has not been altered.",
  mismatch:
    "The stored document does not match the hash recorded when it was executed. Treat this record as compromised and report it before relying on it.",
  unavailable:
    "The check could not be completed, so nothing can be concluded about this document either way. Try again, and report it if it keeps failing.",
}

const FALLBACK_EXPORT_FILENAME = "archive-export.zip"

/**
 * Reads the download name the server chose, and refuses to trust it blindly:
 * a `Content-Disposition` filename can contain path separators or traversal
 * segments, which a browser would honour when saving.
 */
export function filenameFromContentDisposition(header: string | null): string {
  if (!header) return FALLBACK_EXPORT_FILENAME

  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/iu.exec(header)
  if (extended?.[1]) {
    try {
      return safeFilename(decodeURIComponent(extended[1].trim()))
    } catch {
      // A malformed encoding falls through to the plain parameter below.
    }
  }

  const quoted = /filename\s*=\s*"([^"]*)"/iu.exec(header)
  if (quoted?.[1] !== undefined) return safeFilename(quoted[1])

  const bare = /filename\s*=\s*([^;]+)/iu.exec(header)
  if (bare?.[1]) return safeFilename(bare[1].trim())

  return FALLBACK_EXPORT_FILENAME
}

export function safeFilename(value: string): string {
  const base = value
    .replace(/\\/gu, "/")
    .split("/")
    .pop()
    ?.replace(/\p{C}/gu, "")
    .trim()
  if (!base || base === "." || base === "..") return FALLBACK_EXPORT_FILENAME
  return base.slice(0, 200)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export const retentionStatusLabels: Record<RetentionStatus, string> = {
  ACTIVE: "Within retention",
  REVIEW_DUE: "Review due",
}

export const retentionStatusDescriptions: Record<RetentionStatus, string> = {
  ACTIVE: "Inside its retention period.",
  REVIEW_DUE:
    "Past its retention end date and flagged for review. Nothing is deleted automatically, and this application provides no disposal action.",
}

/**
 * One key per export intent, kept across retries of that intent. The API's
 * header schema allows letters, digits, and `._:-`, which a UUID satisfies.
 */
export function createExportIdempotencyKey(): string {
  return crypto.randomUUID()
}

const archiveErrorMessages: Record<string, string> = {
  ARCHIVE_RECORD_NOT_FOUND:
    "This archive record no longer exists, or you are not allowed to see it.",
  EXPORT_EMPTY:
    "No archive records match these filters, so there is nothing to export.",
  EXPORT_TOO_LARGE:
    "This selection is larger than an export may be. Narrow the filters and preview it again.",
  EXPORT_EXPIRED:
    "This export's download window has closed. Create the export again to download it.",
  EXPORT_NOT_FOUND: "That export no longer exists.",
  DOCUMENT_STORAGE_UNAVAILABLE:
    "Document storage is temporarily unavailable. Nothing was changed; try again shortly.",
}

export function archiveMessageForCode(code: string): string | null {
  return archiveErrorMessages[code] ?? null
}
