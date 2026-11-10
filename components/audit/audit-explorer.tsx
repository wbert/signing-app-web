"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  ScrollText,
  Search,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  FullPageError,
  FullPageStatus,
  NoticeBanner,
  type Notice,
} from "@/components/admin/admin-ui"
import { DocumentShell } from "@/components/documents/document-shell"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  AuditEvent,
  AuditEventsResponse,
  MeResponse,
  Pagination,
} from "@/lib/api/types"
import { auditCategories } from "@/lib/api/types"
import {
  type AuditFilters,
  auditCategoryDescriptions,
  auditCategoryLabels,
  auditFiltersFromQuery,
  auditFiltersToQuery,
  describeEventType,
  orderedData,
  validateAuditFilters,
} from "@/lib/audit/audit"
import { can } from "@/lib/auth/capabilities"
import { formatTimestamp } from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

/**
 * A read-only window onto the append-only trail. There is deliberately no
 * control here that creates, edits, or deletes an event: the API exposes no
 * such route, and offering one would misrepresent what the record is.
 */
export function AuditExplorer() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
  })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const search = useCallback(
    async (next: {
      filters: AuditFilters
      offset: number
      foreground: boolean
    }) => {
      const invalid = validateAuditFilters(next.filters)
      if (invalid) {
        setNotice({ tone: "error", message: invalid })
        return
      }

      if (next.foreground) setLoading(true)
      else setSearching(true)
      setLoadError(null)
      try {
        const query = auditFiltersToQuery(next.filters)
        query.set("limit", String(PAGE_SIZE))
        query.set("offset", String(next.offset))
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<AuditEventsResponse>(`/audit-events?${query.toString()}`),
        ])
        if (!can(currentSession.capabilities, "audit:read")) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setSession(currentSession)
        setEvents(response.events)
        setPagination(response.pagination)

        const shareable = auditFiltersToQuery(next.filters)
        if (next.offset > 0) shareable.set("offset", String(next.offset))
        const serialized = shareable.toString()
        window.history.replaceState(
          window.history.state,
          "",
          `/audit${serialized.length > 0 ? `?${serialized}` : ""}`
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
        setLoadError({
          tone: "error",
          message: userMessageForApiError(error),
          reference: errorReference(error),
        })
      } finally {
        setLoading(false)
        setSearching(false)
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = window.location.search.replace(/^\?/u, "")
      const initial = auditFiltersFromQuery(query)
      const offset = Number(new URLSearchParams(query).get("offset") ?? 0)
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

  if (loading) return <FullPageStatus message="Loading the audit trail…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load the audit trail"
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
      eyebrow="Audit trail"
      intro="Every recorded action, in the order it happened. The trail is append-only: nothing here can be edited or removed, by you or by anyone."
      session={session}
      title="Activity records"
    >
      <div className="mt-8 space-y-5">
        <p className="flex items-center gap-2 rounded-none border bg-muted/25 px-4 py-3 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          This view is read-only. Records cannot be amended or deleted.
        </p>

        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}

        <form
          className="rounded-none border bg-card p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            void search({ filters, offset: 0, foreground: false })
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="audit-category"
              >
                Category
              </label>
              <select
                className="field-input"
                id="audit-category"
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    category:
                      event.target.value === ""
                        ? undefined
                        : (event.target.value as AuditFilters["category"]),
                  })
                }
                value={filters.category ?? ""}
              >
                <option value="">Any</option>
                {auditCategories.map((category) => (
                  <option key={category} value={category}>
                    {auditCategoryLabels[category]}
                  </option>
                ))}
              </select>
              {filters.category && (
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {auditCategoryDescriptions[filters.category]}
                </p>
              )}
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="audit-event-type"
              >
                Event type
              </label>
              <input
                className="field-input"
                id="audit-event-type"
                onChange={(event) =>
                  setFilters({ ...filters, eventType: event.target.value })
                }
                placeholder="approval.step_approved"
                type="text"
                value={filters.eventType ?? ""}
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="audit-target"
              >
                Target ID
              </label>
              <input
                className="field-input"
                id="audit-target"
                onChange={(event) =>
                  setFilters({ ...filters, targetId: event.target.value })
                }
                type="text"
                value={filters.targetId ?? ""}
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="audit-actor"
              >
                Actor user ID
              </label>
              <input
                className="field-input"
                id="audit-actor"
                onChange={(event) =>
                  setFilters({ ...filters, actorUserId: event.target.value })
                }
                type="text"
                value={filters.actorUserId ?? ""}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="rounded-none" disabled={searching} type="submit">
              <Search />
              Search
            </Button>
            <Button
              className="rounded-none"
              disabled={searching}
              onClick={() => {
                setFilters({})
                void search({ filters: {}, offset: 0, foreground: false })
              }}
              type="button"
              variant="ghost"
            >
              Clear filters
            </Button>
          </div>
        </form>

        <p aria-live="polite" className="text-sm text-muted-foreground">
          {pagination.total === 0
            ? "No events match."
            : `${pagination.total} ${pagination.total === 1 ? "event" : "events"} · page ${page} of ${pages}`}
        </p>

        {events.length === 0 ? (
          <div className="rounded-none border bg-card p-10 text-center">
            <ScrollText className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl font-semibold">
              No events match
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Try a wider date range, or clear the filters.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {events.map((event) => (
              <EventRow
                event={event}
                expanded={expanded === event.id}
                key={event.id}
                onToggle={() =>
                  setExpanded(expanded === event.id ? null : event.id)
                }
              />
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            className="rounded-none"
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
            className="rounded-none"
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
    </DocumentShell>
  )
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: AuditEvent
  expanded: boolean
  onToggle: () => void
}) {
  const data = orderedData(event)

  return (
    <li className="rounded-none border bg-card">
      <button
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
        onClick={onToggle}
        type="button"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {describeEventType(event.eventType)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {auditCategoryLabels[event.category]} · {event.actor.label} ·{" "}
            {formatTimestamp(event.occurredAt)}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition",
            expanded && "rotate-90"
          )}
        />
      </button>

      {expanded && (
        <div className="border-t px-5 py-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Entry label="Event type" value={event.eventType} />
            <Entry
              label="Target"
              value={`${event.targetType} · ${event.targetId}`}
            />
            <Entry label="Occurred" value={formatTimestamp(event.occurredAt)} />
            <Entry label="Support reference" value={event.requestId} />
          </dl>

          {data.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Recorded detail
              </h3>
              <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                {data.map((entry) => (
                  <Entry
                    key={entry.key}
                    label={entry.label}
                    value={entry.value}
                  />
                ))}
              </dl>
            </>
          )}

          {/* A citable address for this one event, useful in a report. */}
          <Link
            className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 hover:underline focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none dark:text-emerald-300"
            href={`/audit/${event.id}`}
          >
            <ExternalLink className="size-3.5" />
            Open this event on its own page
          </Link>
        </div>
      )}
    </li>
  )
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs break-words">{value}</dd>
    </div>
  )
}
