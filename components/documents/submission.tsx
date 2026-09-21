"use client"

import { useState } from "react"
import { CircleAlert, LoaderCircle, Send, Undo2 } from "lucide-react"

import { NoticeBanner, type Notice } from "@/components/admin/admin-ui"
import { ApprovalPath } from "@/components/approvals/approval-path"
import { Button } from "@/components/ui/button"
import { ApiError, apiRequest, userMessageForApiError } from "@/lib/api/client"
import type {
  ApprovalDocument,
  ApprovalMutationResponse,
  Draft,
} from "@/lib/api/types"
import {
  canRecall,
  decisionHistory,
  describeBlocker,
  documentStatusDescriptions,
  documentStatusLabels,
  parseIncompleteBlockers,
  roleLabel,
  stepsForCurrentRound,
} from "@/lib/approvals/approvals"
import { formatTimestamp } from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

/** Submission panel shown on an editable draft. */
export function SubmissionPanel({
  clientBlockers,
  draft,
  onSubmitted,
  unsavedChanges,
}: {
  clientBlockers: string[]
  draft: Draft
  onSubmitted: (document: ApprovalDocument) => void
  unsavedChanges: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [serverBlockers, setServerBlockers] = useState<string[]>([])

  const blocked = clientBlockers.length > 0 || unsavedChanges

  async function submit() {
    setBusy(true)
    setNotice(null)
    setServerBlockers([])
    try {
      // The version is the duplicate guard; no idempotency key exists here.
      const response = await apiRequest<ApprovalMutationResponse>(
        `/api/documents/${encodeURIComponent(draft.id)}/submit`,
        { method: "POST", body: { expectedVersion: draft.workflowVersion } }
      )
      onSubmitted(response.document)
    } catch (error) {
      if (error instanceof ApiError && error.code === "DOCUMENT_INCOMPLETE") {
        setServerBlockers(parseIncompleteBlockers(error.message))
        setNotice({
          tone: "error",
          message: "The API rejected this document as incomplete.",
          reference: error.requestId,
        })
        return
      }
      setNotice(submissionNoticeFor(error))
    } finally {
      setBusy(false)
    }
  }

  const allBlockers = [...clientBlockers, ...serverBlockers]

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <Send className="size-4" />
        Submit for approval
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {draft.approvalStatus === "RETURNED"
          ? "This document was returned for changes. Submitting it starts a new approval round."
          : "Submitting assigns the first approval step and makes the document read-only."}
      </p>

      {notice && (
        <div className="mt-4">
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      {unsavedChanges && (
        <p className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          Save your changes before submitting. The API submits the version it
          already holds.
        </p>
      )}

      {allBlockers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300/70 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/35">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
            <CircleAlert className="size-4" />
            Not ready to submit
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-950 dark:text-amber-100">
            {allBlockers.map((blocker) => (
              <li key={blocker}>{describeBlocker(blocker)}</li>
            ))}
          </ul>
        </div>
      )}

      <Button
        className="mt-4 w-full rounded-xl"
        disabled={busy || blocked}
        onClick={() => void submit()}
        type="button"
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
        {busy ? "Submitting…" : "Submit for approval"}
      </Button>
    </section>
  )
}

/**
 * Read-only view once a document has left the draft state. The draft endpoint
 * stops returning it at that point, so everything here comes from the approval
 * endpoint instead.
 */
export function SenderApprovalView({
  document,
  onChanged,
}: {
  document: ApprovalDocument
  onChanged: (document: ApprovalDocument) => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const current = stepsForCurrentRound(document)
  const history = decisionHistory(document)
  const recallable = canRecall(document)

  async function recall() {
    setBusy(true)
    setNotice(null)
    try {
      const response = await apiRequest<ApprovalMutationResponse>(
        `/api/documents/${encodeURIComponent(document.id)}/recall`,
        { method: "POST", body: { expectedVersion: document.workflowVersion } }
      )
      onChanged(response.document)
      setNotice({
        tone: "success",
        message:
          "The document was recalled. Its approvers can no longer act on it.",
      })
      setConfirming(false)
    } catch (error) {
      setNotice(recallNoticeFor(error))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}
      </div>

      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              {documentStatusLabels[document.approvalStatus]}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {documentStatusDescriptions[document.approvalStatus]}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[0.64rem] font-bold tracking-wide uppercase",
              document.approvalStatus === "APPROVED"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300"
                : document.approvalStatus === "RETURNED"
                  ? "border-red-200 bg-red-50 text-red-800 dark:border-red-950 dark:bg-red-950/40 dark:text-red-300"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300"
            )}
          >
            Round {document.approvalRound}
          </span>
        </div>

        {document.approvedAt && (
          <p className="mt-3 text-sm text-muted-foreground">
            Approved {formatTimestamp(document.approvedAt)}.
          </p>
        )}

        {recallable && (
          <div className="mt-5 border-t pt-5">
            {!confirming ? (
              <Button
                className="rounded-xl"
                onClick={() => setConfirming(true)}
                type="button"
                variant="destructive"
              >
                <Undo2 />
                Recall from approval
              </Button>
            ) : (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-950 dark:bg-red-950/30">
                <p className="text-sm font-semibold text-red-950 dark:text-red-100">
                  Recall this document?
                </p>
                <p className="mt-1 text-xs leading-5 text-red-900/75 dark:text-red-100/70">
                  It returns to your drafts and its assigned approvers lose
                  access. Recall is only possible before the first approval.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => void recall()}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {busy ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Undo2 />
                    )}
                    {busy ? "Recalling…" : "Confirm recall"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {document.approvalStatus === "IN_APPROVAL" && !recallable && (
          <p className="mt-5 border-t pt-5 text-xs leading-5 text-muted-foreground">
            This document can no longer be recalled, because at least one step
            has already been approved.
          </p>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-heading text-lg font-semibold">Approval path</h2>
        <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
          Round {document.approvalRound}. Later steps become active only as
          earlier ones are decided.
        </p>
        <ApprovalPath steps={current} />
      </section>

      {history.length > 0 && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="font-heading text-lg font-semibold">
            Decision history
          </h2>
          <ol className="mt-3 space-y-3">
            {history.map((step) => (
              <li className="rounded-2xl border p-3.5 text-sm" key={step.id}>
                <p className="font-semibold">
                  {step.decision === "APPROVED" ? "Approved" : "Returned"} at
                  step {step.stepNumber} by {roleLabel(step.approverRole)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.decidedAt ? formatTimestamp(step.decidedAt) : ""} ·
                  round {step.approvalRound}
                </p>
                {step.returnReason && (
                  <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs leading-5">
                    {step.returnReason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function submissionNoticeFor(error: unknown): Notice {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      APPROVAL_MATRIX_REQUIRED:
        "This document type had no approval matrix when the draft was created, so it cannot be submitted.",
      APPROVER_UNAVAILABLE: error.message,
      DOCUMENT_NOT_SUBMITTABLE:
        "This document is no longer awaiting submission. Reload to see its current state.",
      STALE_APPROVAL_STATE:
        "This document changed in another session. Reload before submitting again.",
    }
    return {
      tone: "error",
      message: messages[error.code] ?? userMessageForApiError(error),
      reference: error.requestId,
    }
  }
  return { tone: "error", message: userMessageForApiError(error) }
}

function recallNoticeFor(error: unknown): Notice {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      DOCUMENT_ALREADY_APPROVED:
        "This document cannot be recalled, because an approver has already approved a step.",
      DOCUMENT_NOT_RECALLABLE:
        "This document is not in approval, so there is nothing to recall.",
      STALE_APPROVAL_STATE:
        "This document changed in another session. Reload before recalling again.",
    }
    return {
      tone: "error",
      message: messages[error.code] ?? userMessageForApiError(error),
      reference: error.requestId,
    }
  }
  return { tone: "error", message: userMessageForApiError(error) }
}
