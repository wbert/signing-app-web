import { afterEach, describe, expect, it } from "vitest"

import {
  claimSigningToken,
  fragmentWithoutToken,
  readSigningToken,
  urlWithoutToken,
} from "@/lib/signing/token"

const token = "a".repeat(48)

afterEach(() => {
  window.history.replaceState(null, "", "/")
})

describe("readSigningToken", () => {
  it("reads a token the API would accept", () => {
    expect(readSigningToken(`#token=${token}`)).toBe(token)
    expect(readSigningToken(`token=${token}`)).toBe(token)
  })

  it("keeps other fragment parameters out of the token", () => {
    expect(readSigningToken(`#a=1&token=${token}&b=2`)).toBe(token)
  })

  it("rejects a token the API's authorization guard would refuse", () => {
    expect(readSigningToken("#token=short")).toBeNull()
    expect(readSigningToken(`#token=${"a".repeat(101)}`)).toBeNull()
    expect(readSigningToken(`#token=${"a".repeat(47)}!`)).toBeNull()
    expect(readSigningToken("#nothing=here")).toBeNull()
    expect(readSigningToken("")).toBeNull()
  })
})

describe("fragmentWithoutToken", () => {
  it("empties a fragment that carried only the token", () => {
    expect(fragmentWithoutToken(`#token=${token}`)).toBe("")
  })

  it("keeps unrelated fragment parameters", () => {
    expect(fragmentWithoutToken(`#token=${token}&lang=en`)).toBe("#lang=en")
  })
})

describe("urlWithoutToken", () => {
  it("preserves the path and query while dropping the token", () => {
    expect(
      urlWithoutToken({
        hash: `#token=${token}`,
        pathname: "/sign",
        search: "?source=email",
      })
    ).toBe("/sign?source=email")
  })
})

describe("claimSigningToken", () => {
  it("returns the token and removes it from the URL in one step", () => {
    window.history.replaceState(null, "", `/sign#token=${token}`)

    expect(claimSigningToken()).toBe(token)
    expect(window.location.hash).toBe("")
    expect(window.location.href).not.toContain(token)
  })

  it("replaces the current entry so going back cannot restore the token", () => {
    window.history.replaceState(null, "", "/sign")
    const before = window.history.length

    window.history.replaceState(null, "", `/sign#token=${token}`)
    claimSigningToken()

    expect(window.history.length).toBe(before)
    expect(window.location.href).not.toContain(token)
  })

  it("still strips a fragment that held an unusable token", () => {
    window.history.replaceState(null, "", "/sign#token=short")

    expect(claimSigningToken()).toBeNull()
    expect(window.location.hash).toBe("")
  })

  it("leaves a fragmentless URL alone", () => {
    window.history.replaceState(null, "", "/sign?source=email")

    expect(claimSigningToken()).toBeNull()
    expect(window.location.search).toBe("?source=email")
  })
})
