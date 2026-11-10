"use client"

import { type FormEvent, useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"

import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  EnableTotpResponse,
  MeResponse,
  SignInResponse,
} from "@/lib/api/types"

type Step = "credentials" | "challenge" | "enroll" | "enroll-verify"

export function LoginForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("credentials")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [totpUri, setTotpUri] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [setupKeyCopied, setSetupKeyCopied] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("reason") !== "session-expired") return

    url.searchParams.delete("reason")
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    )

    const updateMessage = window.setTimeout(() => {
      setMessage("Your session expired. Sign in again to continue.")
    }, 0)

    return () => window.clearTimeout(updateMessage)
  }, [])

  async function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      const result = await apiRequest<SignInResponse>(
        "/api/auth/sign-in/username",
        {
          method: "POST",
          body: { username: username.trim(), password },
        }
      )

      setPassword("")
      if (result.twoFactorRedirect) {
        setStep("challenge")
        return
      }

      await finishAuthentication()
    })
  }

  async function handleChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      await apiRequest("/api/auth/two-factor/verify-totp", {
        method: "POST",
        body: { code, trustDevice: false },
      })
      setCode("")
      await finishAuthentication()
    })
  }

  async function handleEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      const result = await apiRequest<EnableTotpResponse>(
        "/api/auth/two-factor/enable",
        {
          method: "POST",
          body: { password, method: "totp" },
        }
      )
      setPassword("")
      setTotpUri(result.totpURI)
      setBackupCodes(result.backupCodes ?? [])
      setStep("enroll-verify")
    })
  }

  async function finishAuthentication() {
    try {
      await apiRequest<MeResponse>("/api/me")
      router.replace("/dashboard")
      router.refresh()
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "MFA_ENROLLMENT_REQUIRED"
      ) {
        setStep("enroll")
        setMessage(null)
        setReference(null)
        return
      }
      throw error
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage(null)
    setReference(null)
    try {
      await action()
    } catch (error) {
      setMessage(userMessageForApiError(error))
      setReference(errorReference(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyBackupCodes() {
    await navigator.clipboard.writeText(backupCodes.join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function copySetupKey() {
    const setupKey = getTotpSetupKey(totpUri)
    if (!setupKey) return

    await navigator.clipboard.writeText(setupKey)
    setSetupKeyCopied(true)
    window.setTimeout(() => setSetupKeyCopied(false), 2000)
  }

  const isTotp = step === "challenge" || step === "enroll-verify"
  const totpSetupKey = getTotpSetupKey(totpUri)

  return (
    <div className="w-full max-w-[29rem]">
      <div className="mb-9">
        <div className="mb-5 flex size-12 items-center justify-center rounded-none border border-emerald-900/10 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {step === "credentials" ? (
            <LockKeyhole aria-hidden="true" className="size-5" />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-5" />
          )}
        </div>
        <p className="mb-2 text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase dark:text-emerald-400">
          {step === "credentials"
            ? "Secure staff access"
            : "Two-step verification"}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
          {step === "credentials" && "Welcome back"}
          {step === "challenge" && "Enter your security code"}
          {step === "enroll" && "Protect your account"}
          {step === "enroll-verify" && "Connect your authenticator"}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {step === "credentials" &&
            "Use the username issued by your administrator. All staff accounts require multi-factor authentication."}
          {step === "challenge" &&
            "Open your authenticator app and enter the current six-digit code."}
          {step === "enroll" &&
            "Your account needs an authenticator before you can access documents. Confirm your password to begin."}
          {step === "enroll-verify" &&
            "Add the account to your authenticator, then enter a code to finish enrollment."}
        </p>
      </div>

      {message && (
        <div
          className="mb-5 rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-950 dark:bg-red-950/40 dark:text-red-200"
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

      {step === "credentials" && (
        <form className="space-y-5" onSubmit={handleCredentials}>
          <Field label="Username" htmlFor="username">
            <input
              autoComplete="username"
              autoFocus
              className="field-input"
              id="username"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <div className="relative">
              <input
                autoComplete="current-password"
                className="field-input pr-12"
                id="password"
                minLength={12}
                name="password"
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
          </Field>
          <SubmitButton busy={busy} label="Continue securely" />
        </form>
      )}

      {step === "enroll" && (
        <form className="space-y-5" onSubmit={handleEnrollment}>
          <Field label="Confirm password" htmlFor="enrollment-password">
            <input
              autoComplete="current-password"
              autoFocus
              className="field-input"
              id="enrollment-password"
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          <SubmitButton busy={busy} label="Set up authenticator" />
        </form>
      )}

      {step === "enroll-verify" && totpUri && (
        <div className="mb-5 rounded-none border bg-muted/35 p-4">
          <div className="text-center">
            <p className="text-sm font-semibold">
              Scan with your authenticator
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Works with Google Authenticator, Microsoft Authenticator,
              1Password, and other TOTP apps.
            </p>
            <div className="mx-auto mt-4 w-fit rounded-none border bg-white p-3 shadow-sm">
              <QRCodeSVG
                level="M"
                size={184}
                title="Authenticator setup QR code"
                value={totpUri}
              />
            </div>
          </div>

          {totpSetupKey && (
            <div className="mt-4 rounded-none border bg-background/80 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 shrink-0 text-emerald-700" />
                  <p className="text-xs font-semibold">Manual setup key</p>
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline dark:text-emerald-300"
                  onClick={copySetupKey}
                  type="button"
                >
                  {setupKeyCopied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {setupKeyCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 font-mono text-xs tracking-[0.12em] break-all text-foreground">
                {totpSetupKey}
              </p>
            </div>
          )}

          <div className="mt-4 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
              Setting up on this device?
            </p>
            <p>
              <a
                className="text-xs font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-400"
                href={totpUri}
              >
                Open in your authenticator app
              </a>
            </p>
          </div>
        </div>
      )}

      {step === "enroll-verify" && backupCodes.length > 0 && (
        <div className="mb-5 rounded-none border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Save your recovery codes now
            </p>
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:underline dark:text-amber-200"
              onClick={copyBackupCodes}
              type="button"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-amber-950 dark:text-amber-100">
            {backupCodes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
        </div>
      )}

      {isTotp && (
        <form className="space-y-5" onSubmit={handleChallenge}>
          <Field label="Six-digit code" htmlFor="totp-code">
            <input
              autoComplete="one-time-code"
              autoFocus
              className="field-input text-center font-mono text-xl tracking-[0.45em]"
              id="totp-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/gu, ""))
              }
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              value={code}
            />
          </Field>
          <SubmitButton
            busy={busy}
            label={
              step === "challenge" ? "Verify and continue" : "Finish setup"
            }
          />
        </form>
      )}

      {step === "challenge" && (
        <button
          className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => {
            setStep("credentials")
            setCode("")
            setMessage(null)
          }}
          type="button"
        >
          <ArrowLeft className="size-3.5" />
          Use a different account
        </button>
      )}
    </div>
  )
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode
  htmlFor: string
  label: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <Button
      className="w-full rounded-none"
      disabled={busy}
      size="lg"
      type="submit"
    >
      {busy ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <ArrowRight aria-hidden="true" />
      )}
      {busy ? "Checking…" : label}
    </Button>
  )
}

function getTotpSetupKey(uri: string | null): string | null {
  if (!uri) return null

  try {
    const parsed = new URL(uri)
    if (parsed.protocol !== "otpauth:") return null
    return parsed.searchParams.get("secret")
  } catch {
    return null
  }
}
