"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, FileQuestion, Lock } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  FullPageError,
  FullPageStatus,
  type Notice,
} from "@/components/admin/admin-ui"
import { DocumentShell } from "@/components/documents/document-shell"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  AuditEvent,
  AuditEventResponse,
  MeResponse,
} from "@/lib/api/types"
import {
  auditCategoryDescriptions,
  auditCategoryLabels,
  describeEventType,
  orderedData,
} from "@/lib/audit/audit"
import { can } from "@/lib/auth/capabilities"
import { formatTimestamp } from "@/lib/documents/document-types"

/**
 * One audit event at its own address, so a specific record can be cited in an
 * incident report or handed to a reviewer.
 *
 * This reads `/audit-events/:eventId` rather than reusing a row already held by
 * the list. The fields are the same either way, but the single-event route
 * applies its own resource-access policy on top of the capability check, and
 * that check should be exercised by the UI that claims to show the event.
 */
export function AuditEventDetail({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [event, setEvent] = useState<AuditEvent | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Notice | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setMissing(false)
    try {
      const [currentSession, response] = await Promise.all([
        apiRequest<MeResponse>("/api/me"),
        apiRequest<AuditEventResponse>(
          `/audit-events/${encodeURIComponent(eventId)}`
        ),
      ])
      if (!can(currentSession.capabilities, "audit:read")) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setSession(currentSession)
      setEvent(response.event)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      if (error instanceof ApiError && error.status === 403) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      // A missing event is a dead end, not a transient failure, so it gets its
      // own state instead of a retry button that can never succeed.
      if (error instanceof ApiError && error.status === 404) {
        const currentSession = await loadSession()
        if (currentSession) setSession(currentSession)
        setMissing(true)
        return
      }
      setLoadError({
        tone: "error",
        message: userMessageForApiError(error),
        reference: errorReference(error),
      })
    } finally {
      setLoading(false)
    }
  }, [eventId, redirectToExpiredSessionLogin, router])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  if (loading) return <FullPageStatus message="Loading this audit event…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load this audit event"
        notice={loadError}
        onRetry={() => void load()}
      />
    )
  }
  if (!session) return null

  if (missing || !event) {
    return (
      <DocumentShell
        backHref="/audit"
        backLabel="Audit trail"
        eyebrow="Audit trail"
        intro="No event is recorded under this identifier."
        session={session}
        title="Event not found"
      >
        <div className="mt-8 rounded-none border bg-card p-10 text-center">
          <FileQuestion className="mx-auto size-7 text-muted-foreground" />
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            The identifier may be mistyped, or it may belong to a different
            environment. Nothing is ever removed from the trail, so an event
            that existed here still does.
          </p>
          <Button
            className="mt-6 rounded-none"
            render={<Link href="/audit" />}
            variant="outline"
          >
            <ArrowLeft />
            Back to the audit trail
          </Button>
        </div>
      </DocumentShell>
    )
  }

  const data = orderedData(event)

  return (
    <DocumentShell
      backHref="/audit"
      backLabel="Audit trail"
      eyebrow={auditCategoryLabels[event.category]}
      intro={auditCategoryDescriptions[event.category]}
      session={session}
      title={describeEventType(event.eventType)}
    >
      <div className="mt-8 space-y-5">
        <p className="flex items-center gap-2 rounded-none border bg-muted/25 px-4 py-3 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          This record is permanent. It cannot be amended or deleted.
        </p>

        <section className="rounded-none border bg-card p-5 sm:p-7">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            What happened
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Entry label="Event type" value={event.eventType} />
            <Entry
              label="Category"
              value={auditCategoryLabels[event.category]}
            />
            <Entry label="Actor" value={event.actor.label} />
            <Entry
              label="Actor ID"
              value={event.actor.partyId ?? "Not attributed to an account"}
            />
            <Entry label="Occurred" value={formatTimestamp(event.occurredAt)} />
            <Entry label="Support reference" value={event.requestId} />
            <Entry label="Target type" value={event.targetType} />
            <Entry label="Target ID" value={event.targetId} />
          </dl>
        </section>

        <section className="rounded-none border bg-card p-5 sm:p-7">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Recorded detail
          </h2>
          {data.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This event carries no additional detail.
            </p>
          ) : (
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {data.map((entry) => (
                <Entry
                  key={entry.key}
                  label={entry.label}
                  value={entry.value}
                />
              ))}
            </dl>
          )}
        </section>
      </div>
    </DocumentShell>
  )
}

async function loadSession(): Promise<MeResponse | null> {
  try {
    return await apiRequest<MeResponse>("/api/me")
  } catch {
    return null
  }
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xs break-words">{value}</dd>
    </div>
  )
}
