"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Upload,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  Field,
  FullPageError,
  FullPageStatus,
  NoticeBanner,
  documentNoticeForError,
  type Notice,
} from "@/components/admin/admin-ui"
import { DocumentShell } from "@/components/documents/document-shell"
import { FieldPlacement } from "@/components/documents/field-placement"
import type { PlacedField } from "@/components/documents/page-surface"
import {
  emptySignatory,
  SignatoryEditor,
} from "@/components/documents/signatory-editor"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  DocumentTypeConfiguration,
  DocumentTypesResponse,
  DraftResponse,
  DraftSignatoryInput,
  MeResponse,
  PageGeometry,
} from "@/lib/api/types"
import { can } from "@/lib/auth/capabilities"
import {
  draftLimits,
  type DraftProblem,
  toFieldPayload,
  toSignatoryPayload,
  validateFields,
  validateSignatories,
} from "@/lib/documents/drafts"
import {
  effectiveUploadLimitBytes,
  formatBytes,
  MAX_PDF_UPLOAD_BYTES,
  usabilityBlockers,
} from "@/lib/documents/document-types"
import {
  inspectPdfSource,
  PdfInspectionError,
  pdfInspectionMessages,
} from "@/lib/documents/pdf-source"
import { cn } from "@/lib/utils"

const steps = ["Document", "Signatories", "Fields", "Review"] as const
type Step = 0 | 1 | 2 | 3

