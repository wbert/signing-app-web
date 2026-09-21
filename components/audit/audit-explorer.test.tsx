import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { AuditEvent, MeResponse } from "@/lib/api/types"

const { apiRequestMock, routerMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  routerMock: { refresh: vi.fn(), replace: vi.fn() },
}))

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }))

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>()
  return { ...actual, apiRequest: apiRequestMock }
})

import { AuditExplorer } from "@/components/audit/audit-explorer"

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

function respond(events: AuditEvent[] = [event()]) {
  apiRequestMock.mockImplementation((path: string) => {
    if (path === "/api/me") return Promise.resolve(session)
    if (path.startsWith("/audit-events?")) {
      return Promise.resolve({
        events,
        pagination: { total: events.length, limit: 25, offset: 0 },
      })
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`))
  })
}

afterEach(() => {
  cleanup()
  apiRequestMock.mockReset()
  routerMock.refresh.mockReset()
  routerMock.replace.mockReset()
  window.history.replaceState(null, "", "/audit")
})

describe("AuditExplorer", () => {
  it("offers no way to change the record", async () => {
    respond()

    render(<AuditExplorer />)

    await screen.findByText("Request voided")
    expect(screen.getByText(/read-only/iu)).toBeDefined()
    for (const pattern of [/delete/iu, /edit/iu, /remove/iu, /amend/iu]) {
      expect(screen.queryByRole("button", { name: pattern })).toBeNull()
    }
    // Every request this page makes is a read.
    for (const call of apiRequestMock.mock.calls) {
      expect(call[1]?.method ?? "GET").toBe("GET")
    }
  })

  it("shows the actor, time, and support reference for an event", async () => {
    respond()

    render(<AuditExplorer />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Request voided/u })
    )

    expect(screen.getByText("signing.request_voided")).toBeDefined()
    expect(screen.getByText("signing_request · request-1")).toBeDefined()
    expect(screen.getByText("request-id-1")).toBeDefined()
    expect(screen.getByText("Wrong contract attached")).toBeDefined()
  })

  it("links each event to its own citable page", async () => {
    respond()

    render(<AuditExplorer />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Request voided/u })
    )

    expect(
      screen
        .getByRole("link", { name: /Open this event on its own page/u })
        .getAttribute("href")
    ).toBe("/audit/event-1")
  })

  it("renders only the fields the API returned", async () => {
    respond([event({ data: {} })])

    render(<AuditExplorer />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Request voided/u })
    )

    expect(screen.queryByText("Recorded detail")).toBeNull()
    expect(document.body.textContent).not.toMatch(/ip address|user agent/iu)
  })

  it("keeps filter criteria in the URL so a search can be shared", async () => {
    respond()

    render(<AuditExplorer />)

    fireEvent.change(await screen.findByLabelText("Event type"), {
      target: { value: "signing.request_voided" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    await screen.findByText("Request voided")
    expect(window.location.search).toContain("eventType=signing.request_voided")
  })

  it("reads filters back out of the URL on load", async () => {
    window.history.replaceState(null, "", "/audit?category=SECURITY")
    respond([event({ category: "SECURITY", eventType: "security.sign_in" })])

    render(<AuditExplorer />)

    await screen.findByText("Sign in")
    const requested = apiRequestMock.mock.calls
      .map((call) => String(call[0]))
      .find((path) => path.startsWith("/audit-events?"))
    expect(requested).toContain("category=SECURITY")
  })
})
