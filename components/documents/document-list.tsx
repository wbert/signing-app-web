"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  CircleAlert,
  Clock3,
  FileText,
  Files,
  Plus,
  RefreshCw,
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
import { Skeleton } from "@/components/ui/skeleton"
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
  DocumentApprovalStatus,
  DocumentSummary,
  DocumentsResponse,
  MeResponse,
} from "@/lib/api/types"
import { documentApprovalStatuses } from "@/lib/api/types"
import {
  documentStatusDescriptions,
  documentStatusLabels,
} from "@/lib/approvals/approvals"
import { can } from "@/lib/auth/capabilities"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20

type StatusFilter = "ALL" | DocumentApprovalStatus

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  ...documentApprovalStatuses.map((status) => ({
    value: status,
    label: documentStatusLabels[status],
  })),
]

const statusStyles: Record<DocumentApprovalStatus, string> = {
  DRAFT:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300",
  IN_APPROVAL:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-950 dark:bg-blue-950/40 dark:text-blue-300",
  RETURNED:
    "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  APPROVED:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300",
  VOIDED:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-950 dark:bg-red-950/40 dark:text-red-300",
}

export function DocumentList() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(
    async (foreground: boolean) => {
      if (foreground) setLoading(true)
      else setRefreshing(true)
      setLoadError(null)
      setNotice(null)

      try {
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<DocumentsResponse>(
            `/api/documents?limit=${PAGE_SIZE}&offset=0`
          ),
        ])
        if (!can(currentSession.capabilities, "documents:read")) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setSession(currentSession)
        setDocuments(response.documents)
        setHasMore(response.documents.length === PAGE_SIZE)
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
        const failure = {
          tone: "error" as const,
          message: userMessageForApiError(error),
          reference: errorReference(error),
        }
        if (foreground) setLoadError(failure)
        else setNotice(failure)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => void load(true), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  const visibleDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return documents.filter((document) => {
      if (
        normalized &&
        ![document.title, document.originalFileName].some((value) =>
          value.toLowerCase().includes(normalized)
        )
      ) {
        return false
      }
      return statusFilter === "ALL" || document.approvalStatus === statusFilter
    })
  }, [documents, query, statusFilter])

  async function loadMore() {
    setLoadingMore(true)
    setNotice(null)
    try {
      const response = await apiRequest<DocumentsResponse>(
        `/api/documents?limit=${PAGE_SIZE}&offset=${documents.length}`
      )
      setDocuments((current) => {
        const known = new Set(current.map((document) => document.id))
        return [
          ...current,
          ...response.documents.filter((document) => !known.has(document.id)),
        ]
      })
      setHasMore(response.documents.length === PAGE_SIZE)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      setNotice({
        tone: "error",
        message: userMessageForApiError(error),
        reference: errorReference(error),
      })
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <FullPageStatus message="Loading your documents…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load your documents"
        notice={loadError}
        onRetry={() => void load(true)}
      />
    )
  }
  if (!session) return null

  const canCreate = can(session.capabilities, "documents:create")
  const activeCount = documents.filter((document) =>
    ["DRAFT", "RETURNED", "IN_APPROVAL"].includes(document.approvalStatus)
  ).length
  const approvedCount = documents.filter(
    (document) => document.approvalStatus === "APPROVED"
  ).length

  return (
    <DocumentShell
      actions={
        canCreate ? (
          <Button
            className="rounded-none"
            render={<Link href="/documents/new" />}
            size="lg"
          >
            <Plus />
            New document
          </Button>
        ) : undefined
      }
      eyebrow="Sender workspace"
      intro="Open a draft, continue a returned document, or follow a submission through its approval path. Your most recently changed documents appear first."
      session={session}
      title="Documents"
    >
      <section
        aria-label="Document summary"
        className="mt-8 grid gap-3 sm:grid-cols-3"
      >
        <SummaryCard
          icon={<Files className="size-4" />}
          label="Documents loaded"
          value={documents.length}
        />
        <SummaryCard
          icon={<Clock3 className="size-4" />}
          label="Active work"
          value={activeCount}
        />
        <SummaryCard
          icon={<FileText className="size-4" />}
          label="Approved"
          value={approvedCount}
        />
      </section>

      <div aria-live="polite" className="mt-6">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}
      </div>

      <section className="mt-6 overflow-hidden rounded-none border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Filter loaded documents by title or file name"
              className="field-input h-10 pl-10"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter title or file name"
              type="search"
              value={query}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Status
              <select
                aria-label="Filter loaded documents by status"
                className="field-input h-10 w-auto min-w-40"
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                value={statusFilter}
              >
                {statusFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              {visibleDocuments.length} of {documents.length} loaded shown
            </p>
            <Button
              aria-label="Refresh documents"
              className="rounded-none"
              disabled={refreshing}
              onClick={() => void load(false)}
              size="icon-sm"
              variant="outline"
            >
              <RefreshCw className={cn(refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {visibleDocuments.length === 0 ? (
          <EmptyState
            canCreate={canCreate}
            filtered={Boolean(query.trim()) || statusFilter !== "ALL"}
          />
        ) : (
          <ul className="divide-y">
            {visibleDocuments.map((document) => (
              <DocumentRow document={document} key={document.id} />
            ))}
          </ul>
        )}

        {hasMore && (
          <div className="flex justify-center border-t p-4">
            <Button
              className="rounded-none"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              variant="outline"
            >
              {loadingMore && (
                <Skeleton className="h-3 w-8" aria-hidden="true" />
              )}
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>
    </DocumentShell>
  )
}

function DocumentRow({ document }: { document: DocumentSummary }) {
  return (
    <li>
      <Link
        className="group flex flex-col gap-4 p-4 transition hover:bg-muted/35 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
        href={`/documents/${encodeURIComponent(document.id)}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              {document.title}
            </h2>
            <StatusPill status={document.approvalStatus} />
          </div>
          <p className="mt-1.5 truncate text-sm text-muted-foreground">
            {document.originalFileName} · {document.pageCount}{" "}
            {document.pageCount === 1 ? "page" : "pages"}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {documentStatusDescriptions[document.approvalStatus]}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-5 lg:justify-end">
          <div className="text-left text-xs text-muted-foreground lg:text-right">
            <p>Updated {formatTimestamp(document.updatedAt)}</p>
            <p className="mt-1">
              {document.approvalRound > 0
                ? `Approval round ${document.approvalRound}`
                : "Not submitted"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {documentActionLabel(document.approvalStatus)}
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </li>
  )
}

function StatusPill({ status }: { status: DocumentApprovalStatus }) {
  return (
    <span
      className={cn(
        "rounded-none border px-2.5 py-1 text-[0.62rem] font-bold tracking-wide uppercase",
        statusStyles[status]
      )}
    >
      {documentStatusLabels[status]}
    </span>
  )
}

function EmptyState({
  canCreate,
  filtered,
}: {
  canCreate: boolean
  filtered: boolean
}) {
  return (
    <div className="px-6 py-14 text-center">
      <CircleAlert className="mx-auto size-7 text-muted-foreground" />
      <h2 className="mt-4 font-heading text-xl font-semibold">
        {filtered ? "No matching documents" : "No documents yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {filtered
          ? "Change the filters to see other documents already loaded."
          : canCreate
            ? "Prepare your first document to start placing signatories and signing fields."
            : "No documents are available for this account."}
      </p>
      {!filtered && canCreate && (
        <Button
          className="mt-5 rounded-none"
          render={<Link href="/documents/new" />}
        >
          <Plus />
          New document
        </Button>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="rounded-none border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-[0.68rem] font-bold tracking-[0.1em] uppercase">
          {label}
        </p>
      </div>
      <p className="mt-2 font-heading text-2xl font-semibold">{value}</p>
    </div>
  )
}

function documentActionLabel(status: DocumentApprovalStatus): string {
  if (status === "DRAFT") return "Edit draft"
  if (status === "RETURNED") return "Correct document"
  return "View progress"
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
