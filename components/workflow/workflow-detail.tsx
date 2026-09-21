"use client"

import { type FormEvent, useCallback, useEffect, useState } from "react"
import {
  Ban,
  BellRing,
  CircleAlert,
  Clock,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  FullPageError,
  FullPageStatus,
  NoticeBanner,
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
  WorkflowAssignmentProgress,
  WorkflowReissueResponse,
  WorkflowResponse,
} from "@/lib/api/types"
import { can } from "@/lib/auth/capabilities"
import { stepStatusLabels } from "@/lib/approvals/approvals"
import { formatTimestamp, roleLabel } from "@/lib/documents/document-types"
import {
  canVoid,
  deliveryFailed,
  deliveryStatusLabels,
  describeAssignment,
  describeDeliveryFailure,
  describeOutcome,
  isTerminal,
  MAX_VOID_REASON_CHARACTERS,
  orderedAssignments,
  signedCount,
  validateVoidReason,
  workflowMessageForCode,
  workflowStatusDescriptions,
} from "@/lib/workflow/workflows"
import { cn } from "@/lib/utils"

type Busy = { kind: "void" } | { kind: "reissue"; assignmentId: string } | null

export function WorkflowDetail({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState("")

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const read = useCallback(
    async () =>
      apiRequest<WorkflowResponse>(
        `/api/workflows/${encodeURIComponent(requestId)}`
      ),
    [requestId]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [currentSession, response] = await Promise.all([
        apiRequest<MeResponse>("/api/me"),
        read(),
      ])
      if (!can(currentSession.capabilities, "documents:read")) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setSession(currentSession)
      setWorkflow(response.workflow)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      setLoadError(noticeFor(error))
    } finally {
      setLoading(false)
    }
  }, [read, redirectToExpiredSessionLogin, router])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  /**
   * Runs one operational action. A `409` always reloads before anything is
   * retried, so a stale version can never be resubmitted; neither void nor
   * reissue takes an idempotency key, because the API guards them with the
   * request version and the delivery state instead.
   */
  async function run(next: Exclude<Busy, null>, action: () => Promise<void>) {
    if (busy) return
    setBusy(next)
    setNotice(null)
    try {
      await action()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const reloaded = await read()
          setWorkflow(reloaded.workflow)
        } catch {
          // The reload failure is reported through the notice below.
        }
      }
      setNotice(noticeFor(error))
    } finally {
      setBusy(null)
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const active = workflow
    if (!active) return

    const problem = validateVoidReason(reason)
    if (problem) {
      setNotice({ tone: "error", message: problem })
      return
    }

    await run({ kind: "void" }, async () => {
      const response = await apiRequest<WorkflowResponse>(
        `/api/workflows/${encodeURIComponent(requestId)}/void`,
        {
          method: "POST",
          body: {
            reason: reason.trim(),
            expectedVersion: active.version,
          },
        }
      )
      setWorkflow(response.workflow)
      setVoiding(false)
      setReason("")
      setNotice({
        tone: "success",
        message:
          "The signing request was voided. Every outstanding link is now unusable.",
      })
    })
  }

  async function reissue(assignment: WorkflowAssignmentProgress) {
    await run({ kind: "reissue", assignmentId: assignment.id }, async () => {
      await apiRequest<WorkflowReissueResponse>(
        `/api/workflow-assignments/${encodeURIComponent(assignment.id)}/reissue`,
        { method: "POST", body: {} }
      )
      const reloaded = await read()
      setWorkflow(reloaded.workflow)
      setNotice({
        tone: "success",
        message: `A new invitation was issued to ${assignment.signatoryName}. Their previous link no longer works.`,
      })
    })
  }

  if (loading) return <FullPageStatus message="Loading this workflow…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load this workflow"
        notice={loadError}
        onRetry={() => void load()}
      />
    )
  }
  if (!session || !workflow) return null

  const outcome = describeOutcome(workflow)
  const assignments = orderedAssignments(workflow)
  const working = busy !== null

  return (
    <DocumentShell
      actions={
        <Button
          className="rounded-xl"
          disabled={working}
          onClick={() => void load()}
          variant="outline"
        >
          <RefreshCw />
          Refresh
        </Button>
      }
      backHref="/workflows"
      backLabel="Workflows"
      eyebrow="Workflow"
      intro={workflowStatusDescriptions[workflow.status]}
      session={session}
      title={workflow.title}
    >
      <div className="mt-8 space-y-5">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}

        <section className="rounded-3xl border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <WorkflowStatusBadge status={workflow.status} />
            <p className="text-xs text-muted-foreground">
              {signedCount(workflow)} of {assignments.length} signed
            </p>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail
              label="Signing mode"
              value={
                workflow.signingMode === "SEQUENTIAL"
                  ? "One after another"
                  : workflow.signingMode === "ALL_AT_ONCE"
                    ? "All at once"
                    : "Not issued yet"
              }
            />
            <Detail
              label="Sent"
              value={workflow.sentAt ? formatTimestamp(workflow.sentAt) : "—"}
            />
            <Detail
              label="Expires"
              value={
                workflow.expiresAt ? formatTimestamp(workflow.expiresAt) : "—"
              }
            />
            {outcome && (
              <Detail
                label={outcome.label}
                value={formatTimestamp(outcome.at)}
              />
            )}
          </dl>

          {workflow.cancelReason && (
            <p className="mt-5 rounded-2xl border bg-muted/30 px-4 py-3 text-sm leading-6">
              <span className="font-semibold">Reason given: </span>
              {workflow.cancelReason}
            </p>
          )}
        </section>

        <section className="rounded-3xl border bg-card p-5 sm:p-7">
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            Signatories
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {workflow.signingMode === "SEQUENTIAL"
              ? "Each signatory is invited only after the one before them signs."
              : "Every signatory was invited at the same time."}
          </p>

          <ul className="mt-5 space-y-3">
            {assignments.map((assignment) => (
              <AssignmentRow
                assignment={assignment}
                busy={
                  busy?.kind === "reissue" &&
                  busy.assignmentId === assignment.id
                }
                disabled={working}
                key={assignment.id}
                onReissue={() => void reissue(assignment)}
                signingMode={workflow.signingMode}
              />
            ))}
          </ul>
        </section>

        {workflow.approvalSteps.length > 0 && (
          <section className="rounded-3xl border bg-card p-5 sm:p-7">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              Approval history
            </h2>
            <ol className="mt-5 space-y-2.5">
              {workflow.approvalSteps.map((step) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                  key={step.id}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      Step {step.stepNumber} · {roleLabel(step.approverRole)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Round {step.approvalRound} ·{" "}
                      {stepStatusLabels[step.status]}
                      {step.decidedAt
                        ? ` · ${formatTimestamp(step.decidedAt)}`
                        : ""}
                    </p>
                  </div>
                  {step.reminderCount > 0 && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <BellRing className="size-3.5" />
                      {step.reminderCount} of {step.reminderMaxCount} reminders
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="rounded-3xl border bg-card p-5 sm:p-7">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Withdraw this request
          </h2>

          {!canVoid(workflow) ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isTerminal(workflow)
                ? "This request has already finished, so there is nothing left to withdraw."
                : "This request cannot be withdrawn in its current state."}
            </p>
          ) : voiding ? (
            <form className="mt-3" onSubmit={submitVoid}>
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
                role="alert"
              >
                <p className="flex items-center gap-2 font-semibold">
                  <CircleAlert className="size-4" />
                  This cannot be undone
                </p>
                <p className="mt-1">
                  Every outstanding signing link becomes unusable immediately,
                  including links already opened but not yet signed. Signatures
                  already collected are kept, but no further signature can be
                  added. To collect signatures afterwards you must prepare and
                  submit the document again.
                </p>
              </div>

              <label
                className="mt-4 mb-2 block text-sm font-semibold"
                htmlFor="void-reason"
              >
                Reason for withdrawing
              </label>
              <textarea
                autoFocus
                className="field-input h-auto min-h-24 py-2.5"
                disabled={working}
                id="void-reason"
                maxLength={MAX_VOID_REASON_CHARACTERS}
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                The reason is recorded in the audit trail and shown on this
                workflow.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="rounded-xl"
                  disabled={working || reason.trim().length === 0}
                  type="submit"
                  variant="destructive"
                >
                  {busy?.kind === "void" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Ban />
                  )}
                  Void this request
                </Button>
                <Button
                  className="rounded-xl"
                  disabled={working}
                  onClick={() => {
                    setVoiding(false)
                    setReason("")
                  }}
                  type="button"
                  variant="ghost"
                >
                  Keep it open
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Withdrawing stops the request and makes every outstanding
                signing link unusable.
              </p>
              <Button
                className="mt-4 rounded-xl"
                disabled={working}
                onClick={() => setVoiding(true)}
                type="button"
                variant="outline"
              >
                <Ban />
                Withdraw request
              </Button>
            </>
          )}
        </section>
      </div>
    </DocumentShell>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  )
}

function AssignmentRow({
  assignment,
  busy,
  disabled,
  onReissue,
  signingMode,
}: {
  assignment: WorkflowAssignmentProgress
  busy: boolean
  disabled: boolean
  onReissue: () => void
  signingMode: Workflow["signingMode"]
}) {
  const failed = deliveryFailed(assignment.deliveryStatus)
  const failure = failed
    ? describeDeliveryFailure(assignment.deliveryFailure)
    : null

  return (
    <li
      className={cn(
        "rounded-2xl border px-4 py-4",
        failed && "border-red-200 dark:border-red-950"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {assignment.signingOrder}. {assignment.signatoryName}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {assignment.signatoryEmail}
          </p>
        </div>
        {assignment.status === "SIGNED" ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="size-3.5" />
            Signed
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {assignment.status === "ACTIVE" && assignment.viewedAt
              ? "Opened"
              : assignment.status === "ACTIVE"
                ? "Invited"
                : null}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {describeAssignment(assignment, signingMode)}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        {assignment.deliveryStatus && (
          <div className="flex items-center gap-1.5">
            <Mail className="size-3.5" />
            <dt className="sr-only">Delivery</dt>
            <dd>{deliveryStatusLabels[assignment.deliveryStatus]}</dd>
          </div>
        )}
        {assignment.viewedAt && (
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            <dt className="sr-only">Opened</dt>
            <dd>{formatTimestamp(assignment.viewedAt)}</dd>
          </div>
        )}
        {assignment.signedAt && (
          <div className="flex items-center gap-1.5">
            <dt>Signed</dt>
            <dd>{formatTimestamp(assignment.signedAt)}</dd>
          </div>
        )}
        {assignment.reminderCount > 0 && (
          <div className="flex items-center gap-1.5">
            <BellRing className="size-3.5" />
            <dt className="sr-only">Reminders</dt>
            <dd>
              {assignment.reminderCount}{" "}
              {assignment.reminderCount === 1 ? "reminder" : "reminders"}
            </dd>
          </div>
        )}
      </dl>

      {failure && (
        <p
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
          role="alert"
        >
          {failure}
        </p>
      )}

      {assignment.correctiveAction === "REISSUE" && (
        <div className="mt-3">
          <Button
            className="rounded-xl"
            disabled={disabled}
            onClick={onReissue}
            size="sm"
            type="button"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
            Send a new invitation
          </Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            This issues a fresh link and immediately invalidates the previous
            one.
          </p>
        </div>
      )}
    </li>
  )
}

function noticeFor(error: unknown): Notice {
  const mapped =
    error instanceof ApiError ? workflowMessageForCode(error.code) : null
  return {
    tone: "error",
    message: mapped ?? userMessageForApiError(error),
    reference: errorReference(error),
  }
}
