"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Check, CircleAlert, LoaderCircle, RefreshCw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError, userMessageForApiError } from "@/lib/api/client"
import { cn } from "@/lib/utils"

export type Notice = {
  tone: "success" | "error" | "warning"
  message: string
  reference?: string | null
}

const noticeTones: Record<Notice["tone"], string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-100",
  error:
    "border-red-200 bg-red-50 text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100",
  warning:
    "border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100",
}

export function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: Notice
  onDismiss?: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm",
        noticeTones[notice.tone]
      )}
      role={notice.tone === "success" ? "status" : "alert"}
    >
      <div className="flex gap-2.5">
        {notice.tone === "success" ? (
          <Check className="mt-0.5 size-4 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
        )}
        <div>
          <p className="leading-5">{notice.message}</p>
          {notice.reference && (
            <p className="mt-1 font-mono text-[0.68rem] opacity-65">
              Support reference {notice.reference}
            </p>
          )}
        </div>
      </div>
      {onDismiss && (
        <button
          aria-label="Dismiss message"
          className="shrink-0 rounded-lg p-1 opacity-60 hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          onClick={onDismiss}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function ManagementDialog({
  children,
  description,
  onClose,
  title,
  wide = false,
}: {
  children: React.ReactNode
  description: string
  onClose: () => void
  title: string
  wide?: boolean
}) {
  return (
    <Dialog.Root onOpenChange={(open) => !open && onClose()} open>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-emerald-950/45 backdrop-blur-[2px]" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid items-end overflow-y-auto p-0 sm:items-center sm:justify-items-center sm:p-6">
          <Dialog.Popup
            className={cn(
              "max-h-[95svh] w-full overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-2xl outline-none sm:rounded-3xl sm:p-7",
              wide ? "sm:max-w-3xl" : "sm:max-w-2xl"
            )}
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <Dialog.Title className="font-heading text-2xl font-semibold tracking-tight">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Field({
  children,
  description,
  htmlFor,
  label,
}: {
  children: React.ReactNode
  description?: string
  htmlFor: string
  label: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {description && (
        <p
          className="mt-1.5 text-xs leading-5 text-muted-foreground"
          id={`${htmlFor}-description`}
        >
          {description}
        </p>
      )}
    </div>
  )
}

export function FullPageStatus({ message }: { message: string }) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f5f7f3] dark:bg-background">
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" />
        {message}
      </div>
    </main>
  )
}

export function FullPageError({
  heading,
  notice,
  onRetry,
}: {
  heading: string
  notice: Notice
  onRetry: () => void
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f5f7f3] p-6 dark:bg-background">
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 text-center shadow-sm">
        <CircleAlert className="mx-auto size-7 text-red-700" />
        <h1 className="mt-4 font-heading text-xl font-semibold">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {notice.message}
        </p>
        {notice.reference && (
          <p className="mt-2 font-mono text-[0.68rem] text-muted-foreground">
            Support reference {notice.reference}
          </p>
        )}
        <Button className="mt-5 rounded-xl" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    </main>
  )
}

const documentConfigurationMessages: Record<string, string> = {
  VALIDATION_ERROR:
    "The configuration was rejected by the API. Check the highlighted values and try again.",
  DOCUMENT_TYPE_NOT_FOUND:
    "This document type no longer exists. Refresh the list.",
  DOCUMENT_TYPE_CODE_EXISTS:
    "That document-type code is already in use. Choose a different code.",
  INVALID_PDF: "The selected file is not a PDF.",
  EMPTY_DOCUMENT: "The selected PDF is empty or has no pages.",
  DOCUMENT_TOO_LARGE:
    "The PDF is larger than the file-size policy configured for this type.",
  UNSAFE_PDF_CONTENT:
    "The PDF contains active or embedded content that is not accepted.",
  UNREADABLE_PDF: "The PDF is corrupt, encrypted, or unreadable.",
  PAYLOAD_TOO_LARGE: "The request exceeded the 4.5 MB API limit.",
  DOCUMENT_STORAGE_UNAVAILABLE:
    "Document storage is temporarily unavailable. Nothing was published; try again shortly.",
  MANDATORY_APPROVAL_REQUIRED:
    "An approval matrix must contain at least one mandatory step.",
  APPROVAL_STEPS_NOT_CONTIGUOUS:
    "Approval step numbers must run contiguously from one.",
  INVALID_PARALLEL_GROUP:
    "Parallel flags must match the number of approvers at each step.",
  DUPLICATE_APPROVER_ROLE:
    "An approver role may appear only once within a parallel step.",
}

export function documentNoticeForError(error: unknown): Notice {
  if (!(error instanceof ApiError)) {
    return { tone: "error", message: userMessageForApiError(error) }
  }

  return {
    tone: "error",
    message:
      documentConfigurationMessages[error.code] ??
      userMessageForApiError(error),
    reference: error.requestId,
  }
}
