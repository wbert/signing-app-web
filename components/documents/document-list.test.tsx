import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type { DocumentSummary, MeResponse } from "@/lib/api/types"

const { apiRequestMock, routerMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  routerMock: {
    refresh: vi.fn(),
    replace: vi.fn(),
  },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => routerMock,
}))

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>()
  return { ...actual, apiRequest: apiRequestMock }
})

import { DocumentList } from "@/components/documents/document-list"

const session: MeResponse = {
  user: {
    id: "sender-1",
    fullName: "Sender User",
    emailAddress: "sender@example.test",
    username: "sender",
    roles: ["SENDER"],
  },
  capabilities: ["documents:read", "documents:create"],
}

function document(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "document-1",
    title: "Employment contract",
    documentTypeId: "type-1",
    originalFileName: "contract.pdf",
    pageCount: 3,
    approvalStatus: "DRAFT",
    approvalRound: 0,
    workflowVersion: 1,
    uploadedAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  apiRequestMock.mockReset()
  routerMock.refresh.mockReset()
  routerMock.replace.mockReset()
})

describe("DocumentList", () => {
  it("loads the Sender's newest documents and links creation separately", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/api/documents?limit=20&offset=0") {
        return Promise.resolve({
          documents: [
            document(),
            document({
              id: "document-2",
              title: "Returned placement",
              approvalStatus: "RETURNED",
              approvalRound: 2,
            }),
          ],
        })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<DocumentList />)

    const draftHeading = await screen.findByRole("heading", {
      name: "Employment contract",
    })
    expect(draftHeading).toBeDefined()
    expect(
      screen.getByRole("heading", { name: "Returned placement" })
    ).toBeDefined()
    expect(draftHeading.closest("a")?.getAttribute("href")).toBe(
      "/documents/document-1"
    )
    expect(
      screen.getByRole("link", { name: /New document/u }).getAttribute("href")
    ).toBe("/documents/new")
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/documents?limit=20&offset=0"
    )
    expect(routerMock.replace).not.toHaveBeenCalled()
  })
})
