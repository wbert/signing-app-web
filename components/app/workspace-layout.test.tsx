import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { WorkspaceLayout } from "@/components/app/workspace-layout"
import { PageSkeleton } from "@/components/app/page-skeleton"
import type { MeResponse } from "@/lib/api/types"

const { apiRequestMock, router, location } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
  location: { pathname: "/documents" },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => location.pathname,
}))
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: apiRequestMock,
}))
const session: MeResponse = {
  user: {
    id: "sender",
    fullName: "Test Sender",
    username: "sender",
    emailAddress: "sender@example.test",
    roles: ["SENDER"],
  },
  capabilities: ["documents:read"],
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  location.pathname = "/documents"
})

describe("persistent workspace layout", () => {
  it("keeps the same sidebar while a new child route and session refresh are pending", async () => {
    apiRequestMock.mockResolvedValueOnce(session)
    const view = render(
      <WorkspaceLayout>
        <main>Documents ready</main>
      </WorkspaceLayout>
    )
    await screen.findByText("Documents ready")
    const sidebar = screen.getByRole("complementary")
    let resolveSession!: (value: MeResponse) => void
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise<MeResponse>((resolve) => {
          resolveSession = resolve
        })
    )
    location.pathname = "/workflows"
    view.rerender(
      <WorkspaceLayout>
        <PageSkeleton message="Loading workflows…" />
      </WorkspaceLayout>
    )
    expect(screen.getByRole("complementary")).toBe(sidebar)
    expect(screen.getByText("Test Sender")).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Workflows" })
        .getAttribute("aria-current")
    ).toBe("page")
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true")
    expect(view.container.querySelector(".animate-spin")).toBeNull()
    await act(async () => resolveSession(session))
    view.rerender(
      <WorkspaceLayout>
        <main>Workflows ready</main>
      </WorkspaceLayout>
    )
    expect(screen.getByRole("complementary")).toBe(sidebar)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("renders shell and skeletons during the initial session request", async () => {
    let resolveSession!: (value: MeResponse) => void
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise<MeResponse>((resolve) => {
          resolveSession = resolve
        })
    )
    const view = render(
      <WorkspaceLayout>
        <main>Private content</main>
      </WorkspaceLayout>
    )
    expect(screen.getByRole("complementary")).toBeTruthy()
    expect(screen.getByText("Loading your workspace…")).toBeTruthy()
    expect(screen.queryByText("Private content")).toBeNull()
    expect(view.container.querySelector(".animate-spin")).toBeNull()
    await act(async () => resolveSession(session))
    await waitFor(() =>
      expect(screen.getByText("Private content")).toBeTruthy()
    )
  })
})
