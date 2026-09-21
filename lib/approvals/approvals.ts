import type {
  ApprovalDocument,
  ApprovalStep,
  ApprovalStepStatus,
  DocumentApprovalStatus,
  ReturnTarget,
  Role,
} from "@/lib/api/types"

export const stepStatusLabels: Record<ApprovalStepStatus, string> = {
  WAITING: "Waiting",
  PENDING: "Awaiting decision",
  BLOCKED: "Blocked",
  APPROVED: "Approved",
  RETURNED: "Returned",
  VOIDED: "Superseded",
  RECALLED: "Recalled",
}

export const documentStatusLabels: Record<DocumentApprovalStatus, string> = {
  DRAFT: "Draft",
  IN_APPROVAL: "In approval",
  RETURNED: "Returned for changes",
  APPROVED: "Approved",
  VOIDED: "Voided",
}

export const documentStatusDescriptions: Record<
  DocumentApprovalStatus,
  string
> = {
  DRAFT: "Not yet submitted. Only you can see it.",
  IN_APPROVAL: "Waiting on the approvers in the path below.",
  RETURNED: "An approver asked for changes. Correct it and submit again.",
  APPROVED: "Every mandatory step approved. Signing can proceed.",
  VOIDED: "No longer active. Outstanding links are unusable.",
}

/**
 * The API reports submission blockers only inside the `DOCUMENT_INCOMPLETE`
 * message, as `Missing: SIGNATORY_REQUIRED, ATTACHMENT_REQUIRED:VALID_ID`.
 */
export function parseIncompleteBlockers(message: string): string[] {
  const marker = message.indexOf("Missing:")
  if (marker < 0) return []
  return message
    .slice(marker + "Missing:".length)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function describeBlocker(code: string): string {
  if (code === "SIGNATORY_REQUIRED") {
    return "Add at least one signatory."
  }
  if (code === "SIGNING_FIELD_REQUIRED") {
    return "Place at least one signing field."
  }
  if (code.startsWith("ATTACHMENT_REQUIRED:")) {
    const key = code.slice("ATTACHMENT_REQUIRED:".length)
    return `Attach the required ${key} document.`
  }
  return code
}

/** One numbered step, with every approver definition that shares its number. */
export type ApprovalStepGroup = {
  stepNumber: number
  isParallel: boolean
  steps: ApprovalStep[]
}

export function groupStepsByNumber(
  steps: readonly ApprovalStep[]
): ApprovalStepGroup[] {
  const groups = new Map<number, ApprovalStep[]>()
  for (const step of [...steps].sort(
    (left, right) =>
      left.stepNumber - right.stepNumber || left.position - right.position
  )) {
    groups.set(step.stepNumber, [...(groups.get(step.stepNumber) ?? []), step])
  }
  return [...groups.entries()].map(([stepNumber, entries]) => ({
    stepNumber,
    isParallel: entries.length > 1 || entries.some((entry) => entry.isParallel),
    steps: entries,
  }))
}

/** Steps for the round currently in progress, ignoring superseded rounds. */
export function stepsForCurrentRound(
  document: ApprovalDocument
): ApprovalStep[] {
  return document.steps.filter(
    (step) => step.approvalRound === document.approvalRound
  )
}

export function decisionHistory(document: ApprovalDocument): ApprovalStep[] {
  return document.steps
    .filter((step) => step.decidedAt !== null)
    .sort((left, right) =>
      (left.decidedAt ?? "").localeCompare(right.decidedAt ?? "")
    )
}

/**
 * A document may be recalled only while it is in approval and before any step
 * has been approved, matching `DOCUMENT_ALREADY_APPROVED` on the server.
 */
export function canRecall(document: ApprovalDocument): boolean {
  return (
    document.approvalStatus === "IN_APPROVAL" &&
    !document.steps.some((step) => step.status === "APPROVED")
  )
}

export function canSubmit(document: ApprovalDocument): boolean {
  return (
    document.approvalStatus === "DRAFT" ||
    document.approvalStatus === "RETURNED"
  )
}

/**
 * Earlier steps a returning approver may target. The API rejects a target at or
 * after the deciding step, and falls back to the originator for one it cannot
 * find.
 */
export function returnTargetOptions(
  document: ApprovalDocument,
  decidingStepNumber: number
): number[] {
  return [
    ...new Set(
      stepsForCurrentRound(document)
        .filter((step) => step.stepNumber < decidingStepNumber)
        .map((step) => step.stepNumber)
    ),
  ].sort((left, right) => left - right)
}

/**
 * The server records a target fallback only in its audit trail, so the applied
 * target is compared against what was requested to keep its explanation.
 */
export function returnFellBackToOriginator(
  requested: ReturnTarget,
  applied: Pick<ApprovalStep, "returnTarget" | "returnedToStepNumber">
): boolean {
  if (requested.type !== "STEP") return false
  return (
    applied.returnTarget === "ORIGINATOR" ||
    applied.returnedToStepNumber !== requested.stepNumber
  )
}

export function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase()
}

/** Age of an assignment, used to order and to flag the oldest work. */
export function assignmentAge(
  assignedAt: string | null,
  now: number = Date.now()
): { hours: number; label: string } | null {
  if (!assignedAt) return null
  const assigned = new Date(assignedAt).getTime()
  if (Number.isNaN(assigned)) return null
  const hours = Math.max(0, (now - assigned) / 3_600_000)
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return {
      hours,
      label: `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`,
    }
  }
  if (hours < 48) {
    const whole = Math.round(hours)
    return { hours, label: `${whole} ${whole === 1 ? "hour" : "hours"} ago` }
  }
  const days = Math.round(hours / 24)
  return { hours, label: `${days} ${days === 1 ? "day" : "days"} ago` }
}

export function isOverdue(
  step: ApprovalStep,
  now: number = Date.now()
): boolean {
  const age = assignmentAge(step.assignedAt, now)
  return age !== null && age.hours > step.reminderIntervalHours
}
