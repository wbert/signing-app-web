"use client"

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  BookOpenCheck,
  Clock,
  LoaderCircle,
  LockKeyhole,
  PenLine,
  ShieldCheck,
  X,
} from "lucide-react"

import { NoticeBanner, type Notice } from "@/components/admin/admin-ui"
import { DocumentReader } from "@/components/signing/document-reader"
import {
  type CaptureValue,
  SignatureCapture,
} from "@/components/signing/signature-capture"
import {
  SigningShell,
  TerminalScreen,
} from "@/components/signing/signing-shell"
import { Button } from "@/components/ui/button"
import type {
  SigningCompletionResponse,
  SigningConsentResponse,
  SigningLastPageResponse,
  SigningOtpResponse,
  SigningSession,
  SigningSessionResponse,
} from "@/lib/api/types"
import { SigningApiError, signingRequest } from "@/lib/signing/client"
import {
  createIdempotencyKey,
  describeExpiry,
  isVersionConflict,
  MAX_DECLINE_REASON_CHARACTERS,
  signingErrorReference,
  signingMessageForError,
  stageForSession,
  type SigningStage,
  type TerminalState,
  terminalState,
  terminalStateForError,
  validateDeclineReason,
  validateSignatureCapture,
} from "@/lib/signing/signing"
import { claimSigningToken } from "@/lib/signing/token"

type Busy = "otp" | "consent" | "sign" | "decline" | null

/**
 * The whole accountless signing journey.
 *
 * The token is claimed from the URL fragment once, held in a ref for the life
 * of this component, and sent only as an `Authorization: Signing` header. It is
 * never placed in state that is serialized, never written to storage, and never
 * added to a path, so it cannot reach history, a referrer, or a server log.
 */
