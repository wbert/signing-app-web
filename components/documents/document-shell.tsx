"use client"

import { ArrowLeft, CircleUserRound, LoaderCircle, LogOut } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { BrandLockup } from "@/components/brand/brand-lockup"
import { Button } from "@/components/ui/button"
import { apiRequest } from "@/lib/api/client"
import type { MeResponse } from "@/lib/api/types"

export function DocumentShell({
  actions,
  backHref = "/dashboard",
  backLabel = "Workspace",
  children,
  eyebrow,
  intro,
  session,
  title,
}: {
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  children: React.ReactNode
  eyebrow: string
  intro: string
  session: MeResponse
  title: string
}) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await apiRequest("/api/auth/sign-out", { method: "POST", body: {} })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  return (
    <div className="min-h-svh bg-[#f5f7f3] dark:bg-background">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[90rem] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-5">
            <BrandLockup />
            <span className="hidden h-7 w-px bg-border md:block" />
            <Link
              className="hidden items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground md:flex"
              href={backHref}
            >
              <ArrowLeft className="size-3.5" />
              {backLabel}
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.fullName}</p>
              <p className="text-xs text-muted-foreground">
                @{session.user.username}
              </p>
            </div>
            <div className="grid size-10 place-items-center rounded-full border bg-card text-muted-foreground">
              <CircleUserRound className="size-5" />
            </div>
            <Button
              aria-label="Sign out"
              className="rounded-xl"
              disabled={signingOut}
              onClick={signOut}
              size="icon"
              variant="ghost"
            >
              {signingOut ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogOut />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground md:hidden"
              href={backHref}
            >
              <ArrowLeft className="size-3.5" />
              {backLabel}
            </Link>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase dark:text-emerald-400">
              {eyebrow}
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {intro}
            </p>
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  )
}
