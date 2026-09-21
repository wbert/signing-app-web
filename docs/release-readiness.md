# Release readiness (Phase 7)

**Scope:** what the frontend code now enforces, and what remains for people to
do. Phase 7 is the only phase whose gates cannot be closed by writing code, so
this separates the two rather than letting a green build imply a release
decision.

## 1. Enforced in code

### Content Security Policy

`proxy.ts` sets a per-request nonce policy on every document response.
`lib/security/headers.ts` builds it, and `lib/security/headers.test.ts` asserts
each property below, so a directive cannot be dropped silently.

| Directive         | Value                                 | Why                                                                                                          |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `script-src`      | `'self' 'nonce-…' 'strict-dynamic'`   | No inline script, no third-party origin. `'unsafe-eval'` is added in development only, where React needs it. |
| `style-src`       | `'self' 'nonce-…'`                    | Stylesheets are self-hosted.                                                                                 |
| `style-src-attr`  | `'unsafe-inline'`                     | PDF page surfaces are sized from page geometry via the `style` attribute.                                    |
| `worker-src`      | `'self' blob:`                        | pdf.js runs its parser in a worker served from this origin.                                                  |
| `connect-src`     | `'self'` + configured storage origins | Document bytes are fetched directly from object storage.                                                     |
| `img-src`         | `'self' data: blob:`                  | `data:` is the signature preview; `blob:` is the assembled export.                                           |
| `frame-ancestors` | `'none'`                              | Clickjacking.                                                                                                |
| `object-src`      | `'none'`                              | No plugins.                                                                                                  |

Also sent: `Referrer-Policy: no-referrer` (the signing page is reached from an
emailed link), `X-Content-Type-Options`, `X-Frame-Options`,
`Cross-Origin-Opener-Policy`, `Permissions-Policy`, and — outside development —
`Strict-Transport-Security` and `upgrade-insecure-requests`.

**Two consequences to know about.**

1. **Every route is now dynamically rendered.** A nonce can only be applied
   while rendering against a real request, so `app/layout.tsx` reads the request
   headers, which opts the whole tree in. A statically generated page would ship
   scripts with no nonce and this policy would refuse them.
2. **`SIGNINGAPP_STORAGE_ORIGINS` must list every storage origin.** If it is
   unset or wrong, `connect-src` blocks the preview fetch and every document
   viewer reports that the document could not be loaded. See `.env.example`.

`pdfDocumentDefaults` sets `isEvalSupported: false`, so pdf.js does not reach
for `eval` that production will not grant.

### Telemetry

`lib/telemetry/telemetry.ts` permits a fixed set of operational fields — route,
action, outcome, status code, error code, duration, request ID, attempt — and
drops everything else. Values are refused if they look like a URL, a data URL,
an email address, or a token-length run; `requestId` is accepted only in UUID
form. **No sink is registered**, so nothing is transmitted. Registering one is a
privacy decision with an accountable owner, not a default.

### Accessibility

`prefers-reduced-motion: reduce` collapses every animation and transition.
All motion in the application is decorative, so none of it carries information
that is lost when stopped.

### Repeatable verification

`npm run verify` runs type-check, lint, the full test suite, and a production
build in one command, which is the clean-checkout gate.

## 2. Verified by hand in this session

- Headers present in both development and production modes.
- Production `script-src` carries no `'unsafe-eval'`.
- Every `<script>` and `<style>` Next emits carries the request nonce, including
  the `next-themes` no-flash script, which needed the nonce passed explicitly
  because Next does not nonce scripts it did not emit.
- `upgrade-insecure-requests` and HSTS appear outside development only.

## 3. Not done — needs a person

Nothing below is blocked by code. None of it should be inferred from a green
build.

### Security testing

- [ ] Dependency and secret scanning in CI
- [ ] Stored-XSS attempts through document titles, signatory names, decline
      reasons, return reasons, bounce notes, and archive purposes
- [ ] Guessed-ID probing across every `[id]` route
- [ ] Cross-role matrix — the table in `end-to-end-verification.md`
- [ ] Confirm no signing token appears in logs, telemetry, storage, or referrers
      during a real run

### Accessibility

- [ ] Screen-reader pass over sign-in, approval decision, and the signing journey
- [ ] Keyboard-only completion of the signing journey, including the typed
      signature alternative
- [ ] Contrast audit in both themes
- [ ] Real-device mobile pass; confirm the signatory journey completes in three
      screens with nothing installed

### Browser and network

- [ ] Supported-browser matrix
- [ ] Slow network and mid-journey interruption
- [ ] Large multi-page PDF rendering on a low-end phone

### Configuration and operations

- [ ] Rotate the credentials named in the backend handoff
- [ ] `APP_ORIGIN`, the Lambda Function URL CORS entry, the password-setup
      redirect, and the frontend HTTPS origin all match exactly
- [ ] `SIGNINGAPP_STORAGE_ORIGINS` set for the deployed environment
- [ ] Deploy and rollback exercised, with a smoke test after each
- [ ] Controlled pilot

### Open product decisions

- [ ] Administrator recovery-operations console — build or drop
- [ ] Whether administrators should see workflows at all (today they cannot:
      `/api/workflows` needs `documents:read`, which only Senders hold)

### Sign-off

- [ ] Product
- [ ] Operations
- [ ] Privacy and compliance — including the telemetry sink decision
- [ ] Legal

## 4. Release gate

The frontend is releasable when section 1 is green from a clean checkout via
`npm run verify`, section 3 has no unresolved blocking item, and the four
sign-offs are recorded against a named person and date. A passing build is
evidence for the first of those three, and nothing more.
