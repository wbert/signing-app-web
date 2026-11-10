"use client"

import { Dialog } from "@base-ui/react/dialog"
import {
  Archive,
  ArrowLeft,
  FileCheck2,
  Files,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  UsersRound,
  Workflow,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

import { BrandLockup } from "@/components/brand/brand-lockup"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { apiRequest } from "@/lib/api/client"
import type { MeResponse } from "@/lib/api/types"
import { destinationsFor } from "@/lib/auth/capabilities"
import { cn } from "@/lib/utils"

const icons = {
  "/dashboard": LayoutDashboard,
  "/documents": Files,
  "/approvals": ListChecks,
  "/workflows": Workflow,
  "/archive": Archive,
  "/audit": ShieldCheck,
  "/admin/users": UsersRound,
  "/admin/document-types": Settings2,
}

export function AppShell({
  children,
  session,
  backHref,
  backLabel = "Workspace",
}: {
  children: React.ReactNode
  session: MeResponse | null
  backHref?: string
  backLabel?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const destinations = [
    { href: "/dashboard", label: "Overview" },
    ...destinationsFor(session?.capabilities ?? []),
  ]
  const current = destinations.find(
    (item) => pathname === item.href || pathname?.startsWith(`${item.href}/`)
  )

  async function signOut() {
    setSigningOut(true)
    try {
      await apiRequest("/api/auth/sign-out", { method: "POST", body: {} })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  function sidebar() {
    return (
      <>
        <Link
          href="/dashboard"
          aria-label="SigningApp overview"
          onClick={() => setMenuOpen(false)}
          className="flex h-20 shrink-0 items-center border-b border-sidebar-border px-6"
        >
          <BrandLockup />
        </Link>
        <nav
          aria-label="Workspace navigation"
          className="flex-1 overflow-y-auto px-3 py-6"
        >
          <p className="mb-3 px-3 text-[0.65rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">
            Workspace
          </p>
          <div className="space-y-1">
            {!session && (
              <div aria-label="Loading navigation" className="space-y-4 p-3">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-7 w-full" />
                ))}
              </div>
            )}
            {destinations.map((item) => {
              const Icon = icons[item.href as keyof typeof icons] ?? FileCheck2
              const active = current?.href === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-l-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                    active
                      ? "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                      : "border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-4" /> Secure
            workspace
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              <div
                className="grid size-9 shrink-0 place-items-center border border-sidebar-border bg-sidebar-accent text-sm font-semibold"
                aria-hidden="true"
              >
                {session.user.fullName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {session.user.fullName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{session.user.username}
                </p>
              </div>
              <Button
                aria-label="Sign out"
                disabled={signingOut}
                onClick={signOut}
                size="icon-sm"
                variant="ghost"
              >
                {signingOut ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <LogOut />
                )}
              </Button>
            </div>
          ) : (
            <Skeleton className="h-9 w-full" />
          )}
        </div>
      </>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <a
        href="#workspace-content"
        className="sr-only z-50 bg-background p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        {sidebar()}
      </aside>
      <div className="min-w-0 lg:pl-64">
        <header className="flex h-16 items-center gap-4 border-b bg-card px-5 sm:px-8">
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                />
              }
            >
              <Menu />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
              <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl">
                <Dialog.Title className="sr-only">
                  Workspace navigation
                </Dialog.Title>
                <Dialog.Close
                  className="absolute top-2 right-2 p-2 text-muted-foreground"
                  aria-label="Close navigation"
                >
                  <X className="size-4" />
                </Dialog.Close>
                {sidebar()}
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 border-r pr-4 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {backLabel}
            </Link>
          )}
          <span className="text-sm font-semibold">
            {current?.label ?? "Workspace"}
          </span>
        </header>
        <div id="workspace-content" tabIndex={-1} className="outline-none">
          {children}
        </div>
      </div>
    </div>
  )
}
