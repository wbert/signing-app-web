export const roles = ["ADMINISTRATOR", "SENDER", "APPROVER", "VIEWER"] as const
export type Role = (typeof roles)[number]

export const capabilities = [
  "users:read",
  "users:create",
  "users:update",
  "audit:read",
  "document-types:read",
  "document-types:manage",
  "documents:create",
  "documents:read",
  "documents:update",
  "approvals:read",
  "approvals:decide",
  "approvals:reassign",
  "signing:issue",
  "workflow:manage",
  "archives:read",
  "archives:export",
  "retention:manage",
] as const

export type Capability = (typeof capabilities)[number]

export type AuthenticatedUser = {
  id: string
  fullName: string
  emailAddress: string
  username: string
  roles: Role[]
}

export type MeResponse = {
  user: AuthenticatedUser
  capabilities: Capability[]
}

export const accountStatuses = [
  "PROVISIONING",
  "PENDING_MFA",
  "ACTIVE",
  "DISABLED",
] as const
export type AccountStatus = (typeof accountStatuses)[number]

export type AdminUser = {
  id: string
  fullName: string
  emailAddress: string
  username: string
  roles: Role[]
  accountStatus: AccountStatus
  hasMfa: boolean
  createdAt: string
  updatedAt: string
}

export type AdminUsersResponse = {
  users: AdminUser[]
}

export type AdminUserMutationResponse = {
  user: AdminUser
  replayed: boolean
}

export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
  }
}

export type SignInResponse = {
  twoFactorRedirect?: boolean
  twoFactorMethods?: string[]
  [key: string]: unknown
}

export type EnableTotpResponse = {
  totpURI: string
  backupCodes?: string[]
}

export const signingModes = ["SEQUENTIAL", "ALL_AT_ONCE"] as const
export type SigningMode = (typeof signingModes)[number]

export type DocumentType = {
  id: string
  code: string
  name: string
  category: string
  isActive: boolean
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
  createdAt: string
  updatedAt: string
}

export type DocumentTemplateVersion = {
  id: string
  versionNumber: number
  originalFileName: string
  pageCount: number
  createdAt: string
}

export type ApprovalMatrixStep = {
  stepNumber: number
  approverRole: Role
  isParallel: boolean
  isMandatory: boolean
  position: number
}

export type ApprovalMatrixVersion = {
  id: string
  versionNumber: number
  steps: ApprovalMatrixStep[]
  missingRoles: Role[]
  supersededVersionInFlightCount: number
  isUsableForSubmission: boolean
  createdAt: string
}

export type DocumentTypeConfiguration = DocumentType & {
  currentTemplate: DocumentTemplateVersion | null
  currentMatrix: ApprovalMatrixVersion | null
  isUsableForDraft: boolean
  isUsableForSubmission: boolean
}

export type DocumentTypesResponse = {
  documentTypes: DocumentTypeConfiguration[]
}

export type DocumentTypeMutationResponse = {
  documentType: DocumentType
}

export type DocumentTemplateResponse = {
  template: DocumentTemplateVersion
}

export type ApprovalMatrixResponse = {
  matrix: ApprovalMatrixVersion
}

export const signatoryKinds = [
  "CANDIDATE",
  "WORKER",
  "CLIENT_REPRESENTATIVE",
] as const
export type SignatoryKind = (typeof signatoryKinds)[number]

export const fieldKinds = ["SIGNATURE", "INITIAL", "DATE"] as const
export type FieldKind = (typeof fieldKinds)[number]

/** One-based page dimensions in PDF points, as returned by the API. */
export type PageGeometry = {
  pageNumber: number
  widthPoints: number
  heightPoints: number
  rotationDegrees: number
}

export type DraftSignatoryInput = {
  reference: string
  kind: SignatoryKind
  fullName: string
  emailAddress: string
  mobilePhone?: string
  organization: string
  position: string
  applicationRef?: string
  positionAppliedFor?: string
  employeeNumber?: string
  jobTitle?: string
  deploymentDate?: string
  representativePosition?: string
  telephone?: string
}

export type DraftSignatory = DraftSignatoryInput & {
  id: string
  assignmentId: string
  signingOrder: number
}

/** Coordinates are page fractions against the visually rotated page, origin top-left. */
export type DraftFieldInput = {
  signatoryReference: string
  kind: FieldKind
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
}

export type DraftField = DraftFieldInput & { id: string }

export type DraftAttachment = {
  id: string
  requirementKey: string
  originalFileName: string
  pageCount: number
  byteLength: number
  sha256: string
  createdAt: string
}

export type Draft = {
  id: string
  title: string
  documentTypeId: string
  templateVersionId: string
  matrixVersionId: string | null
  originalFileName: string
  pageCount: number
  pageGeometry: PageGeometry[]
  approvalStatus: "DRAFT" | "RETURNED"
  approvalRound: number
  workflowVersion: number
  returnTargetStepNumber: number | null
  uploadedAt: string
  updatedAt: string
  signatories: DraftSignatory[]
  fields: DraftField[]
  attachments: DraftAttachment[]
  approvalPath: ApprovalMatrixStep[]
  warnings: string[]
}

