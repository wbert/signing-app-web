import { describe, expect, it } from "vitest"

import type { SigningSession } from "@/lib/api/types"
import { SigningApiError } from "@/lib/signing/client"
import {
  base64ByteLength,
  createIdempotencyKey,
  describeExpiry,
  isVersionConflict,
  MAX_CAPTURE_DATA_CHARACTERS,
  MAX_CAPTURE_IMAGE_BYTES,
  signingMessageForError,
  stageForSession,
  terminalStateForError,
  validateDeclineReason,
  validateSignatureCapture,
} from "@/lib/signing/signing"

function session(overrides: Partial<SigningSession> = {}): SigningSession {
  return {
    requestId: "request-1",
    requestVersion: 3,
    documentTitle: "Employment contract",
    pageCount: 4,
    signatoryName: "Alex Candidate",
    requiresOtp: true,
    otpVerified: true,
    lastPageViewed: true,
    consentAccepted: true,
    consentVersion: "2026-01",
    consentText: "I consent to use electronic records and signatures.",
    expiresAt: "2026-09-22T00:00:00.000Z",
    previewUrl: "https://storage.example.test/preview.pdf",
    previewExpiresAt: "2026-09-21T00:05:00.000Z",
    ...overrides,
  }
}

function apiError(status: number, code: string): SigningApiError {
  return new SigningApiError({
    status,
    code,
    message: "server copy",
    requestId: "request-id-1",
  })
}

/** Base64 of the given decoded byte length, so limits can be tested exactly. */
function base64OfBytes(bytes: number): string {
  const groups = Math.ceil(bytes / 3)
  const encoded = "A".repeat(groups * 4)
  const overshoot = groups * 3 - bytes
  return overshoot === 0
    ? encoded
    : `${encoded.slice(0, encoded.length - overshoot)}${"=".repeat(overshoot)}`
}

describe("stageForSession", () => {
  it("holds an unverified signatory at the passcode stage", () => {
    expect(
      stageForSession(session({ requiresOtp: true, otpVerified: false }))
    ).toBe("access")
  })

  it("keeps review open until the server has both review and consent", () => {
    expect(stageForSession(session({ lastPageViewed: false }))).toBe("review")
    expect(stageForSession(session({ consentAccepted: false }))).toBe("review")
  })

  it("allows signing only once the server confirms both", () => {
    expect(stageForSession(session())).toBe("sign")
  })

  it("skips the passcode stage when the document does not use one", () => {
    expect(
      stageForSession(session({ requiresOtp: false, otpVerified: false }))
    ).toBe("sign")
  })
})

describe("terminalStateForError", () => {
  it("shows one non-technical state for every unusable link", () => {
    const state = terminalStateForError(
      apiError(404, "SIGNING_ACCESS_UNAVAILABLE")
    )
    expect(state?.reason).toBe("unavailable")
    expect(state?.message).not.toMatch(/404|token|SIGNING_/u)
  })

  it("explains a missing token separately", () => {
    expect(
      terminalStateForError(apiError(401, "SIGNING_TOKEN_REQUIRED"))?.reason
    ).toBe("no-token")
  })

  it("leaves recoverable failures on the current screen", () => {
    expect(terminalStateForError(apiError(401, "OTP_INVALID"))).toBeNull()
    expect(
      terminalStateForError(apiError(409, "SIGNING_VERSION_CONFLICT"))
    ).toBeNull()
    expect(terminalStateForError(new Error("offline"))).toBeNull()
  })
})

describe("signingMessageForError", () => {
  it("replaces API wording with plain language", () => {
    expect(signingMessageForError(apiError(401, "OTP_INVALID"))).toMatch(
      /passcode was not accepted/u
    )
    expect(
      signingMessageForError(apiError(409, "DOCUMENT_REVIEW_INCOMPLETE"))
    ).toMatch(/Read to the end/u)
    expect(
      signingMessageForError(apiError(409, "CONSENT_VERSION_CHANGED"))
    ).toMatch(/updated/u)
  })

  it("does not leak a server code for an unmapped failure", () => {
    const message = signingMessageForError(apiError(400, "SOME_NEW_CODE"))
    expect(message).not.toContain("SOME_NEW_CODE")
    expect(message).not.toContain("server copy")
  })

  it("names a connection problem when there was no response", () => {
    expect(signingMessageForError(new Error("network"))).toMatch(
      /could not reach/u
    )
  })
})

