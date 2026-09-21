import type { CaptureMethod, SigningSession } from "@/lib/api/types"
import { SigningApiError } from "@/lib/signing/client"

/** `signatureSchema.captureData` accepts at most 1,500,000 characters. */
export const MAX_CAPTURE_DATA_CHARACTERS = 1_500_000

/** `embedCaptureImage` rejects a decoded image above 1,000,000 bytes. */
export const MAX_CAPTURE_IMAGE_BYTES = 1_000_000

/** A typed signature is stamped as text, so the API caps it at 100 characters. */
export const MAX_TYPED_SIGNATURE_CHARACTERS = 100

/** `declineSchema.reason` accepts 1 to 1,000 trimmed characters. */
export const MAX_DECLINE_REASON_CHARACTERS = 1_000

/** The exact data-URL shape `embedCaptureImage` parses. */
export const CAPTURE_IMAGE_PATTERN =
  /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/u

export type SigningStage = "access" | "review" | "sign"

/**
 * Which of the three screens the server's own state puts the signatory on.
 * Progress is never inferred from what this browser did, so a resumed session
 * lands exactly where the server left it.
 */
export function stageForSession(session: SigningSession): SigningStage {
  if (session.requiresOtp && !session.otpVerified) return "access"
  if (!session.lastPageViewed || !session.consentAccepted) return "review"
  return "sign"
}

export type TerminalReason =
  "unavailable" | "no-token" | "completed" | "declined"

export type TerminalState = {
  reason: TerminalReason
  heading: string
  message: string
}

const terminalStates: Record<TerminalReason, Omit<TerminalState, "reason">> = {
  unavailable: {
    heading: "This signing link can no longer be used",
    message:
      "The link may have expired, already been used, been replaced by a newer one, or been withdrawn. If you still need to sign, ask the sender to send you a new link.",
  },
  "no-token": {
    heading: "This page needs the link from your email",
    message:
      "Open the private link in your invitation email exactly as it was sent. Copying only part of the address, or opening the page again later from your history, leaves the link incomplete.",
  },
  completed: {
    heading: "Your signature has been recorded",
    message:
      "There is nothing further for you to do. A copy of the completed document is emailed to everyone involved once every signatory has signed.",
  },
  declined: {
    heading: "You declined to sign",
    message:
      "The sender has been told, along with the reason you gave. This link is now closed. If you declined by mistake, contact the sender and ask for a new link.",
  },
}

export function terminalState(reason: TerminalReason): TerminalState {
  return { reason, ...terminalStates[reason] }
}

/**
 * The API answers every unusable link — unknown, expired, consumed, locked,
 * declined, or voided — with one `404`, deliberately telling an anonymous
 * caller nothing about which. The UI keeps that boundary and shows one state.
 */
export function terminalStateForError(error: unknown): TerminalState | null {
  if (!(error instanceof SigningApiError)) return null
  if (error.status === 404) return terminalState("unavailable")
  if (error.status === 401 && error.code === "SIGNING_TOKEN_REQUIRED") {
    return terminalState("no-token")
  }
  return null
}

const recoverableMessages: Record<string, string> = {
  OTP_INVALID:
    "That passcode was not accepted. Check the code in your invitation email and enter it again.",
  OTP_REQUIRED:
    "Enter the one-time passcode from your invitation email before continuing.",
  OTP_NOT_REQUIRED:
    "This document does not use a passcode. Continue to the document.",
  LAST_PAGE_REQUIRED:
    "The end of this document was not recognised. Reload this page and read it again.",
  DOCUMENT_REVIEW_INCOMPLETE:
    "Read to the end of the document before agreeing to sign it.",
  CONSENT_VERSION_CHANGED:
    "The agreement notice was updated while this page was open. Read the current notice and agree again.",
  SIGNING_PREREQUISITES_INCOMPLETE:
    "Read the whole document and agree to the notice before signing.",
  SIGNING_VERSION_CONFLICT:
    "This signing session changed elsewhere. It has been reloaded — check the document and try again.",
  INVALID_SIGNATURE_CAPTURE:
    "That signature could not be used. Draw, type, or upload it again.",
  VALIDATION_ERROR:
    "Something in that request was not accepted. Check what you entered and try again.",
}

