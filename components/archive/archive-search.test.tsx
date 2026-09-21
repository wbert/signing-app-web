import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"

import type { ArchiveRecord, MeResponse } from "@/lib/api/types"

const { apiRequestMock, routerMock, openMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  routerMock: { refresh: vi.fn(), replace: vi.fn() },
  openMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }))

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>()
  return { ...actual, apiRequest: apiRequestMock }
})

import { ArchiveSearch } from "@/components/archive/archive-search"
import { ApiError } from "@/lib/api/client"

const session: MeResponse = {
  user: {
    id: "viewer-1",
    fullName: "Viewer User",
    emailAddress: "viewer@example.test",
    username: "viewer",
    roles: ["VIEWER"],
  },
  capabilities: ["archives:read", "archives:export", "audit:read"],
}

function record(overrides: Partial<ArchiveRecord> = {}): ArchiveRecord {
  return {
    id: "archive-1",
    documentTitle: "Employment contract",
    documentTypeId: "type-1",
    documentTypeName: "Employment",
    senderUserId: "sender-1",
    senderName: "Sender User",
    fileName: "contract-executed.pdf",
    byteLength: 204_800,
    documentHash: "a".repeat(64),
    certificateNo: "SIG-20260921-ABC",
    completedAt: "2026-09-21T16:00:00.000Z",
    certifiedAt: "2026-09-21T16:00:00.000Z",
    indexedAt: "2026-09-21T16:00:00.000Z",
    retentionEndDate: "2029-09-21T16:00:00.000Z",
    retentionStatus: "ACTIVE",
    retentionPeriodMonths: 36,
    disposalAction: "REVIEW",
    legalBasis: "Contract",
    signatories: [
      { name: "Alex Candidate", email: "alex@example.test", kind: "CANDIDATE" },
    ],
    clientAccounts: [],
    workerFiles: [],
    ...overrides,
  }
}

function searchResponse(records: ArchiveRecord[] = [record()]) {
  return {
    records,
    pagination: { total: records.length, limit: 25, offset: 0 },
  }
}

afterEach(() => {
  cleanup()
  apiRequestMock.mockReset()
  routerMock.refresh.mockReset()
  routerMock.replace.mockReset()
  openMock.mockReset()
  window.history.replaceState(null, "", "/archive")
})

