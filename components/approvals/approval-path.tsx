"use client"

import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleSlash,
  GitBranch,
  Undo2,
} from "lucide-react"

import type { ApprovalStep, ApprovalStepStatus } from "@/lib/api/types"
import {
  groupStepsByNumber,
  roleLabel,
  stepStatusLabels,
} from "@/lib/approvals/approvals"
import { formatTimestamp } from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

const statusStyles: Record<ApprovalStepStatus, string> = {
  WAITING: "border-border bg-muted/40 text-muted-foreground",
  PENDING:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300",
  BLOCKED: "border-border bg-muted/40 text-muted-foreground",
  APPROVED:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300",
  RETURNED:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-950 dark:bg-red-950/40 dark:text-red-300",
  VOIDED: "border-border bg-muted/40 text-muted-foreground line-through",
  RECALLED: "border-border bg-muted/40 text-muted-foreground",
}

function StatusIcon({ status }: { status: ApprovalStepStatus }) {
  if (status === "APPROVED") return <CircleCheck className="size-3" />
  if (status === "RETURNED") return <Undo2 className="size-3" />
  if (status === "PENDING") return <CircleDot className="size-3" />
  if (status === "VOIDED" || status === "RECALLED")
    return <CircleSlash className="size-3" />
  return <CircleAlert className="size-3" />
}

/**
 * Renders the instantiated approval path. Steps sharing a number run in
 * parallel; a sequential step is shown on its own so later approvers are never
 * implied to be active.
 */
export function ApprovalPath({
  highlightStepId,
  steps,
}: {
  highlightStepId?: string
  steps: readonly ApprovalStep[]
}) {
  const groups = groupStepsByNumber(steps)

  if (groups.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No approval steps have been instantiated for this round.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {groups.map((group) => (
        <li
          className="rounded-none border bg-card p-3.5"
          key={`${group.stepNumber}-${group.steps[0]?.id}`}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-none bg-muted text-xs font-bold">
              {group.stepNumber}
            </span>
            <p className="text-sm font-semibold">Step {group.stepNumber}</p>
            {group.isParallel && (
              <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-muted-foreground">
                <GitBranch className="size-3" />
                Parallel
              </span>
            )}
          </div>

          <ul className="mt-2.5 space-y-2">
            {group.steps.map((step) => (
              <li
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-none border px-3 py-2",
                  step.id === highlightStepId && "ring-2 ring-ring"
                )}
                key={step.id}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {roleLabel(step.approverRole)}
                    {!step.isMandatory && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (optional)
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {step.decidedAt
                      ? `Decided ${formatTimestamp(step.decidedAt)}`
                      : step.assignedAt
                        ? `Assigned ${formatTimestamp(step.assignedAt)}`
                        : "Not yet assigned"}
                  </p>
                  {step.returnReason && (
                    <p className="mt-1.5 rounded-none bg-muted/50 px-2.5 py-1.5 text-xs leading-5">
                      <span className="font-semibold">Reason:</span>{" "}
                      {step.returnReason}
                      {step.returnTarget === "STEP" &&
                        step.returnedToStepNumber !== null && (
                          <> Returned to step {step.returnedToStepNumber}.</>
                        )}
                      {step.returnTarget === "ORIGINATOR" && (
                        <> Returned to the sender.</>
                      )}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-none border px-2.5 py-1 text-[0.62rem] font-bold tracking-wide uppercase",
                    statusStyles[step.status]
                  )}
                >
                  <StatusIcon status={step.status} />
                  {stepStatusLabels[step.status]}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
