import { describe, expect, it } from "vitest"

import type { AuditEvent } from "@/lib/api/types"
import {
  auditFiltersFromQuery,
  auditFiltersToQuery,
  describeDataKey,
  describeEventType,
  formatDataValue,
  orderedData,
  validateAuditFilters,
} from "@/lib/audit/audit"

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "event-1",
    category: "APPROVAL",
    eventType: "approval.step_approved",
    actor: { partyId: "user-1", label: "Sender User" },
    occurredAt: "2026-09-21T15:46:24.000Z",
    targetType: "approval_step",
    targetId: "step-1",
    data: { stepNumber: 2, approverRole: "SENDER", parallel: false },
    requestId: "request-id-1",
    ...overrides,
  }
}

describe("audit filters in the URL", () => {
  it("round-trips every supported filter", () => {
    const filters = {
      category: "SIGNING" as const,
      eventType: "signing.request_voided",
      targetType: "signing_request",
      targetId: "request-1",
      actorUserId: "user-1",
      occurredFrom: "2026-01-01T00:00:00.000Z",
      occurredTo: "2026-12-31T23:59:59.999Z",
    }
    expect(auditFiltersFromQuery(auditFiltersToQuery(filters))).toEqual(filters)
  })

  it("ignores an unknown category and unknown keys", () => {
    expect(auditFiltersFromQuery("category=NONSENSE&limit=9999")).toEqual({})
  })

  it("rejects a reversed range", () => {
    expect(
      validateAuditFilters({
        occurredFrom: "2026-06-01T00:00:00.000Z",
        occurredTo: "2026-01-01T00:00:00.000Z",
      })
    ).toMatch(/ends before it starts/u)
  })
})

describe("describeEventType", () => {
  it("reads the action without repeating the category", () => {
    expect(describeEventType("approval.step_approved")).toBe("Step approved")
    expect(describeEventType("signing.request_voided")).toBe("Request voided")
    expect(describeEventType("archive.exported")).toBe("Exported")
  })

  it("leaves an unnamespaced type readable", () => {
    expect(describeEventType("bootstrap")).toBe("Bootstrap")
  })
})

describe("data rendering", () => {
  it("labels keys in plain words", () => {
    expect(describeDataKey("stepNumber")).toBe("Step number")
    expect(describeDataKey("approver_role")).toBe("Approver role")
  })

  it("renders each primitive the API can return", () => {
    expect(formatDataValue(null)).toBe("—")
    expect(formatDataValue(true)).toBe("Yes")
    expect(formatDataValue(false)).toBe("No")
    expect(formatDataValue(7)).toBe("7")
    expect(formatDataValue(["a", "b"])).toBe("a, b")
    expect(formatDataValue([])).toBe("—")
  })

  it("orders entries so one event always reads the same", () => {
    expect(orderedData(event()).map((entry) => entry.key)).toEqual([
      "approverRole",
      "parallel",
      "stepNumber",
    ])
  })

  it("shows only what the API returned, adding nothing", () => {
    const rendered = orderedData(event({ data: { reason: "Wrong figure" } }))
    expect(rendered).toEqual([
      { key: "reason", label: "Reason", value: "Wrong figure" },
    ])
  })
})
