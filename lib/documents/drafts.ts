import type {
  DraftFieldInput,
  DraftSignatoryInput,
  FieldKind,
  SignatoryKind,
} from "@/lib/api/types"
import { isWithinPage } from "@/lib/documents/geometry"

/** Mirrors the backend draft schemas so the wizard can fail before uploading. */
export const draftLimits = {
  title: { min: 1, max: 300 },
  signatories: { min: 1, max: 50 },
  fields: { min: 1, max: 500 },
  reference: { min: 1, max: 100, pattern: /^[A-Za-z0-9_-]+$/u },
  fullName: { max: 200 },
  organization: { max: 200 },
  position: { max: 200 },
  phone: { max: 50 },
  shortText: { max: 100 },
  longText: { max: 200 },
} as const

export const signatoryKindLabels: Record<SignatoryKind, string> = {
  CANDIDATE: "Candidate",
  WORKER: "Worker",
  CLIENT_REPRESENTATIVE: "Client representative",
}

export const signatoryKindDescriptions: Record<SignatoryKind, string> = {
  CANDIDATE: "An applicant who has not yet been deployed.",
  WORKER: "A deployed worker with an employee record.",
  CLIENT_REPRESENTATIVE: "A signatory acting for the client organization.",
}

export const fieldKindLabels: Record<FieldKind, string> = {
  SIGNATURE: "Signature",
  INITIAL: "Initial",
  DATE: "Date",
}

export type SignatoryDetailField = {
  key: keyof DraftSignatoryInput
  label: string
  maxLength: number
  type?: "date"
}

/**
 * The API accepts these as one flat optional set and does not tie any of them
 * to a kind, so grouping them this way is a presentation choice derived from
 * the field names, not an enforced part of the contract.
 */
export const signatoryDetailFields: Record<
  SignatoryKind,
  SignatoryDetailField[]
> = {
  CANDIDATE: [
    { key: "applicationRef", label: "Application reference", maxLength: 100 },
    {
      key: "positionAppliedFor",
      label: "Position applied for",
      maxLength: 200,
    },
  ],
  WORKER: [
    { key: "employeeNumber", label: "Employee number", maxLength: 100 },
    { key: "jobTitle", label: "Job title", maxLength: 200 },
    {
      key: "deploymentDate",
      label: "Deployment date",
      maxLength: 10,
      type: "date",
    },
  ],
  CLIENT_REPRESENTATIVE: [
    {
      key: "representativePosition",
      label: "Representative position",
      maxLength: 200,
    },
    { key: "telephone", label: "Telephone", maxLength: 50 },
  ],
}

export type DraftProblem = {
  path: string
  message: string
}

