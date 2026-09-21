import { describe, expect, it } from "vitest"

import type { DraftFieldInput, DraftSignatoryInput } from "@/lib/api/types"
import {
  decodeWarning,
  joinWords,
  referenceFromName,
  signatoriesWithoutFields,
  toFieldPayload,
  toSignatoryPayload,
  validateFields,
  validateSignatories,
} from "@/lib/documents/drafts"

function signatory(
  overrides: Partial<DraftSignatoryInput> = {}
): DraftSignatoryInput {
  return {
    reference: "WORKER-1",
    kind: "WORKER",
    fullName: "Alex Worker",
    emailAddress: "alex@example.test",
    organization: "Northpoint",
    position: "Field worker",
    ...overrides,
  }
}

function field(overrides: Partial<DraftFieldInput> = {}): DraftFieldInput {
  return {
    signatoryReference: "WORKER-1",
    kind: "SIGNATURE",
    pageNumber: 1,
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.1,
    ...overrides,
  }
}

describe("draft signatories", () => {
  it("derives stable, unique references from display names", () => {
    expect(referenceFromName("  José  Núñez ", [])).toBe("JOSE-NUNEZ")
    expect(referenceFromName("李雷", [])).toBe("SIGNATORY")
    expect(referenceFromName("Alex Worker", ["ALEX-WORKER"])).toBe(
      "ALEX-WORKER-2"
    )
    expect(
      referenceFromName("Alex Worker", ["ALEX-WORKER", "ALEX-WORKER-2"])
    ).toBe("ALEX-WORKER-3")
  })

  it("requires at least one signatory", () => {
    expect(validateSignatories([])).toEqual([
      { path: "signatories", message: "Add at least one signatory." },
    ])
  })

  it("reports malformed required identity fields", () => {
    const problems = validateSignatories([
      signatory({
        reference: "bad reference",
        fullName: " ",
        emailAddress: "not-an-email",
        organization: "",
        position: " ",
      }),
    ])

    expect(problems.map((problem) => problem.path)).toEqual([
      "signatories.0.reference",
      "signatories.0.fullName",
      "signatories.0.organization",
      "signatories.0.position",
      "signatories.0.emailAddress",
    ])
  })

  it("rejects duplicate references and kind/email identities", () => {
    const problems = validateSignatories([
      signatory(),
      signatory({
        fullName: "Alex Duplicate",
        emailAddress: "ALEX@EXAMPLE.TEST",
      }),
    ])

    expect(problems).toEqual([
      {
        path: "signatories.1.reference",
        message: "Reference WORKER-1 is already used by another signatory.",
      },
      {
        path: "signatories.1.emailAddress",
        message:
          "alex@example.test is already assigned as a worker on this document.",
      },
    ])
  })

  it("allows one email address to represent different signatory kinds", () => {
    expect(
      validateSignatories([
        signatory(),
        signatory({
          reference: "CLIENT-1",
          kind: "CLIENT_REPRESENTATIVE",
        }),
      ])
    ).toEqual([])
  })

  it("trims and normalizes the API payload without empty optional values", () => {
    expect(
      toSignatoryPayload(
        signatory({
          reference: " WORKER-1 ",
          fullName: " Alex Worker ",
          emailAddress: " ALEX@EXAMPLE.TEST ",
          organization: " Northpoint ",
          position: " Field worker ",
          mobilePhone: " ",
          employeeNumber: " EMP-7 ",
        })
      )
    ).toEqual({
      reference: "WORKER-1",
      kind: "WORKER",
      fullName: "Alex Worker",
      emailAddress: "alex@example.test",
      organization: "Northpoint",
      position: "Field worker",
      employeeNumber: "EMP-7",
    })
  })
})

describe("draft fields", () => {
  it("requires at least one field", () => {
    expect(
      validateFields([], { references: ["WORKER-1"], pageCount: 1 })
    ).toEqual([
      { path: "fields", message: "Place at least one field before saving." },
    ])
  })

  it("validates ownership, page number, and normalized page bounds", () => {
    const problems = validateFields(
      [
        field({
          signatoryReference: "MISSING",
          pageNumber: 2,
          x: 0.9,
          width: 0.2,
        }),
      ],
      { references: ["WORKER-1"], pageCount: 1 }
    )

    expect(problems.map((problem) => problem.path)).toEqual([
      "fields.0.signatoryReference",
      "fields.0.pageNumber",
      "fields.0.rect",
    ])
  })

  it("rejects non-integer and non-positive page numbers", () => {
    expect(
      validateFields([field({ pageNumber: 0.5 })], {
        references: ["WORKER-1"],
        pageCount: 1,
      })
    ).toEqual([
      {
        path: "fields.0.pageNumber",
        message: "Page 0.5 is outside this document's 1 pages.",
      },
    ])
  })

  it("identifies signatories that cannot sign because they have no field", () => {
    expect(
      signatoriesWithoutFields(
        [signatory(), signatory({ reference: "WORKER-2" })],
        [field()]
      )
    ).toEqual(["WORKER-2"])
  })

  it("picks only API field properties", () => {
    const payload = toFieldPayload({
      ...field(),
      id: "frontend-only",
    } as DraftFieldInput & { id: string })

    expect(payload).toEqual(field())
    expect(payload).not.toHaveProperty("id")
  })
})

describe("draft messages", () => {
  it("decodes approval matrix warnings", () => {
    expect(decodeWarning("NO_APPROVAL_MATRIX").code).toBe("NO_APPROVAL_MATRIX")
    expect(decodeWarning("MISSING_APPROVER_ROLES:APPROVER,VIEWER")).toEqual({
      code: "MISSING_APPROVER_ROLES",
      message:
        "No active, MFA-enrolled account holds Approver and Viewer, so approval cannot start.",
    })
    expect(decodeWarning("FUTURE_WARNING")).toEqual({
      code: "FUTURE_WARNING",
      message: "FUTURE_WARNING",
    })
  })

  it("joins human-readable lists", () => {
    expect(joinWords([])).toBe("")
    expect(joinWords(["Approver"])).toBe("Approver")
    expect(joinWords(["Approver", "Viewer"])).toBe("Approver and Viewer")
    expect(joinWords(["One", "Two", "Three"])).toBe("One, Two and Three")
  })
})
