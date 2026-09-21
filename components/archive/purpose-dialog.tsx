"use client"

import { type FormEvent, useState } from "react"
import { LoaderCircle, ShieldQuestion } from "lucide-react"

import { ManagementDialog } from "@/components/admin/admin-ui"
import { Button } from "@/components/ui/button"
import { MAX_PURPOSE_CHARACTERS, validatePurpose } from "@/lib/archive/archive"

/**
 * Every archive action that touches a record is logged against a stated
 * purpose, so the purpose is collected in front of the action rather than
 * afterwards. Nothing is sent until this form is satisfied, and the purpose is
 * never placed in the page URL.
 */
export function PurposeDialog({
  busy,
  confirmLabel,
  description,
  onClose,
  onSubmit,
  title,
}: {
  busy: boolean
  confirmLabel: string
  description: string
  onClose: () => void
  onSubmit: (purpose: string) => void
  title: string
}) {
  const [purpose, setPurpose] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = validatePurpose(purpose)
    if (invalid) {
      setProblem(invalid)
      return
    }
    setProblem(null)
    onSubmit(purpose.trim())
  }

  return (
    <ManagementDialog description={description} onClose={onClose} title={title}>
      <form className="mt-6" onSubmit={submit}>
        <label className="mb-2 block text-sm font-semibold" htmlFor="purpose">
          Why do you need this record?
        </label>
        <textarea
          aria-describedby="purpose-description"
          autoFocus
          className="field-input h-auto min-h-24 py-2.5"
          disabled={busy}
          id="purpose"
          maxLength={MAX_PURPOSE_CHARACTERS}
          onChange={(event) => setPurpose(event.target.value)}
          required
          value={purpose}
        />
        <p
          className="mt-1.5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"
          id="purpose-description"
        >
          <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
          This is written to the audit trail with your name and the time, and
          cannot be changed afterwards.
        </p>

        {problem && (
          <p className="mt-3 text-xs leading-5 text-red-700" role="alert">
            {problem}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            className="rounded-xl"
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={busy} type="submit">
            {busy && <LoaderCircle className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </ManagementDialog>
  )
}