export type DraftResponse = {
  document: Draft
}

export type DocumentSummary = {
  id: string
  title: string
  documentTypeId: string
  originalFileName: string
  pageCount: number
  approvalStatus: DocumentApprovalStatus
  approvalRound: number
  workflowVersion: number
  uploadedAt: string
  updatedAt: string
}

export type DocumentsResponse = {
  documents: DocumentSummary[]
}

export type DraftAttachmentResponse = {
  attachment: DraftAttachment
}

export type DraftPreviewResponse = {
  preview: {
    url: string
    expiresAt: string
  }
}

export const approvalStepStatuses = [
  "WAITING",
  "PENDING",
  "BLOCKED",
  "APPROVED",
  "RETURNED",
  "VOIDED",
  "RECALLED",
] as const
export type ApprovalStepStatus = (typeof approvalStepStatuses)[number]

export const documentApprovalStatuses = [
  "DRAFT",
  "IN_APPROVAL",
  "RETURNED",
  "APPROVED",
  "VOIDED",
] as const
export type DocumentApprovalStatus = (typeof documentApprovalStatuses)[number]

export type ApprovalStep = {
  id: string
  sourceDocumentId: string
  documentTitle: string
  /** Document optimistic-concurrency token, required by approve and return. */
  documentWorkflowVersion: number
  approvalRound: number
  position: number
  stepNumber: number
  approverRole: Role
  isParallel: boolean
  isMandatory: boolean
  status: ApprovalStepStatus
  decision: "APPROVED" | "RETURNED" | null
  assignedUserId: string | null
  assignmentVersion: number
  assignedAt: string | null
  viewedAt: string | null
  decidedAt: string | null
  reminderIntervalHours: number
  reminderMaxCount: number
  reminderCount: number
  lastReminderAt: string | null
  returnReason: string | null
  returnTarget: "ORIGINATOR" | "STEP" | null
  returnedToStepNumber: number | null
}

export type ApprovalDocument = {
  id: string
  title: string
  approvalStatus: DocumentApprovalStatus
  approvalRound: number
  workflowVersion: number
  matrixVersionId: string | null
  returnTargetStepNumber: number | null
  approvedAt: string | null
  steps: ApprovalStep[]
}

/** Returned by the API only as `ORIGINATOR`, or an earlier `stepNumber`. */
export type ReturnTarget =
  { type: "ORIGINATOR" } | { type: "STEP"; stepNumber: number }

export type ApprovalQueueResponse = {
  approvals: ApprovalStep[]
}

export type ApprovalDocumentResponse = {
  document: ApprovalDocument
}

export type ApprovalMutationResponse = {
  document: ApprovalDocument
  notificationStatus: "QUEUED"
}

export type ApprovalPreviewAttachment = {
  requirementKey: string
  url: string
  expiresAt: string
}

export type ApprovalStepViewResponse = {
  approval: ApprovalStep
  /** The owning document, so an approver can see the path and prior decisions. */
  document: ApprovalDocument
  preview: {
    url: string
    expiresAt: string
    attachments: ApprovalPreviewAttachment[]
  }
}

export const captureMethods = ["DRAWN", "TYPED", "UPLOADED_IMAGE"] as const
export type CaptureMethod = (typeof captureMethods)[number]

/** Returned instead of a session while a one-time passcode is outstanding. */
export type SigningChallenge = {
  requiresOtp: true
  otpVerified: false
  expiresAt: string
}

export type SigningSession = {
  requestId: string
  /** Optimistic-concurrency token required by sign and decline. */
  requestVersion: number
  documentTitle: string
  pageCount: number
  signatoryName: string
  requiresOtp: boolean
  otpVerified: boolean
  lastPageViewed: boolean
  consentAccepted: boolean
  consentVersion: string
  consentText: string
  expiresAt: string
  previewUrl: string
  previewExpiresAt: string
}

export type SigningSessionResponse =
  | { challenge: SigningChallenge; session?: undefined }
  | { session: SigningSession; challenge?: undefined }

export type SigningOtpResponse = { verified: true }

export type SigningLastPageResponse = { lastPageViewed: true }

export type SigningConsentResponse = {
  consentAccepted: true
  consentVersion: string
}

export type SigningCompletionResponse = {
  requestId: string
  status: "IN_PROGRESS" | "COMPLETED" | "DECLINED"
  idempotent: boolean
}

export const workflowDisplayStatuses = [
  "DRAFT",
  "IN_APPROVAL",
  "RETURNED",
  "APPROVED",
  "SENT",
  "VIEWED",
  "SIGNED",
  "DECLINED",
  "EXPIRED",
  "VOIDED",
] as const
export type WorkflowDisplayStatus = (typeof workflowDisplayStatuses)[number]

export const signingRequestStatuses = [
  "SENT",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "VOIDED",
] as const
export type SigningRequestStatus = (typeof signingRequestStatuses)[number]

export const signingAssignmentStatuses = [
  "WAITING",
  "ACTIVE",
  "SIGNED",
  "DECLINED",
  "VOIDED",
  "LOCKED",
  "EXPIRED",
] as const
export type SigningAssignmentStatus = (typeof signingAssignmentStatuses)[number]

