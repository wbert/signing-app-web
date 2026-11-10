import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type { AuditEvent, MeResponse } from "@/lib/api/types"

const { apiRequestMock, routerMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  routerMock: { refresh: vi.fn(), replace: vi.fn() },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => routerMock,
}))

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>()
  return { ...actual, apiRequest: apiRequestMock }
})

import { AuditEventDetail } from "@/components/audit/audit-event-detail"
import { ApiError } from "@/lib/api/client"

const session: MeResponse = {
  user: {
    id: "admin-1",
    fullName: "Admin User",
    emailAddress: "admin@example.test",
    username: "admin",
    roles: ["ADMINISTRATOR"],
  },
  capabilities: ["audit:read"],
}

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "event-1",
    category: "SIGNING",
    eventType: "signing.request_voided",
    actor: { partyId: "sender-1", label: "Sender User" },
    occurredAt: "2026-09-22T09:00:00.000Z",
    targetType: "signing_request",
    targetId: "request-1",
    data: { reason: "Wrong contract attached" },
    requestId: "request-id-1",
    ...overrides,
  }
}

function apiError(status: number, code: string): ApiError {
  return new ApiError({
    status,
    code,
    message: "server copy",
    requestId: "request-id-1",
  })
}

afterEach(() => {
  cleanup()
  apiRequestMock.mockReset()
  routerMock.refresh.mockReset()
  routerMock.replace.mockReset()
})

describe("AuditEventDetail", () => {
  it("reads the single-event route so its access policy is exercised", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/audit-events/event-1") {
        return Promise.resolve({ event: event() })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<AuditEventDetail eventId="event-1" />)

    await screen.findByRole("heading", { name: "Request voided" })
    expect(apiRequestMock).toHaveBeenCalledWith("/audit-events/event-1")
    // The list route must not be used as a stand-in for the event itself.
    expect(
      apiRequestMock.mock.calls.some((call) =>
        String(call[0]).startsWith("/audit-events?")
      )
    ).toBe(false)
  })

  it("shows actor, time, target, and support reference", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/audit-events/event-1") {
        return Promise.resolve({ event: event() })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<AuditEventDetail eventId="event-1" />)

    await screen.findByRole("heading", { name: "Request voided" })
    expect(screen.getByText("signing.request_voided")).toBeDefined()
    expect(screen.getByText("Sender User")).toBeDefined()
    expect(screen.getByText("request-1")).toBeDefined()
    expect(screen.getByText("request-id-1")).toBeDefined()
    expect(screen.getByText("Wrong contract attached")).toBeDefined()
  })

  it("names an unattributed actor rather than leaving it blank", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/audit-events/event-1") {
        return Promise.resolve({
          event: event({ actor: { partyId: null, label: "System" } }),
        })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<AuditEventDetail eventId="event-1" />)

    expect(
      await screen.findByText("Not attributed to an account")
    ).toBeDefined()
  })

  it("offers no mutation path", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/audit-events/event-1") {
        return Promise.resolve({ event: event() })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<AuditEventDetail eventId="event-1" />)

    await screen.findByRole("heading", { name: "Request voided" })
    expect(screen.getByText(/cannot be amended or deleted/iu)).toBeDefined()
    for (const pattern of [/delete/iu, /edit/iu, /remove/iu, /amend/iu]) {
      expect(screen.queryByRole("button", { name: pattern })).toBeNull()
    }
    for (const call of apiRequestMock.mock.calls) {
      expect(call[1]?.method ?? "GET").toBe("GET")
    }
  })

  it("treats a missing event as a dead end, not a retryable failure", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/audit-events/missing") {
        return Promise.reject(apiError(404, "AUDIT_EVENT_NOT_FOUND"))
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<AuditEventDetail eventId="missing" />)

    await screen.findByRole("heading", { name: "Event not found" })
    expect(screen.queryByRole("button", { name: /Try again/u })).toBeNull()
    expect(
      screen
        .getByRole("link", { name: /Back to the audit trail/u })
        .getAttribute("href")
    ).toBe("/audit")
  })

  it("sends a user without audit access back to the dashboard", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/audit-events/event-1") {
        return Promise.reject(apiError(403, "FORBIDDEN"))
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<AuditEventDetail eventId="event-1" />)

    await vi.waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/dashboard")
    )
  })
})
