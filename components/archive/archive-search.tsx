"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileSearch,
  ShieldCheck,
  ShieldX,
} from "lucide-react"

import {
  FullPageError,
  FullPageStatus,
  NoticeBanner,
  type Notice,
} from "@/components/admin/admin-ui"
import { DocumentShell } from "@/components/documents/document-shell"
import { ExportBuilder } from "@/components/archive/export-builder"
import { PurposeDialog } from "@/components/archive/purpose-dialog"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  ArchiveRecord,
  ArchiveRetrieveResponse,
  ArchiveSearchResponse,
  ArchiveViewResponse,
  ArchiveVerifyResponse,
  MeResponse,
  Pagination,
} from "@/lib/api/types"
import {
  type ArchiveFilters,
  archiveMessageForCode,
  authenticityHeadings,
  authenticityMessages,
  authenticityResult,
  dateFromIso,
  endOfDayIso,
  filtersFromQuery,
  filtersToQuery,
  formatBytes,
  retentionStatusDescriptions,
  retentionStatusLabels,
  startOfDayIso,
  validateFilters,
} from "@/lib/archive/archive"
import { can } from "@/lib/auth/capabilities"
import { formatTimestamp } from "@/lib/documents/document-types"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

type PendingAction =
  | { kind: "view"; record: ArchiveRecord }
  | { kind: "retrieve"; record: ArchiveRecord }
  | { kind: "verify"; record: ArchiveRecord }
  | null

