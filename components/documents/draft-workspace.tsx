"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CircleAlert,
  Eye,
  FileText,
  GitBranch,
  LoaderCircle,
  Paperclip,
  Save,
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
import { SignatoryEditor } from "@/components/documents/signatory-editor"
import {
  SenderApprovalView,
  SubmissionPanel,
} from "@/components/documents/submission"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  ApprovalDocument,
  ApprovalDocumentResponse,
  Draft,
  DraftAttachmentResponse,
  DraftPreviewResponse,
  DraftResponse,
  DraftSignatoryInput,
  DocumentTypeConfiguration,
  DocumentTypesResponse,
  MeResponse,
} from "@/lib/api/types"
import { can } from "@/lib/auth/capabilities"
import {
  decodeWarning,
  draftLimits,
  type DraftProblem,
  signatoriesWithoutFields,
  toFieldPayload,
  toSignatoryPayload,
  validateFields,
  validateSignatories,
} from "@/lib/documents/drafts"
import {
  effectiveUploadLimitBytes,
  formatBytes,
  formatTimestamp,
  roleLabel,
} from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

export function DraftWorkspace({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [documentType, setDocumentType] =
    useState<DocumentTypeConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [title, setTitle] = useState("")
  const [signatories, setSignatories] = useState<DraftSignatoryInput[]>([])
  const [fields, setFields] = useState<PlacedField[]>([])
  const [problems, setProblems] = useState<DraftProblem[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [pdfUnavailable, setPdfUnavailable] = useState<string | null>(null)
  const [approvalDocument, setApprovalDocument] =
    useState<ApprovalDocument | null>(null)
  const [savedFingerprint, setSavedFingerprint] = useState("")
  const action = useRef<{ fingerprint: string; key: string } | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const applyDraft = useCallback((loaded: Draft) => {
    setSavedFingerprint(
      JSON.stringify({
        title: loaded.title,
        signatories: loaded.signatories.map((entry) => ({
          reference: entry.reference,
          kind: entry.kind,
          fullName: entry.fullName,
          emailAddress: entry.emailAddress,
          organization: entry.organization,
          position: entry.position,
          mobilePhone: entry.mobilePhone ?? "",
        })),
        fields: loaded.fields.map((field) => toFieldPayload(field)),
      })
    )
    setDraft(loaded)
    setTitle(loaded.title)
    setSignatories(
      loaded.signatories.map((signatory) => ({
        reference: signatory.reference,
        kind: signatory.kind,
        fullName: signatory.fullName,
        emailAddress: signatory.emailAddress,
        organization: signatory.organization,
        position: signatory.position,
        ...(signatory.mobilePhone
          ? { mobilePhone: signatory.mobilePhone }
          : {}),
        ...(signatory.applicationRef
          ? { applicationRef: signatory.applicationRef }
          : {}),
        ...(signatory.positionAppliedFor
          ? { positionAppliedFor: signatory.positionAppliedFor }
          : {}),
        ...(signatory.employeeNumber
          ? { employeeNumber: signatory.employeeNumber }
          : {}),
        ...(signatory.jobTitle ? { jobTitle: signatory.jobTitle } : {}),
        ...(signatory.deploymentDate
          ? { deploymentDate: signatory.deploymentDate }
          : {}),
        ...(signatory.representativePosition
          ? { representativePosition: signatory.representativePosition }
          : {}),
        ...(signatory.telephone ? { telephone: signatory.telephone } : {}),
      }))
    )
    setFields(
      loaded.fields.map((field) => ({
        key: field.id,
        signatoryReference: field.signatoryReference,
        kind: field.kind,
        pageNumber: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      }))
    )
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setForbidden(false)
    try {
      const [currentSession, response] = await Promise.all([
        apiRequest<MeResponse>("/api/me"),
        apiRequest<DraftResponse>(
          `/api/documents/${encodeURIComponent(documentId)}`
        ),
      ])
      if (!can(currentSession.capabilities, "documents:read")) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setSession(currentSession)
      applyDraft(response.document)

      // The draft response does not carry the type's attachment policy.
      try {
        const types = await apiRequest<DocumentTypesResponse>(
          "/api/document-types"
        )
        setDocumentType(
          types.documentTypes.find(
            (entry) => entry.id === response.document.documentTypeId
          ) ?? null
        )
      } catch {
        setDocumentType(null)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirectToExpiredSessionLogin()
        return
      }
      if (error instanceof ApiError && error.status === 403) {
        setForbidden(true)
        return
      }
      if (error instanceof ApiError && error.status === 404) {
        // The draft endpoint serves only DRAFT and RETURNED documents, so a
        // 404 usually means this one has been submitted.
        try {
          const approval = await apiRequest<ApprovalDocumentResponse>(
            `/api/documents/${encodeURIComponent(documentId)}/approval`
          )
          setApprovalDocument(approval.document)
          setSession(await apiRequest<MeResponse>("/api/me"))
          return
        } catch {
          // Fall through to the generic not-found state below.
        }
      }
      setLoadError({
        tone: "error",
        message:
          error instanceof ApiError && error.status === 404
            ? "This document does not exist, or it is no longer an editable draft."
            : userMessageForApiError(error),
        reference: errorReference(error),
      })
    } finally {
      setLoading(false)
    }
  }, [applyDraft, documentId, redirectToExpiredSessionLogin, router])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [redirectToExpiredSessionLogin])

  const draftId = draft?.id
  useEffect(() => {
    if (!draftId) return
    let cancelled = false

    void (async () => {
      setPdfUnavailable(null)
      try {
        const response = await apiRequest<DraftPreviewResponse>(
          `/api/documents/${encodeURIComponent(draftId)}/preview`
        )
        // The signed URL is short lived: it is fetched immediately and never
        // stored, and only the bytes are kept for rendering.
        const asset = await fetch(response.preview.url, {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        })
        if (!asset.ok) throw new Error(`preview responded ${asset.status}`)
        const bytes = new Uint8Array(await asset.arrayBuffer())
        if (!cancelled) setPdfBytes(bytes)
      } catch {
        if (!cancelled) {
          setPdfBytes(null)
          setPdfUnavailable(
            "The page images could not be loaded from document storage. Field positions below are still exact, and Preview PDF opens the file directly."
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [draftId])

  async function save() {
    if (!draft) return
    const found = [
      ...(title.trim().length < draftLimits.title.min
        ? [{ path: "title", message: "Enter a title for this document." }]
        : []),
      ...validateSignatories(signatories),
      ...validateFields(fields, {
        references: signatories.map((entry) => entry.reference),
        pageCount: draft.pageCount,
      }),
    ]
    setProblems(found)
    if (found.length > 0) {
      setNotice({
        tone: "error",
        message: "Some details still need attention before this can be saved.",
      })
      return
    }

    setSaving(true)
    setNotice(null)
    try {
      const body = {
        title: title.trim(),
        signatories: signatories.map(toSignatoryPayload),
        fields: fields.map(toFieldPayload),
      }
      const fingerprint = JSON.stringify(body)
      if (action.current?.fingerprint !== fingerprint) {
        action.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<DraftResponse>(
        `/api/documents/${encodeURIComponent(draft.id)}`,
        { method: "PATCH", idempotencyKey: action.current.key, body }
      )
      applyDraft(response.document)
      setNotice({ tone: "success", message: "Draft saved." })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setNotice({
          tone: "warning",
          message:
            "This draft changed in another session, so your save was not applied. The latest server state has been reloaded — review it and try again.",
        })
        void load()
        return
      }
      setNotice(documentNoticeForError(error))
    } finally {
      setSaving(false)
    }
  }

  async function openPreview() {
    if (!draft) return
    setPreviewing(true)
    setNotice(null)
    try {
      const response = await apiRequest<DraftPreviewResponse>(
        `/api/documents/${encodeURIComponent(draft.id)}/preview`
      )
      // The URL is short lived; it is opened immediately and never stored.
      const opened = window.open(
        response.preview.url,
        "_blank",
        "noopener,noreferrer"
      )
      if (!opened) {
        setNotice({
          tone: "warning",
          message:
            "The preview could not be opened, most likely because the browser blocked a new tab. Allow pop-ups for this site and try again.",
        })
      }
    } catch (error) {
      setNotice(documentNoticeForError(error))
    } finally {
      setPreviewing(false)
    }
  }

  if (loading) return <FullPageStatus message="Loading draft…" />
  if (forbidden) {
    return (
      <FullPageError
        heading="This document is not yours"
        notice={{
          tone: "error",
          message:
            "Drafts are private to the Sender who created them. Ask that person to share what you need.",
        }}
        onRetry={() => router.replace("/documents")}
      />
    )
  }
  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load this draft"
        notice={loadError}
        onRetry={() => void load()}
      />
    )
  }
  if (session && approvalDocument) {
    return (
      <DocumentShell
        backHref="/documents"
        backLabel="Documents"
        eyebrow="Submitted document"
        intro="This document has left the draft state, so it can no longer be edited here."
        session={session}
        title={approvalDocument.title}
      >
        <div className="mt-6">
          <SenderApprovalView
            document={approvalDocument}
            onChanged={(updated) => {
              setApprovalDocument(updated)
              if (
                updated.approvalStatus === "DRAFT" ||
                updated.approvalStatus === "RETURNED"
              ) {
                setApprovalDocument(null)
                void load()
              }
            }}
          />
        </div>
      </DocumentShell>
    )
  }

  if (!session || !draft) return null

  const orphaned = signatoriesWithoutFields(signatories, fields)
  const currentFingerprint = JSON.stringify({
    title,
    signatories: signatories.map((entry) => ({
      reference: entry.reference,
      kind: entry.kind,
      fullName: entry.fullName,
      emailAddress: entry.emailAddress,
      organization: entry.organization,
      position: entry.position,
      mobilePhone: entry.mobilePhone ?? "",
    })),
    fields: fields.map((field) => toFieldPayload(field)),
  })
  const unsavedChanges = currentFingerprint !== savedFingerprint
  const presentAttachmentKeys = new Set(
    draft.attachments.map((attachment) => attachment.requirementKey)
  )
  const clientBlockers = [
    ...(signatories.length === 0 ? ["SIGNATORY_REQUIRED"] : []),
    ...(fields.length === 0 ? ["SIGNING_FIELD_REQUIRED"] : []),
    ...(documentType?.requiredAttachmentKeys ?? [])
      .filter((key) => !presentAttachmentKeys.has(key))
      .map((key) => `ATTACHMENT_REQUIRED:${key}`),
  ]

  return (
    <DocumentShell
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-none"
            disabled={previewing}
            onClick={() => void openPreview()}
            size="lg"
            variant="outline"
          >
            {previewing ? <LoaderCircle className="animate-spin" /> : <Eye />}
            Preview PDF
          </Button>
          <Button
            className="rounded-none"
            disabled={saving}
            onClick={() => void save()}
            size="lg"
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      }
      backHref="/documents"
      backLabel="Documents"
      eyebrow={
        draft.approvalStatus === "RETURNED" ? "Returned for changes" : "Draft"
      }
      intro={`${draft.originalFileName} · ${draft.pageCount} ${draft.pageCount === 1 ? "page" : "pages"} · last updated ${formatTimestamp(draft.updatedAt)}`}
      session={session}
      title={draft.title}
    >
      <div aria-live="polite" className="mt-6 space-y-3">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}
        {draft.warnings.map((warning) => {
          const decoded = decodeWarning(warning)
          return (
            <NoticeBanner
              key={decoded.code}
              notice={{ tone: "warning", message: decoded.message }}
            />
          )
        })}
        {draft.approvalStatus === "RETURNED" && (
          <NoticeBanner
            notice={{
              tone: "warning",
              message: `This document was returned for changes${
                draft.returnTargetStepNumber
                  ? ` and will resume at approval step ${draft.returnTargetStepNumber}`
                  : ""
              }. It is round ${draft.approvalRound}.`,
            }}
          />
        )}
        {orphaned.length > 0 && (
          <NoticeBanner
            notice={{
              tone: "warning",
              message: `${orphaned.join(", ")} ${orphaned.length === 1 ? "has" : "have"} no field to sign. Place at least one field for every signatory.`,
            }}
          />
        )}
      </div>

      {problems.length > 0 && (
        <div
          className="mt-4 rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
          role="alert"
        >
          <p className="font-semibold">Before saving:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((problem) => (
              <li key={`${problem.path}-${problem.message}`}>
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-none border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="font-heading text-lg font-semibold">Document</h2>
            <div className="mt-4">
              <Field htmlFor="draft-title" label="Title">
                <input
                  className="field-input"
                  id="draft-title"
                  maxLength={draftLimits.title.max}
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-none border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="font-heading text-lg font-semibold">Signatories</h2>
            <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
              Signing order follows this list. No account is created for a
              signatory; they receive a private link instead.
            </p>
            <SignatoryEditor
              detailsUnavailable
              onChange={setSignatories}
              problems={problems}
              recordedIdentities={draft.signatories.map(
                (signatory) =>
                  `${signatory.kind}:${signatory.emailAddress.toLowerCase()}`
              )}
              signatories={signatories}
            />
          </section>

          <section className="rounded-none border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="font-heading text-lg font-semibold">
              Signing fields
            </h2>
            <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
              Pages are drawn at the exact proportions the API reported for this
              PDF, so placement matches what will be stamped.
            </p>
            {pdfUnavailable && (
              <p className="mb-4 rounded-none border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
                {pdfUnavailable}
              </p>
            )}
            <FieldPlacement
              fields={fields}
              onChange={setFields}
              pages={draft.pageGeometry}
              pdfBytes={pdfBytes}
              pdfSourceKey={draft.id}
              problems={problems}
              signatories={signatories}
            />
          </section>
        </div>

        <div className="space-y-6">
          <SubmissionPanel
            clientBlockers={clientBlockers}
            draft={draft}
            onSubmitted={(submitted) => {
              setApprovalDocument(submitted)
              setNotice(null)
            }}
            unsavedChanges={unsavedChanges}
          />
          <ApprovalPathPanel draft={draft} />
          <AttachmentsPanel
            attachments={draft.attachments}
            documentId={draft.id}
            documentType={documentType}
            onChanged={() => void load()}
            onNotice={setNotice}
          />
        </div>
      </div>
    </DocumentShell>
  )
}

function ApprovalPathPanel({ draft }: { draft: Draft }) {
  const grouped = new Map<number, string[]>()
  for (const step of [...draft.approvalPath].sort(
    (left, right) =>
      left.stepNumber - right.stepNumber || left.position - right.position
  )) {
    const entries = grouped.get(step.stepNumber) ?? []
    entries.push(
      `${roleLabel(step.approverRole)}${step.isMandatory ? "" : " (optional)"}`
    )
    grouped.set(step.stepNumber, entries)
  }

  return (
    <section className="rounded-none border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <GitBranch className="size-4" />
        Approval path
      </h2>
      {grouped.size === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No approval matrix was pinned to this draft, so it cannot be submitted
          for approval.
        </p>
      ) : (
        <>
          <ol className="mt-3 space-y-2 text-sm">
            {[...grouped.entries()].map(([stepNumber, entries]) => (
              <li className="flex gap-3" key={stepNumber}>
                <span className="grid size-6 shrink-0 place-items-center rounded-none bg-muted text-xs font-bold">
                  {stepNumber}
                </span>
                <span>
                  {entries.length > 1
                    ? `${entries.join(" + ")} in parallel`
                    : entries[0]}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            This path was pinned when the draft was created. Later changes to
            the document type&rsquo;s matrix do not alter it.
          </p>
        </>
      )}
    </section>
  )
}

function AttachmentsPanel({
  attachments,
  documentId,
  documentType,
  onChanged,
  onNotice,
}: {
  attachments: Draft["attachments"]
  documentId: string
  documentType: DocumentTypeConfiguration | null
  onChanged: () => void
  onNotice: (notice: Notice) => void
}) {
  const [uploading, setUploading] = useState<string | null>(null)
  const required = documentType?.requiredAttachmentKeys ?? []
  const present = new Map(
    attachments.map((attachment) => [attachment.requirementKey, attachment])
  )

  async function upload(requirementKey: string, file: File) {
    if (
      documentType &&
      file.size > effectiveUploadLimitBytes(documentType.maxFileSizeBytes)
    ) {
      onNotice({
        tone: "error",
        message: `That attachment is ${formatBytes(file.size)}. This document type accepts at most ${formatBytes(
          effectiveUploadLimitBytes(documentType.maxFileSizeBytes)
        )}.`,
      })
      return
    }

    setUploading(requirementKey)
    try {
      const body = new FormData()
      body.append("requirementKey", requirementKey)
      body.append("file", file)
      const response = await apiRequest<DraftAttachmentResponse>(
        `/api/documents/${encodeURIComponent(documentId)}/attachments`,
        { method: "POST", idempotencyKey: crypto.randomUUID(), body }
      )
      onNotice({
        tone: "success",
        message: `${response.attachment.requirementKey} attached.`,
      })
      onChanged()
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "ATTACHMENT_ALREADY_EXISTS"
      ) {
        onNotice({
          tone: "warning",
          message: `${requirementKey} already has an attachment. The API allows only one per key and does not support replacing it.`,
        })
        onChanged()
        return
      }
      if (
        error instanceof ApiError &&
        error.code === "ATTACHMENT_NOT_CONFIGURED"
      ) {
        onNotice({
          tone: "error",
          message: `${requirementKey} is no longer required by this document type.`,
        })
        onChanged()
        return
      }
      onNotice(documentNoticeForError(error))
    } finally {
      setUploading(null)
    }
  }

  return (
    <section className="rounded-none border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <Paperclip className="size-4" />
        Attachments
      </h2>

      {!documentType && (
        <p className="mt-2 flex gap-2 text-xs leading-5 text-muted-foreground">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          This document&rsquo;s type is not in the active list, so its required
          attachment keys could not be read.
        </p>
      )}

      {required.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {documentType
            ? "This document type requires no attachments."
            : "No attachment requirements are known."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {required.map((key) => {
            const attachment = present.get(key)
            const inputId = `attachment-${key}`
            return (
              <li className="rounded-none border p-3" key={key}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs font-bold">{key}</p>
                  <span
                    className={cn(
                      "rounded-none border px-2 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase",
                      attachment
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300"
                    )}
                  >
                    {attachment ? "Attached" : "Missing"}
                  </span>
                </div>
                {attachment ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {attachment.originalFileName}
                    </span>
                    <span className="shrink-0">
                      {attachment.pageCount}p ·{" "}
                      {formatBytes(attachment.byteLength)}
                    </span>
                  </p>
                ) : (
                  <>
                    <label className="sr-only" htmlFor={inputId}>
                      Attach a PDF for {key}
                    </label>
                    <input
                      accept="application/pdf,.pdf"
                      className="field-input mt-2 h-auto cursor-pointer py-2 text-xs file:mr-2 file:rounded-none file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[0.65rem] file:font-semibold"
                      disabled={uploading === key}
                      id={inputId}
                      onChange={(event) => {
                        const selected = event.target.files?.[0]
                        if (selected) void upload(key, selected)
                      }}
                      type="file"
                    />
                    {uploading === key && (
                      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <LoaderCircle className="size-3.5 animate-spin" />
                        Uploading…
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground">
        <Upload className="mt-0.5 size-3.5 shrink-0" />
        Attachments must be PDFs and are limited by the same file-size policy as
        the document. Each key accepts one file.
      </p>
    </section>
  )
}
