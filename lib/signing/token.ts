/**
 * The signing token arrives only in the URL fragment, which browsers never send
 * to a server and never place in a `Referer` header. It is read once at
 * bootstrap, kept in component memory, and removed from the address bar and
 * from the current history entry so a back navigation cannot restore it.
 */

/** Matches the API's own `^Signing ([A-Za-z0-9_-]{40,100})$` authorization guard. */
export const SIGNING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,100}$/u

/** Reads `#token=...` without accepting a value the API would reject anyway. */
export function readSigningToken(fragment: string): string | null {
  const token = fragmentParameters(fragment).get("token")
  if (token === null || !SIGNING_TOKEN_PATTERN.test(token)) return null
  return token
}

/** The same fragment with `token` removed, or an empty string when nothing is left. */
export function fragmentWithoutToken(fragment: string): string {
  const parameters = fragmentParameters(fragment)
  parameters.delete("token")
  const remaining = parameters.toString()
  return remaining.length === 0 ? "" : `#${remaining}`
}

export type SigningLocation = {
  hash: string
  pathname: string
  search: string
}

/**
 * The URL this page should show once the token has been taken out of it. The
 * fragment is stripped whenever one is present, including a malformed token,
 * because an unusable credential is still a credential.
 */
export function urlWithoutToken(location: SigningLocation): string {
  return `${location.pathname}${location.search}${fragmentWithoutToken(location.hash)}`
}

/**
 * Takes the token out of the live URL exactly once. `replaceState` is used
 * rather than `pushState` so no history entry ever holds the token.
 */
export function claimSigningToken(): string | null {
  if (typeof window === "undefined") return null

  const { hash, pathname, search } = window.location
  const token = readSigningToken(hash)

  if (hash.length > 0) {
    window.history.replaceState(
      window.history.state,
      "",
      urlWithoutToken({ hash, pathname, search })
    )
  }

  return token
}

function fragmentParameters(fragment: string): URLSearchParams {
  return new URLSearchParams(fragment.replace(/^#/u, ""))
}
