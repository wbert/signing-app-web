import type {
  ApprovalMatrixStep,
  DocumentType,
  DocumentTypeConfiguration,
  Role,
  SigningMode,
} from "@/lib/api/types"

/**
 * Hard ceiling enforced by the API (`MAX_PDF_UPLOAD_BYTES`) and by the
 * `document_types_max_file_size_lambda_limit` database check.
 */
export const MAX_PDF_UPLOAD_BYTES = 4_000_000

/** Mirrors the backend document-type Zod schema so the form can fail fast. */
export const documentTypeLimits = {
  code: { min: 2, max: 50, pattern: "[A-Za-z0-9_-]+" },
  name: { min: 1, max: 200 },
  category: { min: 1, max: 100 },
  disposalAction: { min: 1, max: 200 },
  legalBasis: { min: 1, max: 1000 },
  maxFileSizeBytes: { min: 1, max: MAX_PDF_UPLOAD_BYTES },
  retentionPeriodMonths: { min: 1, max: 1200 },
  signingLinkExpiryHours: { min: 1, max: 24 * 90 },
  reminderIntervalHours: { min: 1, max: 24 * 90 },
  reminderMaxCount: { min: 0, max: 20 },
  attachmentKey: { max: 100, pattern: /^[A-Za-z0-9_-]+$/u },
  attachmentKeyCount: { max: 20 },
  steps: { max: 100 },
} as const

export const documentTypeDefaults = {
  maxFileSizeBytes: MAX_PDF_UPLOAD_BYTES,
  retentionPeriodMonths: 120,
  signingMode: "SEQUENTIAL" as SigningMode,
  signingLinkExpiryHours: 168,
  requiresOtp: false,
  approvalReminderIntervalHours: 72,
  signingReminderIntervalHours: 72,
  reminderMaxCount: 3,
} as const

export const signingModeLabels: Record<SigningMode, string> = {
  SEQUENTIAL: "Sequential",
  ALL_AT_ONCE: "All at once",
}

export const signingModeDescriptions: Record<SigningMode, string> = {
  SEQUENTIAL: "Each signatory is invited only after the previous one signs.",
  ALL_AT_ONCE: "Every signatory is invited at the same time.",
}

/**
 * A PDF is rejected before upload when it exceeds the lower of the type's
 * configured policy and the 4,000,000-byte API limit. Server validation stays
 * authoritative.
 */
