import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"

import type {
  MeResponse,
  Workflow,
  WorkflowAssignmentProgress,
} from "@/lib/api/types"

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

import { WorkflowDetail } from "@/components/workflow/workflow-detail"
import { ApiError } from "@/lib/api/client"

const session: MeResponse = {
  user: {
    id: "sender-1",
    fullName: "Sender User",
    emailAddress: "sender@example.test",
    username: "sender",
    roles: ["SENDER"],
  },
  capabilities: ["documents:read", "documents:update"],
}

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

function apiError(status: number, code: string): ApiError {
  return new ApiError({
    status,
    code,
    message: "server copy",
    requestId: "request-id-1",
  })
}

function respondWith(current: () => Workflow) {
  apiRequestMock.mockImplementation((path: string) => {
    if (path === "/api/me") return Promise.resolve(session)
    if (path === "/api/workflows/request-1") {
      return Promise.resolve({ workflow: current() })
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`))
  })
}

afterEach(() => {
  cleanup()
  apiRequestMock.mockReset()
  routerMock.refresh.mockReset()
  routerMock.replace.mockReset()
})

describe("WorkflowDetail", () => {
  it("does not imply a waiting sequential signatory was invited", async () => {
    respondWith(() =>
      workflow({
        signingMode: "SEQUENTIAL",
        assignments: [
          assignment({
            status: "SIGNED",
            signedAt: "2026-09-21T16:00:00.000Z",
          }),
          assignment({
            id: "assignment-2",
            signatoryName: "Sam Worker",
            signatoryEmail: "sam@example.test",
            signingOrder: 2,
            status: "WAITING",
            deliveryStatus: null,
          }),
        ],
      })
    )

    render(<WorkflowDetail requestId="request-1" />)

    expect(
      await screen.findByText(/No invitation has been sent yet/u)
    ).toBeDefined()
    expect(screen.getByText(/1 of 2 signed/u)).toBeDefined()
  })

  it("warns that outstanding links stop working before voiding", async () => {
    respondWith(() => workflow())

    render(<WorkflowDetail requestId="request-1" />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Withdraw request/u })
    )

    const warning = screen.getByRole("alert")
    expect(warning.textContent).toMatch(/unusable immediately/u)
    expect(warning.textContent).toMatch(/cannot be undone/u)
  })

  it("voids with the current version and reports the outcome", async () => {
    let current = workflow()
    apiRequestMock.mockImplementation(
      (path: string, options?: { body?: Record<string, unknown> }) => {
        if (path === "/api/me") return Promise.resolve(session)
        if (path === "/api/workflows/request-1") {
          return Promise.resolve({ workflow: current })
        }
        if (path === "/api/workflows/request-1/void") {
          expect(options?.body).toEqual({
            reason: "Wrong contract attached",
            expectedVersion: 2,
          })
          current = workflow({
            status: "VOIDED",
            requestStatus: "VOIDED",
            version: 3,
            voidedAt: "2026-09-22T09:00:00.000Z",
            cancelReason: "Wrong contract attached",
          })
          return Promise.resolve({ workflow: current })
        }
        return Promise.reject(new Error(`Unexpected request: ${path}`))
      }
    )

    render(<WorkflowDetail requestId="request-1" />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Withdraw request/u })
    )
    fireEvent.change(screen.getByLabelText("Reason for withdrawing"), {
      target: { value: "Wrong contract attached" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Void this request/u }))

    expect(
      await screen.findByText(/Every outstanding link is now unusable/u)
    ).toBeDefined()
    expect(screen.getByText(/already finished/u)).toBeDefined()
  })

  it("reloads instead of resubmitting a stale version on a conflict", async () => {
    let current = workflow()
    let voidAttempts = 0
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/api/workflows/request-1") {
        return Promise.resolve({ workflow: current })
      }
      if (path === "/api/workflows/request-1/void") {
        voidAttempts += 1
        current = workflow({ version: 5 })
        return Promise.reject(apiError(409, "SIGNING_VERSION_CONFLICT"))
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<WorkflowDetail requestId="request-1" />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Withdraw request/u })
    )
    fireEvent.change(screen.getByLabelText("Reason for withdrawing"), {
      target: { value: "Wrong contract attached" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Void this request/u }))

    expect(await screen.findByText(/changed in another session/u)).toBeDefined()
    expect(voidAttempts).toBe(1)
  })

  it("offers a reissue only where the API allows one", async () => {
    respondWith(() =>
      workflow({
        assignments: [
          assignment({
            deliveryStatus: "BOUNCED",
            deliveryFailure: "Mailbox full",
            correctiveAction: "REISSUE",
          }),
          assignment({
            id: "assignment-2",
            signatoryName: "Sam Worker",
            signingOrder: 2,
            deliveryStatus: "SENT",
          }),
        ],
      })
    )

    render(<WorkflowDetail requestId="request-1" />)

    const buttons = await screen.findAllByRole("button", {
      name: /Send a new invitation/u,
    })
    expect(buttons).toHaveLength(1)
    expect(screen.getByText("Mailbox full")).toBeDefined()
  })

  it("never renders a signing link pasted into a bounce note", async () => {
    respondWith(() =>
      workflow({
        assignments: [
          assignment({
            deliveryStatus: "BOUNCED",
            deliveryFailure:
              "Undeliverable: http://localhost:3000/sign#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            correctiveAction: "REISSUE",
          }),
        ],
      })
    )

    render(<WorkflowDetail requestId="request-1" />)

    await screen.findByRole("button", { name: /Send a new invitation/u })
    expect(document.body.textContent).not.toContain("token=")
    expect(document.body.textContent).not.toContain("/sign#")
    expect(document.body.textContent).toContain("[link removed]")
  })

  it("explains a refused reissue without offering a retry loop", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/api/workflows/request-1") {
        return Promise.resolve({
          workflow: workflow({
            assignments: [
              assignment({
                deliveryStatus: "FAILED",
                correctiveAction: "REISSUE",
              }),
            ],
          }),
        })
      }
      if (path === "/api/workflow-assignments/assignment-1/reissue") {
        return Promise.reject(apiError(409, "DELIVERY_NOT_REISSUABLE"))
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<WorkflowDetail requestId="request-1" />)

    fireEvent.click(
      await screen.findByRole("button", { name: /Send a new invitation/u })
    )

    await waitFor(() =>
      expect(screen.getByText(/no failed invitation to reissue/u)).toBeDefined()
    )
  })

  it("hides the withdraw action once the request has finished", async () => {
    respondWith(() =>
      workflow({
        status: "SIGNED",
        requestStatus: "COMPLETED",
        completedAt: "2026-09-22T10:00:00.000Z",
        assignments: [assignment({ status: "SIGNED" })],
      })
    )

    render(<WorkflowDetail requestId="request-1" />)

    expect(await screen.findByText(/already finished/u)).toBeDefined()
    expect(
      screen.queryByRole("button", { name: /Withdraw request/u })
    ).toBeNull()
  })
})