export const deliveryStatuses = [
  "PENDING",
  "SENT",
  "FAILED",
  "BOUNCED",
  "DEAD_LETTER",
] as const
export type DeliveryStatus = (typeof deliveryStatuses)[number]

export type WorkflowAssignmentProgress = {
  id: string
  signatoryName: string
  signatoryEmail: string
  signingOrder: number
  status: SigningAssignmentStatus
  viewedAt: string | null
  signedAt: string | null
  declinedAt: string | null
  reminderCount: number
  lastReminderAt: string | null
  deliveryStatus: DeliveryStatus | null
  /** A bounce reason recorded by an operator, or a delivery error code. */
  deliveryFailure: string | null
  /** Set by the API only when a reissue is actually permitted. */
  correctiveAction: "REISSUE" | null
}

export type WorkflowApprovalStep = {
  id: string
  approvalRound: number
  stepNumber: number
  approverRole: Role
  status: ApprovalStepStatus
  assignmentVersion: number
  assignedAt: string | null
  viewedAt: string | null
  decidedAt: string | null
  reminderCount: number
  reminderMaxCount: number
  lastReminderAt: string | null
}

export type Workflow = {
  /** Null until approval completes and a signing request is issued. */
  requestId: string | null
  sourceDocumentId: string
  title: string
  signingMode: SigningMode | null
  status: WorkflowDisplayStatus
  approvalStatus: DocumentApprovalStatus
  requestStatus: SigningRequestStatus | null
  /** The signing request's version, or the document's while none exists. */
  version: number
  sentAt: string | null
  expiresAt: string | null
  cancelReason: string | null
  completedAt: string | null
  declinedAt: string | null
  expiredAt: string | null
  voidedAt: string | null
  assignments: WorkflowAssignmentProgress[]
  approvalSteps: WorkflowApprovalStep[]
}

export type WorkflowsResponse = {
  workflows: Workflow[]
}

export type WorkflowResponse = {
  workflow: Workflow
}

export type WorkflowReissueResponse = {
  reissued: true
}

export const retentionStatuses = ["ACTIVE", "REVIEW_DUE"] as const
export type RetentionStatus = (typeof retentionStatuses)[number]

export type ArchiveSignatory = {
  name: string
  email: string
  kind: string
}

export type ArchiveRecord = {
  id: string
  documentTitle: string
  documentTypeId: string
  documentTypeName: string
  senderUserId: string
  senderName: string
  fileName: string
  byteLength: number
  documentHash: string
  certificateNo: string
  completedAt: string
  certifiedAt: string
  indexedAt: string
  retentionEndDate: string
  retentionStatus: RetentionStatus
  retentionPeriodMonths: number
  disposalAction: string
  legalBasis: string
  signatories: ArchiveSignatory[]
  clientAccounts: Array<{ id: string; name: string }>
  workerFiles: Array<{
    id: string
    workerFileNo: string
    workerName: string
    status: string
  }>
}

export type Pagination = {
  total: number
  limit: number
  offset: number
}

export type ArchiveSearchResponse = {
  records: ArchiveRecord[]
  pagination: Pagination
}

export type ArchiveViewResponse = {
  record: ArchiveRecord
}

/** Short-lived storage URLs. They are opened at once and never persisted. */
export type ArchiveRetrieveResponse = {
  documentUrl: string
  certificateUrl: string
  expiresAt: string
}

export type ArchiveVerifyResponse = {
  authentic: boolean
  expectedHash: string
  actualHash: string
  certificateNo: string
  certifiedAt: string
  completedAt: string
  signatories: Array<{ name: string; kind: string }>
}

export type ExportLimit = {
  maxItems: number
  maxBytes: number
}

export type ExportPreviewResponse = {
  count: number
  estimatedBytes: number
  canCreate: boolean
  limit: ExportLimit
  records: ArchiveRecord[]
}

export type ExportPackageItem = {
  archiveRecordId: string
  status: "INCLUDED" | "MISSING"
  fileName: string
  byteLength: number
  errorCode: string | null
}

export type ExportPackage = {
  id: string
  createdByUserId: string
  purpose: string
  status: "READY" | "PARTIAL"
  itemCount: number
  missingItemCount: number
  totalByteLength: number
  generatedAt: string
  expiresAt: string
  items: ExportPackageItem[]
}

export type ExportResponse = {
  export: ExportPackage
}

export const auditCategories = [
  "SECURITY",
  "CONFIGURATION",
  "APPROVAL",
  "SIGNING",
  "ACCESS",
] as const
export type AuditCategory = (typeof auditCategories)[number]

/** The API narrows audit payloads to these primitives before returning them. */
export type AuditDataValue = string | number | boolean | null | string[]

export type AuditEvent = {
  id: string
  category: AuditCategory
  eventType: string
  actor: { partyId: string | null; label: string }
  occurredAt: string
  targetType: string
  targetId: string
  data: Record<string, AuditDataValue>
  requestId: string
}

export type AuditEventsResponse = {
  events: AuditEvent[]
  pagination: Pagination
}

export type AuditEventResponse = {
  event: AuditEvent
}
