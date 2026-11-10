"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Clock,
  EyeOff,
  FileStack,
  FileText,
  GitBranch,
  Layers,
  LoaderCircle,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  FullPageError,
  FullPageStatus,
  NoticeBanner,
  documentNoticeForError,
  type Notice,
} from "@/components/admin/admin-ui"
import { ApprovalMatrixDialog } from "@/components/admin/approval-matrix-dialog"
import { DocumentTypeFormDialog } from "@/components/admin/document-type-form-dialog"
import { TemplateUploadDialog } from "@/components/admin/template-upload-dialog"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  ApprovalMatrixVersion,
  DocumentTemplateVersion,
  DocumentType,
  DocumentTypeConfiguration,
  DocumentTypeMutationResponse,
  DocumentTypesResponse,
  MeResponse,
} from "@/lib/api/types"
import {
  effectiveUploadLimitBytes,
  formatBytes,
  formatHours,
  formatMonths,
  formatTimestamp,
  listRoles,
  roleLabel,
  signingModeLabels,
  usabilityBlockers,
} from "@/lib/documents/document-types"
import { can } from "@/lib/auth/capabilities"
import { cn } from "@/lib/utils"

type DialogState =
  | { kind: "create" }
  | { kind: "configure"; id: string }
  | { kind: "template"; id: string }
  | { kind: "matrix"; id: string }

type StatusFilter = "ALL" | "READY" | "BLOCKED" | "INACTIVE"

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "READY", label: "Ready for submission" },
  { value: "BLOCKED", label: "Needs attention" },
  { value: "INACTIVE", label: "Inactive" },
]

