import { describe, expect, it } from "vitest"

import {
  type SigningAssignmentStatus,
  type Workflow,
  type WorkflowAssignmentProgress,
  workflowDisplayStatuses,
} from "@/lib/api/types"
import {
  canVoid,
  describeAssignment,
  describeDeliveryFailure,
  describeOutcome,
  deliveryFailed,
  hasDetail,
  isTerminal,
  orderedAssignments,
  sanitizeDeliveryFailure,
  signedCount,
  validateVoidReason,
  workflowStatusDescriptions,
  workflowStatusLabels,
} from "@/lib/workflow/workflows"

function assignment(
  overrides: Partial<WorkflowAssignmentProgress> = {}
): WorkflowAssignmentProgress {
  return {
    id: "assignment-1",
    signatoryName: "Alex Candidate",
    signatoryEmail: "alex@example.test",
    signingOrder: 1,
    status: "ACTIVE",
    viewedAt: null,
    signedAt: null,
    declinedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    deliveryStatus: "SENT",
    deliveryFailure: null,
    correctiveAction: null,
    ...overrides,
  }
}

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    requestId: "request-1",
    sourceDocumentId: "document-1",
    title: "Employment contract",
    signingMode: "SEQUENTIAL",
    status: "SENT",
    approvalStatus: "APPROVED",
    requestStatus: "SENT",
    version: 2,
    sentAt: "2026-09-21T15:46:24.000Z",
    expiresAt: "2026-09-28T15:46:24.000Z",
    cancelReason: null,
    completedAt: null,
    declinedAt: null,
    expiredAt: null,
    voidedAt: null,
    assignments: [assignment()],
    approvalSteps: [],
    ...overrides,
  }
}

describe("workflow status copy", () => {
  it("gives all ten statuses distinct labels and descriptions", () => {
    const labels = workflowDisplayStatuses.map(
      (status) => workflowStatusLabels[status]
    )
    const descriptions = workflowDisplayStatuses.map(
      (status) => workflowStatusDescriptions[status]
    )

    expect(labels).toHaveLength(10)
    expect(new Set(labels).size).toBe(10)
    expect(new Set(descriptions).size).toBe(10)
    expect(descriptions.every((entry) => entry.length > 0)).toBe(true)
  })

  it("warns that voiding makes outstanding links unusable", () => {
    expect(workflowStatusDescriptions.VOIDED).toMatch(/unusable/u)
  })
})

describe("canVoid", () => {
  it("allows a void only while the request is live", () => {
    expect(canVoid(workflow({ requestStatus: "SENT" }))).toBe(true)
    expect(canVoid(workflow({ requestStatus: "IN_PROGRESS" }))).toBe(true)
  })

  it("refuses a void the API would reject", () => {
    for (const requestStatus of [
      "COMPLETED",
      "DECLINED",
      "EXPIRED",
      "VOIDED",
    ] as const) {
      expect(canVoid(workflow({ requestStatus }))).toBe(false)
    }
    expect(canVoid(workflow({ requestId: null, requestStatus: null }))).toBe(
      false
    )
  })
})

describe("hasDetail", () => {
  it("is false until approval issues a signing request", () => {
    expect(hasDetail(workflow({ requestId: null }))).toBe(false)
    expect(hasDetail(workflow())).toBe(true)
  })
})

describe("isTerminal", () => {
  it("treats only finished statuses as terminal", () => {
    expect(isTerminal(workflow({ status: "SIGNED" }))).toBe(true)
    expect(isTerminal(workflow({ status: "VOIDED" }))).toBe(true)
    expect(isTerminal(workflow({ status: "VIEWED" }))).toBe(false)
  })
})