export function referenceFromName(
  fullName: string,
  taken: readonly string[]
): string {
  const base =
    fullName
      .normalize("NFKD")
      .replace(/\p{Mark}+/gu, "")
      .replace(/[^A-Za-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40)
      .toUpperCase() || "SIGNATORY"
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function validateSignatories(
  signatories: readonly DraftSignatoryInput[]
): DraftProblem[] {
  const problems: DraftProblem[] = []

  if (signatories.length < draftLimits.signatories.min) {
    problems.push({
      path: "signatories",
      message: "Add at least one signatory.",
    })
  }
  if (signatories.length > draftLimits.signatories.max) {
    problems.push({
      path: "signatories",
      message: `A document may have at most ${draftLimits.signatories.max} signatories.`,
    })
  }

  const seenReferences = new Set<string>()
  const seenIdentities = new Set<string>()

  for (const [index, signatory] of signatories.entries()) {
    const at = `signatories.${index}`
    const reference = signatory.reference.trim()

    if (
      reference.length < draftLimits.reference.min ||
      reference.length > draftLimits.reference.max ||
      !draftLimits.reference.pattern.test(reference)
    ) {
      problems.push({
        path: `${at}.reference`,
        message:
          "References may use only letters, digits, hyphen, and underscore.",
      })
    } else if (seenReferences.has(reference)) {
      problems.push({
        path: `${at}.reference`,
        message: `Reference ${reference} is already used by another signatory.`,
      })
    }
    seenReferences.add(reference)

    if (!signatory.fullName.trim()) {
      problems.push({ path: `${at}.fullName`, message: "Enter a full name." })
    }
    if (!signatory.organization.trim()) {
      problems.push({
        path: `${at}.organization`,
        message: "Enter an organization.",
      })
    }
    if (!signatory.position.trim()) {
      problems.push({ path: `${at}.position`, message: "Enter a position." })
    }

    const email = signatory.emailAddress.trim().toLowerCase()
    if (!isEmailLike(email)) {
      problems.push({
        path: `${at}.emailAddress`,
        message: "Enter a valid email address.",
      })
    } else {
      const identity = `${signatory.kind}:${email}`
      if (seenIdentities.has(identity)) {
        problems.push({
          path: `${at}.emailAddress`,
          message: `${email} is already assigned as a ${signatoryKindLabels[
            signatory.kind
          ].toLowerCase()} on this document.`,
        })
      }
      seenIdentities.add(identity)
    }
  }

  return problems
}

export function validateFields(
  fields: readonly DraftFieldInput[],
  options: { references: readonly string[]; pageCount: number }
): DraftProblem[] {
  const problems: DraftProblem[] = []

  if (fields.length < draftLimits.fields.min) {
    problems.push({
      path: "fields",
      message: "Place at least one field before saving.",
    })
  }
  if (fields.length > draftLimits.fields.max) {
    problems.push({
      path: "fields",
      message: `A document may have at most ${draftLimits.fields.max} fields.`,
    })
  }

  for (const [index, field] of fields.entries()) {
    const at = `fields.${index}`
    if (!options.references.includes(field.signatoryReference)) {
      problems.push({
        path: `${at}.signatoryReference`,
        message: "This field belongs to a signatory that no longer exists.",
      })
    }
    if (
      !Number.isInteger(field.pageNumber) ||
      field.pageNumber < 1 ||
      field.pageNumber > options.pageCount
    ) {
      problems.push({
        path: `${at}.pageNumber`,
        message: `Page ${field.pageNumber} is outside this document's ${options.pageCount} pages.`,
      })
    }
    if (!isWithinPage(field)) {
      problems.push({
        path: `${at}.rect`,
        message: "This field extends past the edge of its page.",
      })
    }
  }

  return problems
}

/** Signatories without a field cannot sign, which the server does not check. */
export function signatoriesWithoutFields(
  signatories: readonly DraftSignatoryInput[],
  fields: readonly DraftFieldInput[]
): string[] {
  const used = new Set(fields.map((field) => field.signatoryReference))
  return signatories
    .filter((signatory) => !used.has(signatory.reference))
    .map((signatory) => signatory.reference)
}

export type DecodedWarning = {
  code: string
  message: string
}

/** Warnings arrive as opaque strings such as `MISSING_APPROVER_ROLES:APPROVER,VIEWER`. */
export function decodeWarning(warning: string): DecodedWarning {
  if (warning === "NO_APPROVAL_MATRIX") {
    return {
      code: warning,
      message:
        "This document type had no approval matrix when the draft was created, so it cannot be submitted for approval.",
    }
  }
  if (warning.startsWith("MISSING_APPROVER_ROLES:")) {
    const roles = warning
      .slice("MISSING_APPROVER_ROLES:".length)
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean)
      .map((role) => role.charAt(0) + role.slice(1).toLowerCase())
    return {
      code: "MISSING_APPROVER_ROLES",
      message: `No active, MFA-enrolled account holds ${joinWords(roles)}, so approval cannot start.`,
    }
  }
  return { code: warning, message: warning }
}

/** Strips empty optional values so a strict schema does not reject them. */
export function toSignatoryPayload(
  signatory: DraftSignatoryInput
): DraftSignatoryInput {
  const payload: DraftSignatoryInput = {
    reference: signatory.reference.trim(),
    kind: signatory.kind,
    fullName: signatory.fullName.trim(),
    emailAddress: signatory.emailAddress.trim().toLowerCase(),
    organization: signatory.organization.trim(),
    position: signatory.position.trim(),
  }
  const optional = [
    "mobilePhone",
    "applicationRef",
    "positionAppliedFor",
    "employeeNumber",
    "jobTitle",
    "deploymentDate",
    "representativePosition",
    "telephone",
  ] as const
  for (const key of optional) {
    const value = signatory[key]?.trim()
    if (value) payload[key] = value
  }
  return payload
}

/** Picks exactly the properties the field schema accepts. */
export function toFieldPayload(field: DraftFieldInput): DraftFieldInput {
  return {
    signatoryReference: field.signatoryReference,
    kind: field.kind,
    pageNumber: field.pageNumber,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
  }
}

export function joinWords(values: readonly string[]): string {
  if (values.length <= 1) return values.join("")
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
}
