"use client"

import { type FormEvent, useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  BellRing,
  Check,
  ExternalLink,
  FileText,
  LoaderCircle,
  Lock,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  Field,
  FullPageError,
  FullPageStatus,
  NoticeBanner,
  type Notice,
} from "@/components/admin/admin-ui"
import { ApprovalPath } from "@/components/approvals/approval-path"
import { PdfPreview } from "@/components/approvals/pdf-preview"
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
  ApprovalDocument,
  ApprovalMutationResponse,
  ApprovalStepViewResponse,
  MeResponse,
  ReturnTarget,
} from "@/lib/api/types"
import {
  assignmentAge,
  decisionHistory,
  documentStatusLabels,
  returnFellBackToOriginator,
  returnTargetOptions,
  roleLabel,
  stepStatusLabels,
  stepsForCurrentRound,
} from "@/lib/approvals/approvals"
import { can } from "@/lib/auth/capabilities"
import { formatTimestamp } from "@/lib/documents/document-types"

const MAX_REASON = 2000

export function ApprovalDetail({ approvalStepId }: { approvalStepId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [view, setView] = useState<ApprovalStepViewResponse | null>(null)
  const [decided, setDecided] = useState<ApprovalDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<"approve" | "return" | null>(null)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState("")
  const [targetChoice, setTargetChoice] = useState("ORIGINATOR")

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [currentSession, response] = await Promise.all([
        apiRequest<MeResponse>("/api/me"),
        apiRequest<ApprovalStepViewResponse>(
          `/api/approval-steps/${encodeURIComponent(approvalStepId)}`
        ),
      ])
      if (!can(currentSession.capabilities, "approvals:read")) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setSession(currentSession)
      setView(response)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      setLoadError(loadNoticeFor(error))
    } finally {
      setLoading(false)
    }
  }, [approvalStepId, redirectToExpiredSessionLogin, router])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  async function decide(
    kind: "approve" | "return",
    event?: FormEvent<HTMLFormElement>
  ) {
    event?.preventDefault()
    if (busy || !view) return

    const step = view.approval
    const target: ReturnTarget =
      targetChoice === "ORIGINATOR"
        ? { type: "ORIGINATOR" }
        : { type: "STEP", stepNumber: Number(targetChoice) }

    if (kind === "return" && reason.trim().length === 0) {
      setNotice({
        tone: "error",
        message: "Enter the reason this document is being returned.",
      })
      return
    }

    setBusy(kind)
    setNotice(null)
    try {
      // No idempotency key exists for approval decisions: the version pair is
      // the duplicate guard, so a replayed decision is rejected with 409.
      const body =
        kind === "approve"
          ? {
              expectedDocumentVersion: step.documentWorkflowVersion,
              expectedAssignmentVersion: step.assignmentVersion,
            }
          : {
              expectedDocumentVersion: step.documentWorkflowVersion,
              expectedAssignmentVersion: step.assignmentVersion,
              reason: reason.trim(),
              target,
            }

      const response = await apiRequest<ApprovalMutationResponse>(
        `/api/approval-steps/${encodeURIComponent(step.id)}/${kind}`,
        { method: "POST", body }
      )

      setDecided(response.document)
      const applied = response.document.steps.find(
        (entry) => entry.id === step.id
      )
      const fellBack =
        kind === "return" &&
        applied !== undefined &&
        returnFellBackToOriginator(target, applied)

      setNotice({
        tone: fellBack ? "warning" : "success",
        message:
          kind === "approve"
            ? "Your approval was recorded."
            : fellBack
              ? `The document was returned, but the API could not use step ${targetChoice}. It went back to the sender instead.`
              : applied?.returnTarget === "STEP"
                ? `The document was returned to approval step ${applied.returnedToStepNumber}.`
                : "The document was returned to the sender.",
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setNotice({
          tone: "warning",
          message:
            "This approval changed in another session — it may already have been decided, recalled, or reassigned. The latest state has been reloaded.",
          reference: errorReference(error),
        })
        void load()
        return
      }
      setNotice(decisionNoticeFor(error))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <FullPageStatus message="Loading the approval…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to open this approval"
        notice={loadError}
        onRetry={() => router.replace("/approvals")}
      />
    )
  }
  if (!session || !view) return null

  const step = view.approval
  const age = assignmentAge(step.assignedAt)
  const assignedToMe = step.assignedUserId === session.user.id
  const canDecide =
    can(session.capabilities, "approvals:decide") &&
    assignedToMe &&
    step.status === "PENDING" &&
    decided === null
  const pathDocument = decided ?? view.document
  // Steps that really exist earlier in this round, rather than every number
  // below this one, now that the path is visible before deciding.
  const earlierSteps = returnTargetOptions(pathDocument, step.stepNumber)

  return (
    <DocumentShell
      backHref="/approvals"
      backLabel="Approvals"
      eyebrow={`Step ${step.stepNumber} · ${roleLabel(step.approverRole)}`}
      intro={`${step.isMandatory ? "Mandatory" : "Optional"} step${
        step.isParallel ? ", decided in parallel with other roles" : ""
      }${step.approvalRound > 1 ? ` · round ${step.approvalRound}` : ""}.`}
      session={session}
      title={step.documentTitle}
    >
      <div aria-live="polite" className="mt-6 space-y-3">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}
        {!assignedToMe && (
          <NoticeBanner
            notice={{
              tone: "warning",
              message:
                "This step is not assigned to you, so no decision controls are shown. The API enforces this regardless.",
            }}
          />
        )}
        {assignedToMe && step.status !== "PENDING" && decided === null && (
          <NoticeBanner
            notice={{
              tone: "warning",
              message: `This step is ${stepStatusLabels[step.status].toLowerCase()} and no longer awaits your decision.`,
            }}
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="rounded-none border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="font-heading text-lg font-semibold">Document</h2>
          <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
            Review the document before deciding. Opening this page recorded that
            you viewed it.
          </p>
          <PdfPreview previewUrl={view.preview.url} sourceKey={step.id} />

          {view.preview.attachments.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Attachments</h3>
              <ul className="mt-2 space-y-2">
                {view.preview.attachments.map((attachment) => (
                  <li key={attachment.requirementKey}>
                    <a
                      className="flex items-center gap-2.5 rounded-none border px-3 py-2.5 text-sm transition hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      href={attachment.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {attachment.requirementKey}
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Attachment links expire shortly after this page was opened.
                Reload to request new ones.
              </p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-none border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-lg font-semibold">Assignment</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Detail
                label="Assigned"
                value={
                  step.assignedAt
                    ? `${formatTimestamp(step.assignedAt)}${age ? ` · ${age.label}` : ""}`
                    : "Not recorded"
                }
              />
              <Detail
                label="First viewed"
                value={
                  step.viewedAt ? formatTimestamp(step.viewedAt) : "Just now"
                }
              />
              <Detail
                label="Reminders"
                value={
                  step.reminderMaxCount === 0
                    ? "Disabled for this document type"
                    : `${step.reminderCount} of ${step.reminderMaxCount} sent, every ${step.reminderIntervalHours} hours`
                }
              />
            </dl>
            {step.reminderCount > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                <BellRing className="size-3.5" />
                This assignment has already been chased.
              </p>
            )}
          </section>

          {canDecide && (
            <section className="rounded-none border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-lg font-semibold">Decision</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Your decision is recorded against the current version of this
                document. If it changed elsewhere, you will be asked to reload.
              </p>

              {!returning ? (
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    className="rounded-none"
                    disabled={busy !== null}
                    onClick={() => void decide("approve")}
                    type="button"
                  >
                    {busy === "approve" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Check />
                    )}
                    {busy === "approve" ? "Recording…" : "Approve"}
                  </Button>
                  <Button
                    className="rounded-none"
                    disabled={busy !== null}
                    onClick={() => setReturning(true)}
                    type="button"
                    variant="destructive"
                  >
                    <Undo2 />
                    Return for correction
                  </Button>
                </div>
              ) : (
                <form
                  className="mt-4 space-y-4"
                  noValidate
                  onSubmit={(event) => void decide("return", event)}
                >
                  <Field
                    description="Shared with the sender and recorded in the audit trail."
                    htmlFor="return-reason"
                    label="Reason for returning"
                  >
                    <textarea
                      aria-describedby="return-reason-description"
                      autoFocus
                      className="field-input h-28 resize-y py-3"
                      id="return-reason"
                      maxLength={MAX_REASON}
                      onChange={(event) => setReason(event.target.value)}
                      value={reason}
                    />
                  </Field>

                  <Field
                    description={
                      earlierSteps.length === 0
                        ? "This is the first step, so it can only go back to the sender."
                        : "Only steps that exist earlier in this round are listed. If the API cannot use the one you pick, it returns the document to the sender and this page will say so."
                    }
                    htmlFor="return-target"
                    label="Send back to"
                  >
                    <select
                      className="field-input h-11"
                      id="return-target"
                      onChange={(event) => setTargetChoice(event.target.value)}
                      value={targetChoice}
                    >
                      <option value="ORIGINATOR">The sender</option>
                      {earlierSteps.map((stepNumber) => (
                        <option key={stepNumber} value={String(stepNumber)}>
                          Approval step {stepNumber}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      className="rounded-none"
                      disabled={busy !== null}
                      onClick={() => setReturning(false)}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      className="rounded-none"
                      disabled={busy !== null || reason.trim().length === 0}
                      type="submit"
                      variant="destructive"
                    >
                      {busy === "return" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Undo2 />
                      )}
                      {busy === "return" ? "Returning…" : "Confirm return"}
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}

          {!canDecide && decided === null && (
            <section className="rounded-none border bg-muted/25 p-5">
              <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
                <Lock className="size-4" />
                No decision available
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Decision controls appear only while a step is assigned to you
                and awaiting your decision.
              </p>
            </section>
          )}

          <section className="rounded-none border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-lg font-semibold">
              {decided ? "Resulting path" : "Approval path"}
            </h2>
            <p className="mt-1 mb-3 text-sm leading-6 text-muted-foreground">
              {decided
                ? `The document is now ${documentStatusLabels[
                    decided.approvalStatus
                  ].toLowerCase()}.`
                : `Round ${pathDocument.approvalRound}. Your step is highlighted.`}
            </p>
            <ApprovalPath
              highlightStepId={step.id}
              steps={stepsForCurrentRound(pathDocument)}
            />
            {decided && (
              <Link
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                href="/approvals"
              >
                <ArrowLeft className="size-3.5" />
                Back to your queue
              </Link>
            )}
          </section>

          {decisionHistory(pathDocument).length > 0 && (
            <section className="rounded-none border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-lg font-semibold">
                Decisions so far
              </h2>
              <ol className="mt-3 space-y-3">
                {decisionHistory(pathDocument).map((entry) => (
                  <li
                    className="rounded-none border p-3.5 text-sm"
                    key={entry.id}
                  >
                    <p className="font-semibold">
                      {entry.decision === "APPROVED" ? "Approved" : "Returned"}{" "}
                      at step {entry.stepNumber} by{" "}
                      {roleLabel(entry.approverRole)}
                    </p>
                    {entry.returnReason && (
                      <p className="mt-2 rounded-none bg-muted/50 px-2.5 py-1.5 text-xs leading-5">
                        {entry.returnReason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </DocumentShell>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

function loadNoticeFor(error: unknown): Notice {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return {
        tone: "error",
        message:
          "This approval is not assigned to you, so it cannot be opened.",
        reference: error.requestId,
      }
    }
    if (error.status === 404) {
      return {
        tone: "error",
        message: "This approval step no longer exists.",
        reference: error.requestId,
      }
    }
    if (error.status === 409) {
      return {
        tone: "error",
        message:
          "This document is no longer awaiting your decision. It may have been recalled, returned, or reassigned.",
        reference: error.requestId,
      }
    }
  }
  return {
    tone: "error",
    message: userMessageForApiError(error),
    reference: errorReference(error),
  }
}

function decisionNoticeFor(error: unknown): Notice {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      INVALID_RETURN_TARGET:
        "A document can only be returned to a step earlier than yours.",
      APPROVAL_STEP_NOT_FOUND:
        "This approval step no longer exists. Return to your queue.",
      VALIDATION_ERROR:
        "The decision was rejected. Check the reason and try again.",
    }
    return {
      tone: "error",
      message: messages[error.code] ?? userMessageForApiError(error),
      reference: error.requestId,
    }
  }
  return { tone: "error", message: userMessageForApiError(error) }
}
