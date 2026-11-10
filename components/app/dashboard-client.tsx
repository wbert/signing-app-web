"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Archive,
  ArrowUpRight,
  FileClock,
  Files,
  ListChecks,
  Settings2,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { PageSkeleton } from "@/components/app/page-skeleton"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type { MeResponse } from "@/lib/api/types"
import { destinationsFor } from "@/lib/auth/capabilities"

const destinationIcons = {
  "/documents": Files,
  "/approvals": ListChecks,
  "/workflows": Workflow,
  "/archive": Archive,
  "/audit": ShieldCheck,
  "/admin/users": UsersRound,
  "/admin/document-types": Settings2,
}

export function DashboardClient() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  if (error) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <div className="max-w-md rounded-none border bg-card p-7 text-center shadow-sm">
          <FileClock className="mx-auto mb-4 size-7 text-muted-foreground" />
          <h1 className="font-heading text-xl font-semibold">
            Unable to load your workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {error}
          </p>
          <Button
            className="mt-5 rounded-none"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </main>
    )
  }

  if (!session) return <PageSkeleton message="Opening your secure workspace…" />

  const destinations = destinationsFor(session.capabilities)
  const firstName = session.user.fullName.split(/\s+/u)[0]

  return (
    <>
      <main className="mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12">
        <section className="overflow-hidden rounded-none border bg-card text-card-foreground">
          <div className="px-6 py-8 sm:px-9 sm:py-10">
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Good day, {firstName}.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Your workspace only shows the document actions assigned to your
                account.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="workspace-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.15em] text-muted-foreground uppercase">
                Your workspace
              </p>
              <h2
                className="mt-2 font-heading text-2xl font-semibold tracking-tight"
                id="workspace-heading"
              >
                Quick Action
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination) => {
              const Icon =
                destinationIcons[
                  destination.href as keyof typeof destinationIcons
                ] ?? Files

              return (
                <Link
                  className="group relative min-h-44 overflow-hidden rounded-none border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  href={destination.href}
                  key={destination.href}
                >
                  <div className="grid size-10 place-items-center rounded-none bg-muted text-foreground">
                    <Icon aria-hidden="true" className="size-5" />
                  </div>
                  <h3 className="mt-6 font-heading text-lg font-semibold">
                    {destination.label}
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {destination.description}
                  </p>
                  <ArrowUpRight className="absolute right-5 bottom-5 size-4 text-muted-foreground/40 transition group-hover:text-foreground" />
                </Link>
              )
            })}
          </div>
        </section>
      </main>
    </>
  )
}
