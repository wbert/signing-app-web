import { describe, expect, it } from "vitest"

import { documentNoticeForError } from "@/components/admin/admin-ui"
import { ApiError } from "@/lib/api/client"

describe("documentNoticeForError", () => {
  it("explains the backend's duplicate document-type code conflict", () => {
    expect(
      documentNoticeForError(
        new ApiError({
          status: 409,
          code: "DOCUMENT_TYPE_CODE_EXISTS",
          message: "Document type code already exists",
          requestId: "request-1",
        })
      )
    ).toEqual({
      tone: "error",
      message:
        "That document-type code is already in use. Choose a different code.",
      reference: "request-1",
    })
  })

  it("does not misdiagnose an unrelated server failure as a duplicate code", () => {
    expect(
      documentNoticeForError(
        new ApiError({
          status: 500,
          code: "INTERNAL",
          message: "Internal server error",
          requestId: "request-2",
        })
      )
    ).toEqual({
      tone: "error",
      message:
        "The SigningApp service is temporarily unavailable. Please try again shortly.",
      reference: "request-2",
    })
  })
})
