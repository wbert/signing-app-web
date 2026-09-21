"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  userMessageForApiError,
} from "@/lib/api/client"

type View = "loading" | "ready" | "invalid" | "complete"

export function SetPasswordForm() {
  const resetLink = useRef<{
    error: string | null
    token: string | null
  } | null>(null)
  const [view, setView] = useState<View>("loading")
  const [token, setToken] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)

  useEffect(() => {
    if (!resetLink.current) {
      const parameters = new URLSearchParams(window.location.search)
      resetLink.current = {
        error: parameters.get("error"),
        token: parameters.get("token"),
      }

      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname
      )
    }

    const { error: resetError, token: resetToken } = resetLink.current

    const updateState = window.setTimeout(() => {
      if (resetError || !resetToken) {
        setView("invalid")
        return
      }

      setToken(resetToken)
      setView("ready")
    }, 0)

    return () => window.clearTimeout(updateState)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setReference(null)

    if (!token) {
      setView("invalid")
      return
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.")
      return
    }

    setBusy(true)
    try {
      await apiRequest<{ status: boolean }>("/api/auth/reset-password", {
        method: "POST",
        body: { newPassword: password, token },
      })
      setToken(null)
      setPassword("")
      setConfirmation("")
      setView("complete")
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code.includes("INVALID_TOKEN") || error.code.includes("EXPIRED"))
      ) {
        setToken(null)
        setView("invalid")
        return
      }
      setMessage(userMessageForApiError(error))
      setReference(errorReference(error))
    } finally {
      setBusy(false)
    }
  }

  if (view === "loading") {
    return (
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" />
        Checking your secure link…
      </div>
    )
  }

  if (view === "invalid") {
    return (
      <StatusCard
        description="This password link is invalid, expired, or has already been used. Ask your administrator to issue a new setup link."
        icon={<ShieldAlert className="size-6" />}
        title="This link is no longer available"
      />
    )
  }

  if (view === "complete") {
    return (
      <StatusCard
        description="Your password is ready. Sign in with your assigned username, then complete authenticator setup."
        icon={<CheckCircle2 className="size-6" />}
        title="Password created"
      >
        <Button className="mt-6 rounded-xl" render={<Link href="/login" />}>
          Continue to sign in
          <ArrowRight />
        </Button>
      </StatusCard>
    )
  }

  return (
    <div className="w-full max-w-[29rem]">
      <div className="mb-8">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-emerald-900/10 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <KeyRound className="size-5" />
        </div>
        <p className="mb-2 text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase dark:text-emerald-400">
          Secure account setup
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Create your password
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Use at least 12 characters. After this step, you&apos;ll sign in and
          connect an authenticator app.
        </p>
      </div>

      {message && (
        <div
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-950 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          <p>{message}</p>
          {reference && (
            <p className="mt-1 font-mono text-[0.68rem] opacity-70">
              Reference {reference}
            </p>
          )}
        </div>
      )}

      <form className="space-y-5" onSubmit={submit}>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="new-password"
          >
            New password
          </label>
          <div className="relative">
            <input
              autoComplete="new-password"
              autoFocus
              className="field-input pr-12"
              id="new-password"
              maxLength={128}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground transition hover:text-foreground"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="confirm-password"
          >
            Confirm password
          </label>
          <input
            autoComplete="new-password"
            className="field-input"
            id="confirm-password"
            maxLength={128}
            minLength={12}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type={showPassword ? "text" : "password"}
            value={confirmation}
          />
        </div>

        <Button
          className="w-full rounded-xl"
          disabled={busy}
          size="lg"
          type="submit"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
          {busy ? "Creating password…" : "Create password"}
        </Button>
      </form>
    </div>
  )
}

function StatusCard({
  children,
  description,
  icon,
  title,
}: {
  children?: React.ReactNode
  description: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="max-w-md text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        {icon}
      </div>
      <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {children}
    </div>
  )
}