async function openRecord() {
  fireEvent.click(await screen.findByRole("button", { name: /Open record/u }))
  fireEvent.change(screen.getByLabelText(/Why do you need this record/u), {
    target: { value: "Annual compliance review" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Open record" }))
}

describe("ArchiveSearch", () => {
  it("captures a purpose before any record is opened", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path.startsWith("/api/archive?")) {
        return Promise.resolve(searchResponse())
      }
      if (path === "/api/archive/archive-1/view") {
        return Promise.resolve({ record: record() })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<ArchiveSearch />)

    fireEvent.click(await screen.findByRole("button", { name: /Open record/u }))
    expect(screen.getByLabelText(/Why do you need this record/u)).toBeDefined()
    expect(
      apiRequestMock.mock.calls.some(
        (call) => call[0] === "/api/archive/archive-1/view"
      )
    ).toBe(false)
  })

  it("refuses a purpose shorter than the API accepts", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path.startsWith("/api/archive?")) {
        return Promise.resolve(searchResponse())
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<ArchiveSearch />)

    fireEvent.click(await screen.findByRole("button", { name: /Open record/u }))
    fireEvent.change(screen.getByLabelText(/Why do you need this record/u), {
      target: { value: "ab" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Open record" }))

    expect(await screen.findByRole("alert")).toBeDefined()
    expect(
      apiRequestMock.mock.calls.some(
        (call) => call[0] === "/api/archive/archive-1/view"
      )
    ).toBe(false)
  })

  it("sends the purpose with the view and keeps it out of the URL", async () => {
    apiRequestMock.mockImplementation(
      (path: string, options?: { body?: unknown }) => {
        if (path === "/api/me") return Promise.resolve(session)
        if (path.startsWith("/api/archive?")) {
          return Promise.resolve(searchResponse())
        }
        if (path === "/api/archive/archive-1/view") {
          expect(options?.body).toEqual({ purpose: "Annual compliance review" })
          return Promise.resolve({ record: record() })
        }
        return Promise.reject(new Error(`Unexpected request: ${path}`))
      }
    )

    render(<ArchiveSearch />)
    await openRecord()

    expect(await screen.findByText("contract-executed.pdf")).toBeDefined()
    expect(window.location.search).not.toContain("purpose")
    expect(window.location.href).not.toContain("compliance")
  })

  it("reports a hash mismatch prominently rather than as a pass", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path.startsWith("/api/archive?")) {
        return Promise.resolve(searchResponse())
      }
      if (path === "/api/archive/archive-1/view") {
        return Promise.resolve({ record: record() })
      }
      if (path === "/api/archive/archive-1/verify") {
        return Promise.resolve({
          authentic: false,
          expectedHash: "a".repeat(64),
          actualHash: "b".repeat(64),
          certificateNo: "SIG-20260921-ABC",
          certifiedAt: "2026-09-21T16:00:00.000Z",
          completedAt: "2026-09-21T16:00:00.000Z",
          signatories: [],
        })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<ArchiveSearch />)
    await openRecord()

    fireEvent.click(
      await screen.findByRole("button", { name: /Verify authenticity/u })
    )
    fireEvent.change(screen.getByLabelText(/Why do you need this record/u), {
      target: { value: "Dispute investigation" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: /Verify authenticity/u })
    )

    expect(await screen.findByText("Does not match")).toBeDefined()
    expect(screen.getByText(/compromised/u)).toBeDefined()
  })

  it("says nothing can be concluded when the check itself fails", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path.startsWith("/api/archive?")) {
        return Promise.resolve(searchResponse())
      }
      if (path === "/api/archive/archive-1/view") {
        return Promise.resolve({ record: record() })
      }
      if (path === "/api/archive/archive-1/verify") {
        return Promise.reject(
          new ApiError({
            status: 503,
            code: "DOCUMENT_STORAGE_UNAVAILABLE",
            message: "server copy",
            requestId: "request-1",
          })
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<ArchiveSearch />)
    await openRecord()

    fireEvent.click(
      await screen.findByRole("button", { name: /Verify authenticity/u })
    )
    fireEvent.change(screen.getByLabelText(/Why do you need this record/u), {
      target: { value: "Dispute investigation" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: /Verify authenticity/u })
    )

    expect(await screen.findByText("Could not be checked")).toBeDefined()
    expect(screen.getByText(/nothing can be concluded/u)).toBeDefined()
  })

  it("keeps only non-sensitive filter criteria in the address bar", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path.startsWith("/api/archive?")) {
        return Promise.resolve(searchResponse())
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<ArchiveSearch />)

    fireEvent.change(await screen.findByLabelText("Signatory"), {
      target: { value: "alex@example.test" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    await waitFor(() =>
      expect(window.location.search).toContain("signatory=alex")
    )
    expect(window.location.search).not.toContain("purpose")
    expect(window.location.search).not.toMatch(/hash|token/iu)
  })

  it("flags a record whose retention review is due, offering no disposal", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path.startsWith("/api/archive?")) {
        return Promise.resolve(
          searchResponse([record({ retentionStatus: "REVIEW_DUE" })])
        )
      }
      if (path === "/api/archive/archive-1/view") {
        return Promise.resolve({
          record: record({ retentionStatus: "REVIEW_DUE" }),
        })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<ArchiveSearch />)
    await openRecord()

    // "Review due" is also a filter option, so the badge is matched by role.
    expect(
      (await screen.findAllByText("Review due")).some(
        (node) => node.tagName !== "OPTION"
      )
    ).toBe(true)
    expect(screen.getByText(/nothing is deleted automatically/iu)).toBeDefined()
    expect(
      screen.queryByRole("button", { name: /delete|dispose/iu })
    ).toBeNull()
  })
})