export function effectiveUploadLimitBytes(maxFileSizeBytes: number): number {
  return Math.min(maxFileSizeBytes, MAX_PDF_UPLOAD_BYTES)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`
  if (bytes < 1_000_000) return `${round(bytes / 1000)} kB`
  return `${round(bytes / 1_000_000)} MB`
}

export function formatHours(hours: number): string {
  const unit = hours === 1 ? "hour" : "hours"
  if (hours % 24 !== 0) return `${hours} ${unit}`
  const days = hours / 24
  return `${hours} ${unit} (${days} ${days === 1 ? "day" : "days"})`
}

export function formatMonths(months: number): string {
  const unit = months === 1 ? "month" : "months"
  if (months % 12 !== 0) return `${months} ${unit}`
  const years = months / 12
  return `${months} ${unit} (${years} ${years === 1 ? "year" : "years"})`
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase().replace(/_/gu, " ")
}

export type UsabilityBlocker = {
  code: string
  message: string
  scope: "DRAFT" | "SUBMISSION"
}

/**
 * Blockers are derived only from fields the API returned. Nothing here guesses
 * at server-side authorization or at state the API did not report.
 */
export function usabilityBlockers(
  documentType: DocumentTypeConfiguration
): UsabilityBlocker[] {
  const derived: UsabilityBlocker[] = []

  if (!documentType.isActive) {
    derived.push({
      code: "INACTIVE",
      scope: "DRAFT",
      message: "The type is inactive, so Senders cannot start a draft from it.",
    })
  }
  if (!documentType.currentTemplate) {
    derived.push({
      code: "TEMPLATE_REQUIRED",
      scope: "DRAFT",
      message: "No PDF template version has been published.",
    })
  }
  if (!documentType.currentMatrix) {
    derived.push({
      code: "MATRIX_REQUIRED",
      scope: "SUBMISSION",
      message: "No approval matrix version has been published.",
    })
  } else if (documentType.currentMatrix.missingRoles.length > 0) {
    derived.push({
      code: "MISSING_ROLE_HOLDERS",
      scope: "SUBMISSION",
      message: `No active, MFA-enrolled account holds ${listRoles(
        documentType.currentMatrix.missingRoles
      )}.`,
    })
  }

  // The API's own usability booleans stay authoritative: a scope it reports as
  // usable shows no blockers, and a scope it reports as blocked always shows at
  // least one reason even when the returned fields do not explain why.
  return (["DRAFT", "SUBMISSION"] as const).flatMap((scope) => {
    const usable =
      scope === "DRAFT"
        ? documentType.isUsableForDraft
        : documentType.isUsableForSubmission
    const scoped = derived.filter((blocker) => blocker.scope === scope)
    if (usable) return []
    if (scoped.length > 0) return scoped
    return [
      {
        code:
          scope === "DRAFT" ? "UNUSABLE_FOR_DRAFT" : "UNUSABLE_FOR_SUBMISSION",
        scope,
        message:
          scope === "DRAFT"
            ? "The API reports this type cannot be used for new drafts."
            : "The API reports this type cannot be used for submission.",
      },
    ]
  })
}

export function listRoles(values: readonly Role[]): string {
  const labels = values.map(roleLabel)
  if (labels.length <= 1) return labels.join("")
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

export type MatrixDraftApprover = {
  id: string
  approverRole: Role
  isMandatory: boolean
}

/** One numbered step. More than one approver in a group means a parallel step. */
export type MatrixDraftGroup = {
  id: string
  approvers: MatrixDraftApprover[]
}

export function groupsFromSteps(
  steps: ApprovalMatrixStep[]
): MatrixDraftGroup[] {
  const ordered = [...steps].sort(
    (left, right) =>
      left.stepNumber - right.stepNumber || left.position - right.position
  )
  const groups = new Map<number, MatrixDraftGroup>()
  for (const step of ordered) {
    const group = groups.get(step.stepNumber) ?? {
      id: `step-${step.stepNumber}`,
      approvers: [],
    }
    group.approvers.push({
      id: `step-${step.stepNumber}-${step.approverRole}`,
      approverRole: step.approverRole,
      isMandatory: step.isMandatory,
    })
    groups.set(step.stepNumber, group)
  }
  return [...groups.values()]
}

export type ApprovalMatrixStepInput = {
  stepNumber: number
  approverRole: Role
  isParallel: boolean
  isMandatory: boolean
}

/**
 * Serializes the editor model into the backend contract. Step numbers are
 * always contiguous from one, and `isParallel` is derived from the group size
 * exactly as `validateApprovalMatrix` requires.
 */
export function stepsFromGroups(
  groups: readonly MatrixDraftGroup[]
): ApprovalMatrixStepInput[] {
  return groups.flatMap((group, index) =>
    group.approvers.map((approver) => ({
      stepNumber: index + 1,
      approverRole: approver.approverRole,
      isParallel: group.approvers.length > 1,
      isMandatory: approver.isMandatory,
    }))
  )
}

/** Client-side mirror of the backend matrix rules. Server stays authoritative. */
export function validateMatrixGroups(
  groups: readonly MatrixDraftGroup[]
): string[] {
  const problems: string[] = []
  const steps = stepsFromGroups(groups)

  if (steps.length === 0) {
    problems.push("Add at least one approval step.")
    return problems
  }
  if (steps.length > documentTypeLimits.steps.max) {
    problems.push(
      `An approval matrix may contain at most ${documentTypeLimits.steps.max} step definitions.`
    )
  }
  if (groups.some((group) => group.approvers.length === 0)) {
    problems.push("Every numbered step needs at least one approver role.")
  }
  if (!steps.some((step) => step.isMandatory)) {
    problems.push("At least one step must be mandatory.")
  }
  for (const [index, group] of groups.entries()) {
    const roles = group.approvers.map((approver) => approver.approverRole)
    if (new Set(roles).size !== roles.length) {
      problems.push(
        `Step ${index + 1} repeats an approver role. A role may appear only once in a parallel group.`
      )
    }
  }

  return problems
}

export function normalizeAttachmentKeys(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/u)
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    ),
  ]
}

export function invalidAttachmentKeys(keys: readonly string[]): string[] {
  return keys.filter(
    (key) =>
      key.length > documentTypeLimits.attachmentKey.max ||
      !documentTypeLimits.attachmentKey.pattern.test(key)
  )
}

/** `true` when the browser reported a PDF, or reported nothing and the name ends in .pdf. */
export function looksLikePdf(file: File): boolean {
  if (file.type) return file.type === "application/pdf"
  return file.name.toLowerCase().endsWith(".pdf")
}

/** Reads the first five bytes and checks for the `%PDF-` signature. */
export async function hasPdfSignature(file: File): Promise<boolean> {
  const header = await file.slice(0, 5).arrayBuffer()
  if (header.byteLength < 5) return false
  return new TextDecoder("ascii").decode(header) === "%PDF-"
}

/** Fields shared by the create and update payloads. */
export type DocumentTypeConfigurationInput = {
  name: string
  category: string
  maxFileSizeBytes: number
  retentionPeriodMonths: number
  disposalAction: string
  legalBasis: string
  signingMode: SigningMode
  signingLinkExpiryHours: number
  requiresOtp: boolean
  approvalReminderIntervalHours: number
  signingReminderIntervalHours: number
  reminderMaxCount: number
  requiredAttachmentKeys: string[]
}

/**
 * Builds a PATCH body containing only genuinely changed fields, because the
 * update schema is strict and requires at least one property.
 */
export function changedConfiguration(
  current: DocumentType,
  next: DocumentTypeConfigurationInput
): Partial<DocumentTypeConfigurationInput> {
  const changes: Partial<DocumentTypeConfigurationInput> = {}
  for (const key of Object.keys(next) as Array<
    keyof DocumentTypeConfigurationInput
  >) {
    if (key === "requiredAttachmentKeys") {
      if (
        next.requiredAttachmentKeys.join(",") !==
        current.requiredAttachmentKeys.join(",")
      ) {
        changes.requiredAttachmentKeys = next.requiredAttachmentKeys
      }
      continue
    }
    if (next[key] !== current[key]) {
      Object.assign(changes, { [key]: next[key] })
    }
  }
  return changes
}

function round(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}
