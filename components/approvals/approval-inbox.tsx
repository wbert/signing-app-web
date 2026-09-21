"use client"

import { useCallback, useEffect, useState } from "react"
import {
  BellRing,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Inbox,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  FullPageError,
  FullPageStatus,
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
  ApprovalQueueResponse,
  ApprovalStep,
  MeResponse,
} from "@/lib/api/types"
import { assignmentAge, isOverdue, roleLabel } from "@/lib/approvals/approvals"
import { can } from "@/lib/auth/capabilities"
import { cn } from "@/lib/utils"

export function ApprovalInbox() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [approvals, setApprovals] = useState<ApprovalStep[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<Notice | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(
    async (options: { foreground: boolean }) => {
      if (options.foreground) setLoading(true)
      else setRefreshing(true)
      setLoadError(null)
      try {
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<ApprovalQueueResponse>("/api/approvals"),
        ])
        if (!can(currentSession.capabilities, "approvals:read")) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setSession(currentSession)
        setApprovals(response.approvals)
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
    const timer = window.setTimeout(() => void load({ foreground: true }), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  if (loading) return <FullPageStatus message="Loading your approvals…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load approvals"
        notice={loadError}
        onRetry={() => void load({ foreground: true })}
      />
    )
  }
  if (!session) return null

  const overdueCount = approvals.filter((step) => isOverdue(step)).length

  return (
    <DocumentShell
      actions={
        <Button
          className="rounded-xl"
          disabled={refreshing}
          onClick={() => void load({ foreground: false })}
          size="lg"
          variant="outline"
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          Refresh
        </Button>
      }
      eyebrow="Approvals"
      intro="Documents assigned to you for a decision, oldest first. Only steps currently awaiting you appear here."
      session={session}
      title="Your approval queue"
    >
      <section className="mt-8 rounded-3xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
          <p className="text-sm font-semibold">
            {approvals.length} awaiting your decision
          </p>
          {overdueCount > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.68rem] font-bold tracking-wide text-amber-900 uppercase dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock className="size-3" />
              {overdueCount} past the reminder interval
            </p>
          )}
        </div>

        {approvals.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Inbox className="size-5" />
              </span>
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Nothing awaiting you
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Approvals appear here when a document reaches a step your role
                is responsible for.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {approvals.map((step) => {
              const age = assignmentAge(step.assignedAt)
              const overdue = isOverdue(step)
              return (
                <li key={step.id}>
                  <Link
                    className="flex items-center justify-between gap-4 p-4 transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
                    href={`/approvals/${step.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <ClipboardCheck className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {step.documentTitle}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Step {step.stepNumber} ·{" "}
                          {roleLabel(step.approverRole)}
                          {step.isParallel && " · parallel"}
                          {!step.isMandatory && " · optional"}
                          {step.approvalRound > 1 &&
                            ` · round ${step.approvalRound}`}
                        </p>
                        <p
                          className={cn(
                            "mt-1 inline-flex items-center gap-1.5 text-xs",
                            overdue
                              ? "font-semibold text-amber-800 dark:text-amber-300"
                              : "text-muted-foreground"
                          )}
                        >
                          <Clock className="size-3" />
                          {age
                            ? `Assigned ${age.label}`
                            : "Assignment time unknown"}
                          {step.reminderCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <BellRing className="size-3" />
                              {step.reminderCount} of {step.reminderMaxCount}{" "}
                              reminders sent
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </DocumentShell>
  )
}
