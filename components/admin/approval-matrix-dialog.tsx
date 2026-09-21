"use client"

import { type FormEvent, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  GitBranch,
  LoaderCircle,
  Plus,
  Trash2,
  Users,
} from "lucide-react"

import {
  ManagementDialog,
  NoticeBanner,
  documentNoticeForError,
  type Notice,
} from "@/components/admin/admin-ui"
import { Button } from "@/components/ui/button"
import { ApiError, apiRequest } from "@/lib/api/client"
import type {
  ApprovalMatrixResponse,
  ApprovalMatrixVersion,
  DocumentTypeConfiguration,
  Role,
} from "@/lib/api/types"
import { roles } from "@/lib/api/types"
import {
  documentTypeLimits,
  formatTimestamp,
  groupsFromSteps,
  listRoles,
  roleLabel,
  stepsFromGroups,
  validateMatrixGroups,
  type MatrixDraftGroup,
} from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

function newGroup(role: Role = "APPROVER"): MatrixDraftGroup {
  return {
    id: crypto.randomUUID(),
    approvers: [
      { id: crypto.randomUUID(), approverRole: role, isMandatory: true },
    ],
  }
}

export function ApprovalMatrixDialog({
  documentType,
  onClose,
  onConflict,
  onPublished,
}: {
  documentType: DocumentTypeConfiguration
  onClose: () => void
  onConflict: () => void
  onPublished: (matrix: ApprovalMatrixVersion, message: string) => void
}) {
  const current = documentType.currentMatrix
  const [groups, setGroups] = useState<MatrixDraftGroup[]>(() =>
    current && current.steps.length > 0
      ? groupsFromSteps(current.steps)
      : [newGroup()]
  )
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const action = useRef<{ fingerprint: string; key: string } | null>(null)

  const steps = useMemo(() => stepsFromGroups(groups), [groups])
  // The only role-holder data the API returns is `missingRoles` on the current
  // published version, so warnings below are labelled as coming from that check.
  const knownMissingRoles = current?.missingRoles
  const plannedMissingRoles = useMemo(() => {
    const missing = knownMissingRoles ?? []
    return [...new Set(steps.map((step) => step.approverRole))].filter((role) =>
      missing.includes(role)
    )
  }, [knownMissingRoles, steps])

  function mutate(next: MatrixDraftGroup[]) {
    setGroups(next)
    setProblems([])
    setNotice(null)
  }

  function addStep() {
    mutate([...groups, newGroup()])
  }

  function removeStep(index: number) {
    mutate(groups.filter((_, position) => position !== index))
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    const next = [...groups]
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    mutate(next)
  }

  function addApprover(index: number) {
    const group = groups[index]
    if (!group) return
    const unused =
      roles.find(
        (role) =>
          !group.approvers.some((approver) => approver.approverRole === role)
      ) ?? "APPROVER"
    mutate(
      groups.map((entry, position) =>
        position === index
          ? {
              ...entry,
              approvers: [
                ...entry.approvers,
                {
                  id: crypto.randomUUID(),
                  approverRole: unused,
                  isMandatory: false,
                },
              ],
            }
          : entry
      )
    )
  }

  function updateApprover(
    groupIndex: number,
    approverId: string,
    changes: { approverRole?: Role; isMandatory?: boolean }
  ) {
    mutate(
      groups.map((entry, position) =>
        position === groupIndex
          ? {
              ...entry,
              approvers: entry.approvers.map((approver) =>
                approver.id === approverId
                  ? { ...approver, ...changes }
                  : approver
              ),
            }
          : entry
      )
    )
  }

  function removeApprover(groupIndex: number, approverId: string) {
    const group = groups[groupIndex]
    if (!group) return
    if (group.approvers.length === 1) {
      removeStep(groupIndex)
      return
    }
    mutate(
      groups.map((entry, position) =>
        position === groupIndex
          ? {
              ...entry,
              approvers: entry.approvers.filter(
                (approver) => approver.id !== approverId
              ),
            }
          : entry
      )
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validateMatrixGroups(groups)
    setProblems(found)
    if (found.length > 0) return

    setBusy(true)
    setNotice(null)
    try {
      const body = { steps }
      const fingerprint = JSON.stringify(body)
      if (action.current?.fingerprint !== fingerprint) {
        action.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<ApprovalMatrixResponse>(
        `/api/admin/document-types/${encodeURIComponent(documentType.id)}/approval-matrices`,
        { method: "POST", idempotencyKey: action.current.key, body }
      )

      const matrix = response.matrix
      const parts = [
        `Approval matrix version ${matrix.versionNumber} was published.`,
      ]
      if (matrix.supersededVersionInFlightCount > 0) {
        parts.push(
          `${matrix.supersededVersionInFlightCount} workflow${
            matrix.supersededVersionInFlightCount === 1 ? "" : "s"
          } already in progress continue on the previous version.`
        )
      }
      if (matrix.missingRoles.length > 0) {
        parts.push(
          `Submission stays blocked until an active, MFA-enrolled account holds ${listRoles(
            matrix.missingRoles
          )}.`
        )
      }
      onPublished(matrix, parts.join(" "))
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
      description={`Define the approval path for ${documentType.code}. Steps are numbered contiguously from one, and a step with more than one approver runs in parallel.`}
      onClose={onClose}
      title="Approval matrix"
      wide
    >
      {notice && (
        <div className="mt-5">
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      <section
        aria-labelledby="current-matrix-heading"
        className="mt-5 rounded-2xl border bg-muted/25 p-4"
      >
        <h3 className="text-sm font-semibold" id="current-matrix-heading">
          Current matrix
        </h3>
        {current ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Version {current.versionNumber}, published{" "}
            {formatTimestamp(current.createdAt)}, with {current.steps.length}{" "}
            step {current.steps.length === 1 ? "definition" : "definitions"}.
            {current.missingRoles.length > 0
              ? ` No active, MFA-enrolled account holds ${listRoles(current.missingRoles)}.`
              : " Every referenced role has at least one active, MFA-enrolled holder."}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No approval matrix has been published, so drafts of this type cannot
            be submitted for approval.
          </p>
        )}
      </section>

      <div className="mt-4 flex gap-2.5 rounded-2xl border border-amber-300/70 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Publishing creates a new version that applies only to documents
          submitted afterwards. Workflows already in progress keep the matrix
          version they were submitted with, and earlier versions are preserved
          for traceability.
        </p>
      </div>

      {problems.length > 0 && (
        <div
          className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
          role="alert"
        >
          <p className="font-semibold">This matrix cannot be published yet:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      <form className="mt-5" noValidate onSubmit={submit}>
        <ol className="space-y-3">
          {groups.map((group, index) => {
            const parallel = group.approvers.length > 1
            return (
              <li
                className="rounded-2xl border bg-card p-4 shadow-xs"
                key={group.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Step {index + 1}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {parallel ? (
                          <>
                            <GitBranch className="size-3.5" />
                            Parallel: all approvers are assigned together
                          </>
                        ) : (
                          <>
                            <Users className="size-3.5" />
                            Single approver role
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      aria-label={`Move step ${index + 1} earlier`}
                      className="rounded-xl"
                      disabled={index === 0}
                      onClick={() => moveStep(index, -1)}
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      aria-label={`Move step ${index + 1} later`}
                      className="rounded-xl"
                      disabled={index === groups.length - 1}
                      onClick={() => moveStep(index, 1)}
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      aria-label={`Remove step ${index + 1}`}
                      className="rounded-xl"
                      disabled={groups.length === 1}
                      onClick={() => removeStep(index)}
                      size="icon-sm"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <ul className="mt-4 space-y-2.5">
                  {group.approvers.map((approver, approverIndex) => {
                    const selectId = `approver-${group.id}-${approver.id}`
                    const duplicate =
                      group.approvers.filter(
                        (entry) => entry.approverRole === approver.approverRole
                      ).length > 1
                    return (
                      <li
                        className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center"
                        key={approver.id}
                      >
                        <div className="min-w-0 flex-1">
                          <label
                            className="mb-1.5 block text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase"
                            htmlFor={selectId}
                          >
                            Approver role {approverIndex + 1}
                          </label>
                          <select
                            aria-invalid={duplicate ? true : undefined}
                            className={cn(
                              "field-input h-10",
                              duplicate && "border-red-500"
                            )}
                            id={selectId}
                            onChange={(event) =>
                              updateApprover(index, approver.id, {
                                approverRole: event.target.value as Role,
                              })
                            }
                            value={approver.approverRole}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:mt-5">
                          <input
                            checked={approver.isMandatory}
                            className="size-4 accent-emerald-700"
                            onChange={(event) =>
                              updateApprover(index, approver.id, {
                                isMandatory: event.target.checked,
                              })
                            }
                            type="checkbox"
                          />
                          Mandatory
                        </label>
                        <Button
                          aria-label={`Remove approver ${approverIndex + 1} from step ${index + 1}`}
                          className="rounded-xl sm:mt-5"
                          onClick={() => removeApprover(index, approver.id)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    )
                  })}
                </ul>

                <Button
                  className="mt-3 rounded-xl"
                  disabled={group.approvers.length >= roles.length}
                  onClick={() => addApprover(index)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus />
                  Add parallel approver
                </Button>
              </li>
            )
          })}
        </ol>

        <Button
          className="mt-3 rounded-xl"
          disabled={steps.length >= documentTypeLimits.steps.max}
          onClick={addStep}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus />
          Add step
        </Button>

        {plannedMissingRoles.length > 0 && (
          <div
            className="mt-5 flex gap-2.5 rounded-2xl border border-amber-300/70 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100"
            role="status"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              At the last published check, no active, MFA-enrolled account held{" "}
              {listRoles(plannedMissingRoles)}. Publishing is still allowed, but
              documents of this type cannot be submitted until a holder exists.
              The API re-checks role holders when the version is published.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {steps.length} step{" "}
            {steps.length === 1 ? "definition" : "definitions"} across{" "}
            {groups.length} numbered {groups.length === 1 ? "step" : "steps"}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
              {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {busy
                ? "Publishing…"
                : `Publish version ${(current?.versionNumber ?? 0) + 1}`}
            </Button>
          </div>
        </div>
      </form>
    </ManagementDialog>
  )
}
