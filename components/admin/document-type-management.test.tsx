import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"

import type { DocumentTypeConfiguration, MeResponse } from "@/lib/api/types"

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

import { DocumentTypeManagement } from "@/components/admin/document-type-management"

const session: MeResponse = {
  user: {
    id: "admin-1",
    fullName: "Admin User",
    emailAddress: "admin@example.test",
    username: "admin",
    roles: ["ADMINISTRATOR"],
  },
  capabilities: ["document-types:read", "document-types:manage"],
}

const inactiveType: DocumentTypeConfiguration = {
  id: "type-1",
  code: "INACTIVE-TYPE",
  name: "Inactive contract",
  category: "Contracts",
  isActive: false,
  maxFileSizeBytes: 4_000_000,
  retentionPeriodMonths: 120,
  disposalAction: "Destroy securely",
  legalBasis: "Contract administration",
  signingMode: "SEQUENTIAL",
  signingLinkExpiryHours: 168,
  requiresOtp: false,
  approvalReminderIntervalHours: 72,
  signingReminderIntervalHours: 72,
  reminderMaxCount: 3,
  requiredAttachmentKeys: ["VALID_ID"],
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  currentTemplate: null,
  currentMatrix: null,
  isUsableForDraft: false,
  isUsableForSubmission: false,
}

afterEach(() => {
  cleanup()
  apiRequestMock.mockReset()
  routerMock.refresh.mockReset()
  routerMock.replace.mockReset()
})

describe("DocumentTypeManagement", () => {
  it("loads the administrative list and keeps inactive types visible", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(session)
      if (path === "/api/admin/document-types") {
        return Promise.resolve({ documentTypes: [inactiveType] })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    render(<DocumentTypeManagement />)

    const heading = await screen.findByRole("heading", {
      name: "Inactive contract",
    })
    expect(heading).toBeDefined()
    expect(
      within(heading.closest("article")!).getByText("Inactive")
    ).toBeDefined()
    expect(apiRequestMock).toHaveBeenCalledWith("/api/admin/document-types")
    expect(apiRequestMock).not.toHaveBeenCalledWith("/api/document-types")
    await waitFor(() => expect(routerMock.replace).not.toHaveBeenCalled())
  })
})
