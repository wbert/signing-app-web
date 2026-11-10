"use client"

import { type FormEvent, useRef, useState } from "react"
import { FileText, LoaderCircle, Upload } from "lucide-react"

import {
  ManagementDialog,
  NoticeBanner,
  documentNoticeForError,
  type Notice,
} from "@/components/admin/admin-ui"
import { Button } from "@/components/ui/button"
import { ApiError, apiRequest } from "@/lib/api/client"
import type {
  DocumentTemplateResponse,
  DocumentTemplateVersion,
  DocumentTypeConfiguration,
} from "@/lib/api/types"
import {
  effectiveUploadLimitBytes,
  formatBytes,
  formatTimestamp,
  hasPdfSignature,
  looksLikePdf,
  MAX_PDF_UPLOAD_BYTES,
} from "@/lib/documents/document-types"

export function TemplateUploadDialog({
  documentType,
  onClose,
  onConflict,
  onPublished,
}: {
  documentType: DocumentTypeConfiguration
  onClose: () => void
  onConflict: () => void
  onPublished: (template: DocumentTemplateVersion, message: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const action = useRef<{ fingerprint: string; key: string } | null>(null)

  const limit = effectiveUploadLimitBytes(documentType.maxFileSizeBytes)
  const current = documentType.currentTemplate

  async function selectFile(selected: File | null) {
    setNotice(null)
    setFileError(null)
    setFile(null)
    if (!selected) return

    if (!looksLikePdf(selected)) {
      setFileError("Select a PDF file. Other file types are not accepted.")
      return
    }
    if (selected.size === 0) {
      setFileError("The selected file is empty.")
      return
    }
    if (selected.size > limit) {
      setFileError(
        `The file is ${formatBytes(selected.size)}. This type accepts at most ${formatBytes(limit)}${
          documentType.maxFileSizeBytes < MAX_PDF_UPLOAD_BYTES
            ? " under its file-size policy."
            : ", the API upload limit."
        }`
      )
      return
    }

    setChecking(true)
    try {
      if (!(await hasPdfSignature(selected))) {
        setFileError(
          "The file does not start with a PDF signature, so the API would reject it."
        )
        return
      }
      setFile(selected)
    } finally {
      setChecking(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy) return

    setBusy(true)
    setNotice(null)
    try {
      // FormData is passed through untouched so the browser sets the
      // multipart boundary itself.
      const body = new FormData()
      body.append("file", file)

      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`
      if (action.current?.fingerprint !== fingerprint) {
        action.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<DocumentTemplateResponse>(
        `/api/admin/document-types/${encodeURIComponent(documentType.id)}/templates`,
        { method: "POST", idempotencyKey: action.current.key, body }
      )

      onPublished(
        response.template,
        `Template version ${response.template.versionNumber} was published with ${response.template.pageCount} ${
          response.template.pageCount === 1 ? "page" : "pages"
        }.`
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
      description={`Publish a new PDF template version for ${documentType.code}. Existing documents keep the version they were created with.`}
      onClose={onClose}
      title="PDF template"
    >
      {notice && (
        <div className="mt-5">
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      <section
        aria-labelledby="current-template-heading"
        className="mt-5 rounded-none border bg-muted/25 p-4"
      >
        <h3 className="text-sm font-semibold" id="current-template-heading">
          Current template
        </h3>
        {current ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Detail
              label="Version"
              value={`Version ${current.versionNumber}`}
            />
            <Detail
              label="Pages"
              value={`${current.pageCount} ${current.pageCount === 1 ? "page" : "pages"}`}
            />
            <Detail
              label="Original file name"
              value={current.originalFileName}
            />
            <Detail
              label="Published"
              value={formatTimestamp(current.createdAt)}
            />
          </dl>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No template has been published yet, so Senders cannot create a draft
            from this type.
          </p>
        )}
      </section>

      <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="template-file"
          >
            PDF file
          </label>
          <input
            accept="application/pdf,.pdf"
            aria-describedby={
              fileError ? "template-file-error" : "template-file-description"
            }
            aria-invalid={fileError ? true : undefined}
            className="field-input h-auto cursor-pointer py-3 file:mr-3 file:rounded-none file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            id="template-file"
            onChange={(event) =>
              void selectFile(event.target.files?.[0] ?? null)
            }
            type="file"
          />
          <p
            className="mt-1.5 text-xs leading-5 text-muted-foreground"
            id="template-file-description"
          >
            PDF only, at most {formatBytes(limit)} (the lower of this
            type&rsquo;s {formatBytes(documentType.maxFileSizeBytes)} policy and
            the {formatBytes(MAX_PDF_UPLOAD_BYTES)} API limit). The API
            re-validates the file and remains authoritative.
          </p>
          {fileError && (
            <p
              className="mt-1.5 text-xs leading-5 font-medium text-red-700 dark:text-red-400"
              id="template-file-error"
              role="alert"
            >
              {fileError}
            </p>
          )}
        </div>

        <div aria-live="polite">
          {checking && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Checking the file…
            </p>
          )}
          {file && !checking && (
            <p className="flex items-center gap-2 rounded-none border bg-card px-3 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
            </p>
          )}
        </div>

        <p className="rounded-none border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          Publishing creates a new immutable version and makes it current for
          new drafts. Documents already created keep the template version they
          were prepared with.
        </p>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button
            className="rounded-none"
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="rounded-none"
            disabled={busy || checking || !file}
            type="submit"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
            {busy ? "Uploading…" : "Publish template"}
          </Button>
        </div>
      </form>
    </ManagementDialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate">{value}</dd>
    </div>
  )
}
