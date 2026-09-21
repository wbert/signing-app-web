import { describe, expect, it } from "vitest"

import type { ArchiveVerifyResponse } from "@/lib/api/types"
import {
  authenticityMessages,
  authenticityResult,
  createExportIdempotencyKey,
  dateFromIso,
  endOfDayIso,
  filenameFromContentDisposition,
  filtersFromQuery,
  filtersToQuery,
  formatBytes,
  hasFilters,
  retentionStatusDescriptions,
  safeFilename,
  startOfDayIso,
  validateFilters,
  validatePurpose,
} from "@/lib/archive/archive"

function verification(
  overrides: Partial<ArchiveVerifyResponse> = {}
): ArchiveVerifyResponse {
  return {
    authentic: true,
    expectedHash: "a".repeat(64),
    actualHash: "a".repeat(64),
    certificateNo: "SIG-20260921-ABC",
    certifiedAt: "2026-09-21T16:00:00.000Z",
    completedAt: "2026-09-21T16:00:00.000Z",
    signatories: [{ name: "Alex Candidate", kind: "CANDIDATE" }],
    ...overrides,
  }
}

describe("validatePurpose", () => {
  it("enforces the API's 3 to 500 character rule", () => {
    expect(validatePurpose("  ")).toMatch(/at least 3/u)
    expect(validatePurpose("ab")).toMatch(/at least 3/u)
    expect(validatePurpose("Audit request 2026")).toBeNull()
    expect(validatePurpose("a".repeat(500))).toBeNull()
    expect(validatePurpose("a".repeat(501))).toMatch(/at most 500/u)
  })
})

describe("archive filters in the URL", () => {
  it("round-trips every supported filter", () => {
    const filters = {
      clientAccountId: "11111111-1111-1111-1111-111111111111",
      documentTypeId: "22222222-2222-2222-2222-222222222222",
      senderUserId: "sender-1",
      signatory: "alex@example.test",
      workerFileId: "33333333-3333-3333-3333-333333333333",
      completedFrom: "2026-01-01T00:00:00.000Z",
      completedTo: "2026-12-31T23:59:59.999Z",
      retentionStatus: "REVIEW_DUE" as const,
    }
    expect(filtersFromQuery(filtersToQuery(filters))).toEqual(filters)
  })

  it("carries nothing sensitive into the address bar", () => {
    const query = filtersToQuery({ signatory: "alex@example.test" }).toString()
    expect(query).not.toMatch(/purpose|hash|token|url/iu)
  })

  it("ignores query parameters the API does not accept", () => {
    const filters = filtersFromQuery(
      "clientAccountId=abc&purpose=snooping&limit=9999&retentionStatus=NOPE"
    )
    expect(filters).toEqual({ clientAccountId: "abc" })
  })

  it("drops empty values rather than sending them", () => {
    expect(filtersToQuery({ signatory: "   " }).toString()).toBe("")
    expect(hasFilters({})).toBe(false)
    expect(hasFilters({ signatory: "alex" })).toBe(true)
  })

  it("rejects a range the API would refuse", () => {
    expect(
      validateFilters({
        completedFrom: "2026-06-01T00:00:00.000Z",
        completedTo: "2026-01-01T00:00:00.000Z",
      })
    ).toMatch(/ends before it starts/u)
    expect(
      validateFilters({
        completedFrom: "2026-01-01T00:00:00.000Z",
        completedTo: "2026-06-01T00:00:00.000Z",
      })
    ).toBeNull()
  })

  it("converts date inputs to offset-aware timestamps", () => {
    expect(startOfDayIso("2026-09-21")).toBe("2026-09-21T00:00:00.000Z")
    expect(endOfDayIso("2026-09-21")).toBe("2026-09-21T23:59:59.999Z")
    expect(dateFromIso("2026-09-21T15:46:24.000Z")).toBe("2026-09-21")
    expect(dateFromIso(undefined)).toBe("")
  })
})

describe("authenticityResult", () => {
  it("names the server's verdict and never invents one", () => {
    expect(authenticityResult(verification())).toBe("verified")
    expect(authenticityResult(verification({ authentic: false }))).toBe(
      "mismatch"
    )
    expect(authenticityResult(null)).toBe("unavailable")
  })

  it("does not let a mismatch read as a pass", () => {
    expect(authenticityMessages.mismatch).toMatch(/does not match/iu)
    expect(authenticityMessages.mismatch).toMatch(/compromised/u)
  })

  it("states that an unavailable check concludes nothing", () => {
    expect(authenticityMessages.unavailable).toMatch(
      /nothing can be concluded/u
    )
  })

  it("ignores the hashes when deciding, even if they look equal", () => {
    const lying = verification({
      authentic: false,
      expectedHash: "b".repeat(64),
      actualHash: "b".repeat(64),
    })
    expect(authenticityResult(lying)).toBe("mismatch")
  })
})

describe("filenameFromContentDisposition", () => {
  it("reads a quoted filename", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="export-2026.zip"')
    ).toBe("export-2026.zip")
  })

  it("prefers the encoded parameter when both are present", () => {
    expect(
      filenameFromContentDisposition(
        `attachment; filename="plain.zip"; filename*=UTF-8''r%C3%A9sum%C3%A9.zip`
      )
    ).toBe("résumé.zip")
  })

  it("reads an unquoted filename", () => {
    expect(filenameFromContentDisposition("attachment; filename=a.zip")).toBe(
      "a.zip"
    )
  })

  it("strips a traversal attempt out of the saved name", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="../../../etc/passwd"'
      )
    ).toBe("passwd")
    expect(
      filenameFromContentDisposition(
        `attachment; filename*=UTF-8''..%2F..%2Fescape.zip`
      )
    ).toBe("escape.zip")
  })

  it("refuses a name that is only a traversal segment", () => {
    expect(safeFilename("..")).toBe("archive-export.zip")
    expect(safeFilename("")).toBe("archive-export.zip")
  })

  it("falls back when the header is absent or unusable", () => {
    expect(filenameFromContentDisposition(null)).toBe("archive-export.zip")
    expect(filenameFromContentDisposition("attachment")).toBe(
      "archive-export.zip"
    )
  })
})

describe("formatBytes", () => {
  it("scales units without pretending to precision", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(2048)).toBe("2.0 KB")
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB")
  })
})

describe("retention copy", () => {
  it("states that nothing is deleted automatically", () => {
    expect(retentionStatusDescriptions.REVIEW_DUE).toMatch(
      /nothing is deleted automatically/iu
    )
    expect(retentionStatusDescriptions.REVIEW_DUE).toMatch(
      /no disposal action/u
    )
  })
})

describe("createExportIdempotencyKey", () => {
  it("matches the API's header pattern and length", () => {
    const key = createExportIdempotencyKey()
    expect(key).toMatch(/^[a-zA-Z0-9._:-]+$/u)
    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(key.length).toBeLessThanOrEqual(200)
    expect(key).not.toBe(createExportIdempotencyKey())
  })
})
