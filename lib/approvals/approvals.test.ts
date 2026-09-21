import { describe, expect, it } from "vitest"

import type { ApprovalDocument, ApprovalStep } from "@/lib/api/types"
import {
  assignmentAge,
  canRecall,
  canSubmit,
  decisionHistory,
  describeBlocker,
  groupStepsByNumber,
  isOverdue,
  parseIncompleteBlockers,
  returnFellBackToOriginator,
  returnTargetOptions,
  roleLabel,
  stepsForCurrentRound,
} from "@/lib/approvals/approvals"

function step(overrides: Partial<ApprovalStep> = {}): ApprovalStep {
  return {
    id: "step-1",
    sourceDocumentId: "document-1",
    documentTitle: "Contract",
    documentWorkflowVersion: 3,
    approvalRound: 2,
    position: 1,
    stepNumber: 1,
    approverRole: "APPROVER",
    isParallel: false,
    isMandatory: true,
    status: "PENDING",
    decision: null,
    assignedUserId: "user-1",
    assignmentVersion: 1,
    assignedAt: "2026-09-18T00:00:00.000Z",
    viewedAt: null,
    decidedAt: null,
    reminderIntervalHours: 72,
    reminderMaxCount: 3,
    reminderCount: 0,
    lastReminderAt: null,
    returnReason: null,
    returnTarget: null,
    returnedToStepNumber: null,
    ...overrides,
  }
}

function document(overrides: Partial<ApprovalDocument> = {}): ApprovalDocument {
  return {
    id: "document-1",
    title: "Contract",
    approvalStatus: "IN_APPROVAL",
    approvalRound: 2,
    workflowVersion: 3,
    matrixVersionId: "matrix-1",
    returnTargetStepNumber: null,
    approvedAt: null,
    steps: [],
    ...overrides,
  }
}

describe("approval submission errors", () => {
  it("extracts the backend's comma-separated incomplete blockers", () => {
    expect(
      parseIncompleteBlockers(
        "Draft cannot be submitted. Missing: SIGNATORY_REQUIRED, SIGNING_FIELD_REQUIRED, ATTACHMENT_REQUIRED:VALID_ID"
      )
    ).toEqual([
      "SIGNATORY_REQUIRED",
      "SIGNING_FIELD_REQUIRED",
      "ATTACHMENT_REQUIRED:VALID_ID",
    ])
    expect(parseIncompleteBlockers("Request validation failed")).toEqual([])
  })

  it("describes known blockers and preserves unknown codes", () => {
    expect(describeBlocker("SIGNATORY_REQUIRED")).toBe(
      "Add at least one signatory."
    )
    expect(describeBlocker("SIGNING_FIELD_REQUIRED")).toBe(
      "Place at least one signing field."
    )
    expect(describeBlocker("ATTACHMENT_REQUIRED:VALID_ID")).toBe(
      "Attach the required VALID_ID document."
    )
    expect(describeBlocker("FUTURE_BLOCKER")).toBe("FUTURE_BLOCKER")
  })
})

