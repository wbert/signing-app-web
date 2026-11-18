"use client"

import { type FormEvent, useState } from "react"
import { Check, Copy, KeyRound, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  apiRequest,
  errorReference,
  userMessageForApiError,
} from "@/lib/api/client"
import type { GenerateBackupCodesResponse } from "@/lib/api/types"

/**
 * Lets a signed-in user replace their backup codes. The codes are only ever
 * held in component state: they are shown once, never stored, and generating a
 * new set invalidates every earlier one.
 */
export function BackupCodes() {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setReference(null)
    setCopied(false)
    try {
      const result = await apiRequest<GenerateBackupCodesResponse>(
        "/api/auth/two-factor/generate-backup-codes",
        { method: "POST", body: { password } }
      )
      setCodes(result.backupCodes)
      setPassword("")
    } catch (failure) {
      setCodes([])
      setMessage(userMessageForApiError(failure))
      setReference(errorReference(failure))
    } finally {
      setBusy(false)
    }
  }

  async function copyCodes() {
    await navigator.clipboard.writeText(codes.join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <div className="mb-8 flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center border border-emerald-900/10 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <KeyRound aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-[-0.03em]">
            Backup codes
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use a backup code to sign in if you lose access to your
            authenticator app. Each code works once. Generating a new set
            immediately invalidates your previous codes.
          </p>
        </div>
      </div>

      {message && (
        <div
          className="mb-5 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
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

      <form className="space-y-5" onSubmit={generate}>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="backup-password"
          >
            Confirm your password
          </label>
          <input
            autoComplete="current-password"
            className="field-input"
            id="backup-password"
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        <Button disabled={busy || !password} type="submit">
          {busy && <LoaderCircle className="animate-spin" />}
          {codes.length > 0 ? "Generate new codes" : "Generate backup codes"}
        </Button>
      </form>

      {codes.length > 0 && (
        <div className="mt-8 border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Save these codes now — they won&apos;t be shown again
            </p>
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:underline dark:text-amber-200"
              onClick={copyCodes}
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
            {codes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