describe("describeAssignment", () => {
  it("never implies a sequential signatory was already invited", () => {
    const waiting = describeAssignment(
      assignment({ status: "WAITING" }),
      "SEQUENTIAL"
    )
    expect(waiting).toMatch(/No invitation has been sent yet/u)
    expect(waiting).not.toMatch(/reminder|ignored/iu)
  })

  it("separates an invitation opened from one only delivered", () => {
    expect(describeAssignment(assignment(), "ALL_AT_ONCE")).toMatch(
      /has not been opened/u
    )
    expect(
      describeAssignment(
        assignment({ viewedAt: "2026-09-21T16:00:00.000Z" }),
        "ALL_AT_ONCE"
      )
    ).toMatch(/has opened/u)
  })

  it("explains a lockout without naming the passcode", () => {
    const locked = describeAssignment(assignment({ status: "LOCKED" }), null)
    expect(locked).toMatch(/new invitation is required/u)
  })

  it("covers every assignment status", () => {
    const statuses: SigningAssignmentStatus[] = [
      "WAITING",
      "ACTIVE",
      "SIGNED",
      "DECLINED",
      "VOIDED",
      "LOCKED",
      "EXPIRED",
    ]
    for (const status of statuses) {
      expect(
        describeAssignment(assignment({ status }), null).length
      ).toBeGreaterThan(0)
    }
  })
})

describe("delivery failures", () => {
  it("recognises only the states the API treats as failures", () => {
    expect(deliveryFailed("FAILED")).toBe(true)
    expect(deliveryFailed("BOUNCED")).toBe(true)
    expect(deliveryFailed("DEAD_LETTER")).toBe(true)
    expect(deliveryFailed("SENT")).toBe(false)
    expect(deliveryFailed("PENDING")).toBe(false)
    expect(deliveryFailed(null)).toBe(false)
  })

  it("translates known delivery codes", () => {
    expect(describeDeliveryFailure("EMAIL_PROVIDER_UNAVAILABLE")).toMatch(
      /No mail provider was configured/u
    )
  })

  it("strips a signing link pasted into an operator's bounce note", () => {
    const note =
      "Rejected. Original link http://localhost:3000/sign#token=abc was undeliverable"
    const safe = sanitizeDeliveryFailure(note)
    expect(safe).not.toContain("token=")
    expect(safe).not.toContain("http")
    expect(safe).toContain("[link removed]")
  })

  it("removes a bare token-like run", () => {
    const safe = sanitizeDeliveryFailure(
      `mailbox full ${"a".repeat(48)} retry later`
    )
    expect(safe).not.toContain("a".repeat(24))
    expect(safe).toContain("mailbox full")
  })

  it("keeps an ordinary reason readable", () => {
    expect(describeDeliveryFailure("Mailbox full")).toBe("Mailbox full")
  })

  it("does not return an empty message for unreadable text", () => {
    expect(describeDeliveryFailure("   ")).toMatch(/not readable/u)
  })

  it("returns nothing when there was no failure", () => {
    expect(describeDeliveryFailure(null)).toBeNull()
  })
})

describe("orderedAssignments", () => {
  it("reads in signing order regardless of API ordering", () => {
    const unordered = workflow({
      assignments: [
        assignment({ id: "b", signingOrder: 2 }),
        assignment({ id: "a", signingOrder: 1 }),
      ],
    })
    expect(orderedAssignments(unordered).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("signedCount", () => {
  it("counts only completed signatures", () => {
    expect(
      signedCount(
        workflow({
          assignments: [
            assignment({ status: "SIGNED" }),
            assignment({ id: "b", status: "ACTIVE" }),
          ],
        })
      )
    ).toBe(1)
  })
})

describe("describeOutcome", () => {
  it("uses the timestamp the API set rather than the status", () => {
    expect(
      describeOutcome(
        workflow({ status: "VOIDED", voidedAt: "2026-09-22T09:00:00.000Z" })
      )
    ).toEqual({ at: "2026-09-22T09:00:00.000Z", label: "Voided" })
  })

  it("is absent while a workflow is still running", () => {
    expect(describeOutcome(workflow())).toBeNull()
  })
})

describe("validateVoidReason", () => {
  it("requires a reason within the API's limit", () => {
    expect(validateVoidReason("  ")).toMatch(/reason/u)
    expect(validateVoidReason("Wrong contract attached")).toBeNull()
    expect(validateVoidReason("a".repeat(1001))).toMatch(/at most/u)
  })
})
