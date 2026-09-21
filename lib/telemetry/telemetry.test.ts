import { afterEach, describe, expect, it, vi } from "vitest"

import {
  allowedFields,
  buildTelemetryEvent,
  isReportableValue,
  reportTelemetry,
  setTelemetrySink,
} from "@/lib/telemetry/telemetry"

afterEach(() => setTelemetrySink(null))

describe("buildTelemetryEvent", () => {
  it("keeps the allow-listed operational fields", () => {
    const event = buildTelemetryEvent("signing.sign", {
      route: "/sign",
      action: "sign",
      outcome: "success",
      statusCode: 200,
      durationMs: 1240,
      attempt: 1,
    })

    expect(event.fields).toEqual({
      route: "/sign",
      action: "sign",
      outcome: "success",
      statusCode: 200,
      durationMs: 1240,
      attempt: 1,
    })
  })

  it("drops any field nobody has reviewed", () => {
    const event = buildTelemetryEvent("signing.sign", {
      route: "/sign",
      signatoryName: "Alex Candidate",
      documentTitle: "Employment contract",
      purpose: "Annual compliance review",
    })

    expect(event.fields).toEqual({ route: "/sign" })
  })

  it("never reports a signing token, even in an allowed field", () => {
    const event = buildTelemetryEvent("signing.open", {
      action: "a".repeat(48),
    })
    expect(event.fields.action).toBeUndefined()
  })

  it("never reports a signature capture or any URL", () => {
    for (const value of [
      "data:image/png;base64,AAAA",
      "https://api.cloudinary.com/v1_1/demo/pdf/download?x=1",
      "blob:http://localhost:3000/abc",
    ]) {
      expect(
        buildTelemetryEvent("x", { outcome: value }).fields.outcome
      ).toBeUndefined()
    }
  })

  it("never reports an email address", () => {
    expect(
      buildTelemetryEvent("x", { outcome: "alex@example.test" }).fields.outcome
    ).toBeUndefined()
  })

  it("drops an oversized value rather than truncating it", () => {
    const event = buildTelemetryEvent("x", { errorCode: "E".repeat(200) })
    expect(event.fields.errorCode).toBeUndefined()
  })

  it("keeps a request ID, which is the one identifier support needs", () => {
    const requestId = "0f9b1f26-2b1a-4f4e-9b0f-2c2f0d4a7b31"
    expect(buildTelemetryEvent("x", { requestId }).fields.requestId).toBe(
      requestId
    )
  })

  it("refuses a requestId that is not a request ID", () => {
    expect(
      buildTelemetryEvent("x", { requestId: "token-" + "a".repeat(40) }).fields
        .requestId
    ).toBeUndefined()
  })

  it("allow-lists nothing that names a person or a document", () => {
    const forbidden =
      /name|title|email|purpose|reason|token|password|otp|signature|hash|url|content/iu
    for (const field of allowedFields) {
      expect(field).not.toMatch(forbidden)
    }
  })
})

describe("isReportableValue", () => {
  it("accepts finite numbers and booleans only", () => {
    expect(isReportableValue("durationMs", 12)).toBe(true)
    expect(isReportableValue("durationMs", Number.NaN)).toBe(false)
    expect(isReportableValue("outcome", true)).toBe(true)
    expect(isReportableValue("outcome", { nested: 1 })).toBe(false)
    expect(isReportableValue("outcome", null)).toBe(false)
  })
})

describe("reportTelemetry", () => {
  it("sends nothing until a sink is deliberately registered", () => {
    expect(() => reportTelemetry("x", { route: "/sign" })).not.toThrow()

    const sink = vi.fn()
    setTelemetrySink(sink)
    reportTelemetry("x", { route: "/sign", signatoryName: "Alex" })

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0]?.[0]).toEqual({
      name: "x",
      fields: { route: "/sign" },
    })
  })
})
