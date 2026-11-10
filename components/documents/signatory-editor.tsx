"use client"

import { ArrowDown, ArrowUp, Info, Trash2, UserPlus } from "lucide-react"

import { Field } from "@/components/admin/admin-ui"
import { Button } from "@/components/ui/button"
import type { DraftSignatoryInput, SignatoryKind } from "@/lib/api/types"
import { signatoryKinds } from "@/lib/api/types"
import {
  draftLimits,
  type DraftProblem,
  referenceFromName,
  signatoryDetailFields,
  signatoryKindDescriptions,
  signatoryKindLabels,
} from "@/lib/documents/drafts"
import { paletteFor } from "@/components/documents/page-surface"
import { cn } from "@/lib/utils"

export function emptySignatory(taken: readonly string[]): DraftSignatoryInput {
  return {
    reference: referenceFromName("Signatory", taken),
    kind: "WORKER",
    fullName: "",
    emailAddress: "",
    organization: "",
    position: "",
  }
}

export function SignatoryEditor({
  detailsUnavailable = false,
  onChange,
  problems,
  recordedIdentities = [],
  signatories,
}: {
  detailsUnavailable?: boolean
  onChange: (signatories: DraftSignatoryInput[]) => void
  problems: DraftProblem[]
  /**
   * `kind:email` pairs the API has already recorded. The backend writes a
   * person row only the first time it sees one, and never updates it, so
   * detail inputs for these are locked rather than silently discarded.
   */
  recordedIdentities?: readonly string[]
  signatories: DraftSignatoryInput[]
}) {
  function update(index: number, changes: Partial<DraftSignatoryInput>) {
    onChange(
      signatories.map((signatory, position) =>
        position === index ? { ...signatory, ...changes } : signatory
      )
    )
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= signatories.length) return
    const next = [...signatories]
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    onChange(next)
  }

  function problemFor(index: number, key: string): string | undefined {
    return problems.find(
      (problem) => problem.path === `signatories.${index}.${key}`
    )?.message
  }

  return (
    <div className="space-y-3">
      {detailsUnavailable && signatories.length > 0 && (
        <p className="flex gap-2.5 rounded-none border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          Candidate, worker, and representative details are recorded once per
          person, the first time that person is seen. They are shown here but
          cannot be changed from this draft; saving again leaves them as they
          are.
        </p>
      )}

      <ol className="space-y-3">
        {signatories.map((signatory, index) => {
          const prefix = `signatory-${index}`
          const details = signatoryDetailFields[signatory.kind]
          const locked = recordedIdentities.includes(
            `${signatory.kind}:${signatory.emailAddress.trim().toLowerCase()}`
          )
          return (
            <li
              className="rounded-none border bg-card p-4 shadow-xs"
              key={index}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-none border-2 text-sm font-bold",
                      paletteFor(index)
                    )}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {signatory.fullName.trim() || "New signatory"}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {signatory.reference || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    aria-label={`Move signatory ${index + 1} earlier in the signing order`}
                    className="rounded-none"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    aria-label={`Move signatory ${index + 1} later in the signing order`}
                    className="rounded-none"
                    disabled={index === signatories.length - 1}
                    onClick={() => move(index, 1)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    aria-label={`Remove signatory ${index + 1}`}
                    className="rounded-none"
                    onClick={() =>
                      onChange(signatories.filter((_, at) => at !== index))
                    }
                    size="icon-sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field htmlFor={`${prefix}-kind`} label="Signatory kind">
                  <select
                    className="field-input h-11"
                    id={`${prefix}-kind`}
                    onChange={(event) =>
                      update(index, {
                        kind: event.target.value as SignatoryKind,
                      })
                    }
                    value={signatory.kind}
                  >
                    {signatoryKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {signatoryKindLabels[kind]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {signatoryKindDescriptions[signatory.kind]}
                  </p>
                </Field>

                <Field
                  description="Used to link fields to this signatory. Letters, digits, hyphen, and underscore only."
                  htmlFor={`${prefix}-reference`}
                  label="Reference"
                >
                  <input
                    aria-describedby={`${prefix}-reference-description`}
                    aria-invalid={
                      problemFor(index, "reference") ? true : undefined
                    }
                    className="field-input font-mono"
                    id={`${prefix}-reference`}
                    maxLength={draftLimits.reference.max}
                    onChange={(event) =>
                      update(index, {
                        reference: event.target.value.toUpperCase(),
                      })
                    }
                    value={signatory.reference}
                  />
                  <Problem
                    id={`${prefix}-reference`}
                    message={problemFor(index, "reference")}
                  />
                </Field>

                <Field htmlFor={`${prefix}-full-name`} label="Full name">
                  <input
                    aria-invalid={
                      problemFor(index, "fullName") ? true : undefined
                    }
                    className="field-input"
                    id={`${prefix}-full-name`}
                    maxLength={draftLimits.fullName.max}
                    onChange={(event) => {
                      const fullName = event.target.value
                      const taken = signatories
                        .filter((_, at) => at !== index)
                        .map((entry) => entry.reference)
                      const autoReference =
                        !signatory.fullName.trim() ||
                        signatory.reference ===
                          referenceFromName(signatory.fullName, taken)
                      update(index, {
                        fullName,
                        ...(autoReference
                          ? { reference: referenceFromName(fullName, taken) }
                          : {}),
                      })
                    }}
                    value={signatory.fullName}
                  />
                  <Problem
                    id={`${prefix}-full-name`}
                    message={problemFor(index, "fullName")}
                  />
                </Field>

                <Field htmlFor={`${prefix}-email`} label="Email address">
                  <input
                    aria-invalid={
                      problemFor(index, "emailAddress") ? true : undefined
                    }
                    autoCapitalize="none"
                    className="field-input"
                    id={`${prefix}-email`}
                    onChange={(event) =>
                      update(index, { emailAddress: event.target.value })
                    }
                    type="email"
                    value={signatory.emailAddress}
                  />
                  <Problem
                    id={`${prefix}-email`}
                    message={problemFor(index, "emailAddress")}
                  />
                </Field>

                <Field htmlFor={`${prefix}-organization`} label="Organization">
                  <input
                    aria-invalid={
                      problemFor(index, "organization") ? true : undefined
                    }
                    className="field-input"
                    id={`${prefix}-organization`}
                    maxLength={draftLimits.organization.max}
                    onChange={(event) =>
                      update(index, { organization: event.target.value })
                    }
                    value={signatory.organization}
                  />
                  <Problem
                    id={`${prefix}-organization`}
                    message={problemFor(index, "organization")}
                  />
                </Field>

                <Field htmlFor={`${prefix}-position`} label="Position">
                  <input
                    aria-invalid={
                      problemFor(index, "position") ? true : undefined
                    }
                    className="field-input"
                    id={`${prefix}-position`}
                    maxLength={draftLimits.position.max}
                    onChange={(event) =>
                      update(index, { position: event.target.value })
                    }
                    value={signatory.position}
                  />
                  <Problem
                    id={`${prefix}-position`}
                    message={problemFor(index, "position")}
                  />
                </Field>

                <Field
                  htmlFor={`${prefix}-mobile`}
                  label="Mobile phone (optional)"
                >
                  <input
                    className="field-input"
                    id={`${prefix}-mobile`}
                    maxLength={draftLimits.phone.max}
                    onChange={(event) =>
                      update(index, { mobilePhone: event.target.value })
                    }
                    value={signatory.mobilePhone ?? ""}
                  />
                </Field>

                {details.map((detail) => (
                  <Field
                    description={
                      locked
                        ? "Already recorded for this person and cannot be changed here."
                        : undefined
                    }
                    htmlFor={`${prefix}-${detail.key}`}
                    key={detail.key}
                    label={`${detail.label} (optional)`}
                  >
                    <input
                      className="field-input"
                      disabled={locked}
                      id={`${prefix}-${detail.key}`}
                      maxLength={detail.maxLength}
                      onChange={(event) =>
                        update(index, { [detail.key]: event.target.value })
                      }
                      type={detail.type ?? "text"}
                      value={signatory[detail.key] ?? ""}
                    />
                  </Field>
                ))}
              </div>
            </li>
          )
        })}
      </ol>

      <Button
        className="rounded-none"
        disabled={signatories.length >= draftLimits.signatories.max}
        onClick={() =>
          onChange([
            ...signatories,
            emptySignatory(signatories.map((entry) => entry.reference)),
          ])
        }
        size="sm"
        type="button"
        variant="outline"
      >
        <UserPlus />
        Add signatory
      </Button>
    </div>
  )
}

function Problem({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p
      className="mt-1.5 text-xs leading-5 font-medium text-red-700 dark:text-red-400"
      id={`${id}-error`}
      role="alert"
    >
      {message}
    </p>
  )
}
