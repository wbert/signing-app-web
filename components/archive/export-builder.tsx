"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CircleAlert, Download, LoaderCircle, Package } from "lucide-react"

import {
  ManagementDialog,
  NoticeBanner,
  type Notice,
} from "@/components/admin/admin-ui"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  ExportPackage,
  ExportPreviewResponse,
  ExportResponse,
} from "@/lib/api/types"
import {
  type ArchiveFilters,
  archiveMessageForCode,
  createExportIdempotencyKey,
  filenameFromContentDisposition,
  filtersToQuery,
  formatBytes,
  MAX_PURPOSE_CHARACTERS,
  validatePurpose,
} from "@/lib/archive/archive"

/**
 * Builds an export in three visible steps: preview what would be included,
 * state a purpose, then download.
 *
 * The API assembles the ZIP inside the create request and answers with the
 * finished package, so there is nothing to poll. One idempotency key is made
 * when the export is first requested and kept for every retry of that same
 * request, so a lost response cannot produce two packages.
 */
export function ExportBuilder({
  filters,
  onClose,
}: {
  filters: ArchiveFilters
  onClose: () => void
}) {
  const idempotencyKey = useRef<string | null>(null)
  const [preview, setPreview] = useState<ExportPreviewResponse | null>(null)
  const [created, setCreated] = useState<ExportPackage | null>(null)
  const [purpose, setPurpose] = useState("")
  const [busy, setBusy] = useState<"preview" | "create" | "download" | null>(
    null
  )
  const [notice, setNotice] = useState<Notice | null>(null)

  const loadPreview = useCallback(async () => {
    setBusy("preview")
    setNotice(null)
    try {
      const response = await apiRequest<ExportPreviewResponse>(
        "/api/exports/preview",
        {
          method: "POST",
          // The preview needs a purpose to satisfy the schema, but it reads
          // nothing and logs no access; the real purpose is collected below.
          body: { purpose: "Export size preview", filters: asPayload(filters) },
        }
      )
      setPreview(response)
    } catch (error) {
      setNotice(noticeFor(error))
    } finally {
      setBusy(null)
    }
  }, [filters])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPreview(), 0)
    return () => window.clearTimeout(timer)
  }, [loadPreview])

  async function create() {
    const invalid = validatePurpose(purpose)
    if (invalid) {
      setNotice({ tone: "error", message: invalid })
      return
    }

    idempotencyKey.current ??= createExportIdempotencyKey()
    setBusy("create")
    setNotice(null)
    try {
      const response = await apiRequest<ExportResponse>("/api/exports", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        body: { purpose: purpose.trim(), filters: asPayload(filters) },
      })
      setCreated(response.export)
    } catch (error) {
      setNotice(noticeFor(error))
    } finally {
      setBusy(null)
    }
  }

  async function download(packageId: string) {
    setBusy("download")
    setNotice(null)
    try {
      const response = await apiRequest<Response>(
        `/api/exports/${encodeURIComponent(packageId)}/download`
      )
      const fileName = filenameFromContentDisposition(
        response.headers.get("content-disposition")
      )
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement("a")
        anchor.href = objectUrl
        anchor.download = fileName
        anchor.rel = "noopener"
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      setNotice(noticeFor(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <ManagementDialog
      description="Export the archive records matching your current filters as a single ZIP, with every executed document and completion certificate."
      onClose={onClose}
      title="Export archive records"
      wide
    >
      <div className="mt-6 space-y-5">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}

        {busy === "preview" && !preview ? (
          <p
            className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Measuring this export…
          </p>
        ) : preview ? (
          <>
            <div className="rounded-none border bg-muted/25 px-5 py-4">
              <p className="text-sm font-semibold">
                {preview.count === 0
                  ? "No records match these filters"
                  : `${preview.count} ${preview.count === 1 ? "record" : "records"} · about ${formatBytes(preview.estimatedBytes)}`}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                An export may contain at most {preview.limit.maxItems} records
                and {formatBytes(preview.limit.maxBytes)}.
              </p>
              {!preview.canCreate && preview.count > 0 && (
                <p
                  className="mt-3 flex items-start gap-2 text-xs leading-5 font-semibold text-amber-800 dark:text-amber-300"
                  role="alert"
                >
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  This selection is over the limit. Narrow the filters before
                  creating the export.
                </p>
              )}
            </div>

            {created ? (
              <CreatedPackage
                busy={busy === "download"}
                onDownload={() => void download(created.id)}
                packageView={created}
              />
            ) : (
              <>
                <div>
                  <label
                    className="mb-2 block text-sm font-semibold"
                    htmlFor="export-purpose"
                  >
                    Why is this export needed?
                  </label>
                  <textarea
                    className="field-input h-auto min-h-24 py-2.5"
                    disabled={busy !== null || !preview.canCreate}
                    id="export-purpose"
                    maxLength={MAX_PURPOSE_CHARACTERS}
                    onChange={(event) => setPurpose(event.target.value)}
                    required
                    value={purpose}
                  />
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    Recorded in the audit trail with your name, the filters
                    used, and every record included.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    className="rounded-none"
                    disabled={busy !== null}
                    onClick={onClose}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="rounded-none"
                    disabled={busy !== null || !preview.canCreate}
                    onClick={() => void create()}
                    type="button"
                  >
                    {busy === "create" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Package />
                    )}
                    Create export
                  </Button>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </ManagementDialog>
  )
}

function CreatedPackage({
  busy,
  onDownload,
  packageView,
}: {
  busy: boolean
  onDownload: () => void
  packageView: ExportPackage
}) {
  const missing = packageView.items.filter((item) => item.status === "MISSING")

  return (
    <div>
      <div className="rounded-none border bg-card px-5 py-4">
        <p className="text-sm font-semibold">
          {packageView.itemCount}{" "}
          {packageView.itemCount === 1 ? "record" : "records"} packaged ·{" "}
          {formatBytes(packageView.totalByteLength)}
        </p>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          The download link is available for a short time only. If it lapses,
          create the export again.
        </p>
      </div>

      {missing.length > 0 && (
        <div
          className="mt-4 rounded-none border border-amber-300/70 bg-amber-50 px-5 py-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100"
          role="alert"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CircleAlert className="size-4" />
            {missing.length}{" "}
            {missing.length === 1 ? "record is" : "records are"} missing from
            this export
          </p>
          <p className="mt-1.5 text-sm leading-6">
            Their files could not be read from storage, so the ZIP is
            incomplete. The records below are listed so the gap is on the record
            rather than silently omitted.
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            {missing.map((item) => (
              <li key={item.archiveRecordId}>
                <span className="font-mono">{item.archiveRecordId}</span>
                {item.errorCode ? ` · ${item.errorCode}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button className="rounded-none" disabled={busy} onClick={onDownload}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
          Download ZIP
        </Button>
      </div>
    </div>
  )
}

/** The API's filter schema is strict, so undefined keys are dropped entirely. */
function asPayload(filters: ArchiveFilters): Record<string, string> {
  return Object.fromEntries(filtersToQuery(filters).entries())
}

function noticeFor(error: unknown): Notice {
  const mapped =
    error instanceof ApiError ? archiveMessageForCode(error.code) : null
  return {
    tone: "error",
    message: mapped ?? userMessageForApiError(error),
    reference: errorReference(error),
  }
}