export function SigningJourney() {
  // Wrapped so "not yet claimed" is distinguishable from "claimed nothing".
  // The claim is destructive — it takes the token out of the URL — so it must
  // happen exactly once per mount. React mounts effects twice under Strict
  // Mode, and the second pass would otherwise read an address bar the first
  // pass had already cleaned and conclude the link was incomplete.
  const claimed = useRef<{ value: string | null } | null>(null)
  const token = useRef<string | null>(null)
  const signKey = useRef<string | null>(null)
  const declineKey = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SigningSession | null>(null)
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string | null>(
    null
  )
  const [terminal, setTerminal] = useState<TerminalState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [otp, setOtp] = useState("")
  const [consentChecked, setConsentChecked] = useState(false)
  const [capture, setCapture] = useState<CaptureValue | null>(null)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [rereading, setRereading] = useState(false)

  /** Reads the current server state. The server, not this page, holds progress. */
  const openSession = useCallback(async (): Promise<SigningSession | null> => {
    const current = token.current
    if (!current) return null
    const response = await signingRequest<SigningSessionResponse>(
      current,
      "/api/signing/session"
    )
    if (response.challenge) {
      setChallengeExpiresAt(response.challenge.expiresAt)
      setSession(null)
      return null
    }
    setChallengeExpiresAt(null)
    setSession(response.session)
    return response.session
  }, [])

  useEffect(() => {
    // Claimed synchronously so the token leaves the address bar on the first
    // frame; everything that renders from it is deferred by a tick.
    claimed.current ??= { value: claimSigningToken() }
    token.current = claimed.current.value

    let cancelled = false
    const bootstrap = window.setTimeout(() => {
      if (!token.current) {
        setTerminal(terminalState("no-token"))
        setLoading(false)
        return
      }

      void (async () => {
        try {
          await openSession()
        } catch (error) {
          if (cancelled) return
          const ended = terminalStateForError(error)
          if (ended) setTerminal(ended)
          else setNotice(noticeFor(error))
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(bootstrap)
    }
  }, [openSession])

  /** Runs one server action, ending the journey when the link stops working. */
  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    if (busy) return
    setBusy(kind)
    setNotice(null)
    try {
      await action()
    } catch (error) {
      const ended = terminalStateForError(error)
      if (ended) {
        setTerminal(ended)
        return
      }
      if (isVersionConflict(error)) {
        // The idempotency keys are deliberately kept: this is the same intent,
        // retried against the version the server now reports.
        try {
          await openSession()
        } catch (reloadError) {
          const reloadEnded = terminalStateForError(reloadError)
          if (reloadEnded) {
            setTerminal(reloadEnded)
            return
          }
        }
      }
      setNotice(noticeFor(error))
    } finally {
      setBusy(null)
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = token.current
    if (!current) return

    await run("otp", async () => {
      try {
        await signingRequest<SigningOtpResponse>(current, "/api/signing/otp", {
          method: "POST",
          body: { code: otp },
        })
      } catch (error) {
        // Three wrong passcodes lock the assignment. The lock is only visible
        // through the server, so it is asked rather than counted here.
        if (error instanceof SigningApiError && error.code === "OTP_INVALID") {
          const locked = await hasBecomeUnavailable(current)
          if (locked) {
            setTerminal(terminalState("unavailable"))
            return
          }
        }
        throw error
      }
      setOtp("")
      await openSession()
    })
  }

  const recordLastPage = useCallback((pageNumber: number) => {
    const current = token.current
    if (!current) return
    void (async () => {
      try {
        await signingRequest<SigningLastPageResponse>(
          current,
          "/api/signing/review/last-page",
          { method: "POST", body: { pageNumber } }
        )
        setSession((value) =>
          value ? { ...value, lastPageViewed: true } : value
        )
      } catch (error) {
        const ended = terminalStateForError(error)
        if (ended) setTerminal(ended)
        else setNotice(noticeFor(error))
      }
    })()
  }, [])

  async function submitConsent() {
    const current = token.current
    const active = session
    if (!current || !active) return

    await run("consent", async () => {
      const response = await signingRequest<SigningConsentResponse>(
        current,
        "/api/signing/consent",
        {
          method: "POST",
          body: { accepted: true, consentVersion: active.consentVersion },
        }
      )
      setSession((value) =>
        value
          ? {
              ...value,
              consentAccepted: true,
              consentVersion: response.consentVersion,
            }
          : value
      )
    })
  }

  async function submitSignature() {
    const current = token.current
    const active = session
    if (!current || !active || !capture) return

    const problem = validateSignatureCapture(capture)
    if (problem) {
      setNotice({ tone: "error", message: problem })
      return
    }

    signKey.current ??= createIdempotencyKey()
    const idempotencyKey = signKey.current

    await run("sign", async () => {
      const response = await signingRequest<SigningCompletionResponse>(
        current,
        "/api/signing/sign",
        {
          method: "POST",
          body: {
            captureMethod: capture.captureMethod,
            captureData: capture.captureData,
            idempotencyKey,
            expectedVersion: active.requestVersion,
          },
        }
      )
      if (
        response.status === "COMPLETED" ||
        response.status === "IN_PROGRESS"
      ) {
        setCapture(null)
        setTerminal(terminalState("completed"))
      }
    })
  }

  async function submitDecline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = token.current
    const active = session
    if (!current || !active) return

    const problem = validateDeclineReason(declineReason)
    if (problem) {
      setNotice({ tone: "error", message: problem })
      return
    }

    declineKey.current ??= createIdempotencyKey()
    const idempotencyKey = declineKey.current

    await run("decline", async () => {
      await signingRequest<SigningCompletionResponse>(
        current,
        "/api/signing/decline",
        {
          method: "POST",
          body: {
            reason: declineReason.trim(),
            idempotencyKey,
            expectedVersion: active.requestVersion,
          },
        }
      )
      setDeclineReason("")
      setTerminal(terminalState("declined"))
    })
  }

  if (terminal) return <TerminalScreen state={terminal} />

  if (loading) {
    return (
      <SigningShell>
        <p
          className="flex items-center justify-center gap-2 rounded-none border bg-card py-16 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Opening your document…
        </p>
      </SigningShell>
    )
  }

  if (!session) {
    return (
      <SigningShell stage="access">
        <AccessStage
          busy={busy === "otp"}
          expiresAt={challengeExpiresAt}
          notice={notice}
          onChange={setOtp}
          onDismissNotice={() => setNotice(null)}
          onSubmit={submitOtp}
          value={otp}
        />
      </SigningShell>
    )
  }

  const stage: SigningStage = rereading ? "review" : stageForSession(session)
  const expiry = describeExpiry(session.expiresAt)

  return (
    <SigningShell documentTitle={session.documentTitle} stage={stage}>
      <div className="space-y-5">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Prepared for {session.signatoryName}
          </span>
          {expiry && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {expiry}
            </span>
          )}
        </p>

        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}

        {stage === "review" && (
          <ReviewIntro
            onStopRereading={rereading ? () => setRereading(false) : undefined}
            session={session}
          />
        )}

        {/* Mounted once, in a fixed position, for the life of the session. The
            preview URL is short lived, so re-reading the document after
            reaching the signature screen must not refetch it. */}
        <div hidden={stage !== "review"}>
          <DocumentReader
            onReachedLastPage={recordLastPage}
            previewUrl={session.previewUrl}
          />
        </div>

        {stage === "review" ? (
          <ConsentPanel
            busy={busy === "consent"}
            consentChecked={consentChecked}
            onConsent={submitConsent}
            onConsentChange={setConsentChecked}
            session={session}
          />
        ) : (
          <SignStage
            busy={busy}
            capture={capture}
            declineReason={declineReason}
            declining={declining}
            onCancelDecline={() => {
              setDeclining(false)
              setDeclineReason("")
            }}
            onCapture={setCapture}
            onDecline={submitDecline}
            onDeclineReasonChange={setDeclineReason}
            onReread={() => setRereading(true)}
            onSign={submitSignature}
            onStartDecline={() => setDeclining(true)}
            session={session}
          />
        )}
      </div>
    </SigningShell>
  )
}

function AccessStage({
  busy,
  expiresAt,
  notice,
  onChange,
  onDismissNotice,
  onSubmit,
  value,
}: {
  busy: boolean
  expiresAt: string | null
  notice: Notice | null
  onChange: (value: string) => void
  onDismissNotice: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  value: string
}) {
  const expiry = expiresAt ? describeExpiry(expiresAt) : null

  return (
    <div className="rounded-none border bg-card p-6 shadow-sm sm:p-8">
      <span className="grid size-11 place-items-center rounded-none bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        <LockKeyhole className="size-5" />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-semibold tracking-tight">
        Enter your passcode
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Your invitation email contains a six-digit passcode. It confirms the
        link reached you and nobody else.
      </p>
      {expiry && <p className="mt-2 text-xs text-muted-foreground">{expiry}</p>}

      {notice && (
        <div className="mt-5">
          <NoticeBanner notice={notice} onDismiss={onDismissNotice} />
        </div>
      )}

      <form className="mt-5" onSubmit={onSubmit}>
        <label className="mb-2 block text-sm font-semibold" htmlFor="otp">
          Six-digit passcode
        </label>
        <input
          autoComplete="one-time-code"
          autoFocus
          className="field-input text-center font-mono text-xl tracking-[0.45em]"
          disabled={busy}
          id="otp"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) =>
            onChange(event.target.value.replace(/\D/gu, "").slice(0, 6))
          }
          pattern="\d{6}"
          required
          value={value}
        />
        <Button
          className="mt-5 w-full rounded-none"
          disabled={busy || value.length !== 6}
          size="lg"
          type="submit"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
          Continue
        </Button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          After three incorrect passcodes this link closes and the sender is
          told, so check the code carefully before continuing.
        </p>
      </form>
    </div>
  )
}