export function DocumentTypeManagement() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [documentTypes, setDocumentTypes] = useState<
    DocumentTypeConfiguration[]
  >([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reactivating, setReactivating] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const load = useCallback(
    async (options: { foreground: boolean }) => {
      if (options.foreground) setLoading(true)
      else setRefreshing(true)
      setLoadError(null)

      try {
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<DocumentTypesResponse>("/api/admin/document-types"),
        ])

        if (!can(currentSession.capabilities, "document-types:read")) {
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
        setRefreshing(false)
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load({ foreground: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handleSessionExpiry = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry)
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry)
  }, [redirectToExpiredSessionLogin])

  const rows = useMemo(() => {
    return [...documentTypes].sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  }, [documentTypes])

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (
        normalized &&
        ![row.name, row.code, row.category].some((value) =>
          value.toLowerCase().includes(normalized)
        )
      ) {
        return false
      }
      if (statusFilter === "READY")
        return row.isActive && row.isUsableForSubmission
      if (statusFilter === "BLOCKED")
        return row.isActive && !row.isUsableForSubmission
      if (statusFilter === "INACTIVE") return !row.isActive
      return true
    })
  }, [query, rows, statusFilter])

  const canManage = session
    ? can(session.capabilities, "document-types:manage")
    : false
  const selected =
    dialog && dialog.kind !== "create"
      ? (rows.find((row) => row.id === dialog.id) ?? null)
      : null

  const handleConflict = useCallback(() => {
    setDialog(null)
    setNotice({
      tone: "warning",
      message:
        "This configuration changed in another session, so your change was not applied. The latest server state has been reloaded — review it and try again.",
    })
    void load({ foreground: false })
  }, [load])

  /**
   * Merges a mutation response into the cached row. The usability booleans are
   * recomputed with the API's own mapping so the card is not left showing a
   * stale status before the background refresh returns.
   */
  function mergeDocumentType(updated: DocumentType) {
    const existing = rows.find((row) => row.id === updated.id)
    const merged: DocumentTypeConfiguration = {
      ...(existing ?? {
        currentTemplate: null,
        currentMatrix: null,
        isUsableForDraft: false,
        isUsableForSubmission: false,
      }),
      ...updated,
      isUsableForDraft: Boolean(existing?.currentTemplate) && updated.isActive,
      isUsableForSubmission:
        Boolean(existing?.currentTemplate && existing?.currentMatrix) &&
        existing?.currentMatrix?.missingRoles.length === 0,
    }

    setDocumentTypes((current) =>
      current.some((row) => row.id === merged.id)
        ? current.map((row) => (row.id === merged.id ? merged : row))
        : [...current, merged]
    )
  }

  function mergeTemplate(id: string, template: DocumentTemplateVersion) {
    setDocumentTypes((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              currentTemplate: template,
              isUsableForDraft: row.isActive,
              isUsableForSubmission:
                Boolean(row.currentMatrix) &&
                row.currentMatrix?.missingRoles.length === 0,
            }
          : row
      )
    )
  }

  function mergeMatrix(id: string, matrix: ApprovalMatrixVersion) {
    setDocumentTypes((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              currentMatrix: matrix,
              isUsableForSubmission:
                Boolean(row.currentTemplate) &&
                matrix.missingRoles.length === 0,
            }
          : row
      )
    )
  }

  async function reactivate(documentType: DocumentTypeConfiguration) {
    setReactivating(documentType.id)
    setNotice(null)
    try {
      const response = await apiRequest<DocumentTypeMutationResponse>(
        `/api/admin/document-types/${encodeURIComponent(documentType.id)}`,
        {
          method: "PATCH",
          idempotencyKey: crypto.randomUUID(),
          body: { isActive: true },
        }
      )
      mergeDocumentType(response.documentType)
      setNotice({
        tone: "success",
        message: `${response.documentType.name} was re-enabled.`,
      })
      void load({ foreground: false })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        handleConflict()
        return
      }
      setNotice(documentNoticeForError(error))
    } finally {
      setReactivating(null)
    }
  }

  if (loading) {
    return <FullPageStatus message="Loading document configuration…" />
  }

  if (loadError) {
    return (
      <FullPageError
        heading="Unable to load document configuration"
        notice={loadError}
        onRetry={() => void load({ foreground: true })}
      />
    )
  }

  if (!session) return null

  const readyCount = rows.filter(
    (row) => row.isActive && row.isUsableForSubmission
  ).length
  const activeCount = rows.filter((row) => row.isActive).length
  const blockedCount = rows.filter(
    (row) => row.isActive && !row.isUsableForSubmission
  ).length

  return (
    <>
      <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground md:hidden"
              href="/dashboard"
            >
              <ArrowLeft className="size-3.5" />
              Workspace
            </Link>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase dark:text-emerald-400">
              Document configuration
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Document types
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Control the policy, PDF template, and approval path that every new
              draft inherits. Configuration changes are prospective: documents
              already in progress keep the versions they started with.
            </p>
          </div>
          {canManage && (
            <Button
              className="rounded-none"
              onClick={() => setDialog({ kind: "create" })}
              size="lg"
            >
              <Plus />
              New document type
            </Button>
          )}
        </div>

        {!canManage && (
          <div className="mt-6">
            <NoticeBanner
              notice={{
                tone: "warning",
                message:
                  "You can view document configuration but not change it. Changing a type, template, or approval matrix needs the document-types:manage capability.",
              }}
            />
          </div>
        )}

        <section
          aria-label="Configuration summary"
          className="mt-8 grid gap-3 sm:grid-cols-3"
        >
          <SummaryCard
            icon={<Layers className="size-4" />}
            label="Active types"
            value={activeCount}
          />
          <SummaryCard
            icon={<ShieldCheck className="size-4" />}
            label="Ready for submission"
            value={readyCount}
          />
          <SummaryCard
            icon={<CircleAlert className="size-4" />}
            label="Needs attention"
            value={blockedCount}
          />
        </section>

        <div aria-live="polite" className="mt-6 space-y-3">
          {notice && (
            <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
          )}
        </div>

        <section className="mt-6 rounded-none border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Filter document types by name, code, or category"
                className="field-input h-10 pl-10"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter name, code, or category"
                type="search"
                value={query}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
              <fieldset className="flex flex-wrap items-center gap-1.5">
                <legend className="sr-only">Filter by status</legend>
                {statusFilters.map((filter) => (
                  <label
                    className={cn(
                      "cursor-pointer rounded-none border px-3 py-1.5 text-xs font-semibold transition focus-within:ring-2 focus-within:ring-ring/30",
                      statusFilter === filter.value
                        ? "border-emerald-700/35 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                    key={filter.value}
                  >
                    <input
                      checked={statusFilter === filter.value}
                      className="sr-only"
                      name="status-filter"
                      onChange={() => setStatusFilter(filter.value)}
                      type="radio"
                      value={filter.value}
                    />
                    {filter.label}
                  </label>
                ))}
              </fieldset>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  {visibleRows.length} of {rows.length} shown
                </p>
                <Button
                  aria-label="Refresh document types"
                  className="rounded-none"
                  disabled={refreshing}
                  onClick={() => void load({ foreground: false })}
                  size="icon-sm"
                  variant="outline"
                >
                  <RefreshCw className={cn(refreshing && "animate-spin")} />
                </Button>
              </div>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState
              canManage={canManage}
              filtered={Boolean(query.trim()) || statusFilter !== "ALL"}
              onCreate={() => setDialog({ kind: "create" })}
            />
          ) : (
            <ul className="divide-y">
              {visibleRows.map((row) => (
                <li className="p-4 sm:p-5" key={row.id}>
                  <DocumentTypeCard
                    canManage={canManage}
                    documentType={row}
                    onConfigure={() =>
                      setDialog({ kind: "configure", id: row.id })
                    }
                    onMatrix={() => setDialog({ kind: "matrix", id: row.id })}
                    onReactivate={() => void reactivate(row)}
                    onTemplate={() =>
                      setDialog({ kind: "template", id: row.id })
                    }
                    reactivating={reactivating === row.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {dialog?.kind === "create" && (
        <DocumentTypeFormDialog
          documentType={null}
          onClose={() => setDialog(null)}
          onConflict={handleConflict}
          onSaved={(documentType, message) => {
            setDialog(null)
            mergeDocumentType(documentType)
            setNotice({ tone: "success", message })
            void load({ foreground: false })
          }}
        />
      )}

      {dialog?.kind === "configure" && selected && (
        <DocumentTypeFormDialog
          documentType={selected}
          key={selected.id}
          onClose={() => setDialog(null)}
          onConflict={handleConflict}
          onSaved={(documentType, message) => {
            setDialog(null)
            mergeDocumentType(documentType)
            setNotice({
              tone: "success",
              message: documentType.isActive
                ? message
                : `${message} It is now inactive and cannot be selected for new drafts.`,
            })
            void load({ foreground: false })
          }}
        />
      )}

      {dialog?.kind === "template" && selected && (
        <TemplateUploadDialog
          documentType={selected}
          key={selected.id}
          onClose={() => setDialog(null)}
          onConflict={handleConflict}
          onPublished={(template, message) => {
            setDialog(null)
            mergeTemplate(selected.id, template)
            setNotice({ tone: "success", message })
            void load({ foreground: false })
          }}
        />
      )}

      {dialog?.kind === "matrix" && selected && (
        <ApprovalMatrixDialog
          documentType={selected}
          key={selected.id}
          onClose={() => setDialog(null)}
          onConflict={handleConflict}
          onPublished={(matrix, message) => {
            setDialog(null)
            mergeMatrix(selected.id, matrix)
            setNotice({
              tone: matrix.missingRoles.length > 0 ? "warning" : "success",
              message,
            })
            void load({ foreground: false })
          }}
        />
      )}
    </>
  )
}

function DocumentTypeCard({
  canManage,
  documentType,
  onConfigure,
  onMatrix,
  onReactivate,
  onTemplate,
  reactivating,
}: {
  canManage: boolean
  documentType: DocumentTypeConfiguration
  onConfigure: () => void
  onMatrix: () => void
  onReactivate: () => void
  onTemplate: () => void
  reactivating: boolean
}) {
  const blockers = usabilityBlockers(documentType)
  const uploadLimit = effectiveUploadLimitBytes(documentType.maxFileSizeBytes)

  return (
    <article className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {documentType.name}
          </h2>
          <span className="rounded-none border bg-muted/40 px-2.5 py-1 font-mono text-[0.62rem] font-bold tracking-wide">
            {documentType.code}
          </span>
          <span className="text-xs text-muted-foreground">
            {documentType.category}
          </span>
          {!documentType.isActive && (
            <span className="inline-flex items-center gap-1.5 rounded-none border border-red-200 bg-red-50 px-2.5 py-1 text-[0.62rem] font-bold tracking-wide text-red-800 uppercase dark:border-red-950 dark:bg-red-950/40 dark:text-red-300">
              <EyeOff className="size-3" />
              Inactive
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <UsabilityPill
            label="Drafts"
            usable={documentType.isUsableForDraft}
          />
          <UsabilityPill
            label="Submission"
            usable={documentType.isUsableForSubmission}
          />
        </div>

        {blockers.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {blockers.map((blocker) => (
              <li
                className="flex gap-2 text-xs leading-5 text-amber-900 dark:text-amber-200"
                key={blocker.code}
              >
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">
                    {blocker.scope === "DRAFT" ? "Drafts" : "Submission"}:
                  </span>{" "}
                  {blocker.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <Detail
            icon={<SlidersHorizontal className="size-3.5" />}
            label="Signing mode"
            value={signingModeLabels[documentType.signingMode]}
          />
          <Detail
            icon={<Clock className="size-3.5" />}
            label="Signing-link expiry"
            value={formatHours(documentType.signingLinkExpiryHours)}
          />
          <Detail
            icon={<Lock className="size-3.5" />}
            label="One-time code"
            value={documentType.requiresOtp ? "Required" : "Not required"}
          />
          <Detail
            icon={<FileStack className="size-3.5" />}
            label="Maximum PDF size"
            value={`${formatBytes(documentType.maxFileSizeBytes)} (uploads capped at ${formatBytes(uploadLimit)})`}
          />
          <Detail
            icon={<Layers className="size-3.5" />}
            label="Retention"
            value={`${formatMonths(documentType.retentionPeriodMonths)} · ${documentType.disposalAction}`}
          />
          <Detail
            icon={<RefreshCw className="size-3.5" />}
            label="Reminders"
            value={
              documentType.reminderMaxCount === 0
                ? "Disabled"
                : `Approval ${formatHours(documentType.approvalReminderIntervalHours)}, signing ${formatHours(
                    documentType.signingReminderIntervalHours
                  )}, up to ${documentType.reminderMaxCount}`
            }
          />
        </dl>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <VersionPanel
            empty="No template published"
            icon={<FileText className="size-3.5" />}
            title="PDF template"
          >
            {documentType.currentTemplate && (
              <>
                <p className="font-semibold">
                  Version {documentType.currentTemplate.versionNumber} ·{" "}
                  {documentType.currentTemplate.pageCount}{" "}
                  {documentType.currentTemplate.pageCount === 1
                    ? "page"
                    : "pages"}
                </p>
                <p className="mt-1 truncate text-muted-foreground">
                  {documentType.currentTemplate.originalFileName}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Published{" "}
                  {formatTimestamp(documentType.currentTemplate.createdAt)}
                </p>
              </>
            )}
          </VersionPanel>

          <VersionPanel
            empty="No approval matrix published"
            icon={<GitBranch className="size-3.5" />}
            title="Approval matrix"
          >
            {documentType.currentMatrix && (
              <>
                <p className="font-semibold">
                  Version {documentType.currentMatrix.versionNumber} ·{" "}
                  {documentType.currentMatrix.steps.length}{" "}
                  {documentType.currentMatrix.steps.length === 1
                    ? "step definition"
                    : "step definitions"}
                </p>
                <ol className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {summarizeSteps(documentType.currentMatrix).map((step) => (
                    <li key={step.stepNumber}>
                      Step {step.stepNumber}: {step.summary}
                    </li>
                  ))}
                </ol>
                {documentType.currentMatrix.missingRoles.length > 0 && (
                  <p className="mt-1.5 font-medium text-amber-800 dark:text-amber-300">
                    No active, MFA-enrolled holder for{" "}
                    {listRoles(documentType.currentMatrix.missingRoles)}.
                  </p>
                )}
              </>
            )}
          </VersionPanel>
        </div>

        {documentType.requiredAttachmentKeys.length > 0 && (
          <div className="mt-4">
            <p className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              Required attachments
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {documentType.requiredAttachmentKeys.map((key) => (
                <li
                  className="rounded-none border bg-muted/40 px-2.5 py-1 font-mono text-[0.62rem] font-bold tracking-wide"
                  key={key}
                >
                  {key}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex shrink-0 flex-wrap gap-2 lg:w-52 lg:flex-col">
          <Button
            className="rounded-none lg:w-full lg:justify-start"
            onClick={onConfigure}
            size="sm"
            variant="outline"
          >
            <SlidersHorizontal />
            Configuration
          </Button>
          <Button
            className="rounded-none lg:w-full lg:justify-start"
            onClick={onTemplate}
            size="sm"
            variant="outline"
          >
            <Upload />
            PDF template
          </Button>
          <Button
            className="rounded-none lg:w-full lg:justify-start"
            onClick={onMatrix}
            size="sm"
            variant="outline"
          >
            <GitBranch />
            Approval matrix
          </Button>
          {!documentType.isActive && (
            <Button
              className="rounded-none lg:w-full lg:justify-start"
              disabled={reactivating}
              onClick={onReactivate}
              size="sm"
            >
              {reactivating ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CircleCheck />
              )}
              {reactivating ? "Re-enabling…" : "Re-enable"}
            </Button>
          )}
        </div>
      )}
    </article>
  )
}

function summarizeSteps(matrix: ApprovalMatrixVersion) {
  const byStep = new Map<number, string[]>()
  for (const step of [...matrix.steps].sort(
    (left, right) =>
      left.stepNumber - right.stepNumber || left.position - right.position
  )) {
    const entries = byStep.get(step.stepNumber) ?? []
    entries.push(
      `${roleLabel(step.approverRole)}${step.isMandatory ? "" : " (optional)"}`
    )
    byStep.set(step.stepNumber, entries)
  }
  return [...byStep.entries()].map(([stepNumber, entries]) => ({
    stepNumber,
    summary:
      entries.length > 1
        ? `${entries.join(" + ")} in parallel`
        : (entries[0] ?? ""),
  }))
}

function UsabilityPill({ label, usable }: { label: string; usable: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1 text-[0.64rem] font-bold tracking-wide uppercase",
        usable
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300"
      )}
    >
      {usable ? (
        <CircleCheck className="size-3" />
      ) : (
        <CircleAlert className="size-3" />
      )}
      {label}: {usable ? "Ready" : "Blocked"}
    </span>
  )
}

function VersionPanel({
  children,
  empty,
  icon,
  title,
}: {
  children: React.ReactNode
  empty: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <section className="rounded-none border bg-muted/25 p-3.5 text-xs leading-5">
      <h3 className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {icon}
        {title}
      </h3>
      <div className="mt-2">
        {children ?? <p className="text-muted-foreground">{empty}</p>}
      </div>
    </section>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-5">{value}</dd>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-none border bg-card px-4 py-4 shadow-xs">
      <span className="grid size-9 place-items-center rounded-none bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        {icon}
      </span>
      <div>
        <p className="text-xl leading-none font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({
  canManage,
  filtered,
  onCreate,
}: {
  canManage: boolean
  filtered: boolean
  onCreate: () => void
}) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-none bg-muted text-muted-foreground">
          <Layers className="size-5" />
        </span>
        <h2 className="mt-4 font-heading text-xl font-semibold">
          {filtered ? "No matching document types" : "No document types yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {filtered
            ? "Adjust the filter or search to see other configurations."
            : "Create a document type, publish its PDF template, and publish an approval matrix before Senders can prepare documents."}
        </p>
        {!filtered && canManage && (
          <Button className="mt-5 rounded-none" onClick={onCreate}>
            <Plus />
            New document type
          </Button>
        )}
      </div>
    </div>
  )
}
