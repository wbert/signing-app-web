import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"

import type { SigningSession } from "@/lib/api/types"

const { signingRequestMock, lastPageSpy } = vi.hoisted(() => ({
  signingRequestMock: vi.fn(),
  lastPageSpy: vi.fn(),
}))

vi.mock("@/lib/signing/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signing/client")>()
  return { ...actual, signingRequest: signingRequestMock }
})

// The reader is exercised separately; here it only reports reaching the end,
// which is what the journey depends on.
vi.mock("@/components/signing/document-reader", () => ({
  DocumentReader: ({
    onReachedLastPage,
  }: {
    onReachedLastPage: (pageNumber: number) => void
  }) => (
    <button
      onClick={() => {
        lastPageSpy()
        onReachedLastPage(4)
      }}
      type="button"
    >
      Reach the last page
    </button>
  ),
}))

import { SigningJourney } from "@/components/signing/signing-journey"
import { SigningApiError } from "@/lib/signing/client"

const token = "t".repeat(48)

function session(overrides: Partial<SigningSession> = {}): SigningSession {
  return {
    requestId: "request-1",
    requestVersion: 3,
    documentTitle: "Employment contract",
    pageCount: 4,
    signatoryName: "Alex Candidate",
    requiresOtp: false,
    otpVerified: true,
    lastPageViewed: false,
    consentAccepted: false,
    consentVersion: "2026-01",
    consentText: "I consent to use electronic records and signatures.",
    expiresAt: "2999-01-01T00:00:00.000Z",
    previewUrl: "https://storage.example.test/preview.pdf",
    previewExpiresAt: "2999-01-01T00:05:00.000Z",
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

function renderWithToken(hash = `#token=${token}`) {
  window.history.replaceState(null, "", `/sign${hash}`)
  return render(<SigningJourney />)
}

afterEach(() => {
  cleanup()
  signingRequestMock.mockReset()
  lastPageSpy.mockReset()
  window.history.replaceState(null, "", "/")
})

describe("SigningJourney", () => {
  it("claims the token from the fragment, hides it, and never puts it in a path", async () => {
    signingRequestMock.mockResolvedValue({ session: session() })

    renderWithToken()

    await screen.findByRole("heading", { name: "Employment contract" })
    expect(window.location.href).not.toContain(token)
    expect(window.location.hash).toBe("")

    for (const call of signingRequestMock.mock.calls) {
      expect(call[0]).toBe(token)
      expect(call[1]).not.toContain(token)
      expect(JSON.stringify(call[2] ?? {})).not.toContain(token)
    }
  })

  it("claims the token once even when effects are mounted twice", async () => {
    signingRequestMock.mockResolvedValue({ session: session() })

    window.history.replaceState(null, "", `/sign#token=${token}`)
    render(
      <StrictMode>
        <SigningJourney />
      </StrictMode>
    )

    expect(
      await screen.findByRole("heading", { name: "Employment contract" })
    ).toBeDefined()
    expect(window.location.href).not.toContain(token)
  })

  it("explains an incomplete link without calling the API", async () => {
    renderWithToken("")

    expect(
      await screen.findByRole("heading", {
        name: /needs the link from your email/u,
      })
    ).toBeDefined()
    expect(signingRequestMock).not.toHaveBeenCalled()
  })

  it("shows one terminal state for an unusable link", async () => {
    signingRequestMock.mockRejectedValue(
      apiError(404, "SIGNING_ACCESS_UNAVAILABLE")
    )

    renderWithToken()

    const heading = await screen.findByRole("heading", {
      name: /can no longer be used/u,
    })
    expect(heading).toBeDefined()
    expect(document.body.textContent).not.toContain("SIGNING_ACCESS")
  })

  it("asks for the passcode first and reopens the session once it is accepted", async () => {
    signingRequestMock.mockImplementation(
      (_token: string, path: string, options?: { body?: unknown }) => {
        if (path === "/api/signing/session") {
          return Promise.resolve(
            signingRequestMock.mock.calls.some(
              (call) => call[1] === "/api/signing/otp"
            )
              ? { session: session({ requiresOtp: true, otpVerified: true }) }
              : {
                  challenge: {
                    requiresOtp: true,
                    otpVerified: false,
                    expiresAt: "2999-01-01T00:00:00.000Z",
                  },
                }
          )
        }
        if (path === "/api/signing/otp") {
          expect(options?.body).toEqual({ code: "123456" })
          return Promise.resolve({ verified: true })
        }
        return Promise.reject(new Error(`Unexpected path: ${path}`))
      }
    )

    renderWithToken()

    const field = await screen.findByLabelText("Six-digit passcode")
    fireEvent.change(field, { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/u }))

    expect(
      await screen.findByRole("heading", { name: "Employment contract" })
    ).toBeDefined()
  })

  it("ends the journey when a wrong passcode closed the link", async () => {
    let otpAttempted = false
    signingRequestMock.mockImplementation((_token: string, path: string) => {
      if (path === "/api/signing/otp") {
        otpAttempted = true
        return Promise.reject(apiError(401, "OTP_INVALID"))
      }
      if (otpAttempted) {
        return Promise.reject(apiError(404, "SIGNING_ACCESS_UNAVAILABLE"))
      }
      return Promise.resolve({
        challenge: {
          requiresOtp: true,
          otpVerified: false,
          expiresAt: "2999-01-01T00:00:00.000Z",
        },
      })
    })

    renderWithToken()

    const field = await screen.findByLabelText("Six-digit passcode")
    fireEvent.change(field, { target: { value: "000000" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/u }))

    expect(
      await screen.findByRole("heading", { name: /can no longer be used/u })
    ).toBeDefined()
  })

  it("keeps consent closed until the server has recorded the review", async () => {
    signingRequestMock.mockImplementation((_token: string, path: string) => {
      if (path === "/api/signing/session") {
        return Promise.resolve({ session: session() })
      }
      if (path === "/api/signing/review/last-page") {
        return Promise.resolve({ lastPageViewed: true })
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`))
    })

    renderWithToken()

    const agree = await screen.findByRole("button", {
      name: /Agree and continue/u,
    })
    expect(agree.hasAttribute("disabled")).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Reach the last page" }))

    await waitFor(() =>
      expect(signingRequestMock).toHaveBeenCalledWith(
        token,
        "/api/signing/review/last-page",
        { method: "POST", body: { pageNumber: 4 } }
      )
    )

    const checkbox = await screen.findByRole("checkbox")
    fireEvent.click(checkbox)
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /Agree and continue/u })
          .hasAttribute("disabled")
      ).toBe(false)
    )
  })

  it("signs once with the current version and one retained idempotency key", async () => {
    const signCalls: Array<Record<string, unknown>> = []
    signingRequestMock.mockImplementation(
      (
        _token: string,
        path: string,
        options?: { body?: Record<string, unknown> }
      ) => {
        if (path === "/api/signing/session") {
          return Promise.resolve({
            session: session({ lastPageViewed: true, consentAccepted: true }),
          })
        }
        if (path === "/api/signing/sign") {
          signCalls.push(options?.body ?? {})
          if (signCalls.length === 1) {
            return Promise.reject(apiError(409, "SIGNING_VERSION_CONFLICT"))
          }
          return Promise.resolve({
            requestId: "request-1",
            status: "COMPLETED",
            idempotent: false,
          })
        }
        return Promise.reject(new Error(`Unexpected path: ${path}`))
      }
    )

    renderWithToken()

    fireEvent.click(await screen.findByRole("radio", { name: /Type/u }))
    fireEvent.change(screen.getByLabelText("Your full name"), {
      target: { value: "Alex Candidate" },
    })

    const signButton = screen.getByRole("button", {
      name: /Sign this document/u,
    })
    fireEvent.click(signButton)
    fireEvent.click(signButton)

    await screen.findByRole("alert")
    expect(signCalls).toHaveLength(1)
    expect(signCalls[0]).toMatchObject({
      captureMethod: "TYPED",
      captureData: "Alex Candidate",
      expectedVersion: 3,
    })

    fireEvent.click(screen.getByRole("button", { name: /Sign this document/u }))

    expect(
      await screen.findByRole("heading", {
        name: /signature has been recorded/u,
      })
    ).toBeDefined()
    expect(signCalls).toHaveLength(2)
    expect(signCalls[1]?.idempotencyKey).toBe(signCalls[0]?.idempotencyKey)
  })

  it("requires a reason before a decline is sent", async () => {
    signingRequestMock.mockImplementation((_token: string, path: string) => {
      if (path === "/api/signing/session") {
        return Promise.resolve({
          session: session({ lastPageViewed: true, consentAccepted: true }),
        })
      }
      if (path === "/api/signing/decline") {
        return Promise.resolve({
          requestId: "request-1",
          status: "DECLINED",
          idempotent: false,
        })
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`))
    })

    renderWithToken()

    fireEvent.click(
      await screen.findByRole("button", { name: /Decline to sign/u })
    )
    const confirm = screen.getByRole("button", { name: /Confirm decline/u })
    expect(confirm.hasAttribute("disabled")).toBe(true)

    fireEvent.change(screen.getByLabelText("Reason for declining"), {
      target: { value: "The salary figure is wrong." },
    })
    fireEvent.click(screen.getByRole("button", { name: /Confirm decline/u }))

    expect(
      await screen.findByRole("heading", { name: /declined to sign/u })
    ).toBeDefined()
    expect(signingRequestMock).toHaveBeenCalledWith(
      token,
      "/api/signing/decline",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          reason: "The salary figure is wrong.",
          expectedVersion: 3,
        }),
      })
    )
  })
})
