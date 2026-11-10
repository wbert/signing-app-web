"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppShell } from "@/components/app/app-shell"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type { MeResponse } from "@/lib/api/types"

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const controller = new AbortController()
    function expireSession() {
      setSession(null)
      router.replace("/login?reason=session-expired")
      router.refresh()
    }
    async function refreshSession() {
      try {
        const current = await apiRequest<MeResponse>("/api/me", {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setSession(current)
          setError(null)
        }
      } catch (failure) {
        if (controller.signal.aborted) return
        if (failure instanceof ApiError && failure.status === 401) {
          expireSession()
        } else if (
          failure instanceof ApiError &&
          failure.code === "MFA_ENROLLMENT_REQUIRED"
        ) {
          setSession(null)
          router.replace("/login")
          router.refresh()
        } else {
          setError(userMessageForApiError(failure))
        }
      }
    }
    void refreshSession()
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession)
    window.addEventListener("focus", refreshSession)
    return () => {
      controller.abort()
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession)
      window.removeEventListener("focus", refreshSession)
    }
  }, [attempt, pathname, router])

  return (
    <AppShell session={session}>
      {session ? (
        children
      ) : error ? (
        <main className="p-8" role="alert">
          <h1 className="text-xl font-semibold">
            Unable to load your workspace
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          <Button
            className="mt-4"
            onClick={() => {
              setError(null)
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </Button>
        </main>
      ) : (
        <PageSkeleton message="Loading your workspace…" />
      )}
    </AppShell>
  )
}
