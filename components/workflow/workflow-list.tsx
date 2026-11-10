"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Workflow as WorkflowIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  FullPageError,
  FullPageStatus,
  type Notice,
} from "@/components/admin/admin-ui"
import { DocumentShell } from "@/components/documents/document-shell"
import { WorkflowStatusBadge } from "@/components/workflow/workflow-status"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  MeResponse,
  Workflow,
  WorkflowDisplayStatus,
  WorkflowsResponse,
} from "@/lib/api/types"
import { workflowDisplayStatuses } from "@/lib/api/types"
import { can } from "@/lib/auth/capabilities"
import { formatTimestamp } from "@/lib/documents/document-types"
import {
  deliveryFailed,
  hasDetail,
  signedCount,
  workflowStatusDescriptions,
  workflowStatusLabels,
} from "@/lib/workflow/workflows"
import { cn } from "@/lib/utils"

/** The API's own ceiling on `limit`, and what it applies before filtering. */
const PAGE_LIMIT = 100

export function WorkflowList() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [status, setStatus] = useState<WorkflowDisplayStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<Notice | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(
    async (options: {
      foreground: boolean
      status: WorkflowDisplayStatus | null
    }) => {
      if (options.foreground) setLoading(true)
      else setRefreshing(true)
      setLoadError(null)
      try {
        const query = new URLSearchParams({ limit: String(PAGE_LIMIT) })
        if (options.status) query.set("status", options.status)
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<WorkflowsResponse>(`/api/workflows?${query.toString()}`),
        ])
        if (!can(currentSession.capabilities, "documents:read")) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setSession(currentSession)
        setWorkflows(response.workflows)
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
        setRefreshing(false)
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load({ foreground: true, status }),
      0
    )
    return () => window.clearTimeout(timer)
  }, [load, status])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  if (loading) return <FullPageStatus message="Loading your workflows…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load workflows"
        notice={loadError}
        onRetry={() => void load({ foreground: true, status })}
      />
    )
  }
  if (!session) return null

  return (
    <DocumentShell
      actions={
        <Button
          className="rounded-none"
          disabled={refreshing}
          onClick={() => void load({ foreground: false, status })}
          variant="outline"
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          Refresh
        </Button>
      }
      eyebrow="Workflows"
      intro="Every document you sent, from draft through approval to signature. Delivery problems and the actions still open to you are shown against each one."
      session={session}
      title="Signing progress"
    >
      <nav aria-label="Filter by status" className="mt-8 flex flex-wrap gap-2">
        <FilterChip
          active={status === null}
          label="All"
          onSelect={() => setStatus(null)}
        />
        {workflowDisplayStatuses.map((entry) => (
          <FilterChip
            active={status === entry}
            key={entry}
            label={workflowStatusLabels[entry]}
            onSelect={() => setStatus(entry)}
          />
        ))}
      </nav>

      {status !== null && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          The API applies this filter to your {PAGE_LIMIT} most recently updated
          documents, so an older workflow with this status may not appear here.
        </p>
      )}

      {workflows.length === 0 ? (
        <div className="mt-6 rounded-none border bg-card p-10 text-center">
          <WorkflowIcon className="mx-auto size-7 text-muted-foreground" />
          <h2 className="mt-4 font-heading text-xl font-semibold">
            {status === null
              ? "No workflows yet"
              : `Nothing is ${workflowStatusLabels[status].toLowerCase()}`}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {status === null
              ? "A workflow appears here as soon as you create a document. It follows that document through approval and signing."
              : "Try another status, or clear the filter to see everything."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {workflows.map((workflow) => (
            <WorkflowRow key={workflow.sourceDocumentId} workflow={workflow} />
          ))}
        </ul>
      )}
    </DocumentShell>
  )
}

function FilterChip({
  active,
  label,
  onSelect,
}: {
  active: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded-none border px-3.5 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "bg-card hover:bg-muted"
      )}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  )
}

function WorkflowRow({ workflow }: { workflow: Workflow }) {
  const failures = workflow.assignments.filter((assignment) =>
    deliveryFailed(assignment.deliveryStatus)
  ).length
  const signed = signedCount(workflow)
  const total = workflow.assignments.length
  const openable = hasDetail(workflow)

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-semibold tracking-tight">
            {workflow.title}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {workflowStatusDescriptions[workflow.status]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WorkflowStatusBadge status={workflow.status} />
          {openable && (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {total > 0 && (
          <div className="flex gap-1.5">
            <dt>Signed</dt>
            <dd className="font-semibold text-foreground">
              {signed} of {total}
            </dd>
          </div>
        )}
        {workflow.sentAt && (
          <div className="flex gap-1.5">
            <dt>Sent</dt>
            <dd className="font-semibold text-foreground">
              {formatTimestamp(workflow.sentAt)}
            </dd>
          </div>
        )}
        {workflow.expiresAt && (
          <div className="flex gap-1.5">
            <dt>Expires</dt>
            <dd className="font-semibold text-foreground">
              {formatTimestamp(workflow.expiresAt)}
            </dd>
          </div>
        )}
      </dl>

      {failures > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
          <CircleAlert className="size-3.5" />
          {failures === 1
            ? "One invitation could not be delivered"
            : `${failures} invitations could not be delivered`}
        </p>
      )}
    </>
  )

  return (
    <li>
      {openable ? (
        <Link
          className="block rounded-none border bg-card p-5 transition hover:border-emerald-700/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          href={`/workflows/${workflow.requestId}`}
        >
          {body}
        </Link>
      ) : (
        <div className="rounded-none border bg-card p-5">
          {body}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            There is nothing to track yet. Signing invitations are issued once
            every mandatory approval step is complete.
          </p>
        </div>
      )}
    </li>
  )
}