function ReviewIntro({
  onStopRereading,
  session,
}: {
  onStopRereading?: () => void
  session: SigningSession
}) {
  return (
    <div className="space-y-5">
      {onStopRereading && (
        <Button
          className="rounded-none"
          onClick={onStopRereading}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArrowLeft />
          Back to signing
        </Button>
      )}

      <div className="rounded-none border bg-card px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <BookOpenCheck className="size-4" />
          Read all {session.pageCount}{" "}
          {session.pageCount === 1 ? "page" : "pages"}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {session.lastPageViewed
            ? "You have reached the end of the document. You can scroll back through it at any time before you sign."
            : "Scroll through the whole document. The agreement below opens once you reach the last page."}
        </p>
      </div>
    </div>
  )
}

function ConsentPanel({
  busy,
  consentChecked,
  onConsent,
  onConsentChange,
  session,
}: {
  busy: boolean
  consentChecked: boolean
  onConsent: () => void
  onConsentChange: (checked: boolean) => void
  session: SigningSession
}) {
  return (
    <div className="rounded-none border bg-card p-5 shadow-sm sm:p-7">
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        Agreement to sign electronically
      </h2>
      <p className="mt-3 rounded-none border bg-muted/30 px-4 py-3 text-sm leading-6">
        {session.consentText}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Notice version {session.consentVersion}
      </p>

      {session.consentAccepted ? (
        <p className="mt-4 text-sm leading-6 text-emerald-800 dark:text-emerald-300">
          You have agreed to this notice.
        </p>
      ) : (
        <>
          <label className="mt-4 flex items-start gap-3 text-sm leading-6">
            <input
              checked={consentChecked}
              className="mt-1 size-4 rounded border-border"
              disabled={busy || !session.lastPageViewed}
              onChange={(event) => onConsentChange(event.target.checked)}
              type="checkbox"
            />
            <span>
              I have read the document and I agree to the notice above.
            </span>
          </label>
          <Button
            className="mt-5 w-full rounded-none sm:w-auto"
            disabled={busy || !consentChecked || !session.lastPageViewed}
            onClick={onConsent}
            size="lg"
            type="button"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <PenLine />}
            Agree and continue
          </Button>
          {!session.lastPageViewed && (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Reach the last page of the document to enable this.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function SignStage({
  busy,
  capture,
  declineReason,
  declining,
  onCancelDecline,
  onCapture,
  onDecline,
  onDeclineReasonChange,
  onReread,
  onSign,
  onStartDecline,
  session,
}: {
  busy: Busy
  capture: CaptureValue | null
  declineReason: string
  declining: boolean
  onCancelDecline: () => void
  onCapture: (value: CaptureValue | null) => void
  onDecline: (event: FormEvent<HTMLFormElement>) => void
  onDeclineReasonChange: (value: string) => void
  onReread: () => void
  onSign: () => void
  onStartDecline: () => void
  session: SigningSession
}) {
  const working = busy !== null

  return (
    <div className="space-y-5">
      <div className="rounded-none border bg-card p-5 shadow-sm sm:p-7">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Add your signature
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your signature is placed in the positions the sender prepared, with
          your name and the time you signed.
        </p>

        <div className="mt-5">
          <SignatureCapture
            disabled={working}
            onChange={onCapture}
            signatoryName={session.signatoryName}
          />
        </div>

        <Button
          className="mt-6 w-full rounded-none"
          disabled={working || capture === null}
          onClick={onSign}
          size="lg"
          type="button"
        >
          {busy === "sign" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <PenLine />
          )}
          Sign this document
        </Button>
        <Button
          className="mt-2 w-full rounded-none"
          disabled={working}
          onClick={onReread}
          size="sm"
          type="button"
          variant="ghost"
        >
          <BookOpenCheck />
          Read the document again
        </Button>
      </div>

      <div className="rounded-none border bg-card p-5 shadow-sm sm:p-7">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          If you cannot sign this
        </h2>
        {declining ? (
          <form className="mt-3" onSubmit={onDecline}>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="decline-reason"
            >
              Reason for declining
            </label>
            <textarea
              autoFocus
              className="field-input h-auto min-h-24 py-2.5"
              disabled={working}
              id="decline-reason"
              maxLength={MAX_DECLINE_REASON_CHARACTERS}
              onChange={(event) => onDeclineReasonChange(event.target.value)}
              required
              value={declineReason}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              The sender is told that you declined and is shown this reason.
              This link closes once you confirm.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                className="rounded-none"
                disabled={working || declineReason.trim().length === 0}
                type="submit"
                variant="destructive"
              >
                {busy === "decline" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <X />
                )}
                Confirm decline
              </Button>
              <Button
                className="rounded-none"
                disabled={working}
                onClick={onCancelDecline}
                type="button"
                variant="ghost"
              >
                Keep signing
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You can decline instead. The sender is told, along with the reason
              you give.
            </p>
            <Button
              className="mt-4 rounded-none"
              disabled={working}
              onClick={onStartDecline}
              type="button"
              variant="outline"
            >
              Decline to sign
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** True when the link has stopped working, which is how a lockout surfaces. */
async function hasBecomeUnavailable(token: string): Promise<boolean> {
  try {
    await signingRequest<SigningSessionResponse>(token, "/api/signing/session")
    return false
  } catch (error) {
    return error instanceof SigningApiError && error.status === 404
  }
}

function noticeFor(error: unknown): Notice {
  return {
    tone: "error",
    message: signingMessageForError(error),
    reference: signingErrorReference(error),
  }
}
