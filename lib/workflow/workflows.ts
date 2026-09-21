import type {
  DeliveryStatus,
  SigningAssignmentStatus,
  SigningMode,
  Workflow,
  WorkflowAssignmentProgress,
  WorkflowDisplayStatus,
} from "@/lib/api/types"

/** Every status the API can display, each with its own meaning for a sender. */
export const workflowStatusLabels: Record<WorkflowDisplayStatus, string> = {
  DRAFT: "Draft",
  IN_APPROVAL: "In approval",
  RETURNED: "Returned for changes",
  APPROVED: "Approved",
  SENT: "Sent for signature",
  VIEWED: "Opened by a signatory",
  SIGNED: "Signed and archived",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  VOIDED: "Voided",
}

export const workflowStatusDescriptions: Record<WorkflowDisplayStatus, string> =
  {
    DRAFT: "Not submitted yet. No approver or signatory can see it.",
    IN_APPROVAL: "Waiting on the approvers in the path below.",
    RETURNED:
      "An approver asked for changes. Correct the draft and submit it again.",
    APPROVED: "Approved. Signing invitations are issued automatically.",
    SENT: "Invitations have been issued. No signatory has opened the document yet.",
    VIEWED:
      "At least one signatory has opened the document but not yet signed.",
    SIGNED:
      "Every signatory signed. The executed document and certificate are archived.",
    DECLINED:
      "A signatory declined. No further signatures can be collected on this request.",
    EXPIRED: "The signing window closed before every signatory signed.",
    VOIDED:
      "Withdrawn by you. Every outstanding signing link was made unusable.",
  }

/** Statuses that mean the request is finished; no action remains. */
const terminalStatuses: ReadonlySet<WorkflowDisplayStatus> = new Set([
  "SIGNED",
  "DECLINED",
  "EXPIRED",
  "VOIDED",
])

export function isTerminal(workflow: Workflow): boolean {
  return terminalStatuses.has(workflow.status)
}

/**
 * Void is permitted only while the request is live. This mirrors the API's own
 * `SIGNING_NOT_VOIDABLE` guard; the server stays authoritative.
 */
export function canVoid(workflow: Workflow): boolean {
  return (
    workflow.requestId !== null &&
    (workflow.requestStatus === "SENT" ||
      workflow.requestStatus === "IN_PROGRESS")
  )
}

/** Only a workflow with an issued request has a detail page to open. */
export function hasDetail(workflow: Workflow): boolean {
  return workflow.requestId !== null
}

export const assignmentStatusLabels: Record<SigningAssignmentStatus, string> = {
  WAITING: "Waiting",
  ACTIVE: "Invited",
  SIGNED: "Signed",
  DECLINED: "Declined",
  VOIDED: "Void",
  LOCKED: "Locked",
  EXPIRED: "Expired",
}

/**
 * What a signatory's state means, which depends on the signing mode. Under
 * `SEQUENTIAL` a waiting signatory has no link at all yet — saying they are
 * merely "waiting" would imply one was sent and they ignored it.
 */
export function describeAssignment(
  assignment: WorkflowAssignmentProgress,
  signingMode: SigningMode | null
): string {
  switch (assignment.status) {
    case "WAITING":
      return signingMode === "SEQUENTIAL"
        ? "No invitation has been sent yet. This signatory is invited once the signatory before them signs."
        : "Queued for invitation."
    case "ACTIVE":
      return assignment.viewedAt
        ? "Invited, and has opened the document."
        : "Invited. The document has not been opened yet."
    case "SIGNED":
      return "Signed."
    case "DECLINED":
      return "Declined to sign."
    case "LOCKED":
      return "Access was locked after too many incorrect passcode attempts. A new invitation is required."
    case "EXPIRED":
      return "Their signing link expired before they signed."
    case "VOIDED":
      return "Their link was made unusable when the request was voided."
  }
}

export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  PENDING: "Queued",
  SENT: "Delivered to the mail server",
  FAILED: "Delivery failed",
  BOUNCED: "Bounced",
  DEAD_LETTER: "Delivery abandoned",
}

export function deliveryFailed(status: DeliveryStatus | null): boolean {
  return status === "FAILED" || status === "BOUNCED" || status === "DEAD_LETTER"
}

const deliveryFailureMessages: Record<string, string> = {
  EMAIL_PROVIDER_UNAVAILABLE:
    "No mail provider was configured when this was sent, so nothing left the server.",
  EMAIL_DELIVERY_FAILED: "The mail server refused the message.",
  DELIVERY_ATTEMPTS_EXHAUSTED:
    "Every automatic retry was used without the message being accepted.",
}

/** A run of token-like characters, long enough not to be an ordinary word. */
const TOKEN_LIKE = /[A-Za-z0-9_-]{24,}/gu
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/giu

/**
 * Delivery failures are shown so a sender can act on them, but the stored value
 * can be free text an operator typed when recording a bounce. Anything that
 * looks like a URL or a credential is removed before display: a signing link
 * pasted into a bounce note must never be handed back to the browser.
 */
export function sanitizeDeliveryFailure(value: string): string {
  return value
    .replace(URL_LIKE, "[link removed]")
    .replace(TOKEN_LIKE, "[removed]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300)
}

export function describeDeliveryFailure(value: string | null): string | null {
  if (value === null) return null
  const known = deliveryFailureMessages[value]
  if (known) return known
  const safe = sanitizeDeliveryFailure(value)
  return safe.length === 0 ? "The reason given was not readable." : safe
}

/** Ordered as the signatories were invited, so a sequence reads top to bottom. */
export function orderedAssignments(
  workflow: Workflow
): WorkflowAssignmentProgress[] {
  return [...workflow.assignments].sort(
    (left, right) => left.signingOrder - right.signingOrder
  )
}

export function signedCount(workflow: Workflow): number {
  return workflow.assignments.filter((entry) => entry.status === "SIGNED")
    .length
}

/**
 * The reason a terminal workflow ended, and when. Read from the specific
 * timestamp the API sets rather than inferred from the status alone.
 */
export function describeOutcome(
  workflow: Workflow
): { at: string; label: string } | null {
  if (workflow.completedAt) {
    return { at: workflow.completedAt, label: "Completed" }
  }
  if (workflow.declinedAt) {
    return { at: workflow.declinedAt, label: "Declined" }
  }
  if (workflow.expiredAt) return { at: workflow.expiredAt, label: "Expired" }
  if (workflow.voidedAt) return { at: workflow.voidedAt, label: "Voided" }
  return null
}

export const MAX_VOID_REASON_CHARACTERS = 1_000

export function validateVoidReason(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return "Give the reason this signing request is being withdrawn."
  }
  if (trimmed.length > MAX_VOID_REASON_CHARACTERS) {
    return `A reason may be at most ${MAX_VOID_REASON_CHARACTERS} characters.`
  }
  return null
}

const workflowErrorMessages: Record<string, string> = {
  SIGNING_VERSION_CONFLICT:
    "This workflow changed in another session. It has been reloaded — check it and try again.",
  SIGNING_NOT_VOIDABLE:
    "This signing request can no longer be voided. It has already finished or been withdrawn.",
  DELIVERY_NOT_REISSUABLE:
    "There is no failed invitation to reissue. A new link can only replace one that failed to be delivered.",
  SIGNING_REQUEST_NOT_FOUND:
    "This signing request no longer exists, or it is not yours to view.",
}

export function workflowMessageForCode(code: string): string | null {
  return workflowErrorMessages[code] ?? null
}