export function ArchiveSearch() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [filters, setFilters] = useState<ArchiveFilters>({})
  const [records, setRecords] = useState<ArchiveRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<ArchiveRecord | null>(null)
  const [verification, setVerification] =
    useState<ArchiveVerifyResponse | null>(null)
  const [verified, setVerified] = useState(false)
  const [exporting, setExporting] = useState(false)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const search = useCallback(
    async (next: {
      filters: ArchiveFilters
      offset: number
      foreground: boolean
    }) => {
      const invalid = validateFilters(next.filters)
      if (invalid) {
        setNotice({ tone: "error", message: invalid })
        return
      }

      if (next.foreground) setLoading(true)
      else setSearching(true)
      setLoadError(null)
      try {
        const query = filtersToQuery(next.filters)
        query.set("limit", String(PAGE_SIZE))
        query.set("offset", String(next.offset))
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<ArchiveSearchResponse>(`/api/archive?${query.toString()}`),
        ])
        if (!can(currentSession.capabilities, "archives:read")) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setSession(currentSession)
        setRecords(response.records)
        setPagination(response.pagination)

        // Filters are identifiers, dates, and enums only — safe to keep in the
        // address bar so a search can be shared or reloaded. The purpose, the
        // hashes, and every retrieval URL stay out of it.
        const shareable = filtersToQuery(next.filters)
        if (next.offset > 0) shareable.set("offset", String(next.offset))
        const search = shareable.toString()
        window.history.replaceState(
          window.history.state,
          "",
          `/archive${search.length > 0 ? `?${search}` : ""}`
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          redirectToExpiredSessionLogin()
          return
        }
        if (error instanceof ApiError && error.status === 403) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setLoadError(noticeFor(error))
      } finally {
        setLoading(false)
        setSearching(false)
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initial = filtersFromQuery(
        window.location.search.replace(/^\?/u, "")
      )
      const offset = Number(
        new URLSearchParams(window.location.search).get("offset") ?? 0
      )
      setFilters(initial)
      void search({
        filters: initial,
        offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
        foreground: true,
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  async function runPending(purpose: string) {
    const action = pending
    if (!action) return

    setBusy(true)
    setNotice(null)
    try {
      if (action.kind === "view") {
        const response = await apiRequest<ArchiveViewResponse>(
          `/api/archive/${encodeURIComponent(action.record.id)}/view`,
          { method: "POST", body: { purpose } }
        )
        setOpened(response.record)
        setVerification(null)
        setVerified(false)
      }

      if (action.kind === "verify") {
        try {
          const response = await apiRequest<ArchiveVerifyResponse>(
            `/api/archive/${encodeURIComponent(action.record.id)}/verify`,
            { method: "POST", body: { purpose } }
          )
          setVerification(response)
        } finally {
          // A failed check is reported as "could not be checked" rather than
          // left looking like it never ran.
          setVerified(true)
        }
      }

      if (action.kind === "retrieve") {
        const response = await apiRequest<ArchiveRetrieveResponse>(
          `/api/archive/${encodeURIComponent(action.record.id)}/retrieve`,
          { method: "POST", body: { purpose } }
        )
        openRetrieved(response)
        setNotice({
          tone: "success",
          message:
            "The executed document and its certificate were opened in new tabs. Their links are short lived and were not kept by this page.",
        })
      }

      setPending(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      setNotice(noticeFor(error))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <FullPageStatus message="Loading the archive…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to search the archive"
        notice={loadError}
        onRetry={() => void search({ filters, offset: 0, foreground: true })}
      />
    )
  }
  if (!session) return null

  const page = Math.floor(pagination.offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE))

  return (
    <DocumentShell
      actions={
        can(session.capabilities, "archives:export") ? (
          <Button
            className="rounded-xl"
            onClick={() => setExporting(true)}
            variant="outline"
          >
            <Download />
            Export records
          </Button>
        ) : undefined
      }
      eyebrow="Archive"
      intro="Completed documents, their certificates, and the retention terms recorded when they were executed. Opening, retrieving, and verifying a record are each logged against the reason you give."
      session={session}
      title="Archive and compliance"
    >
      <div className="mt-8 space-y-5">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}

        <FilterPanel
          busy={searching}
          filters={filters}
          onChange={setFilters}
          onSearch={() =>
            void search({ filters, offset: 0, foreground: false })
          }
        />

        <p aria-live="polite" className="text-sm text-muted-foreground">
          {pagination.total === 0
            ? "No records match."
            : `${pagination.total} ${pagination.total === 1 ? "record" : "records"} · page ${page} of ${pages}`}
        </p>

        {records.length === 0 ? (
          <div className="rounded-3xl border bg-card p-10 text-center">
            <Archive className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl font-semibold">
              Nothing to show
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              A record appears here once every signatory has signed and the
              executed document has been archived.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {records.map((record) => (
              <li className="rounded-3xl border bg-card p-5" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-lg font-semibold tracking-tight">
                      {record.documentTitle}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {record.documentTypeName} · {record.certificateNo}
                    </p>
                  </div>
                  <RetentionBadge record={record} />
                </div>

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <Fact
                    label="Completed"
                    value={formatTimestamp(record.completedAt)}
                  />
                  <Fact label="Sender" value={record.senderName} />
                  <Fact label="Size" value={formatBytes(record.byteLength)} />
                  <Fact
                    label="Retention ends"
                    value={formatTimestamp(record.retentionEndDate)}
                  />
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    className="rounded-xl"
                    onClick={() => setPending({ kind: "view", record })}
                    size="sm"
                    variant="outline"
                  >
                    <FileSearch />
                    Open record
                  </Button>
                </div>

                {opened?.id === record.id && (
                  <OpenedRecord
                    onRetrieve={() => setPending({ kind: "retrieve", record })}
                    onVerify={() => setPending({ kind: "verify", record })}
                    record={opened}
                    verification={verification}
                    verified={verified}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            className="rounded-xl"
            disabled={pagination.offset === 0 || searching}
            onClick={() =>
              void search({
                filters,
                offset: Math.max(0, pagination.offset - PAGE_SIZE),
                foreground: false,
              })
            }
            variant="outline"
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            className="rounded-xl"
            disabled={
              pagination.offset + PAGE_SIZE >= pagination.total || searching
            }
            onClick={() =>
              void search({
                filters,
                offset: pagination.offset + PAGE_SIZE,
                foreground: false,
              })
            }
            variant="outline"
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>

      {pending && (
        <PurposeDialog
          busy={busy}
          confirmLabel={
            pending.kind === "view"
              ? "Open record"
              : pending.kind === "retrieve"
                ? "Retrieve documents"
                : "Verify authenticity"
          }
          description={
            pending.kind === "view"
              ? `Opening the full record for “${pending.record.documentTitle}”.`
              : pending.kind === "retrieve"
                ? `Retrieving the executed document and certificate for “${pending.record.documentTitle}”.`
                : `Checking that the stored document for “${pending.record.documentTitle}” still matches its recorded hash.`
          }
          onClose={() => setPending(null)}
          onSubmit={(purpose) => void runPending(purpose)}
          title="State your purpose"
        />
      )}

      {exporting && (
        <ExportBuilder filters={filters} onClose={() => setExporting(false)} />
      )}
    </DocumentShell>
  )
}

/**
 * Retrieval URLs are short lived and are opened at once. They are never put
 * into component state, never rendered as an `href`, and never written to
 * storage, so nothing can copy them out of the page afterwards.
 */
function openRetrieved(response: ArchiveRetrieveResponse): void {
  for (const url of [response.documentUrl, response.certificateUrl]) {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  )
}

function RetentionBadge({ record }: { record: ArchiveRecord }) {
  const due = record.retentionStatus === "REVIEW_DUE"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold",
        due
          ? "border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {retentionStatusLabels[record.retentionStatus]}
    </span>
  )
}

function OpenedRecord({
  onRetrieve,
  onVerify,
  record,
  verification,
  verified,
}: {
  onRetrieve: () => void
  onVerify: () => void
  record: ArchiveRecord
  verification: ArchiveVerifyResponse | null
  verified: boolean
}) {
  const result = verified ? authenticityResult(verification) : null

  return (
    <div className="mt-5 rounded-2xl border bg-muted/20 p-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="File name" value={record.fileName} />
        <Detail label="Certificate" value={record.certificateNo} />
        <Detail label="Certified" value={formatTimestamp(record.certifiedAt)} />
        <Detail label="Indexed" value={formatTimestamp(record.indexedAt)} />
        <Detail label="Legal basis" value={record.legalBasis} />
        <Detail
          label="Retention"
          value={`${record.retentionPeriodMonths} months · ${record.disposalAction}`}
        />
      </dl>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {retentionStatusDescriptions[record.retentionStatus]}
      </p>

      {record.signatories.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Signatories
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {record.signatories.map((signatory) => (
              <li key={`${signatory.email}-${signatory.kind}`}>
                {signatory.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({signatory.kind.toLowerCase().replace(/_/gu, " ")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="rounded-xl" onClick={onRetrieve} size="sm">
          <Download />
          Retrieve documents
        </Button>
        <Button
          className="rounded-xl"
          onClick={onVerify}
          size="sm"
          variant="outline"
        >
          <ShieldCheck />
          Verify authenticity
        </Button>
      </div>

      {result && (
        <div
          className={cn(
            "mt-4 rounded-2xl border px-4 py-3",
            result === "verified"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-100"
              : result === "mismatch"
                ? "border-red-200 bg-red-50 text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
                : "border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100"
          )}
          role="status"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            {result === "verified" ? (
              <ShieldCheck className="size-4" />
            ) : result === "mismatch" ? (
              <ShieldX className="size-4" />
            ) : (
              <CircleAlert className="size-4" />
            )}
            {authenticityHeadings[result]}
          </p>
          <p className="mt-1 text-sm leading-6">
            {authenticityMessages[result]}
          </p>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words">{value}</dd>
    </div>
  )
}

function FilterPanel({
  busy,
  filters,
  onChange,
  onSearch,
}: {
  busy: boolean
  filters: ArchiveFilters
  onChange: (filters: ArchiveFilters) => void
  onSearch: () => void
}) {
  return (
    <form
      className="rounded-3xl border bg-card p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="filter-signatory"
          >
            Signatory
          </label>
          <input
            className="field-input"
            id="filter-signatory"
            onChange={(event) =>
              onChange({ ...filters, signatory: event.target.value })
            }
            placeholder="Name or email"
            type="text"
            value={filters.signatory ?? ""}
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="filter-from"
          >
            Completed from
          </label>
          <input
            className="field-input"
            id="filter-from"
            onChange={(event) =>
              onChange({
                ...filters,
                completedFrom: event.target.value
                  ? startOfDayIso(event.target.value)
                  : undefined,
              })
            }
            type="date"
            value={dateFromIso(filters.completedFrom)}
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="filter-to"
          >
            Completed to
          </label>
          <input
            className="field-input"
            id="filter-to"
            onChange={(event) =>
              onChange({
                ...filters,
                completedTo: event.target.value
                  ? endOfDayIso(event.target.value)
                  : undefined,
              })
            }
            type="date"
            value={dateFromIso(filters.completedTo)}
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="filter-retention"
          >
            Retention
          </label>
          <select
            className="field-input"
            id="filter-retention"
            onChange={(event) =>
              onChange({
                ...filters,
                retentionStatus:
                  event.target.value === ""
                    ? undefined
                    : (event.target.value as "ACTIVE" | "REVIEW_DUE"),
              })
            }
            value={filters.retentionStatus ?? ""}
          >
            <option value="">Any</option>
            <option value="ACTIVE">Within retention</option>
            <option value="REVIEW_DUE">Review due</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="rounded-xl" disabled={busy} type="submit">
          <FileSearch />
          Search
        </Button>
        <Button
          className="rounded-xl"
          disabled={busy}
          onClick={() => {
            onChange({})
            onSearch()
          }}
          type="button"
          variant="ghost"
        >
          Clear filters
        </Button>
      </div>
    </form>
  )
}

function noticeFor(error: unknown): Notice {
  const mapped =
    error instanceof ApiError ? archiveMessageForCode(error.code) : null
  return {
    tone: "error",
    message: mapped ?? userMessageForApiError(error),
    reference: errorReference(error),
  }
}
