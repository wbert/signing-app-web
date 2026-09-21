"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  FileClock,
  LoaderCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { BrandLockup } from "@/components/brand/brand-lockup"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type { MeResponse } from "@/lib/api/types"
import { destinationsFor } from "@/lib/auth/capabilities"

export function DashboardClient() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const refreshSession = useCallback(
    async (options: { showError: boolean }) => {
      try {
        const currentSession = await apiRequest<MeResponse>("/api/me")
        setSession(currentSession)
        setError(null)
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          redirectToExpiredSessionLogin()
          return
        }
        if (
          requestError instanceof ApiError &&
          requestError.code === "MFA_ENROLLMENT_REQUIRED"
        ) {
          router.replace("/login")
          router.refresh()
          return
        }
        if (options.showError) {
          setError(userMessageForApiError(requestError))
        }
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<MeResponse>("/api/me", { signal: controller.signal })
      .then(setSession)
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return
        }
        if (requestError instanceof ApiError && requestError.status === 401) {
          redirectToExpiredSessionLogin()
          return
        }
        if (
          requestError instanceof ApiError &&
          requestError.code === "MFA_ENROLLMENT_REQUIRED"
        ) {
          router.replace("/login")
          router.refresh()
          return
        }
        setError(userMessageForApiError(requestError))
      })
    return () => controller.abort()
  }, [redirectToExpiredSessionLogin, router])

  useEffect(() => {
    const handleSessionExpiry = () => redirectToExpiredSessionLogin()
    const refreshVisibleSession = () => {
      if (document.visibilityState === "visible") {
        void refreshSession({ showError: false })
      }
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry)
    window.addEventListener("focus", refreshVisibleSession)
    document.addEventListener("visibilitychange", refreshVisibleSession)

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry)
      window.removeEventListener("focus", refreshVisibleSession)
      document.removeEventListener("visibilitychange", refreshVisibleSession)
    }
  }, [redirectToExpiredSessionLogin, refreshSession])

  async function signOut() {
    setSigningOut(true)
    try {
      await apiRequest("/api/auth/sign-out", { method: "POST", body: {} })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  if (error) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <div className="max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
          <FileClock className="mx-auto mb-4 size-7 text-muted-foreground" />
          <h1 className="font-heading text-xl font-semibold">
            Unable to load your workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {error}
          </p>
          <Button
            className="mt-5 rounded-xl"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="grid min-h-svh place-items-center" role="status">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Opening your secure workspace…
        </div>
      </main>
    )
  }

  const destinations = destinationsFor(session.capabilities)
  const firstName = session.user.fullName.split(/\s+/u)[0]

  return (
    <div className="min-h-svh bg-[#f5f7f3] dark:bg-background">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <BrandLockup />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {session.user.roles.map(titleCase).join(" · ")}
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

      <main className="mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12">
        <section className="overflow-hidden rounded-[1.75rem] bg-[#143c32] text-white shadow-xl shadow-emerald-950/10">
          <div className="relative grid gap-8 px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="relative z-10">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-emerald-50">
                <ShieldCheck className="size-3.5" />
                MFA-protected session
              </div>
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Good day, {firstName}.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75 sm:text-base">
                Your workspace only shows the document actions assigned to your
                account.
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/10 px-4 py-3 text-sm">
              <CheckCircle2 className="size-5 text-emerald-300" />
              <div>
                <p className="font-semibold">Access verified</p>
                <p className="text-xs text-emerald-50/65">
                  {session.capabilities.length} capabilities active
                </p>
              </div>
            </div>
            <div className="absolute -top-24 right-20 size-64 rounded-full border border-white/10" />
            <div className="absolute -right-10 -bottom-36 size-80 rounded-full bg-emerald-300/10 blur-3xl" />
          </div>
        </section>

        <section className="mt-10" aria-labelledby="workspace-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.15em] text-emerald-700 uppercase dark:text-emerald-400">
                Your workspace
              </p>
              <h2
                className="mt-2 font-heading text-2xl font-semibold tracking-tight"
                id="workspace-heading"
              >
                Available modules
              </h2>
            </div>
            <button
              className="hidden items-center gap-2 text-xs font-semibold text-muted-foreground sm:flex"
              type="button"
            >
              Capability-based access
              <ChevronDown className="size-3.5" />
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination, index) => (
              <Link
                className="group relative min-h-44 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                href={destination.href}
                key={destination.href}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 font-mono text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="rounded-full border px-2.5 py-1 text-[0.62rem] font-bold tracking-wider text-muted-foreground uppercase">
                    Phase {destination.phase}
                  </span>
                </div>
                <h3 className="mt-6 font-heading text-lg font-semibold">
                  {destination.label}
                </h3>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {destination.description}
                </p>
                <ArrowUpRight className="absolute right-5 bottom-5 size-4 text-muted-foreground/40 transition group-hover:text-emerald-700" />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/^./u, (letter) => letter.toUpperCase())
}
