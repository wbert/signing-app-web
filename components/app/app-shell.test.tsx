import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { AppShell } from "@/components/app/app-shell"
import type { MeResponse } from "@/lib/api/types"

vi.mock("next/navigation", () => ({
  usePathname: () => "/documents/example",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

const session: MeResponse = {
  user: {
    id: "sender-1",
    fullName: "Test Sender",
    emailAddress: "sender@example.test",
    username: "sender",
    roles: ["SENDER"],
  },
  capabilities: ["documents:read"],
}

afterEach(cleanup)

describe("AppShell navigation", () => {
  it("shows permitted modules and marks the parent module active on detail pages", () => {
    render(
      <AppShell session={session}>
        <main>Document detail</main>
      </AppShell>
    )
    const nav = within(screen.getByRole("navigation"))
    expect(
      nav.getByRole("link", { name: "Documents" }).getAttribute("aria-current")
    ).toBe("page")
    expect(nav.getByRole("link", { name: "Workflows" })).toBeTruthy()
    expect(nav.queryByRole("link", { name: "User administration" })).toBeNull()
    expect(nav.queryByRole("link", { name: "Approvals" })).toBeNull()
  })

  it("opens and closes the mobile navigation drawer", async () => {
    render(
      <AppShell session={session}>
        <main>Document detail</main>
      </AppShell>
    )
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Workspace navigation",
    })
    expect(within(dialog).getByRole("link", { name: "Documents" })).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close navigation" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