/** Plain-language copy for a failure the signatory can still recover from. */
export function signingMessageForError(error: unknown): string {
  if (!(error instanceof SigningApiError)) {
    return "We could not reach SigningApp. Check your connection and try again."
  }

  const known = recoverableMessages[error.code]
  if (known) return known

  if (error.status === 429) {
    return "Too many attempts were made. Wait a short while before trying again."
  }
  if (error.status === 413) {
    return "That signature image is too large. Use a smaller image."
  }
  if (error.status >= 500) {
    return "SigningApp is temporarily unavailable. Please try again shortly."
  }

  return "That request could not be completed. Please try again."
}

/** A version conflict is safe to retry once the newest session has been read. */
export function isVersionConflict(error: unknown): boolean {
  return (
    error instanceof SigningApiError &&
    error.code === "SIGNING_VERSION_CONFLICT"
  )
}

export function signingErrorReference(error: unknown): string | null {
  return error instanceof SigningApiError ? error.requestId : null
}

/** Decoded byte length of base64 text, without allocating the bytes. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.max(0, (base64.length * 3) / 4 - padding)
}

/**
 * Mirrors the API's capture rules so an unusable signature is refused before a
 * request is sent. The server check stays authoritative.
 */
export function validateSignatureCapture(input: {
  captureMethod: CaptureMethod
  captureData: string
}): string | null {
  if (input.captureData.length === 0) {
    return input.captureMethod === "TYPED"
      ? "Type your full name to sign."
      : "Add your signature before signing."
  }

  if (input.captureData.length > MAX_CAPTURE_DATA_CHARACTERS) {
    return "That signature is too large to send. Use a smaller image."
  }

  if (input.captureMethod === "TYPED") {
    const typed = input.captureData.trim()
    if (typed.length === 0) return "Type your full name to sign."
    if (typed.length > MAX_TYPED_SIGNATURE_CHARACTERS) {
      return `A typed signature may be at most ${MAX_TYPED_SIGNATURE_CHARACTERS} characters.`
    }
    return null
  }

  const match = CAPTURE_IMAGE_PATTERN.exec(input.captureData)
  if (!match?.[2]) {
    return "Only a PNG or JPEG image can be used as a signature."
  }

  const bytes = base64ByteLength(match[2])
  if (bytes === 0) return "That image is empty. Choose another file."
  if (bytes > MAX_CAPTURE_IMAGE_BYTES) {
    return "That image is larger than 1 MB. Choose a smaller file."
  }

  return null
}

export function validateDeclineReason(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return "Give a short reason so the sender knows why you declined."
  }
  if (trimmed.length > MAX_DECLINE_REASON_CHARACTERS) {
    return `A reason may be at most ${MAX_DECLINE_REASON_CHARACTERS} characters.`
  }
  return null
}

/**
 * One key per intent, created when the signatory first commits to signing or
 * declining and kept for every retry of that same intent, so a lost response
 * or a version reload can never produce a second signature.
 */
export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

/** Remaining link lifetime, phrased for someone who is not watching a clock. */
export function describeExpiry(
  expiresAt: string,
  now: number = Date.now()
): string | null {
  const expiry = new Date(expiresAt).getTime()
  if (Number.isNaN(expiry)) return null

  const minutes = Math.round((expiry - now) / 60_000)
  if (minutes <= 0) return "This link has expired."
  if (minutes < 60) {
    return `This link expires in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 48) {
    return `This link expires in about ${hours} ${hours === 1 ? "hour" : "hours"}.`
  }

  const days = Math.round(hours / 24)
  return `This link expires in about ${days} days.`
}