describe("isVersionConflict", () => {
  it("recognises only the server's own conflict code", () => {
    expect(isVersionConflict(apiError(409, "SIGNING_VERSION_CONFLICT"))).toBe(
      true
    )
    expect(
      isVersionConflict(apiError(409, "SIGNING_PREREQUISITES_INCOMPLETE"))
    ).toBe(false)
  })
})

describe("base64ByteLength", () => {
  it("accounts for padding", () => {
    expect(base64ByteLength("AAAA")).toBe(3)
    expect(base64ByteLength("AAA=")).toBe(2)
    expect(base64ByteLength("AA==")).toBe(1)
    expect(base64ByteLength("")).toBe(0)
  })
})

describe("validateSignatureCapture", () => {
  it("accepts a typed name within the API's limit", () => {
    expect(
      validateSignatureCapture({
        captureMethod: "TYPED",
        captureData: "Alex Candidate",
      })
    ).toBeNull()
    expect(
      validateSignatureCapture({
        captureMethod: "TYPED",
        captureData: "a".repeat(100),
      })
    ).toBeNull()
  })

  it("rejects typed input the API would refuse", () => {
    expect(
      validateSignatureCapture({ captureMethod: "TYPED", captureData: "   " })
    ).toMatch(/Type your full name/u)
    expect(
      validateSignatureCapture({
        captureMethod: "TYPED",
        captureData: "a".repeat(101),
      })
    ).toMatch(/at most 100/u)
  })

  it("accepts only a PNG or JPEG data URL", () => {
    expect(
      validateSignatureCapture({
        captureMethod: "DRAWN",
        captureData: "data:image/png;base64,AAAA",
      })
    ).toBeNull()
    expect(
      validateSignatureCapture({
        captureMethod: "UPLOADED_IMAGE",
        captureData: "data:image/svg+xml;base64,AAAA",
      })
    ).toMatch(/PNG or JPEG/u)
    expect(
      validateSignatureCapture({
        captureMethod: "UPLOADED_IMAGE",
        captureData: "<svg onload=alert(1)>",
      })
    ).toMatch(/PNG or JPEG/u)
  })

  it("holds the decoded image inside the API's 1 MB limit", () => {
    expect(
      validateSignatureCapture({
        captureMethod: "UPLOADED_IMAGE",
        captureData: `data:image/jpeg;base64,${base64OfBytes(MAX_CAPTURE_IMAGE_BYTES)}`,
      })
    ).toBeNull()
    expect(
      validateSignatureCapture({
        captureMethod: "UPLOADED_IMAGE",
        captureData: `data:image/jpeg;base64,${base64OfBytes(MAX_CAPTURE_IMAGE_BYTES + 3)}`,
      })
    ).toMatch(/larger than 1 MB/u)
  })

  it("refuses a capture longer than the request schema allows", () => {
    expect(
      validateSignatureCapture({
        captureMethod: "DRAWN",
        captureData: `data:image/png;base64,${"A".repeat(MAX_CAPTURE_DATA_CHARACTERS)}`,
      })
    ).toMatch(/too large to send/u)
  })

  it("asks for a signature before one exists", () => {
    expect(
      validateSignatureCapture({ captureMethod: "DRAWN", captureData: "" })
    ).toMatch(/Add your signature/u)
  })
})

describe("validateDeclineReason", () => {
  it("requires a reason and caps it at the schema limit", () => {
    expect(validateDeclineReason("  ")).toMatch(/short reason/u)
    expect(validateDeclineReason("Wrong salary figure")).toBeNull()
    expect(validateDeclineReason("a".repeat(1001))).toMatch(/at most 1,?000/u)
  })
})

describe("createIdempotencyKey", () => {
  it("produces a distinct key the API's 8–200 character rule accepts", () => {
    const first = createIdempotencyKey()
    expect(first).not.toBe(createIdempotencyKey())
    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(first.length).toBeLessThanOrEqual(200)
  })
})

describe("describeExpiry", () => {
  const now = Date.parse("2026-09-21T00:00:00.000Z")

  it("describes remaining time without asking the reader to do arithmetic", () => {
    expect(describeExpiry("2026-09-21T00:30:00.000Z", now)).toMatch(
      /30 minutes/u
    )
    expect(describeExpiry("2026-09-21T06:00:00.000Z", now)).toMatch(/6 hours/u)
    expect(describeExpiry("2026-09-26T00:00:00.000Z", now)).toMatch(/5 days/u)
  })

  it("states plainly when the link has already expired", () => {
    expect(describeExpiry("2026-09-20T23:00:00.000Z", now)).toBe(
      "This link has expired."
    )
  })

  it("returns nothing for an unreadable timestamp", () => {
    expect(describeExpiry("not-a-date", now)).toBeNull()
  })
})