export function DraftStart() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [documentTypes, setDocumentTypes] = useState<
    DocumentTypeConfiguration[]
  >([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [step, setStep] = useState<Step>(0)

  const [documentTypeId, setDocumentTypeId] = useState("")
  const [title, setTitle] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [geometry, setGeometry] = useState<PageGeometry[] | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState(false)

  const [signatories, setSignatories] = useState<DraftSignatoryInput[]>([
    emptySignatory([]),
  ])
  const [fields, setFields] = useState<PlacedField[]>([])
  const [problems, setProblems] = useState<DraftProblem[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [creating, setCreating] = useState(false)
  const action = useRef<{ fingerprint: string; key: string } | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [currentSession, response] = await Promise.all([
        apiRequest<MeResponse>("/api/me"),
        apiRequest<DocumentTypesResponse>("/api/document-types"),
      ])
      if (!can(currentSession.capabilities, "documents:create")) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setSession(currentSession)
      setDocumentTypes(response.documentTypes)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      if (error instanceof ApiError && error.status === 403) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setLoadError({
        tone: "error",
        message: userMessageForApiError(error),
        reference: errorReference(error),
      })
    } finally {
      setLoading(false)
    }
  }, [redirectToExpiredSessionLogin, router])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  const selectedType =
    documentTypes.find((entry) => entry.id === documentTypeId) ?? null
  const uploadLimit = selectedType
    ? effectiveUploadLimitBytes(selectedType.maxFileSizeBytes)
    : MAX_PDF_UPLOAD_BYTES

  async function selectFile(selected: File | null) {
    setFileError(null)
    setFile(null)
    setGeometry(null)
    setPdfBytes(null)
    setFields([])
    if (!selected) return

    if (
      selected.type
        ? selected.type !== "application/pdf"
        : !selected.name.toLowerCase().endsWith(".pdf")
    ) {
      setFileError("Select a PDF file. Other file types are not accepted.")
      return
    }
    if (selected.size === 0) {
      setFileError("The selected file is empty.")
      return
    }
    if (selected.size > uploadLimit) {
      setFileError(
        `The file is ${formatBytes(selected.size)}. This document type accepts at most ${formatBytes(uploadLimit)}.`
      )
      return
    }

    setInspecting(true)
    try {
      const inspected = await inspectPdfSource(selected)
      setFile(selected)
      setGeometry(inspected.pageGeometry)
      setPdfBytes(inspected.bytes)
    } catch (error) {
      setFileError(
        error instanceof PdfInspectionError
          ? error.message
          : pdfInspectionMessages.UNREADABLE_PDF
      )
    } finally {
      setInspecting(false)
    }
  }

  function validateStep(target: Step): DraftProblem[] {
    if (target === 0) {
      const found: DraftProblem[] = []
      if (!selectedType) {
        found.push({
          path: "documentTypeId",
          message: "Choose a document type.",
        })
      }
      if (
        title.trim().length < draftLimits.title.min ||
        title.trim().length > draftLimits.title.max
      ) {
        found.push({
          path: "title",
          message: "Enter a title for this document.",
        })
      }
      if (!file || !geometry) {
        found.push({ path: "file", message: "Select a readable PDF." })
      }
      return found
    }
    if (target === 1) return validateSignatories(signatories)
    if (target === 2) {
      return validateFields(fields, {
        references: signatories.map((entry) => entry.reference),
        pageCount: geometry?.length ?? 0,
      })
    }
    return []
  }

  function goNext() {
    const found = validateStep(step)
    setProblems(found)
    if (found.length > 0) return
    setProblems([])
    setStep((current) => Math.min(3, current + 1) as Step)
  }

  async function create() {
    const found = [0, 1, 2].flatMap((target) => validateStep(target as Step))
    setProblems(found)
    if (found.length > 0 || !file || !selectedType) {
      setNotice({
        tone: "error",
        message:
          "Some details still need attention before this can be created.",
      })
      return
    }

    setCreating(true)
    setNotice(null)
    try {
      const metadata = {
        title: title.trim(),
        documentTypeId: selectedType.id,
        signatories: signatories.map(toSignatoryPayload),
        fields: fields.map(toFieldPayload),
      }
      // FormData is sent untouched so the browser sets the multipart boundary.
      const body = new FormData()
      body.append("file", file)
      body.append("metadata", JSON.stringify(metadata))

      const fingerprint = `${file.name}:${file.size}:${file.lastModified}:${JSON.stringify(metadata)}`
      if (action.current?.fingerprint !== fingerprint) {
        action.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<DraftResponse>("/api/documents", {
        method: "POST",
        idempotencyKey: action.current.key,
        body,
      })
      router.push(`/documents/${response.document.id}`)
    } catch (error) {
      setNotice(documentNoticeForError(error))
      setCreating(false)
    }
  }

  if (loading) return <FullPageStatus message="Loading document preparation…" />
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to start a document"
        notice={loadError}
        onRetry={() => void load()}
      />
    )
  }
  if (!session) return null

  const usableTypes = documentTypes.filter((entry) => entry.isUsableForDraft)
  const blockedTypes = documentTypes.filter((entry) => !entry.isUsableForDraft)

  return (
    <DocumentShell
      backHref="/documents"
      backLabel="Documents"
      eyebrow="Document preparation"
      intro="Upload the PDF, identify the people who must sign it, and place their signing fields. The draft stays private to you until you submit it."
      session={session}
      title="Prepare a document"
    >
      <ol className="mt-8 flex flex-wrap gap-2" aria-label="Progress">
        {steps.map((label, index) => (
          <li key={label}>
            <span
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-none border px-3 py-1.5 text-xs font-semibold",
                index === step
                  ? "border-emerald-700/35 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200"
                  : index < step
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60"
              )}
            >
              <span className="grid size-5 place-items-center rounded-full border text-[0.6rem]">
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="mt-6">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}
      </div>

      <section className="mt-6 rounded-none border bg-card p-5 shadow-sm sm:p-6">
        {step === 0 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold">Document type</legend>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The type fixes the retention policy, signing mode, reminders,
                and approval path this document will follow.
              </p>
              {usableTypes.length === 0 ? (
                <p className="mt-3 rounded-none border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
                  No document type is ready for drafts. An administrator must
                  publish a PDF template for at least one active type first.
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {usableTypes.map((entry) => (
                    <label
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-none border p-3 transition focus-within:ring-2 focus-within:ring-ring/30",
                        documentTypeId === entry.id
                          ? "border-emerald-700/35 bg-emerald-50/70 dark:bg-emerald-950/35"
                          : "hover:bg-muted/50"
                      )}
                      key={entry.id}
                    >
                      <input
                        checked={documentTypeId === entry.id}
                        className="mt-0.5 size-4 accent-emerald-700"
                        name="document-type"
                        onChange={() => {
                          setDocumentTypeId(entry.id)
                          setFile(null)
                          setGeometry(null)
                          setPdfBytes(null)
                          setFileError(null)
                        }}
                        type="radio"
                        value={entry.id}
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold tracking-wide">
                          {entry.name}
                        </span>
                        <span className="mt-1 block text-[0.7rem] leading-4 text-muted-foreground">
                          {entry.category} · PDF up to{" "}
                          {formatBytes(
                            effectiveUploadLimitBytes(entry.maxFileSizeBytes)
                          )}
                          {entry.isUsableForSubmission
                            ? ""
                            : " · not yet submittable"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {blockedTypes.length > 0 && (
                <details className="mt-3 rounded-none border bg-muted/25 p-3">
                  <summary className="cursor-pointer text-xs font-semibold">
                    {blockedTypes.length} type
                    {blockedTypes.length === 1 ? "" : "s"} cannot be used yet
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {blockedTypes.map((entry) => (
                      <li className="text-xs leading-5" key={entry.id}>
                        <span className="font-semibold">{entry.name}</span>
                        <ul className="mt-0.5 list-disc pl-5 text-muted-foreground">
                          {usabilityBlockers(entry)
                            .filter((blocker) => blocker.scope === "DRAFT")
                            .map((blocker) => (
                              <li key={blocker.code}>{blocker.message}</li>
                            ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </fieldset>

            <Field
              description="Shown to approvers and recorded in the audit trail."
              htmlFor="draft-title"
              label="Title"
            >
              <input
                aria-describedby="draft-title-description"
                aria-invalid={
                  problems.some((problem) => problem.path === "title")
                    ? true
                    : undefined
                }
                className="field-input"
                id="draft-title"
                maxLength={draftLimits.title.max}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </Field>

            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="draft-file"
              >
                PDF document
              </label>
              <input
                accept="application/pdf,.pdf"
                aria-describedby={
                  fileError ? "draft-file-error" : "draft-file-description"
                }
                aria-invalid={fileError ? true : undefined}
                className="field-input h-auto cursor-pointer py-3 file:mr-3 file:rounded-none file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                disabled={!selectedType}
                id="draft-file"
                onChange={(event) =>
                  void selectFile(event.target.files?.[0] ?? null)
                }
                type="file"
              />
              <p
                className="mt-1.5 text-xs leading-5 text-muted-foreground"
                id="draft-file-description"
              >
                {selectedType
                  ? `PDF only, at most ${formatBytes(uploadLimit)}. The page sizes are read in your browser so fields can be placed before upload; the API re-validates the file and stays authoritative.`
                  : "Choose a document type first so its file-size policy can be applied."}
              </p>
              {fileError && (
                <p
                  className="mt-1.5 text-xs leading-5 font-medium text-red-700 dark:text-red-400"
                  id="draft-file-error"
                  role="alert"
                >
                  {fileError}
                </p>
              )}
              <div aria-live="polite" className="mt-3">
                {inspecting && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Reading the PDF…
                  </p>
                )}
                {file && geometry && !inspecting && (
                  <p className="flex items-center gap-2 rounded-none border bg-background px-3 py-2.5 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {geometry.length}{" "}
                      {geometry.length === 1 ? "page" : "pages"} ·{" "}
                      {formatBytes(file.size)}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <SignatoryEditor
            onChange={setSignatories}
            problems={problems}
            signatories={signatories}
          />
        )}

        {step === 2 && geometry && (
          <FieldPlacement
            fields={fields}
            onChange={setFields}
            pages={geometry}
            pdfBytes={pdfBytes}
            pdfSourceKey={
              file ? `${file.name}:${file.size}:${file.lastModified}` : "none"
            }
            problems={problems}
            signatories={signatories}
          />
        )}

        {step === 3 && selectedType && file && geometry && (
          <ReviewSummary
            documentType={selectedType}
            fields={fields}
            file={file}
            pageCount={geometry.length}
            signatories={signatories}
            title={title}
          />
        )}

        {problems.length > 0 && step !== 2 && (
          <div
            className="mt-5 rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
            role="alert"
          >
            <p className="font-semibold">Before continuing:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {problems.map((problem) => (
                <li key={`${problem.path}-${problem.message}`}>
                  {problem.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
          <Button
            className="rounded-none"
            disabled={step === 0 || creating}
            onClick={() => {
              setProblems([])
              setStep((current) => Math.max(0, current - 1) as Step)
            }}
            type="button"
            variant="outline"
          >
            <ArrowLeft />
            Back
          </Button>
          {step < 3 ? (
            <Button className="rounded-none" onClick={goNext} type="button">
              Continue
              <ArrowRight />
            </Button>
          ) : (
            <Button
              className="rounded-none"
              disabled={creating}
              onClick={() => void create()}
              type="button"
            >
              {creating ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              {creating ? "Creating draft…" : "Create draft"}
            </Button>
          )}
        </div>
      </section>
    </DocumentShell>
  )
}

function ReviewSummary({
  documentType,
  fields,
  file,
  pageCount,
  signatories,
  title,
}: {
  documentType: DocumentTypeConfiguration
  fields: PlacedField[]
  file: File
  pageCount: number
  signatories: DraftSignatoryInput[]
  title: string
}) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Summary label="Title" value={title.trim()} />
        <Summary
          label="Document type"
          value={`${documentType.name} (${documentType.code})`}
        />
        <Summary
          label="File"
          value={`${file.name} · ${pageCount} ${pageCount === 1 ? "page" : "pages"} · ${formatBytes(file.size)}`}
        />
        <Summary
          label="Signatories"
          value={`${signatories.length} · ${fields.length} ${fields.length === 1 ? "field" : "fields"}`}
        />
      </dl>

      <div className="rounded-none border bg-muted/25 p-4">
        <h3 className="text-sm font-semibold">Signing order</h3>
        <ol className="mt-2 space-y-1 text-sm">
          {signatories.map((signatory, index) => (
            <li key={signatory.reference}>
              {index + 1}. {signatory.fullName.trim() || signatory.reference} ·{" "}
              {signatory.emailAddress.trim().toLowerCase()} ·{" "}
              {countFields(fields, signatory.reference)}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {documentType.signingMode === "SEQUENTIAL"
            ? "This type signs sequentially, so each signatory is invited only after the previous one signs."
            : "This type invites every signatory at the same time."}
        </p>
      </div>

      {documentType.requiredAttachmentKeys.length > 0 && (
        <p className="rounded-none border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          This type requires {documentType.requiredAttachmentKeys.length}{" "}
          attachment
          {documentType.requiredAttachmentKeys.length === 1 ? "" : "s"}. You can
          add them once the draft exists.
        </p>
      )}

      {!documentType.isUsableForSubmission && (
        <p className="rounded-none border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          This type is not ready for submission yet, so the draft can be saved
          but not sent for approval until an administrator finishes configuring
          it.
        </p>
      )}
    </div>
  )
}

function countFields(fields: PlacedField[], reference: string): string {
  const total = fields.filter(
    (field) => field.signatoryReference === reference
  ).length
  return `${total} ${total === 1 ? "field" : "fields"}`
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words">{value}</dd>
    </div>
  )
}