describe("approval path", () => {
  it("sorts definitions and groups parallel steps by step number", () => {
    const grouped = groupStepsByNumber([
      step({ id: "step-2b", stepNumber: 2, position: 2 }),
      step({ id: "step-1", stepNumber: 1, position: 1 }),
      step({ id: "step-2a", stepNumber: 2, position: 1 }),
    ])

    expect(grouped.map((group) => group.stepNumber)).toEqual([1, 2])
    expect(grouped[0]?.isParallel).toBe(false)
    expect(grouped[1]?.isParallel).toBe(true)
    expect(grouped[1]?.steps.map((entry) => entry.id)).toEqual([
      "step-2a",
      "step-2b",
    ])
  })

  it("retains an explicit parallel flag on a single definition", () => {
    expect(
      groupStepsByNumber([step({ isParallel: true })])[0]?.isParallel
    ).toBe(true)
  })

  it("selects the current round and sorts all decided history", () => {
    const old = step({
      id: "old",
      approvalRound: 1,
      status: "APPROVED",
      decision: "APPROVED",
      decidedAt: "2026-09-16T02:00:00.000Z",
    })
    const later = step({
      id: "later",
      decidedAt: "2026-09-18T03:00:00.000Z",
    })
    const earlier = step({
      id: "earlier",
      decidedAt: "2026-09-18T01:00:00.000Z",
    })
    const pending = step({ id: "pending" })
    const approval = document({ steps: [later, old, pending, earlier] })

    expect(stepsForCurrentRound(approval).map((entry) => entry.id)).toEqual([
      "later",
      "pending",
      "earlier",
    ])
    expect(decisionHistory(approval).map((entry) => entry.id)).toEqual([
      "old",
      "earlier",
      "later",
    ])
  })

  it("matches submission and recall eligibility", () => {
    expect(canSubmit(document({ approvalStatus: "DRAFT" }))).toBe(true)
    expect(canSubmit(document({ approvalStatus: "RETURNED" }))).toBe(true)
    expect(canSubmit(document())).toBe(false)

    expect(canRecall(document({ steps: [step()] }))).toBe(true)
    expect(
      canRecall(
        document({
          steps: [step({ status: "APPROVED", decision: "APPROVED" })],
        })
      )
    ).toBe(false)
    expect(canRecall(document({ approvalStatus: "DRAFT" }))).toBe(false)
  })

  it("offers unique earlier targets from the current approval round", () => {
    const approval = document({
      steps: [
        step({ id: "one-a", stepNumber: 1 }),
        step({ id: "one-b", stepNumber: 1, position: 2 }),
        step({ id: "two", stepNumber: 2 }),
        step({ id: "current", stepNumber: 3 }),
        step({ id: "old", approvalRound: 1, stepNumber: 0 }),
      ],
    })

    expect(returnTargetOptions(approval, 3)).toEqual([1, 2])
  })

  it("detects when the server applied its audit-only target fallback", () => {
    expect(
      returnFellBackToOriginator(
        { type: "STEP", stepNumber: 2 },
        { returnTarget: "ORIGINATOR", returnedToStepNumber: null }
      )
    ).toBe(true)
    expect(
      returnFellBackToOriginator(
        { type: "STEP", stepNumber: 2 },
        { returnTarget: "STEP", returnedToStepNumber: 1 }
      )
    ).toBe(true)
    expect(
      returnFellBackToOriginator(
        { type: "STEP", stepNumber: 2 },
        { returnTarget: "STEP", returnedToStepNumber: 2 }
      )
    ).toBe(false)
    expect(
      returnFellBackToOriginator(
        { type: "ORIGINATOR" },
        { returnTarget: "ORIGINATOR", returnedToStepNumber: null }
      )
    ).toBe(false)
  })

  it("formats role labels", () => {
    expect(roleLabel("APPROVER")).toBe("Approver")
    expect(roleLabel("ADMINISTRATOR")).toBe("Administrator")
  })
})

describe("approval assignment age", () => {
  const now = Date.parse("2026-09-18T04:00:00.000Z")

  it("handles missing, invalid, and future assignment timestamps", () => {
    expect(assignmentAge(null, now)).toBeNull()
    expect(assignmentAge("not-a-date", now)).toBeNull()
    expect(assignmentAge("2026-09-18T05:00:00.000Z", now)).toEqual({
      hours: 0,
      label: "0 minutes ago",
    })
  })

  it("formats minute, hour, and day ages", () => {
    expect(assignmentAge("2026-09-18T03:59:00.000Z", now)?.label).toBe(
      "1 minute ago"
    )
    expect(assignmentAge("2026-09-18T02:30:00.000Z", now)?.label).toBe(
      "2 hours ago"
    )
    expect(assignmentAge("2026-09-16T04:00:00.000Z", now)?.label).toBe(
      "2 days ago"
    )
  })

  it("marks an assignment overdue only after its reminder interval", () => {
    expect(
      isOverdue(
        step({
          assignedAt: "2026-09-15T04:00:00.000Z",
          reminderIntervalHours: 72,
        }),
        now
      )
    ).toBe(false)
    expect(
      isOverdue(
        step({
          assignedAt: "2026-09-15T03:59:59.000Z",
          reminderIntervalHours: 72,
        }),
        now
      )
    ).toBe(true)
    expect(isOverdue(step({ assignedAt: null }), now)).toBe(false)
  })
})
