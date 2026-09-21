"use client"

import { type FormEvent, useMemo, useRef, useState } from "react"
import { Check, LoaderCircle, Plus } from "lucide-react"

import {
  Field,
  ManagementDialog,
  NoticeBanner,
  documentNoticeForError,
  type Notice,
} from "@/components/admin/admin-ui"
import { Button } from "@/components/ui/button"
import { ApiError, apiRequest } from "@/lib/api/client"
import type {
  DocumentType,
  DocumentTypeConfiguration,
  DocumentTypeMutationResponse,
  SigningMode,
} from "@/lib/api/types"
import { signingModes } from "@/lib/api/types"
import {
  changedConfiguration,
  documentTypeDefaults,
  documentTypeLimits,
  formatBytes,
  invalidAttachmentKeys,
  normalizeAttachmentKeys,
  signingModeDescriptions,
  signingModeLabels,
} from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

type FormState = {
  code: string
  name: string
  category: string
  isActive: boolean
  maxFileSizeBytes: string
  retentionPeriodMonths: string
  disposalAction: string
  legalBasis: string
  signingMode: SigningMode
  signingLinkExpiryHours: string
  requiresOtp: boolean
  approvalReminderIntervalHours: string
  signingReminderIntervalHours: string
  reminderMaxCount: string
  requiredAttachmentKeys: string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

function initialState(
  documentType: DocumentTypeConfiguration | null
): FormState {
  if (!documentType) {
    return {
      code: "",
      name: "",
      category: "",
      isActive: true,
      maxFileSizeBytes: String(documentTypeDefaults.maxFileSizeBytes),
      retentionPeriodMonths: String(documentTypeDefaults.retentionPeriodMonths),
      disposalAction: "",
      legalBasis: "",
      signingMode: documentTypeDefaults.signingMode,
      signingLinkExpiryHours: String(
        documentTypeDefaults.signingLinkExpiryHours
      ),
      requiresOtp: documentTypeDefaults.requiresOtp,
      approvalReminderIntervalHours: String(
        documentTypeDefaults.approvalReminderIntervalHours
      ),
      signingReminderIntervalHours: String(
        documentTypeDefaults.signingReminderIntervalHours
      ),
      reminderMaxCount: String(documentTypeDefaults.reminderMaxCount),
      requiredAttachmentKeys: "",
    }
  }

  return {
    code: documentType.code,
    name: documentType.name,
    category: documentType.category,
    isActive: documentType.isActive,
    maxFileSizeBytes: String(documentType.maxFileSizeBytes),
    retentionPeriodMonths: String(documentType.retentionPeriodMonths),
    disposalAction: documentType.disposalAction,
    legalBasis: documentType.legalBasis,
    signingMode: documentType.signingMode,
    signingLinkExpiryHours: String(documentType.signingLinkExpiryHours),
    requiresOtp: documentType.requiresOtp,
    approvalReminderIntervalHours: String(
      documentType.approvalReminderIntervalHours
    ),
    signingReminderIntervalHours: String(
      documentType.signingReminderIntervalHours
    ),
    reminderMaxCount: String(documentType.reminderMaxCount),
    requiredAttachmentKeys: documentType.requiredAttachmentKeys.join(", "),
  }
}

export function DocumentTypeFormDialog({
  documentType,
  onClose,
  onConflict,
  onSaved,
}: {
  documentType: DocumentTypeConfiguration | null
  onClose: () => void
  onConflict: () => void
  onSaved: (documentType: DocumentType, message: string) => void
}) {
  const [form, setForm] = useState<FormState>(() => initialState(documentType))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const action = useRef<{ fingerprint: string; key: string } | null>(null)
  const formElement = useRef<HTMLFormElement>(null)

  const editing = documentType !== null
  const attachmentKeys = useMemo(
    () => normalizeAttachmentKeys(form.requiredAttachmentKeys),
    [form.requiredAttachmentKeys]
  )

  function update<Key extends keyof FormState>(
    key: Key,
    value: FormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {}

    if (!editing) {
      const code = form.code.trim().toUpperCase()
      if (
        code.length < documentTypeLimits.code.min ||
        code.length > documentTypeLimits.code.max ||
        !/^[A-Za-z0-9_-]+$/u.test(code)
      ) {
        errors.code = `Use ${documentTypeLimits.code.min}–${documentTypeLimits.code.max} characters: letters, digits, hyphen, or underscore.`
      }
    }
    if (!form.name.trim()) errors.name = "Enter a name."
    if (!form.category.trim()) errors.category = "Enter a category."
    if (!form.disposalAction.trim()) {
      errors.disposalAction =
        "Describe the disposal action for retained records."
    }
    if (!form.legalBasis.trim()) {
      errors.legalBasis = "Record the legal basis for retaining this document."
    }

    assignRangeError(
      errors,
      "maxFileSizeBytes",
      form.maxFileSizeBytes,
      documentTypeLimits.maxFileSizeBytes,
      `Enter a whole number of bytes between 1 and ${documentTypeLimits.maxFileSizeBytes.max.toLocaleString()}.`
    )
    assignRangeError(
      errors,
      "retentionPeriodMonths",
      form.retentionPeriodMonths,
      documentTypeLimits.retentionPeriodMonths,
      "Enter a retention period between 1 and 1200 months."
    )
    assignRangeError(
      errors,
      "signingLinkExpiryHours",
      form.signingLinkExpiryHours,
      documentTypeLimits.signingLinkExpiryHours,
      "Enter a signing-link expiry between 1 and 2160 hours."
    )
    assignRangeError(
      errors,
      "approvalReminderIntervalHours",
      form.approvalReminderIntervalHours,
      documentTypeLimits.reminderIntervalHours,
      "Enter an approval reminder interval between 1 and 2160 hours."
    )
    assignRangeError(
      errors,
      "signingReminderIntervalHours",
      form.signingReminderIntervalHours,
      documentTypeLimits.reminderIntervalHours,
      "Enter a signing reminder interval between 1 and 2160 hours."
    )
    assignRangeError(
      errors,
      "reminderMaxCount",
      form.reminderMaxCount,
      documentTypeLimits.reminderMaxCount,
      "Enter a reminder maximum between 0 and 20."
    )

    if (attachmentKeys.length > documentTypeLimits.attachmentKeyCount.max) {
      errors.requiredAttachmentKeys = `Use at most ${documentTypeLimits.attachmentKeyCount.max} attachment keys.`
    } else {
      const invalid = invalidAttachmentKeys(attachmentKeys)
      if (invalid.length > 0) {
        errors.requiredAttachmentKeys = `Keys may use only letters, digits, hyphen, and underscore: ${invalid.join(", ")}`
      }
    }

    return errors
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setNotice({
        tone: "error",
        message: "Some values still need attention before this can be saved.",
      })
      const firstInvalid = formElement.current?.querySelector<HTMLElement>(
        "[aria-invalid='true']"
      )
      firstInvalid?.focus()
      return
    }

    const configuration = {
      name: form.name.trim(),
      category: form.category.trim(),
      maxFileSizeBytes: Number(form.maxFileSizeBytes),
      retentionPeriodMonths: Number(form.retentionPeriodMonths),
      disposalAction: form.disposalAction.trim(),
      legalBasis: form.legalBasis.trim(),
      signingMode: form.signingMode,
      signingLinkExpiryHours: Number(form.signingLinkExpiryHours),
      requiresOtp: form.requiresOtp,
      approvalReminderIntervalHours: Number(form.approvalReminderIntervalHours),
      signingReminderIntervalHours: Number(form.signingReminderIntervalHours),
      reminderMaxCount: Number(form.reminderMaxCount),
      requiredAttachmentKeys: attachmentKeys,
    }

    const body: Record<string, unknown> = editing
      ? {
          ...changedConfiguration(documentType, configuration),
          ...(documentType.isActive === form.isActive
            ? {}
            : { isActive: form.isActive }),
        }
      : { code: form.code.trim().toUpperCase(), ...configuration }

    if (editing && Object.keys(body).length === 0) {
      setNotice({
        tone: "warning",
        message: "Nothing has changed yet, so there is nothing to save.",
      })
      return
    }

    setBusy(true)
    setNotice(null)
    try {
      // One key per distinct action, reused for retries of that same action.
      const fingerprint = JSON.stringify(body)
      if (action.current?.fingerprint !== fingerprint) {
        action.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<DocumentTypeMutationResponse>(
        editing
          ? `/api/admin/document-types/${encodeURIComponent(documentType.id)}`
          : "/api/admin/document-types",
        {
          method: editing ? "PATCH" : "POST",
          idempotencyKey: action.current.key,
          body,
        }
      )

      onSaved(
        response.documentType,
        editing
          ? `${response.documentType.name} was updated.`
          : `${response.documentType.name} was created. Publish a PDF template and an approval matrix to make it usable.`
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        onConflict()
        return
      }
      setNotice(documentNoticeForError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ManagementDialog
      description={
        editing
          ? `Update ${documentType.code}. Changes apply to documents created after they are saved; workflows already in progress keep the configuration they started with.`
          : "Define the policy a Sender's draft inherits. A template and an approval matrix are published separately."
      }
      onClose={onClose}
      title={editing ? documentType.name : "New document type"}
      wide
    >
      {notice && (
        <div className="mt-5">
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      <form
        className="mt-5 space-y-6"
        noValidate
        onSubmit={submit}
        ref={formElement}
      >
        <section aria-labelledby="identity-heading" className="space-y-4">
          <h3 className="text-sm font-semibold" id="identity-heading">
            Identity
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              description={
                editing
                  ? "The code is fixed after creation."
                  : "Uppercase reference used across configuration and audit records."
              }
              htmlFor="type-code"
              label="Code"
            >
              <input
                autoFocus={!editing}
                className="field-input font-mono uppercase"
                disabled={editing}
                id="type-code"
                maxLength={documentTypeLimits.code.max}
                onChange={(event) =>
                  update("code", event.target.value.toUpperCase())
                }
                value={form.code}
                {...errorProps("type-code", fieldErrors.code)}
              />
              <FieldError error={fieldErrors.code} id="type-code" />
            </Field>
            <Field htmlFor="type-category" label="Category">
              <input
                className="field-input"
                id="type-category"
                maxLength={documentTypeLimits.category.max}
                onChange={(event) => update("category", event.target.value)}
                value={form.category}
                {...errorProps("type-category", fieldErrors.category, false)}
              />
              <FieldError error={fieldErrors.category} id="type-category" />
            </Field>
          </div>
          <Field htmlFor="type-name" label="Name">
            <input
              autoFocus={editing}
              className="field-input"
              id="type-name"
              maxLength={documentTypeLimits.name.max}
              onChange={(event) => update("name", event.target.value)}
              value={form.name}
              {...errorProps("type-name", fieldErrors.name, false)}
            />
            <FieldError error={fieldErrors.name} id="type-name" />
          </Field>

          {editing && (
            <ToggleRow
              checked={form.isActive}
              description="Inactive types remain available here for administration but cannot be used for new drafts."
              id="type-active"
              label="Active"
              onChange={(value) => update("isActive", value)}
            />
          )}
        </section>

        <Divider />

        <section aria-labelledby="retention-heading" className="space-y-4">
          <h3 className="text-sm font-semibold" id="retention-heading">
            File policy and retention
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              description={`At most ${documentTypeLimits.maxFileSizeBytes.max.toLocaleString()} bytes. Currently ${formatBytes(
                Number(form.maxFileSizeBytes) || 0
              )}.`}
              htmlFor="type-max-size"
              label="Maximum PDF size (bytes)"
            >
              <input
                className="field-input"
                id="type-max-size"
                inputMode="numeric"
                onChange={(event) =>
                  update("maxFileSizeBytes", event.target.value)
                }
                value={form.maxFileSizeBytes}
                {...errorProps("type-max-size", fieldErrors.maxFileSizeBytes)}
              />
              <FieldError
                error={fieldErrors.maxFileSizeBytes}
                id="type-max-size"
              />
            </Field>
            <Field
              description="1 to 1200 months."
              htmlFor="type-retention"
              label="Retention period (months)"
            >
              <input
                className="field-input"
                id="type-retention"
                inputMode="numeric"
                onChange={(event) =>
                  update("retentionPeriodMonths", event.target.value)
                }
                value={form.retentionPeriodMonths}
                {...errorProps(
                  "type-retention",
                  fieldErrors.retentionPeriodMonths
                )}
              />
              <FieldError
                error={fieldErrors.retentionPeriodMonths}
                id="type-retention"
              />
            </Field>
          </div>
          <Field
            description="What happens when the retention period ends. The backend never destroys records automatically."
            htmlFor="type-disposal"
            label="Disposal action"
          >
            <input
              className="field-input"
              id="type-disposal"
              maxLength={documentTypeLimits.disposalAction.max}
              onChange={(event) => update("disposalAction", event.target.value)}
              value={form.disposalAction}
              {...errorProps("type-disposal", fieldErrors.disposalAction)}
            />
            <FieldError error={fieldErrors.disposalAction} id="type-disposal" />
          </Field>
          <Field
            description={`Up to ${documentTypeLimits.legalBasis.max} characters.`}
            htmlFor="type-legal-basis"
            label="Legal basis"
          >
            <textarea
              className="field-input h-24 resize-y py-3"
              id="type-legal-basis"
              maxLength={documentTypeLimits.legalBasis.max}
              onChange={(event) => update("legalBasis", event.target.value)}
              value={form.legalBasis}
              {...errorProps("type-legal-basis", fieldErrors.legalBasis)}
            />
            <FieldError error={fieldErrors.legalBasis} id="type-legal-basis" />
          </Field>
        </section>

        <Divider />

        <section aria-labelledby="signing-heading" className="space-y-4">
          <h3 className="text-sm font-semibold" id="signing-heading">
            Signing
          </h3>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Signing mode</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {signingModes.map((mode) => (
                <label
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                    form.signingMode === mode
                      ? "border-emerald-700/35 bg-emerald-50/70 dark:bg-emerald-950/35"
                      : "hover:bg-muted/50"
                  )}
                  key={mode}
                >
                  <input
                    checked={form.signingMode === mode}
                    className="mt-0.5 size-4 accent-emerald-700"
                    name="signing-mode"
                    onChange={() => update("signingMode", mode)}
                    type="radio"
                    value={mode}
                  />
                  <span>
                    <span className="block text-xs font-bold tracking-wide">
                      {signingModeLabels[mode]}
                    </span>
                    <span className="mt-1 block text-[0.7rem] leading-4 text-muted-foreground">
                      {signingModeDescriptions[mode]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              description="1 to 2160 hours (90 days)."
              htmlFor="type-expiry"
              label="Signing-link expiry (hours)"
            >
              <input
                className="field-input"
                id="type-expiry"
                inputMode="numeric"
                onChange={(event) =>
                  update("signingLinkExpiryHours", event.target.value)
                }
                value={form.signingLinkExpiryHours}
                {...errorProps(
                  "type-expiry",
                  fieldErrors.signingLinkExpiryHours
                )}
              />
              <FieldError
                error={fieldErrors.signingLinkExpiryHours}
                id="type-expiry"
              />
            </Field>
            <div className="flex items-end">
              <ToggleRow
                checked={form.requiresOtp}
                description="Signatories must enter a one-time code emailed to them before they can open the document."
                id="type-otp"
                label="Require a one-time code"
                onChange={(value) => update("requiresOtp", value)}
              />
            </div>
          </div>
        </section>

        <Divider />

        <section aria-labelledby="reminder-heading" className="space-y-4">
          <h3 className="text-sm font-semibold" id="reminder-heading">
            Reminders
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              description="1 to 2160 hours."
              htmlFor="type-approval-reminder"
              label="Approval reminder (hours)"
            >
              <input
                className="field-input"
                id="type-approval-reminder"
                inputMode="numeric"
                onChange={(event) =>
                  update("approvalReminderIntervalHours", event.target.value)
                }
                value={form.approvalReminderIntervalHours}
                {...errorProps(
                  "type-approval-reminder",
                  fieldErrors.approvalReminderIntervalHours
                )}
              />
              <FieldError
                error={fieldErrors.approvalReminderIntervalHours}
                id="type-approval-reminder"
              />
            </Field>
            <Field
              description="1 to 2160 hours."
              htmlFor="type-signing-reminder"
              label="Signing reminder (hours)"
            >
              <input
                className="field-input"
                id="type-signing-reminder"
                inputMode="numeric"
                onChange={(event) =>
                  update("signingReminderIntervalHours", event.target.value)
                }
                value={form.signingReminderIntervalHours}
                {...errorProps(
                  "type-signing-reminder",
                  fieldErrors.signingReminderIntervalHours
                )}
              />
              <FieldError
                error={fieldErrors.signingReminderIntervalHours}
                id="type-signing-reminder"
              />
            </Field>
            <Field
              description="0 disables reminders."
              htmlFor="type-reminder-max"
              label="Maximum reminders"
            >
              <input
                className="field-input"
                id="type-reminder-max"
                inputMode="numeric"
                onChange={(event) =>
                  update("reminderMaxCount", event.target.value)
                }
                value={form.reminderMaxCount}
                {...errorProps(
                  "type-reminder-max",
                  fieldErrors.reminderMaxCount
                )}
              />
              <FieldError
                error={fieldErrors.reminderMaxCount}
                id="type-reminder-max"
              />
            </Field>
          </div>
        </section>

        <Divider />

        <section aria-labelledby="attachment-heading" className="space-y-3">
          <h3 className="text-sm font-semibold" id="attachment-heading">
            Required attachments
          </h3>
          <Field
            description={`Separate keys with commas or spaces. They are stored in upper case; at most ${documentTypeLimits.attachmentKeyCount.max}.`}
            htmlFor="type-attachments"
            label="Attachment keys"
          >
            <input
              className="field-input font-mono"
              id="type-attachments"
              onChange={(event) =>
                update("requiredAttachmentKeys", event.target.value)
              }
              placeholder="VALID_ID, MEDICAL_CERTIFICATE"
              value={form.requiredAttachmentKeys}
              {...errorProps(
                "type-attachments",
                fieldErrors.requiredAttachmentKeys
              )}
            />
            <FieldError
              error={fieldErrors.requiredAttachmentKeys}
              id="type-attachments"
            />
          </Field>
          {attachmentKeys.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {attachmentKeys.map((key) => (
                <li
                  className="rounded-full border bg-muted/40 px-2.5 py-1 font-mono text-[0.62rem] font-bold tracking-wide"
                  key={key}
                >
                  {key}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            className="rounded-xl"
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={busy} type="submit">
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : editing ? (
              <Check />
            ) : (
              <Plus />
            )}
            {busy
              ? "Saving…"
              : editing
                ? "Save configuration"
                : "Create document type"}
          </Button>
        </div>
      </form>
    </ManagementDialog>
  )
}

function assignRangeError(
  errors: FieldErrors,
  key: keyof FormState,
  raw: string,
  range: { min: number; max: number },
  message: string
): void {
  const value = Number(raw)
  if (
    raw.trim() === "" ||
    !Number.isInteger(value) ||
    value < range.min ||
    value > range.max
  ) {
    Object.assign(errors, { [key]: message })
  }
}

function errorProps(
  id: string,
  error: string | undefined,
  hasDescription = true
) {
  const described = [
    error ? `${id}-error` : null,
    hasDescription ? `${id}-description` : null,
  ]
    .filter(Boolean)
    .join(" ")
  return {
    "aria-describedby": described || undefined,
    "aria-invalid": error ? true : undefined,
  } as const
}

function FieldError({ error, id }: { error?: string; id: string }) {
  if (!error) return null
  return (
    <p
      className="mt-1.5 text-xs leading-5 font-medium text-red-700 dark:text-red-400"
      id={`${id}-error`}
      role="alert"
    >
      {error}
    </p>
  )
}

function ToggleRow({
  checked,
  description,
  id,
  label,
  onChange,
}: {
  checked: boolean
  description: string
  id: string
  label: string
  onChange: (value: boolean) => void
}) {
  return (
    <label
      className="flex w-full cursor-pointer gap-3 rounded-xl border p-3 transition hover:bg-muted/50"
      htmlFor={id}
    >
      <input
        checked={checked}
        className="mt-0.5 size-4 accent-emerald-700"
        id={id}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        <span className="block text-xs font-bold tracking-wide">{label}</span>
        <span className="mt-1 block text-[0.7rem] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  )
}

function Divider() {
  return <div className="h-px bg-border" />
}
